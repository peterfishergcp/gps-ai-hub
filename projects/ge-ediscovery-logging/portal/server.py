#!/usr/bin/env python3
"""
server.py — Self-Contained Cloud Run Backend & Static SPA Host for the
Gemini Enterprise & NotebookLM Enterprise Compliance & eDiscovery Review Portal.

Serves:
  - Compiled React 18 SPA static assets from ./dist
  - GET /api/config       -> Runtime configuration & reviewer identity
  - GET /api/logs         -> Live BigQuery `conversation_turns` + GCS notebook archives
                             transformed into Unified ComplianceDataResponse
  - GET /api/search       -> Parameterized BigQuery search across sessions & notebooks
  - GET /api/signed-url   -> Proxied media stream URL for authorized GCS archive objects
  - GET /api/media        -> Direct GCS binary streaming with HTTP Range (206 Partial Content)
                             support for HTML5 audio/video, PDF.js canvas, images, and slides
"""

import base64
import json
import mimetypes
import os
import re
import ssl
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    from cryptography import x509 as _crypto_x509
    from cryptography.hazmat.primitives import hashes as _crypto_hashes
    from cryptography.hazmat.primitives.asymmetric import ec as _crypto_ec
    from cryptography.hazmat.primitives.asymmetric import padding as _crypto_padding
    from cryptography.hazmat.primitives.serialization import (
        load_pem_public_key as _load_pem_public_key,
    )

    _HAS_CRYPTOGRAPHY = True
except Exception:
    _HAS_CRYPTOGRAPHY = False

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
BQ_DATASET = os.environ.get("BQ_DATASET", "ge_ediscovery")
BQ_TABLE = os.environ.get("BQ_TABLE", "conversation_turns")
IAP_EXPECTED_AUDIENCE = os.environ.get("IAP_AUDIENCE", "").strip()
REVIEWER_EMAIL = os.environ.get("PORTAL_REVIEWER_EMAIL", "compliance-reviewer@enterprise.internal")
REVIEWER_NAME = os.environ.get("PORTAL_REVIEWER_NAME", "Compliance & Legal Reviewer")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DIST_DIR = os.path.join(BASE_DIR, "dist")

SSL_CTX = (
    ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    if os.path.exists("/etc/ssl/cert.pem")
    else ssl.create_default_context()
)

_CACHE_LOCK = threading.Lock()
_GCP_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_IAP_PUBKEYS_CACHE: dict[str, object] = {"keys": {}, "parsed": {}, "expires_at": 0.0}
_GOOGLE_OIDC_CERTS_CACHE: dict[str, object] = {"certs": {}, "parsed": {}, "expires_at": 0.0}
_LOGS_CACHE: dict[str, object] = {"data": None, "timestamp": 0.0}
_NB_ARCHIVE_CACHE: dict[str, dict] = {}
MAX_NB_ARCHIVE_CACHE_ENTRIES = 128
CACHE_TTL_SECONDS = 30.0


def _encode_der_int(val_bytes: bytes) -> bytes:
    """Encodes a positive big-endian integer into ASN.1 DER INTEGER format."""
    stripped = val_bytes.lstrip(b"\x00") or b"\x00"
    if stripped[0] & 0x80:
        stripped = b"\x00" + stripped
    return b"\x02" + bytes([len(stripped)]) + stripped


def _ecdsa_raw_to_der(raw_sig: bytes) -> bytes:
    """Converts a 64-byte raw ES256 (r || s) JWT signature into ASN.1 DER sequence."""
    if len(raw_sig) != 64:
        raise ValueError("Invalid ES256 signature length")
    r_der = _encode_der_int(raw_sig[:32])
    s_der = _encode_der_int(raw_sig[32:])
    seq_body = r_der + s_der
    return b"\x30" + bytes([len(seq_body)]) + seq_body


def _fetch_iap_public_keys() -> dict[str, str]:
    now = time.time()
    with _CACHE_LOCK:
        cached = _IAP_PUBKEYS_CACHE.get("keys")
        if isinstance(cached, dict) and cached and float(_IAP_PUBKEYS_CACHE.get("expires_at", 0.0)) > now:
            return dict(cached)
    req = urllib.request.Request("https://www.gstatic.com/iap/verify/public_key")
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=5) as resp:
        keys = json.loads(resp.read().decode("utf-8"))
        if isinstance(keys, dict):
            with _CACHE_LOCK:
                _IAP_PUBKEYS_CACHE["keys"] = keys
                _IAP_PUBKEYS_CACHE["parsed"] = {}
                _IAP_PUBKEYS_CACHE["expires_at"] = now + 3600.0
            return dict(keys)
    return {}


def _fetch_google_oidc_certs() -> dict[str, str]:
    now = time.time()
    with _CACHE_LOCK:
        cached = _GOOGLE_OIDC_CERTS_CACHE.get("certs")
        if isinstance(cached, dict) and cached and float(_GOOGLE_OIDC_CERTS_CACHE.get("expires_at", 0.0)) > now:
            return dict(cached)
    req = urllib.request.Request("https://www.googleapis.com/oauth2/v1/certs")
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=5) as resp:
        certs = json.loads(resp.read().decode("utf-8"))
        if isinstance(certs, dict):
            with _CACHE_LOCK:
                _GOOGLE_OIDC_CERTS_CACHE["certs"] = certs
                _GOOGLE_OIDC_CERTS_CACHE["parsed"] = {}
                _GOOGLE_OIDC_CERTS_CACHE["expires_at"] = now + 3600.0
            return dict(certs)
    return {}


def _verify_es256_iap_jwt(jwt_token: str) -> tuple[str, str] | None:
    """
    Cryptographically verifies a `X-Goog-IAP-JWT-Assertion` ES256 JWT against
    Google IAP's public EC keys (`https://www.gstatic.com/iap/verify/public_key`).
    Uses in-memory `cryptography` (zero subprocesses or /tmp writes) with OpenSSL fallback.
    """
    parts = jwt_token.split(".")
    if len(parts) != 3:
        return None
    try:
        hdr = json.loads(base64.urlsafe_b64decode(parts[0] + "=" * (-len(parts[0]) % 4)).decode("utf-8"))
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)).decode("utf-8"))
        raw_sig = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))
    except Exception:
        return None

    if hdr.get("alg") != "ES256":
        return None
    kid = str(hdr.get("kid") or "").strip()
    if not kid:
        return None

    now = time.time()
    if float(claims.get("exp") or 0) <= now - 30 or float(claims.get("iat") or 0) > now + 120:
        return None
    if claims.get("iss") != "https://cloud.google.com/iap":
        return None
    expected_iap_aud = (os.environ.get("IAP_AUDIENCE") or IAP_EXPECTED_AUDIENCE).strip()
    if not expected_iap_aud or str(claims.get("aud") or "") != expected_iap_aud:
        return None

    email = str(claims.get("email") or "").strip()
    if not email:
        return None
    if ":" in email:
        email = email.split(":", 1)[1].strip()

    try:
        keys = _fetch_iap_public_keys()
        pub_pem = keys.get(kid, "")
        if not pub_pem:
            with _CACHE_LOCK:
                _IAP_PUBKEYS_CACHE["expires_at"] = 0.0
            pub_pem = _fetch_iap_public_keys().get(kid, "")
        if not pub_pem:
            return None
        der_sig = _ecdsa_raw_to_der(raw_sig)
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        if _HAS_CRYPTOGRAPHY:
            with _CACHE_LOCK:
                parsed_map = _IAP_PUBKEYS_CACHE.get("parsed")
                pub_key = parsed_map.get(kid) if isinstance(parsed_map, dict) else None
            if pub_key is None:
                pub_key = _load_pem_public_key(pub_pem.encode("utf-8"))
                with _CACHE_LOCK:
                    if isinstance(_IAP_PUBKEYS_CACHE.get("parsed"), dict):
                        _IAP_PUBKEYS_CACHE["parsed"][kid] = pub_key  # type: ignore[index]
            pub_key.verify(der_sig, signing_input, _crypto_ec.ECDSA(_crypto_hashes.SHA256()))  # type: ignore[union-attr]
        else:
            with tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False) as pf, tempfile.NamedTemporaryFile(
                "wb", suffix=".sig", delete=False
            ) as sf:
                pub_path, sig_path = pf.name, sf.name
                pf.write(pub_pem)
                sf.write(der_sig)
            try:
                res = subprocess.run(
                    ["openssl", "dgst", "-sha256", "-verify", pub_path, "-signature", sig_path],
                    input=signing_input,
                    capture_output=True,
                    timeout=5,
                )
                if res.returncode != 0:
                    return None
            finally:
                for p in (pub_path, sig_path):
                    if os.path.exists(p):
                        try:
                            os.remove(p)
                        except OSError:
                            pass
    except Exception:
        return None

    return email, email.split("@")[0]


def _verify_rs256_google_oidc_jwt(jwt_token: str) -> tuple[str, str] | None:
    """
    Cryptographically verifies a Google-signed RS256 OIDC ID token using in-memory
    `cryptography` (zero subprocesses or /tmp writes) with OpenSSL fallback.
    """
    parts = jwt_token.split(".")
    if len(parts) != 3:
        return None
    try:
        hdr = json.loads(base64.urlsafe_b64decode(parts[0] + "=" * (-len(parts[0]) % 4)).decode("utf-8"))
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)).decode("utf-8"))
        sig = base64.urlsafe_b64decode(parts[2] + "=" * (-len(parts[2]) % 4))
    except Exception:
        return None

    if hdr.get("alg") != "RS256":
        return None
    kid = str(hdr.get("kid") or "").strip()
    if not kid:
        return None

    now = time.time()
    if float(claims.get("exp") or 0) <= now - 30 or float(claims.get("iat") or 0) > now + 120:
        return None
    if str(claims.get("iss") or "") not in ("https://accounts.google.com", "accounts.google.com"):
        return None
    expected_oidc_aud = os.environ.get("EXPECTED_OAUTH_CLIENT_ID", "").strip()
    if not expected_oidc_aud or str(claims.get("aud") or "") != expected_oidc_aud:
        return None
    allowed_hd = {
        d.strip().lower().lstrip("@")
        for d in os.environ.get("ALLOWED_HOSTED_DOMAINS", "").split(",")
        if d.strip()
    }
    if allowed_hd and str(claims.get("hd") or "").strip().lower() not in allowed_hd:
        return None

    email = str(claims.get("email") or "").strip()
    if not email or claims.get("email_verified") is not True:
        return None

    try:
        certs = _fetch_google_oidc_certs()
        cert_pem = certs.get(kid, "")
        if not cert_pem:
            with _CACHE_LOCK:
                _GOOGLE_OIDC_CERTS_CACHE["expires_at"] = 0.0
            cert_pem = _fetch_google_oidc_certs().get(kid, "")
        if not cert_pem:
            return None
        signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
        if _HAS_CRYPTOGRAPHY:
            with _CACHE_LOCK:
                parsed_map = _GOOGLE_OIDC_CERTS_CACHE.get("parsed")
                pub_key = parsed_map.get(kid) if isinstance(parsed_map, dict) else None
            if pub_key is None:
                cert_obj = _crypto_x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
                pub_key = cert_obj.public_key()
                with _CACHE_LOCK:
                    if isinstance(_GOOGLE_OIDC_CERTS_CACHE.get("parsed"), dict):
                        _GOOGLE_OIDC_CERTS_CACHE["parsed"][kid] = pub_key  # type: ignore[index]
            pub_key.verify(sig, signing_input, _crypto_padding.PKCS1v15(), _crypto_hashes.SHA256())  # type: ignore[union-attr]
        else:
            with tempfile.NamedTemporaryFile("w", suffix=".crt", delete=False) as cf, tempfile.NamedTemporaryFile(
                "wb", suffix=".pub", delete=False
            ) as pf, tempfile.NamedTemporaryFile("wb", suffix=".sig", delete=False) as sf:
                cert_path, pub_path, sig_path = cf.name, pf.name, sf.name
                cf.write(cert_pem)
                sf.write(sig)
            try:
                pub_pem = subprocess.check_output(
                    ["openssl", "x509", "-pubkey", "-noout", "-in", cert_path],
                    stderr=subprocess.DEVNULL,
                    timeout=5,
                )
                with open(pub_path, "wb") as pf_out:
                    pf_out.write(pub_pem)
                res = subprocess.run(
                    ["openssl", "dgst", "-sha256", "-verify", pub_path, "-signature", sig_path],
                    input=signing_input,
                    capture_output=True,
                    timeout=5,
                )
                if res.returncode != 0:
                    return None
            finally:
                for p in (cert_path, pub_path, sig_path):
                    if os.path.exists(p):
                        try:
                            os.remove(p)
                        except OSError:
                            pass
    except Exception:
        return None

    return email, email.split("@")[0]


def get_bucket_name(project_id: str) -> str:
    return os.environ.get("GCS_BUCKET_NAME") or f"{project_id}-ge-ediscovery"


def get_gcp_access_token() -> str:
    """Obtains a Google Cloud OAuth2 access token from the Cloud Run Metadata Server or gcloud CLI."""
    now = time.time()
    with _CACHE_LOCK:
        cached = _GCP_TOKEN_CACHE.get("default")
        if cached and cached[1] > now + 60:
            return cached[0]

    meta_url = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"
    req = urllib.request.Request(meta_url, headers={"Metadata-Flavor": "Google"})
    try:
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            token = data["access_token"]
            expires_in = float(data.get("expires_in", 300))
            with _CACHE_LOCK:
                _GCP_TOKEN_CACHE["default"] = (token, now + expires_in)
            return token
    except Exception:
        pass

    try:
        token = subprocess.check_output(
            ["gcloud", "auth", "print-access-token"],
            stdin=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            timeout=8,
        ).decode("utf-8").strip()
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        raise RuntimeError(
            "Local gcloud credentials have expired (Reauthentication required). "
            "Run `gcloud auth login` in your terminal to refresh your cloudtop session."
        ) from e
    with _CACHE_LOCK:
        _GCP_TOKEN_CACHE["default"] = (token, now + 300)
    return token


def extract_email_from_principal(principal: str) -> str:
    """Extracts the human subject/email from a WIF principal or IAM principal string."""
    if not principal:
        return "unattributed@enterprise.internal"
    if "/subject/" in principal:
        return principal.split("/subject/", 1)[1].strip()
    if ":" in principal and "@" in principal:
        return principal.split(":", 1)[1].strip()
    return principal.strip()


def validate_archive_gcs_uri(gcs_uri: str, allowed_bucket: str) -> tuple[str, str]:
    """
    Strictly validates that `gcs_uri` points to an object inside `allowed_bucket`
    with no path traversal segments. Returns (bucket_name, object_path).
    """
    if not gcs_uri or not gcs_uri.startswith("gs://"):
        raise ValueError("Invalid GCS URI scheme")
    without_scheme = gcs_uri[5:]
    if "/" not in without_scheme:
        raise ValueError("Missing GCS object path")
    bucket, obj_path = without_scheme.split("/", 1)
    if bucket != allowed_bucket:
        raise PermissionError(f"Access denied: bucket '{bucket}' is not the authorized compliance archive bucket")
    norm_path = os.path.normpath(obj_path)
    if norm_path.startswith("..") or "/../" in f"/{obj_path}/" or "\\.." in obj_path:
        raise PermissionError("Path traversal detected in GCS URI")
    return bucket, obj_path


def run_bq_query(project_id: str, sql: str, query_params: list[dict] | None = None) -> list[dict]:
    """Executes a Standard SQL query against BigQuery REST API and returns a list of dict rows."""
    gcp_token = get_gcp_access_token()
    url = f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries"
    payload: dict[str, object] = {
        "query": sql,
        "useLegacySql": False,
        "timeoutMs": 20000,
    }
    if query_params:
        payload["parameterMode"] = "NAMED"
        payload["queryParameters"] = query_params

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=25) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    schema_fields = data.get("schema", {}).get("fields", [])
    rows_raw = data.get("rows", [])

    def _parse_value(val: object, field_schema: dict) -> object:
        if val is None:
            return None
        mode = field_schema.get("mode", "NULLABLE")
        ftype = field_schema.get("type", "STRING")
        if mode == "REPEATED":
            if not isinstance(val, list):
                return []
            sub_schema = {**field_schema, "mode": "NULLABLE"}
            return [_parse_value(item.get("v"), sub_schema) for item in val if isinstance(item, dict)]
        if ftype in ("RECORD", "STRUCT"):
            if not isinstance(val, dict):
                return {}
            sub_fields = field_schema.get("fields", [])
            f_vals = val.get("f", [])
            return {
                sf["name"]: _parse_value(f_vals[idx].get("v") if idx < len(f_vals) else None, sf)
                for idx, sf in enumerate(sub_fields)
            }
        if ftype in ("INTEGER", "INT64"):
            try:
                return int(val)
            except Exception:
                return 0
        if ftype in ("FLOAT", "FLOAT64", "NUMERIC"):
            try:
                return float(val)
            except Exception:
                return 0.0
        if ftype in ("TIMESTAMP",):
            try:
                epoch = float(val)
                return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))
            except Exception:
                return str(val)
        return val

    parsed_rows: list[dict] = []
    for r in rows_raw:
        f_vals = r.get("f", [])
        row_dict = {}
        for idx, sf in enumerate(schema_fields):
            raw_v = f_vals[idx].get("v") if idx < len(f_vals) else None
            row_dict[sf["name"]] = _parse_value(raw_v, sf)
        parsed_rows.append(row_dict)
    return parsed_rows


def _build_gcs_headers(gcp_token: str) -> dict[str, str]:
    """
    Builds HTTP headers for `storage.googleapis.com` requests.
    Does NOT send `X-Goog-User-Project` unless `GCS_USER_PROJECT` is explicitly set
    (e.g. for Requester Pays buckets), because `storage.googleapis.com` enforces
    `serviceusage.services.use` whenever `X-Goog-User-Project` is present, which causes
    `HTTP 403` on least-privilege service accounts (`roles/storage.objectViewer`).
    """
    hdrs = {"Authorization": f"Bearer {gcp_token}"}
    requester_pays_proj = os.environ.get("GCS_USER_PROJECT", "").strip()
    if requester_pays_proj:
        hdrs["X-Goog-User-Project"] = requester_pays_proj
    return hdrs


def fetch_gcs_json_cached(gcs_uri: str, allowed_bucket: str, project_id: str) -> dict:
    """Fetches and caches a JSON archive object (bounded LRU-style cap) from GCS."""
    with _CACHE_LOCK:
        if gcs_uri in _NB_ARCHIVE_CACHE:
            return _NB_ARCHIVE_CACHE[gcs_uri]
    try:
        bucket, obj_path = validate_archive_gcs_uri(gcs_uri, allowed_bucket)
        gcp_token = get_gcp_access_token()
        encoded_obj = urllib.parse.quote(obj_path, safe="")
        url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{encoded_obj}?alt=media"
        req = urllib.request.Request(
            url,
            headers=_build_gcs_headers(gcp_token),
        )
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict):
                with _CACHE_LOCK:
                    if len(_NB_ARCHIVE_CACHE) >= MAX_NB_ARCHIVE_CACHE_ENTRIES:
                        oldest_key = next(iter(_NB_ARCHIVE_CACHE))
                        _NB_ARCHIVE_CACHE.pop(oldest_key, None)
                    _NB_ARCHIVE_CACHE[gcs_uri] = data
                return data
    except Exception:
        pass
    return {}


def _transform_bq_rows_to_dataset(rows: list[dict], project_id: str, allowed_bucket: str) -> dict:
    """Transforms BigQuery `conversation_turns` rows into a ComplianceDataResponse payload."""
    processed_logs: list[dict] = []
    sources: list[dict] = []
    chat: list[dict] = []
    studio: list[dict] = []
    notebook_raw_logs: list[dict] = []
    seen_nb_archives: set[str] = set()

    for r in rows:
        engine_id = str(r.get("engine_id") or "")
        session_id = str(r.get("session_id") or "")
        raw_turn_index = r.get("turn_index")
        turn_index = int(raw_turn_index) if raw_turn_index is not None else 1
        principal = str(r.get("user_iam_principal") or "")
        user_email = extract_email_from_principal(principal)
        event_ts = str(r.get("event_timestamp") or r.get("harvested_at") or "")
        files_list = r.get("files") if isinstance(r.get("files"), list) else []
        transcript_uri = str(r.get("session_transcript_gcs_uri") or "")

        if engine_id.startswith("notebooklm-enterprise"):
            nb_id = session_id
            raw_disp = str(r.get("session_display_name") or "")
            nb_title = re.sub(r"^\[NotebookLM\]\s*", "", raw_disp).strip() or f"Notebook {nb_id[:8]}"
            prompt_txt = str(r.get("prompt_text") or "")
            resp_txt = str(r.get("response_text") or "")
            query_id = str(r.get("query_id") or f"{nb_id}_turn_{turn_index}")

            notebook_raw_logs.append({
                "event_id": query_id,
                "event_time": event_ts,
                "notebook_id": nb_id,
                "notebook_title": nb_title,
                "user_email": user_email,
            })

            if turn_index != 0 and (not prompt_txt.startswith("[NotebookLM Notebook & Source Inventory]") or not files_list):
                chat.append({
                    "event_id": query_id,
                    "event_time": event_ts,
                    "project_id": project_id,
                    "location": str(r.get("location") or "global"),
                    "notebook_id": nb_id,
                    "notebook_title": nb_title,
                    "user_email": user_email,
                    "turn_id": query_id,
                    "user_query": prompt_txt,
                    "model_response": resp_txt,
                    "citations": [],
                })

            # Enrich sources and studio artifacts from notebook_archive_<sha256>.json (once per notebook)
            if transcript_uri and transcript_uri not in seen_nb_archives:
                seen_nb_archives.add(transcript_uri)
                nb_archive = fetch_gcs_json_cached(transcript_uri, allowed_bucket, project_id)
                enriched_srcs = nb_archive.get("enriched_sources") if isinstance(nb_archive.get("enriched_sources"), list) else []
                archived_studio = nb_archive.get("studio_artifacts") if isinstance(nb_archive.get("studio_artifacts"), list) else []

                if enriched_srcs:
                    for s_idx, s_obj in enumerate(enriched_srcs):
                        if not isinstance(s_obj, dict):
                            continue
                        sid = (
                            s_obj.get("sourceId", {}).get("id")
                            or str(s_obj.get("name") or "").split("/")[-1]
                            or f"src_{s_idx}"
                        )
                        stitle = str(s_obj.get("title") or f"Source {sid}")
                        smeta = s_obj.get("metadata") if isinstance(s_obj.get("metadata"), dict) else {}
                        web_meta = smeta.get("webScrapeMetadata") if isinstance(smeta.get("webScrapeMetadata"), dict) else {}
                        gdrive_meta = smeta.get("googleDocsMetadata") if isinstance(smeta.get("googleDocsMetadata"), dict) else {}
                        yt_meta = smeta.get("youtubeMetadata") if isinstance(smeta.get("youtubeMetadata"), dict) else {}

                        src_url = str(web_meta.get("url") or s_obj.get("url") or "")
                        if yt_meta.get("videoId") and not src_url:
                            src_url = f"https://www.youtube.com/watch?v={yt_meta['videoId']}"

                        if yt_meta:
                            skind = "YOUTUBE"
                        elif gdrive_meta:
                            skind = "GOOGLE_DRIVE"
                        elif web_meta or src_url:
                            skind = "WEB_URL"
                        else:
                            skind = "FILE"

                        matched_file = next(
                            (f for f in files_list if isinstance(f, dict) and f.get("file_id") == sid),
                            {},
                        )
                        sources.append({
                            "event_id": f"{nb_id}_src_{sid}",
                            "event_time": str(smeta.get("sourceAddedTimestamp") or event_ts),
                            "project_id": project_id,
                            "location": str(r.get("location") or "global"),
                            "notebook_id": nb_id,
                            "notebook_title": nb_title,
                            "user_email": user_email,
                            "source_id": sid,
                            "source_title": stitle,
                            "source_type": skind,
                            "source_kind": skind,
                            "source_status": str(s_obj.get("status") or "COMPLETE"),
                            "word_count": int(smeta.get("wordCount") or 0),
                            "token_count": int(smeta.get("tokenCount") or 0),
                            "source_url": src_url,
                            "original_url": src_url,
                            "gcs_uri": str(matched_file.get("gcs_uri") or transcript_uri),
                            "sha256_hash": str(matched_file.get("sha256") or ""),
                            "crc32c_hash": str(matched_file.get("crc32c") or ""),
                            "content_preview": f"NotebookLM grounded source ({smeta.get('wordCount', 0)} words, {smeta.get('tokenCount', 0)} tokens)",
                            "raw_source_json": json.dumps(s_obj),
                        })
                else:
                    for f in files_list:
                        if not isinstance(f, dict) or f.get("file_source") != "NOTEBOOK_SOURCE":
                            continue
                        sid = str(f.get("file_id") or "")
                        sources.append({
                            "event_id": f"{nb_id}_src_{sid}",
                            "event_time": event_ts,
                            "project_id": project_id,
                            "location": str(r.get("location") or "global"),
                            "notebook_id": nb_id,
                            "notebook_title": nb_title,
                            "user_email": user_email,
                            "source_id": sid,
                            "source_title": str(f.get("file_name") or sid),
                            "source_type": "FILE",
                            "source_kind": "FILE",
                            "source_status": "COMPLETE",
                            "word_count": int(f.get("byte_size") or 0),
                            "gcs_uri": str(f.get("gcs_uri") or ""),
                            "sha256_hash": str(f.get("sha256") or ""),
                            "crc32c_hash": str(f.get("crc32c") or ""),
                            "content_preview": str(f.get("mime_type") or ""),
                        })

                for st_obj in archived_studio:
                    if not isinstance(st_obj, dict):
                        continue
                    art_id = str(st_obj.get("artifact_id") or "")
                    modality = str(st_obj.get("modality") or "REPORT")
                    st_title = str(st_obj.get("title") or modality)
                    studio.append({
                        "event_id": f"{nb_id}_studio_{art_id}",
                        "event_time": str(st_obj.get("created_at") or event_ts),
                        "project_id": project_id,
                        "location": str(r.get("location") or "global"),
                        "notebook_id": nb_id,
                        "notebook_title": nb_title,
                        "user_email": user_email,
                        "artifact_id": art_id,
                        "artifact_type": modality,
                        "artifact_title": st_title,
                        "title": st_title,
                        "artifact_status": str(st_obj.get("state") or "COMPLETED"),
                        "gcs_uri": str(st_obj.get("gcs_uri") or ""),
                        "mime_type": str(st_obj.get("mime_type") or ""),
                        "size_bytes": int(st_obj.get("byte_size") or 0),
                        "sha256_hash": str(st_obj.get("sha256") or ""),
                        "note_content": str(st_obj.get("extracted_text") or ""),
                    })
            continue

        # Gemini Enterprise Chat turn
        model_name = str(r.get("model_name") or "")
        model_lower = model_name.lower()
        input_artifacts: list[dict] = []
        output_artifacts: list[dict] = []

        for f in files_list:
            if not isinstance(f, dict):
                continue
            f_gcs = str(f.get("gcs_uri") or "")
            art_item = {
                "file_id": str(f.get("file_id") or ""),
                "file_name": str(f.get("file_name") or "artifact"),
                "mime_type": str(f.get("mime_type") or "application/octet-stream"),
                "gcs_uri": f_gcs,
                "sha256": str(f.get("sha256") or ""),
                "crc32c": str(f.get("crc32c") or ""),
                "size_bytes": int(f.get("byte_size") or 0),
                "turn_index": turn_index,
                "preview_url": f"/api/media?gcs_uri={urllib.parse.quote(f_gcs)}" if f_gcs else "",
                "web_url": str(f.get("console_url") or ""),
            }
            if f.get("file_source") == "USER_PROVIDED":
                input_artifacts.append(art_item)
            else:
                output_artifacts.append(art_item)

        if "deep_research" in model_lower:
            surface = "DEEP_RESEARCH"
            agent_name = model_name or "Deep Research Agent"
        elif "agent:adk" in model_lower or any(a["mime_type"] == "application/pdf" for a in output_artifacts):
            surface = "HIGH_CODE_AGENT"
            agent_name = model_name or "ADK Custom Agent"
        elif "agent:" in model_lower:
            surface = "NO_CODE_AGENT"
            agent_name = model_name or "Gemini Enterprise Agent"
        else:
            surface = "REGULAR_CHAT_AGENT"
            agent_name = model_name or "Gemini Enterprise Assistant"

        processed_logs.append({
            "insert_id": f"{session_id}_turn_{turn_index}",
            "timestamp": event_ts,
            "receive_timestamp": str(r.get("harvested_at") or event_ts),
            "project_id": project_id,
            "location": str(r.get("location") or "global"),
            "engine_id": engine_id,
            "user_email": user_email,
            "user_id": principal,
            "principal_type": "WORKFORCE_IDENTITY" if "workforcePools" in principal else "IAM_USER",
            "service_name": "discoveryengine.googleapis.com",
            "method_name": "StreamAssist",
            "interaction_surface": surface,
            "agent_id": model_name,
            "agent_name": agent_name,
            "session_id": session_id,
            "session_path": transcript_uri,
            "turn_count": turn_index,
            "query_id": str(r.get("query_id") or ""),
            "answer_id": str(r.get("assist_answer_id") or ""),
            "state": "SUCCEEDED",
            "archive_status": "COMPLETE",
            "input_text": str(r.get("prompt_text") or ""),
            "output_text": str(r.get("response_text") or ""),
            "reasoning_text": str(r.get("thought_text") or ""),
            "input_artifacts": input_artifacts,
            "output_artifacts": output_artifacts,
            "citations": [],
            "gcs_raw_conversation_uri": transcript_uri,
        })

    return {
        "processed_logs": processed_logs,
        "sources": sources,
        "chat": chat,
        "studio": studio,
        "notebook_raw_logs": notebook_raw_logs,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "is_live": True,
    }


def build_compliance_dataset(project_id: str, force_refresh: bool = False) -> dict:
    """
    Queries `ge_ediscovery.conversation_turns` and transforms rows into the
    ComplianceDataResponse structure expected by the React Review Portal.
    """
    now = time.time()
    with _CACHE_LOCK:
        if not force_refresh and _LOGS_CACHE["data"] is not None and (now - float(_LOGS_CACHE["timestamp"])) < CACHE_TTL_SECONDS:
            return _LOGS_CACHE["data"]  # type: ignore[return-value]
        if force_refresh:
            _NB_ARCHIVE_CACHE.clear()

    allowed_bucket = get_bucket_name(project_id)
    sql = f"""
        SELECT
          session_id,
          turn_index,
          query_id,
          assist_answer_id,
          engine_id,
          location,
          user_iam_principal,
          session_display_name,
          prompt_text,
          response_text,
          thought_text,
          model_name,
          session_transcript_gcs_uri,
          session_transcript_console_url,
          files,
          event_timestamp,
          harvested_at
        FROM `{project_id}.{BQ_DATASET}.{BQ_TABLE}`
        ORDER BY event_timestamp DESC, session_id, turn_index ASC
        LIMIT 2000
    """
    rows = run_bq_query(project_id, sql)
    result = _transform_bq_rows_to_dataset(rows, project_id, allowed_bucket)
    with _CACHE_LOCK:
        _LOGS_CACHE["data"] = result
        _LOGS_CACHE["timestamp"] = now
    return result


def is_reviewer_authorized(reviewer_email: str) -> bool:
    """
    Enforces mandatory server-side Role-Based Access Control (RBAC) for compliance reviewers.
    Fails closed (returns False) if neither `ALLOWED_REVIEWER_EMAILS` nor `ALLOWED_REVIEWER_DOMAINS`
    is configured (unless explicit loopback `ALLOW_LOCAL_DEV_BYPASS=true` outside Cloud Run).
    """
    norm_email = (reviewer_email or "").strip().lower()
    if not norm_email or "@" not in norm_email:
        return False

    raw_emails = os.environ.get("ALLOWED_REVIEWER_EMAILS", "")
    allowed_emails = {
        e.strip().lower()
        for e in raw_emails.split(",")
        if e.strip() and not e.strip().startswith("<")
    }
    explicit_reviewer = os.environ.get("PORTAL_REVIEWER_EMAIL", "").strip().lower()
    if (
        explicit_reviewer
        and "@" in explicit_reviewer
        and explicit_reviewer != "compliance-reviewer@enterprise.internal"
        and not explicit_reviewer.startswith("<")
    ):
        allowed_emails.add(explicit_reviewer)

    allowed_domains = {
        d.strip().lower().lstrip("@")
        for d in os.environ.get("ALLOWED_REVIEWER_DOMAINS", "").split(",")
        if d.strip() and not d.strip().startswith("<")
    }

    if not allowed_emails and not allowed_domains:
        if not os.environ.get("K_SERVICE") and os.environ.get("ALLOW_LOCAL_DEV_BYPASS", "").lower() == "true":
            return True
        return False

    if norm_email in allowed_emails:
        return True
    domain = norm_email.rsplit("@", 1)[1]
    if domain in allowed_domains:
        return True
    return False


class PortalRequestHandler(BaseHTTPRequestHandler):
    def send_security_headers(self, is_media: bool = False, allow_sameorigin_frame: bool = False) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN" if allow_sameorigin_frame else "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if is_media:
            if allow_sameorigin_frame:
                self.send_header(
                    "Content-Security-Policy",
                    "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'",
                )
            else:
                self.send_header(
                    "Content-Security-Policy",
                    "default-src 'none'; img-src 'self' data:; media-src 'self' blob:; style-src 'unsafe-inline'; sandbox; frame-ancestors 'none'",
                )
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; "
                "script-src 'self'; "
                "worker-src 'self' blob:; "
                "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                "font-src 'self' https://fonts.gstatic.com data:; "
                "img-src 'self' data: blob:; "
                "media-src 'self' blob:; "
                "frame-src 'self' blob: https://www.youtube.com; "
                "connect-src 'self'; "
                "object-src 'self'; "
                "base-uri 'self'; "
                "frame-ancestors 'none'",
            )

    def get_authenticated_reviewer(self) -> tuple[str, str] | None:
        """
        Cryptographically verifies the reviewer identity (mitigates N2 & ED-6):
          1. Verifies `X-Goog-IAP-JWT-Assertion` (ES256) against Google IAP's public EC keys
             and mandatory `IAP_AUDIENCE`.
          2. Or verifies `Authorization: Bearer <id_token>` (RS256) against Google OIDC certs
             and mandatory `EXPECTED_OAUTH_CLIENT_ID`.
          3. Never trusts raw `X-Goog-Authenticated-User-Email` headers or falls back to a static
             identity unless running outside Cloud Run (`K_SERVICE` unset) on loopback with
             explicit `ALLOW_LOCAL_DEV_BYPASS=true`.
        """
        iap_jwt = self.headers.get("X-Goog-IAP-JWT-Assertion", "").strip()
        if iap_jwt:
            verified_iap = _verify_es256_iap_jwt(iap_jwt)
            if verified_iap:
                return verified_iap
            return None

        auth_header = self.headers.get("Authorization", "").strip()
        if auth_header.startswith("Bearer "):
            bearer_tok = auth_header.split(" ", 1)[1].strip()
            verified_oidc = _verify_rs256_google_oidc_jwt(bearer_tok)
            if verified_oidc:
                return verified_oidc
            return None

        if os.environ.get("K_SERVICE"):
            return None

        if (
            os.environ.get("ALLOW_LOCAL_DEV_BYPASS", "").lower() == "true"
            and self.client_address[0] in ("127.0.0.1", "::1")
        ):
            return REVIEWER_EMAIL, REVIEWER_NAME

        return None

    def emit_access_audit_log(self, reviewer_email: str, action: str, target: str, extra: dict | None = None) -> None:
        """Emits a structured Cloud Logging audit entry for every eDiscovery compliance access."""
        forwarded_for = self.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        entry = {
            "severity": "INFO",
            "event_type": "ediscovery_portal_access_audit",
            "reviewer_email": reviewer_email,
            "action": action,
            "target": target,
            "remote_ip": forwarded_for or self.client_address[0],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        if extra:
            entry.update(extra)
        print(json.dumps(entry), flush=True)

    def send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_security_headers(is_media=False)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        if path == "/healthz":
            self.send_json(200, {"status": "ok", "service": "ge-ediscovery-portal"})
            return

        if path.startswith("/api/"):
            reviewer = self.get_authenticated_reviewer()
            if reviewer is None:
                self.send_json(
                    401,
                    {
                        "error": "Unauthorized: Missing or invalid cryptographic IAP / OIDC identity token",
                    },
                )
                return
            rev_email, rev_name = reviewer
            if not is_reviewer_authorized(rev_email):
                self.emit_access_audit_log(
                    rev_email,
                    "DENIED_UNAUTHORIZED_REVIEWER",
                    path,
                    {"severity": "WARNING"},
                )
                self.send_json(
                    403,
                    {
                        "error": "Forbidden: Identity is not authorized in ALLOWED_REVIEWER_EMAILS / ALLOWED_REVIEWER_DOMAINS",
                    },
                )
                return
        else:
            rev_email, rev_name = "", ""

        if path == "/api/config":
            self.send_json(200, {
                "project_id": PROJECT_ID,
                "bq_dataset": BQ_DATASET,
                "gcs_bucket": get_bucket_name(PROJECT_ID),
                "reviewer_email": rev_email,
                "reviewer_name": rev_name,
            })
            return

        if path == "/api/logs":
            force_refresh = qs.get("force_refresh", ["false"])[0].lower() == "true"
            self.emit_access_audit_log(rev_email, "LIST_COMPLIANCE_LOGS", f"{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}", {"force_refresh": force_refresh})
            try:
                data = build_compliance_dataset(PROJECT_ID, force_refresh=force_refresh)
                self.send_json(200, data)
            except Exception as e:
                print(f"[!] Error in /api/logs: {e}")
                self.send_json(500, {"error": "Failed to query compliance dataset"})
            return

        if path == "/api/search":
            q = (qs.get("q", [""])[0] or "").strip()
            user_email = (qs.get("user_email", [""])[0] or "").strip().lower()
            if len(q) < 2 and not user_email:
                self.send_json(200, {"matched_sessions": [], "matched_notebooks": [], "total_matches": 0})
                return
            self.emit_access_audit_log(rev_email, "SEARCH_COMPLIANCE_LOGS", f"{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}", {"query_length": len(q), "filtered_user": user_email})
            try:
                sql = f"""
                    WITH matched AS (
                      SELECT DISTINCT session_id
                      FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`
                      WHERE (
                        @search_term = ''
                        OR SEARCH((prompt_text, response_text, thought_text, files), @search_term)
                        OR LOWER(prompt_text) LIKE CONCAT('%', LOWER(@search_term), '%')
                        OR LOWER(response_text) LIKE CONCAT('%', LOWER(@search_term), '%')
                        OR LOWER(session_display_name) LIKE CONCAT('%', LOWER(@search_term), '%')
                        OR LOWER(user_iam_principal) LIKE CONCAT('%', LOWER(@search_term), '%')
                      )
                      AND (@user_email = '' OR LOWER(user_iam_principal) LIKE CONCAT('%', @user_email, '%'))
                      LIMIT 200
                    )
                    SELECT
                      t.session_id,
                      t.turn_index,
                      t.query_id,
                      t.assist_answer_id,
                      t.engine_id,
                      t.location,
                      t.user_iam_principal,
                      t.session_display_name,
                      t.prompt_text,
                      t.response_text,
                      t.thought_text,
                      t.model_name,
                      t.session_transcript_gcs_uri,
                      t.session_transcript_console_url,
                      t.files,
                      t.event_timestamp,
                      t.harvested_at
                    FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}` AS t
                    INNER JOIN matched AS m
                      ON t.session_id = m.session_id
                    ORDER BY t.event_timestamp DESC, t.session_id, t.turn_index ASC
                    LIMIT 2000
                """
                params = [
                    {
                        "name": "search_term",
                        "parameterType": {"type": "STRING"},
                        "parameterValue": {"value": q},
                    },
                    {
                        "name": "user_email",
                        "parameterType": {"type": "STRING"},
                        "parameterValue": {"value": user_email},
                    },
                ]
                rows = run_bq_query(PROJECT_ID, sql, params)
                matched_sessions = sorted({
                    str(r["session_id"])
                    for r in rows
                    if not str(r.get("engine_id") or "").startswith("notebooklm-enterprise")
                })
                matched_notebooks = sorted({
                    str(r["session_id"])
                    for r in rows
                    if str(r.get("engine_id") or "").startswith("notebooklm-enterprise")
                })
                search_dataset = _transform_bq_rows_to_dataset(rows, PROJECT_ID, get_bucket_name(PROJECT_ID))
                self.send_json(200, {
                    "matched_sessions": matched_sessions,
                    "matched_notebooks": matched_notebooks,
                    "total_matches": len(matched_sessions) + len(matched_notebooks),
                    "search_dataset": search_dataset,
                })
            except Exception as e:
                print(f"[!] Error in /api/search: {e}")
                self.send_json(500, {"error": "Search query failed"})
            return

        if path == "/api/signed-url":
            gcs_uri = (qs.get("gcs_uri", [""])[0] or "").strip()
            try:
                validate_archive_gcs_uri(gcs_uri, get_bucket_name(PROJECT_ID))
                proxy_url = f"/api/media?gcs_uri={urllib.parse.quote(gcs_uri)}"
                self.send_json(200, {"url": proxy_url, "gcs_uri": gcs_uri})
            except PermissionError as e:
                self.send_json(403, {"error": str(e)})
            except ValueError as e:
                self.send_json(400, {"error": str(e)})
            return

        if path == "/api/media":
            gcs_uri = (qs.get("gcs_uri", [""])[0] or "").strip()
            is_download = qs.get("download", ["false"])[0].lower() == "true"
            try:
                bucket, obj_path = validate_archive_gcs_uri(gcs_uri, get_bucket_name(PROJECT_ID))
            except PermissionError as e:
                self.send_json(403, {"error": str(e)})
                return
            except ValueError as e:
                self.send_json(400, {"error": str(e)})
                return

            self.emit_access_audit_log(rev_email, "STREAM_ARCHIVE_MEDIA", gcs_uri, {"download": is_download})
            try:
                gcp_token = get_gcp_access_token()
                encoded_obj = urllib.parse.quote(obj_path, safe="")
                media_url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{encoded_obj}?alt=media"
                headers = _build_gcs_headers(gcp_token)
                range_header = self.headers.get("Range")
                if range_header:
                    headers["Range"] = range_header

                req = urllib.request.Request(media_url, headers=headers)
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as gcs_resp:
                    status_code = gcs_resp.getcode() or 200
                    content_type = gcs_resp.headers.get("Content-Type") or "application/octet-stream"
                    fname = os.path.basename(obj_path)
                    if content_type == "application/octet-stream":
                        guessed_type, _ = mimetypes.guess_type(fname)
                        if guessed_type:
                            content_type = guessed_type

                    # Prevent Stored XSS via active web content types (.html, .svg, .xml):
                    # never render HTML/SVG/XML inline as executable documents under the portal origin.
                    lower_fname = fname.lower()
                    lower_ct = content_type.lower()
                    is_active_web_doc = (
                        lower_fname.endswith((".html", ".htm", ".svg", ".xml", ".xhtml"))
                        or "html" in lower_ct
                        or "svg" in lower_ct
                        or "xml" in lower_ct
                    )
                    if is_active_web_doc:
                        content_type = "text/plain; charset=utf-8"
                        is_download = True

                    is_inline_pdf = (not is_download) and (
                        lower_fname.endswith(".pdf") or lower_ct.startswith("application/pdf")
                    )
                    self.send_response(status_code)
                    self.send_security_headers(is_media=True, allow_sameorigin_frame=is_inline_pdf)
                    self.send_header("Content-Type", content_type)
                    upstream_len = gcs_resp.headers.get("Content-Length")
                    if upstream_len and upstream_len.isdigit():
                        self.send_header("Content-Length", upstream_len)
                    self.send_header("Accept-Ranges", "bytes")
                    content_range = gcs_resp.headers.get("Content-Range")
                    if content_range:
                        self.send_header("Content-Range", content_range)
                    disp = "attachment" if is_download else "inline"
                    safe_fname = re.sub(r'[^A-Za-z0-9._-]', '_', fname)
                    self.send_header("Content-Disposition", f'{disp}; filename="{safe_fname}"')
                    self.end_headers()
                    while True:
                        chunk = gcs_resp.read(65536)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except urllib.error.HTTPError as e:
                self.send_json(e.code, {"error": f"GCS media fetch failed (HTTP {e.code})"})
            except Exception as e:
                print(f"[!] Error streaming /api/media for {gcs_uri}: {e}")
                self.send_json(500, {"error": "Internal media streaming error"})
            return

        # Serve compiled SPA static files from DIST_DIR with strict trailing-separator boundary check
        rel_path = path.lstrip("/") or "index.html"
        dist_real = os.path.realpath(DIST_DIR)
        candidate = os.path.realpath(os.path.join(DIST_DIR, rel_path))
        if not (candidate == dist_real or candidate.startswith(dist_real + os.sep)) or not os.path.isfile(candidate):
            candidate = os.path.join(dist_real, "index.html")

        if not os.path.isfile(candidate):
            self.send_json(404, {"error": "Static build not found. Run npm run build in portal/."})
            return

        ctype, _ = mimetypes.guess_type(candidate)
        with open(candidate, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_security_headers(is_media=False)
        self.send_header("Content-Type", ctype or "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _reject_unsupported_method(self) -> None:
        self.send_json(405, {"error": "Method Not Allowed"})

    do_POST = _reject_unsupported_method
    do_PUT = _reject_unsupported_method
    do_DELETE = _reject_unsupported_method
    do_PATCH = _reject_unsupported_method
    do_TRACE = _reject_unsupported_method


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    bind_host = "0.0.0.0" if os.environ.get("K_SERVICE") else os.environ.get("BIND_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((bind_host, port), PortalRequestHandler)
    print(f"[*] Gemini Enterprise eDiscovery Review Portal listening on http://{bind_host}:{port}")
    server.serve_forever()
