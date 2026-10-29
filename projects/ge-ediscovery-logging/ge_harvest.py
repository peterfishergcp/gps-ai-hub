#!/usr/bin/env python3
"""
ge_harvest.py — Gemini Enterprise & NotebookLM Enterprise Server-Side eDiscovery Harvester

Discovers Gemini Enterprise user sessions and file uploads from Cloud Logging
(discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity and
discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity), mints
per-user Workforce Identity Federation STS tokens via the 'ediscovery-archiver'
OIDC provider signed by Google Cloud KMS (asymmetricSign RSA_SIGN_PKCS1_2048_SHA256
— zero private keys on disk), fetches full untruncated session transcripts
(GetSession?includeAnswerDetails=true), downloads all USER_PROVIDED and
AI_GENERATED files via the :downloadFile endpoint, archives transcripts and
binaries to Cloud Storage, and loads structured reporting rows into BigQuery.

Supports both:
  - Real-time event-driven execution on Cloud Run (via harvest_single_event)
  - Batch CLI / sweep execution (python3 ge_harvest.py --hours=168)
"""

import argparse
import base64
import datetime
import hashlib
import html
import json
import os
import re
import ssl
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
PROJECT_NUMBER = os.environ.get("GCP_PROJECT_NUMBER", "")
WORKFORCE_POOL_ID = os.environ.get("WORKFORCE_POOL_ID", "")
PROVIDER_ID = os.environ.get("ARCHIVER_PROVIDER_ID", "ediscovery-archiver")
CLIENT_ID = os.environ.get("ARCHIVER_CLIENT_ID", "ediscovery-archiver")

KMS_LOCATION = os.environ.get("KMS_LOCATION", "us-central1")
KMS_KEYRING = os.environ.get("KMS_KEYRING", "ge-ediscovery-kr")
KMS_KEY = os.environ.get("KMS_KEY", "ediscovery-archiver-jwt-key")
KMS_KEY_VERSION = os.environ.get("KMS_KEY_VERSION", "1")
KMS_KEY_ID = os.environ.get("KMS_KEY_ID", "archiver-kms-key-1")

BQ_DATASET = os.environ.get("BQ_DATASET", "ge_ediscovery")
BQ_TABLE = os.environ.get("BQ_TABLE", "conversation_turns")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DISCOVERY_ENGINE_HOSTS: dict[str, str] = {
    "global": "discoveryengine.googleapis.com",
    "us": "us-discoveryengine.googleapis.com",
    "eu": "eu-discoveryengine.googleapis.com",
}

SESSION_RESOURCE_RE = re.compile(
    r"^projects/([a-z0-9-]+|\d+)/locations/(global|us|eu)/collections/[A-Za-z0-9_-]+/engines/([A-Za-z0-9_-]{1,128})/sessions/([A-Za-z0-9_-]{1,128})$"
)
NOTEBOOK_RESOURCE_RE = re.compile(
    r"^projects/([a-z0-9-]+|\d+)/locations/(global|us|eu)/notebooks/([A-Za-z0-9_-]{1,128})$"
)
NOTEBOOK_CHILD_RESOURCE_RE = re.compile(
    r"^projects/([a-z0-9-]+|\d+)/locations/(global|us|eu)/notebooks/([A-Za-z0-9_-]{1,128})/(sources|audioOverviews|artifacts|notes)/([A-Za-z0-9_-]{1,128})$"
)


def get_discovery_engine_host(loc: str) -> str:
    """Maps a validated location ('global', 'us', 'eu') to a static Discovery Engine hostname (mitigates SSRF C1)."""
    host = DISCOVERY_ENGINE_HOSTS.get(loc)
    if not host:
        raise ValueError(f"Invalid or unsupported Discovery Engine location: {loc!r}")
    return host

SSL_CTX = (
    ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    if os.path.exists("/etc/ssl/cert.pem")
    else ssl.create_default_context()
)

_STS_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_GCP_TOKEN_CACHE: dict[str, tuple[str, float]] = {}


def get_bucket_name(project_id: str) -> str:
    return os.environ.get("GCS_BUCKET_NAME") or f"{project_id}-ge-ediscovery"


def get_issuer_uri(project_id: str) -> str:
    return os.environ.get("ARCHIVER_ISSUER_URI") or f"https://ediscovery.{project_id}.internal"


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def get_gcp_access_token() -> str:
    """
    Obtains a Google Cloud OAuth2 access token for the Harvester's own identity:
      1. Checks the Cloud Run / GCE Metadata Server first (zero subprocess overhead).
      2. Falls back to `gcloud auth print-access-token` when running locally.
    """
    now = time.time()
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
            _GCP_TOKEN_CACHE["default"] = (token, now + expires_in)
            return token
    except Exception:
        pass

    token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode("utf-8").strip()
    _GCP_TOKEN_CACHE["default"] = (token, now + 300)
    return token


def compute_crc32c_base64(data: bytes) -> str:
    """Computes RFC 3720 CRC32C (Castagnoli) and returns standard base64 string."""
    poly = 0x82F63B78
    crc = 0xFFFFFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ poly
            else:
                crc >>= 1
    crc ^= 0xFFFFFFFF
    return base64.b64encode(struct.pack(">I", crc)).decode("ascii")


def detect_mime_and_extension(mime_type: str, data: bytes, file_name: str = "") -> tuple[str, str]:
    """
    Resolves the canonical (mime_type, extension) from declared MIME type, filename,
    and binary magic bytes. Upgrades generic 'application/octet-stream' payloads
    using magic-byte inspection.
    """
    mime = (mime_type or "").lower().split(";")[0].strip()
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "video/mp4": ".mp4",
        "text/html": ".html",
        "text/plain": ".txt",
        "text/csv": ".csv",
        "text/markdown": ".md",
        "application/json": ".json",
        "application/zip": ".zip",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    }

    magic_mime = ""
    magic_ext = ""
    if data:
        if data.startswith(b"%PDF-"):
            magic_mime, magic_ext = "application/pdf", ".pdf"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            magic_mime, magic_ext = "image/png", ".png"
        elif data.startswith(b"\xff\xd8\xff"):
            magic_mime, magic_ext = "image/jpeg", ".jpg"
        elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            magic_mime, magic_ext = "image/webp", ".webp"
        elif len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE":
            magic_mime, magic_ext = "audio/wav", ".wav"
        elif data.startswith((b"GIF87a", b"GIF89a")):
            magic_mime, magic_ext = "image/gif", ".gif"
        elif data.startswith(b"ID3") or data[:2] in (b"\xff\xfb", b"\xff\xf3", b"\xff\xf2"):
            magic_mime, magic_ext = "audio/mpeg", ".mp3"
        elif len(data) >= 12 and data[4:8] == b"ftyp":
            magic_mime, magic_ext = "video/mp4", ".mp4"
        elif data.startswith(b"PK\x03\x04"):
            header_window = data[:4096]
            if b"word/" in header_window:
                magic_mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                magic_ext = ".docx"
            elif b"xl/" in header_window:
                magic_mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                magic_ext = ".xlsx"
            elif b"ppt/" in header_window:
                magic_mime = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                magic_ext = ".pptx"
            else:
                magic_mime, magic_ext = "application/zip", ".zip"
        elif data.lstrip()[:15].lower().startswith((b"<!doctype html", b"<html")):
            magic_mime, magic_ext = "text/html", ".html"

    if not mime or mime == "application/octet-stream":
        if magic_mime:
            return magic_mime, magic_ext
        if file_name:
            _, fn_ext = os.path.splitext(file_name.lower())
            rev_map = {v: k for k, v in ext_map.items()}
            if fn_ext in rev_map:
                return rev_map[fn_ext], fn_ext

    if mime in ext_map:
        return mime, ext_map[mime]
    if magic_ext:
        return magic_mime or mime or "application/octet-stream", magic_ext
    return mime or "application/octet-stream", ".bin"


def guess_extension(mime_type: str, data: bytes) -> str:
    _, ext = detect_mime_and_extension(mime_type, data)
    return ext


def sanitize_filename(name: str) -> str:
    base = os.path.basename(name or "artifact")
    return re.sub(r"[^A-Za-z0-9._-]", "_", base)


def sign_jwt_with_kms(signing_input: str, project_id: str) -> bytes:
    """
    Signs an ASCII JWT signing_input (header.payload) using Google Cloud KMS
    asymmetricSign REST API (RSA_SIGN_PKCS1_2048_SHA256).
    Never exposes or stores a private key on disk or in memory.
    """
    digest_bytes = hashlib.sha256(signing_input.encode("ascii")).digest()
    digest_b64 = base64.b64encode(digest_bytes).decode("ascii")
    kms_url = (
        f"https://cloudkms.googleapis.com/v1/projects/{project_id}"
        f"/locations/{KMS_LOCATION}/keyRings/{KMS_KEYRING}"
        f"/cryptoKeys/{KMS_KEY}/cryptoKeyVersions/{KMS_KEY_VERSION}:asymmetricSign"
    )
    gcp_token = get_gcp_access_token()
    body = json.dumps({"digest": {"sha256": digest_b64}}).encode("utf-8")
    req = urllib.request.Request(
        kms_url,
        data=body,
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        resp_data = json.loads(resp.read().decode("utf-8"))
        return base64.b64decode(resp_data["signature"])


def _validate_sts_subject_policy(subject: str) -> None:
    """
    Enforces subject denylist (`ARCHIVER_DENIED_SUBJECTS`) and optional domain allowlist
    (`ARCHIVER_ALLOWED_SUBJECT_DOMAINS`) prior to Cloud KMS JWT signing (mitigates ED-1).
    """
    sub_lower = subject.strip().lower()
    denied_raw = os.environ.get("ARCHIVER_DENIED_SUBJECTS", "")
    denied_set = {s.strip().lower() for s in denied_raw.split(",") if s.strip()}
    if sub_lower in denied_set:
        raise PermissionError(f"WIF subject '{subject}' is blocked by ARCHIVER_DENIED_SUBJECTS")

    allowed_domains_raw = os.environ.get("ARCHIVER_ALLOWED_SUBJECT_DOMAINS", "")
    allowed_domains = {d.strip().lower().lstrip("@") for d in allowed_domains_raw.split(",") if d.strip()}
    if allowed_domains:
        if "@" in sub_lower:
            domain = sub_lower.rsplit("@", 1)[1]
            if domain not in allowed_domains:
                raise PermissionError(
                    f"WIF subject domain '{domain}' is not in ARCHIVER_ALLOWED_SUBJECT_DOMAINS"
                )
        elif os.environ.get("ARCHIVER_REQUIRE_EMAIL_SUBJECT", "false").lower() == "true":
            raise PermissionError(
                f"Non-email WIF subject '{subject}' rejected because ARCHIVER_REQUIRE_EMAIL_SUBJECT=true"
            )


def mint_sts_token(subject: str, project_id: str, workforce_pool_id: str) -> str:
    """
    Mints an OAuth2 access token for the given WIF subject via STS token exchange
    backed exclusively by Google Cloud KMS asymmetricSign (zero private keys on disk).
    Enforces subject denylist/domain policy and attaches an IAM Credential Access Boundary
    scoping the minted token strictly to Discovery Engine in `project_id` (mitigates ED-1).
    """
    if "/subject/" in subject:
        subject = subject.split("/subject/", 1)[1].strip()
    if not subject or len(subject) > 256 or subject.endswith(".gserviceaccount.com"):
        raise ValueError("Invalid WIF subject for STS token exchange")
    _validate_sts_subject_policy(subject)

    cache_key = f"{project_id}:{workforce_pool_id}:{subject}"
    now = int(time.time())
    cached = _STS_TOKEN_CACHE.get(cache_key)
    if cached and cached[1] > now + 60:
        return cached[0]

    header = {"alg": "RS256", "typ": "JWT", "kid": KMS_KEY_ID}
    payload = {
        "iss": get_issuer_uri(project_id),
        "sub": subject,
        "aud": CLIENT_ID,
        "purpose": "ediscovery_harvest",
        "iat": now - 60,
        "exp": now + 900,
    }
    signing_input = (
        f"{b64url_encode(json.dumps(header).encode('utf-8'))}."
        f"{b64url_encode(json.dumps(payload).encode('utf-8'))}"
    )

    sig = sign_jwt_with_kms(signing_input, project_id)
    jwt_token = f"{signing_input}.{b64url_encode(sig)}"

    sts_options: dict = {"userProject": project_id}
    if os.environ.get("DISABLE_STS_ACCESS_BOUNDARY", "false").lower() != "true":
        sts_options["accessBoundary"] = {
            "accessBoundaryRules": [
                {
                    "availableResource": f"//discoveryengine.googleapis.com/projects/{project_id}",
                    "availablePermissions": ["inRole:roles/discoveryengine.user"],
                }
            ]
        }

    sts_body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "audience": f"//iam.googleapis.com/locations/global/workforcePools/{workforce_pool_id}/providers/{PROVIDER_ID}",
        "scope": "https://www.googleapis.com/auth/discoveryengine.readwrite https://www.googleapis.com/auth/discoveryengine.assist.readwrite",
        "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "subject_token": jwt_token,
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "options": json.dumps(sts_options),
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://sts.googleapis.com/v1/token",
        data=sts_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        token = data["access_token"]
        expires_in = min(float(data.get("expires_in", 900)), 900.0)
        _STS_TOKEN_CACHE[cache_key] = (token, now + expires_in)
        return token


def read_cloud_logging_entries(
    project_id: str,
    log_filter: str,
    page_size: int = 500,
    max_entries: int = int(os.environ.get("CLOUD_LOGGING_MAX_ENTRIES", "100000")),
) -> list[dict]:
    """Reads log entries via the Cloud Logging REST API (`entries:list`) with full `nextPageToken` pagination."""
    gcp_token = get_gcp_access_token()
    url = "https://logging.googleapis.com/v2/entries:list"
    entries: list[dict] = []
    page_token = ""

    while True:
        remaining = (max_entries - len(entries)) if max_entries > 0 else page_size
        if max_entries > 0 and remaining <= 0:
            break
        req_payload: dict = {
            "resourceNames": [f"projects/{project_id}"],
            "filter": log_filter,
            "orderBy": "timestamp desc",
            "pageSize": min(page_size, max(1, remaining)),
        }
        if page_token:
            req_payload["pageToken"] = page_token

        req = urllib.request.Request(
            url,
            data=json.dumps(req_payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {gcp_token}",
                "Content-Type": "application/json",
                "X-Goog-User-Project": project_id,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        batch = data.get("entries", [])
        entries.extend(batch)
        page_token = data.get("nextPageToken", "")
        if not page_token:
            break

    return entries[:max_entries] if max_entries > 0 else entries


def discover_from_cloud_logging(project_id: str, hours: int = 72, extra_filter: str = "") -> dict[str, dict]:
    """
    Reads discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity logs
    and returns a mapping of session_resource_name -> metadata dict.
    """
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    log_filter = (
        f'logName="projects/{project_id}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" '
        f'AND timestamp>="{cutoff}" '
        f'AND (jsonPayload.logMetadata.methodName="StreamAssist" '
        f'OR jsonPayload.logMetadata.methodName="UploadSessionFile" '
        f'OR jsonPayload.logMetadata.methodName="AddContextFile")'
    )
    if extra_filter:
        log_filter += f" AND ({extra_filter})"
    entries = read_cloud_logging_entries(project_id, log_filter, page_size=500)

    sessions: dict[str, dict] = {}
    for entry in entries:
        jp = entry.get("jsonPayload", {})
        meta = jp.get("logMetadata", {})
        method = meta.get("methodName", "")
        raw_principal = jp.get("userIamPrincipal", "")
        user_principal = "" if raw_principal == "<elided>" else raw_principal
        ts = entry.get("timestamp") or meta.get("timestamp")
        severity = entry.get("severity", "INFO")
        status_code = jp.get("status", {}).get("code", 0)

        if method == "StreamAssist":
            ans_name = jp.get("response", {}).get("answer", {}).get("name", "")
            if "/sessions/" not in ans_name:
                continue
            session_name = ans_name.split("/assistAnswers/")[0]
            answer_id = ans_name.split("/assistAnswers/")[1] if "/assistAnswers/" in ans_name else ""
            model_name = jp.get("response", {}).get("modelInfo", {}).get("model", "")
            agent_disp = jp.get("response", {}).get("agentInfo", {}).get("displayName", "")
            if agent_disp and model_name:
                model_name = f"{agent_disp} ({model_name})"
            elif agent_disp:
                model_name = agent_disp

            info = sessions.setdefault(session_name, {
                "session_name": session_name,
                "user_iam_principal": user_principal,
                "uploaded_file_ids": set(),
                "logged_file_names": {},
                "turn_models": {},
                "turn_timestamps": {},
                "latest_timestamp": ts,
            })
            if user_principal and not info["user_iam_principal"]:
                info["user_iam_principal"] = user_principal
            if answer_id:
                if model_name:
                    info["turn_models"][answer_id] = model_name
                if ts:
                    info["turn_timestamps"][answer_id] = ts

        elif method in ("UploadSessionFile", "AddContextFile"):
            session_name = (
                jp.get("response", {}).get("session")
                or jp.get("request", {}).get("name")
                or meta.get("name", "")
            )
            if "/sessions/" not in session_name:
                continue
            file_id = jp.get("response", {}).get("fileId", "")
            file_name = jp.get("response", {}).get("fileName") or jp.get("request", {}).get("fileName") or ""
            if not file_id or severity == "ERROR" or status_code != 0:
                continue
            info = sessions.setdefault(session_name, {
                "session_name": session_name,
                "user_iam_principal": user_principal,
                "uploaded_file_ids": set(),
                "logged_file_names": {},
                "turn_models": {},
                "turn_timestamps": {},
                "latest_timestamp": ts,
            })
            if user_principal and not info["user_iam_principal"]:
                info["user_iam_principal"] = user_principal
            if file_name:
                info["logged_file_names"][file_id] = file_name
            if method == "UploadSessionFile":
                info["uploaded_file_ids"].add(file_id)

    return sessions


_PROJECT_NUMBER_CACHE: dict[str, str] = {}


def _is_allowed_project_segment(proj_seg: str) -> bool:
    """
    Verifies that the `projects/<proj_seg>` segment in a Discovery Engine resource name
    belongs to the configured `PROJECT_ID` (either its project ID or its numeric project number).
    Fails closed when `PROJECT_ID` is unset (mitigates C1 / ED-1 cross-project resource injection).
    """
    if not PROJECT_ID:
        return False
    allowed = {PROJECT_ID}
    if PROJECT_NUMBER:
        allowed.add(PROJECT_NUMBER)
    if proj_seg in allowed:
        return True
    if proj_seg.isdigit():
        cached_num = _PROJECT_NUMBER_CACHE.get(PROJECT_ID)
        if cached_num is None:
            try:
                gcp_token = get_gcp_access_token()
                req = urllib.request.Request(
                    f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}",
                    headers={"Authorization": f"Bearer {gcp_token}"},
                )
                with urllib.request.urlopen(req, context=SSL_CTX, timeout=5) as resp:
                    pdata = json.loads(resp.read().decode("utf-8"))
                    cached_num = str(pdata.get("projectNumber") or "")
            except Exception:
                cached_num = ""
            _PROJECT_NUMBER_CACHE[PROJECT_ID] = cached_num
        if cached_num and proj_seg == cached_num:
            return True
    return False


def parse_session_resource(session_name: str) -> tuple[str, str, str]:
    """
    Validates a full session resource name against SESSION_RESOURCE_RE and pins the
    project segment to PROJECT_ID / PROJECT_NUMBER. Returns (location, engine_id, session_id).
    Prevents SSRF / cross-project path injection via forged logs (C1).
    """
    m = SESSION_RESOURCE_RE.fullmatch((session_name or "").strip())
    if not m:
        raise ValueError(f"Rejected invalid session resource name: {session_name!r}")
    proj, loc, engine_id, session_id = m.group(1), m.group(2), m.group(3), m.group(4)
    if not _is_allowed_project_segment(proj):
        raise ValueError(f"Rejected cross-project session resource '{proj}' (expected {PROJECT_ID!r})")
    return loc, engine_id, session_id


def parse_notebook_resource(nb_name: str) -> tuple[str, str]:
    """
    Validates a full notebook resource name against NOTEBOOK_RESOURCE_RE and pins the
    project segment to PROJECT_ID / PROJECT_NUMBER. Returns (location, notebook_id).
    Prevents SSRF / cross-project path injection via forged logs (C1).
    """
    m = NOTEBOOK_RESOURCE_RE.fullmatch((nb_name or "").strip())
    if not m:
        raise ValueError(f"Rejected invalid notebook resource name: {nb_name!r}")
    proj, loc, nb_id = m.group(1), m.group(2), m.group(3)
    if not _is_allowed_project_segment(proj):
        raise ValueError(f"Rejected cross-project notebook resource '{proj}' (expected {PROJECT_ID!r})")
    return loc, nb_id


def fetch_session_details(session_name: str, token: str, project_id: str) -> dict:
    loc, _, _ = parse_session_resource(session_name)
    host = get_discovery_engine_host(loc)
    url = f"https://{host}/v1alpha/{session_name}?includeAnswerDetails=true"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": project_id,
        },
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_session_file(session_name: str, file_id: str, token: str, project_id: str) -> tuple[bytes, str, str]:
    """
    Downloads a binary file from Discovery Engine using the :downloadFile endpoint.
    Returns (raw_bytes, mime_type, filename).
    """
    loc, _, _ = parse_session_resource(session_name)
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", file_id or ""):
        raise ValueError(f"Invalid file_id: {file_id!r}")
    host = get_discovery_engine_host(loc)
    url = f"https://{host}/v1/{session_name}:downloadFile?file_id={file_id}&alt=media"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": project_id,
        },
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        data = resp.read()
        content_type = resp.headers.get("Content-Type", "application/octet-stream")
        cd = resp.headers.get("Content-Disposition", "")
        fname = ""
        if "filename=" in cd:
            fname = cd.split("filename=", 1)[1].strip('"; ')
        return data, content_type, fname


def upload_bytes_to_gcs(
    data: bytes,
    gcs_object_path: str,
    bucket_name: str,
    project_id: str,
    content_type: str = "application/octet-stream",
) -> tuple[str, str]:
    """Uploads bytes to gs://{bucket_name}/{gcs_object_path} via the GCS JSON API and returns (gcs_uri, console_url)."""
    gcs_uri = f"gs://{bucket_name}/{gcs_object_path}"
    console_url = f"https://storage.cloud.google.com/{bucket_name}/{urllib.parse.quote(gcs_object_path, safe='/')}"
    gcp_token = get_gcp_access_token()
    encoded_name = urllib.parse.quote(gcs_object_path, safe="")
    upload_url = f"https://storage.googleapis.com/upload/storage/v1/b/{bucket_name}/o?uploadType=media&name={encoded_name}"
    gcs_headers = {
        "Authorization": f"Bearer {gcp_token}",
        "Content-Type": content_type,
    }
    requester_pays_proj = os.environ.get("GCS_USER_PROJECT", "").strip()
    if requester_pays_proj:
        gcs_headers["X-Goog-User-Project"] = requester_pays_proj
    req = urllib.request.Request(
        upload_url,
        data=data,
        headers=gcs_headers,
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        resp.read()
    return gcs_uri, console_url


def extract_canvas_slides(turn: dict, turn_idx: int) -> tuple[bytes, str] | None:
    """
    Inspects a turn's detailedAssistAnswer (steps and replies) for Canvas
    `save_slides_to_artifact` tool calls and compiles them into a standalone,
    self-contained HTML slide presentation (`text/html`).
    """
    detailed = turn.get("detailedAssistAnswer", {})
    slides_raw: list[dict] = []

    def _collect_slides(obj: object) -> None:
        if isinstance(obj, dict):
            fn_call = obj.get("functionCall") or obj.get("toolCall")
            if isinstance(fn_call, dict) and fn_call.get("name") == "save_slides_to_artifact":
                args = fn_call.get("args") or {}
                if isinstance(args.get("slides"), list):
                    slides_raw.extend(args["slides"])
            if obj.get("name") == "save_slides_to_artifact" and isinstance(obj.get("args", {}).get("slides"), list):
                slides_raw.extend(obj["args"]["slides"])
            for v in obj.values():
                _collect_slides(v)
        elif isinstance(obj, list):
            for item in obj:
                _collect_slides(item)

    _collect_slides(detailed)
    if not slides_raw:
        return None

    slide_sections: list[str] = []
    for s_idx, s in enumerate(slides_raw, start=1):
        if not isinstance(s, dict):
            continue
        s_html = s.get("html") or s.get("content") or ""
        s_title = html.escape(str(s.get("title") or f"Slide {s_idx}"), quote=True)
        if s_html:
            slide_sections.append(
                f'<section class="canvas-slide" data-slide-index="{s_idx}" data-slide-title="{s_title}">\n'
                f"{s_html}\n"
                f"</section>"
            )

    if not slide_sections:
        return None

    compiled_html = (
        "<!DOCTYPE html>\n"
        "<html lang=\"en\">\n"
        "<head>\n"
        "  <meta charset=\"utf-8\" />\n"
        f"  <title>Canvas Slide Deck — Turn {turn_idx}</title>\n"
        "  <style>\n"
        "    body { margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: system-ui, sans-serif; }\n"
        "    .canvas-slide { margin: 0 auto 32px auto; max-width: 1280px; min-height: 720px; background: #ffffff; color: #0f172a; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.4); position: relative; }\n"
        "  </style>\n"
        "</head>\n"
        "<body>\n"
        + "\n".join(slide_sections)
        + "\n</body>\n</html>\n"
    )
    return compiled_html.encode("utf-8"), f"canvas_slides_turn_{turn_idx}.html"


def extract_turn_content(turn: dict) -> tuple[str, str, list[dict], str]:
    """
    Extracts (response_text, thought_text, reply_files, turn_timestamp) from a session turn's
    detailedAssistAnswer.replies[] array.
    """
    detailed = turn.get("detailedAssistAnswer", {})
    replies = detailed.get("replies", [])
    visible_parts: list[str] = []
    thought_parts: list[str] = []
    reply_files: list[dict] = []
    turn_ts = ""

    for rep in replies:
        if rep.get("createTime") and not turn_ts:
            turn_ts = rep["createTime"]
        gc = rep.get("groundedContent", {})
        content = gc.get("content", {})
        is_thought = bool(content.get("thought"))
        txt = content.get("text", "")
        if txt:
            if is_thought:
                thought_parts.append(txt)
            else:
                visible_parts.append(txt)

        if "executableCode" in content:
            code_str = content["executableCode"].get("code", "")
            if code_str:
                visible_parts.append(f"\n```python\n{code_str}\n```\n")
        if "codeExecutionResult" in content:
            out_str = content["codeExecutionResult"].get("output", "")
            if out_str:
                visible_parts.append(f"\n```text\n{out_str}\n```\n")

        file_obj = content.get("file")
        if isinstance(file_obj, dict) and file_obj.get("fileId"):
            reply_files.append({
                "file_id": file_obj["fileId"],
                "mime_type": file_obj.get("mimeType", ""),
                "file_name": file_obj.get("name", ""),
            })

    return (
        "\n".join(visible_parts).strip(),
        "\n".join(thought_parts).strip(),
        reply_files,
        turn_ts,
    )


FALLBACK_PRINCIPALS = [
    p.strip()
    for p in os.environ.get("FALLBACK_PRINCIPALS", "").split(",")
    if p.strip()
]


def harvest_session(
    session_info: dict,
    project_id: str,
    workforce_pool_id: str,
    bucket_name: str,
) -> list[dict]:
    """
    Harvests a single session:
      1. Mints STS token for the owning user_iam_principal (or probes FALLBACK_PRINCIPALS if <elided>).
      2. Calls GetSession?includeAnswerDetails=true.
      3. Archives the raw session JSON transcript to GCS.
      4. Downloads all USER_PROVIDED and AI_GENERATED files via :downloadFile and archives them to GCS.
      5. Compiles any interactive Canvas slide decks (`save_slides_to_artifact`) into standalone HTML artifacts.
      6. Returns the BigQuery rows for conversation_turns.
    """
    session_name = session_info["session_name"]
    raw_principal = session_info.get("user_iam_principal") or ""
    user_principal = "" if raw_principal == "<elided>" else raw_principal
    loc, engine_id, session_id = parse_session_resource(session_name)

    print(f"\n=== Harvesting Session {session_id} (Engine: {engine_id}, User: {user_principal or '<elided/probing>'}) ===")

    candidates: list[str] = []
    if user_principal:
        candidates.append(user_principal)
    for fp in FALLBACK_PRINCIPALS:
        if fp not in candidates:
            candidates.append(fp)

    session_data = None
    token = ""
    resolved_principal = user_principal
    last_err = None

    for candidate in candidates:
        try:
            try:
                cand_token = get_token_for_principal(candidate, project_id, workforce_pool_id)
            except Exception:
                cand_token = get_gcp_access_token()
            session_data = fetch_session_details(session_name, cand_token, project_id)
            token = cand_token
            resolved_principal = candidate
            if candidate != user_principal:
                print(f"  [*] Resolved elided/unowned session {session_id} owner -> {resolved_principal}")
            break
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (403, 404):
                continue
            raise

    if session_data is None:
        print(f"  [!] Skipping session {session_id}: could not resolve owner ({last_err})")
        return []

    user_principal = resolved_principal
    display_name = session_data.get("displayName", "")
    session_start = session_data.get("startTime", "")

    transcript_bytes = json.dumps(session_data, indent=2).encode("utf-8")
    transcript_sha256 = hashlib.sha256(transcript_bytes).hexdigest()[:16]
    transcript_obj_path = f"sessions/{engine_id}/{session_id}/session_transcript_{transcript_sha256}.json"
    transcript_gcs_uri, transcript_console_url = upload_bytes_to_gcs(
        transcript_bytes, transcript_obj_path, bucket_name, project_id, "application/json"
    )
    print(f"  [+] Archived full session transcript -> {transcript_gcs_uri}")

    uploaded_file_ids: set[str] = set(session_info.get("uploaded_file_ids", set()))
    turns_raw = session_data.get("turns", [])

    answered_turns: list[dict] = []
    for t in turns_raw:
        if "assistAnswer" in t or "detailedAssistAnswer" in t:
            answered_turns.append(t)
    if not answered_turns and turns_raw:
        answered_turns = turns_raw

    archived_files_by_id: dict[str, dict] = {}
    logged_file_names: dict[str, str] = session_info.get("logged_file_names", {})

    for fid in sorted(uploaded_file_ids):
        try:
            raw_bytes, dl_mime, cd_fname = download_session_file(session_name, fid, token, project_id)
            hint_name = logged_file_names.get(fid) or cd_fname or ""
            mime_type, ext = detect_mime_and_extension(dl_mime, raw_bytes, hint_name)
            raw_name = hint_name or f"user_upload_{fid}{ext}"
            fname = sanitize_filename(raw_name)
            if not os.path.splitext(fname)[1]:
                fname += ext
            gcs_path = f"files/{engine_id}/{session_id}/USER_PROVIDED/{fid}_{fname}"
            gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, bucket_name, project_id, mime_type)
            archived_files_by_id[fid] = {
                "file_id": fid,
                "file_source": "USER_PROVIDED",
                "file_name": fname,
                "mime_type": mime_type,
                "byte_size": len(raw_bytes),
                "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                "crc32c": compute_crc32c_base64(raw_bytes),
                "gcs_uri": gcs_uri,
                "console_url": console_url,
            }
            print(f"  [+] Archived USER_PROVIDED file {fid} ({len(raw_bytes)} bytes, {mime_type}) -> {gcs_uri}")
        except urllib.error.HTTPError as e:
            print(f"  [!] Skipping fileId {fid} (HTTP {e.code})")

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    bq_rows: list[dict] = []

    session_labels = session_data.get("labels", [])
    agent_label_model = ""
    if session_labels:
        disp_lbl = next((l.split(":", 1)[1] for l in session_labels if l.startswith("agent-display-name:")), "")
        type_lbl = next((l for l in session_labels if l.startswith("agent:") and l.count(":") >= 2), "")
        if disp_lbl and type_lbl:
            agent_label_model = f"{disp_lbl} [{type_lbl}]"
        elif disp_lbl:
            agent_label_model = disp_lbl
        elif type_lbl:
            agent_label_model = type_lbl

    for idx, turn in enumerate(answered_turns, start=1):
        q = turn.get("query", {})
        prompt_text = q.get("text") or ""
        if not prompt_text and isinstance(q.get("parts"), list):
            prompt_text = "\n".join(
                str(part.get("text") or "")
                for part in q["parts"]
                if isinstance(part, dict) and part.get("text")
            )
        query_id = q.get("queryId", "")
        assist_answer_full = turn.get("assistAnswer", "")
        assist_answer_id = (
            assist_answer_full.split("/assistAnswers/")[1]
            if "/assistAnswers/" in assist_answer_full
            else assist_answer_full
        )

        resp_text, thought_text, reply_files, turn_ts = extract_turn_content(turn)
        turn_files: list[dict] = []

        if idx == 1:
            for fid in sorted(uploaded_file_ids):
                if fid in archived_files_by_id:
                    turn_files.append(archived_files_by_id[fid])

        for rf in reply_files:
            fid = rf["file_id"]
            if fid not in archived_files_by_id:
                try:
                    raw_bytes, dl_mime, cd_fname = download_session_file(session_name, fid, token, project_id)
                    hint_name = rf.get("file_name") or logged_file_names.get(fid) or cd_fname or ""
                    declared_mime = rf.get("mime_type") or dl_mime
                    mime_type, ext = detect_mime_and_extension(declared_mime, raw_bytes, hint_name)
                    source_label = "USER_PROVIDED" if fid in uploaded_file_ids else "AI_GENERATED"
                    raw_name = hint_name or f"{source_label.lower()}_{fid}{ext}"
                    fname = sanitize_filename(raw_name)
                    if not os.path.splitext(fname)[1]:
                        fname += ext
                    gcs_path = f"files/{engine_id}/{session_id}/{source_label}/{fid}_{fname}"
                    gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, bucket_name, project_id, mime_type)
                    archived_files_by_id[fid] = {
                        "file_id": fid,
                        "file_source": source_label,
                        "file_name": fname,
                        "mime_type": mime_type,
                        "byte_size": len(raw_bytes),
                        "sha256": hashlib.sha256(raw_bytes).hexdigest(),
                        "crc32c": compute_crc32c_base64(raw_bytes),
                        "gcs_uri": gcs_uri,
                        "console_url": console_url,
                    }
                    print(f"  [+] Archived {source_label} file {fid} ({len(raw_bytes)} bytes, {mime_type}) -> {gcs_uri}")
                except urllib.error.HTTPError as e:
                    print(f"  [!] Could not download file {fid} in turn {idx}: HTTP {e.code}")
                    continue
            if fid in archived_files_by_id and all(x["file_id"] != fid for x in turn_files):
                turn_files.append(archived_files_by_id[fid])

        canvas_deck = extract_canvas_slides(turn, idx)
        if canvas_deck is not None:
            slide_bytes, slide_fname = canvas_deck
            slide_fid = f"canvas_slides_{assist_answer_id or idx}"
            gcs_path = f"files/{engine_id}/{session_id}/AI_GENERATED/{slide_fid}_{slide_fname}"
            gcs_uri, console_url = upload_bytes_to_gcs(slide_bytes, gcs_path, bucket_name, project_id, "text/html")
            turn_files.append({
                "file_id": slide_fid,
                "file_source": "AI_GENERATED",
                "file_name": slide_fname,
                "mime_type": "text/html",
                "byte_size": len(slide_bytes),
                "sha256": hashlib.sha256(slide_bytes).hexdigest(),
                "crc32c": compute_crc32c_base64(slide_bytes),
                "gcs_uri": gcs_uri,
                "console_url": console_url,
            })
            print(f"  [+] Archived AI_GENERATED Canvas Slide Deck ({len(slide_bytes)} bytes) -> {gcs_uri}")

        event_ts = (
            session_info.get("turn_timestamps", {}).get(assist_answer_id)
            or turn_ts
            or session_info.get("latest_timestamp")
            or session_start
            or now_iso
        )
        model_name = session_info.get("turn_models", {}).get(assist_answer_id) or agent_label_model or ""

        bq_rows.append({
            "session_id": session_id,
            "turn_index": idx,
            "query_id": query_id,
            "assist_answer_id": assist_answer_id,
            "engine_id": engine_id,
            "location": loc,
            "user_iam_principal": user_principal,
            "session_display_name": display_name,
            "prompt_text": prompt_text,
            "response_text": resp_text,
            "thought_text": thought_text,
            "model_name": model_name,
            "session_transcript_gcs_uri": transcript_gcs_uri,
            "session_transcript_console_url": transcript_console_url,
            "files": turn_files,
            "event_timestamp": event_ts,
            "harvested_at": now_iso,
        })

    return bq_rows


def load_rows_to_bigquery(rows: list[dict], project_id: str) -> None:
    """
    Non-destructively upserts rows for the harvested session_ids in BigQuery (mitigates M1 & N4):
      1. Loads the batch into a unique per-invocation staging table (`{BQ_TABLE}_staging_<uuid>`)
         so concurrent Cloud Run `/pubsub` workers never race or truncate each other's staged rows (N4).
      2. Executes an atomic DML MERGE into `{BQ_TABLE}` keyed on `(session_id, turn_index)`
         with `WHEN MATCHED AND S.harvested_at >= T.harvested_at THEN UPDATE` so stale/out-of-order
         events never overwrite newer harvested state.
      3. Cleans up the per-run staging table inside a `finally:` block.
    """
    if not rows:
        print("No rows to load into BigQuery.")
        return

    gcp_token = get_gcp_access_token()
    session_ids = sorted({str(r["session_id"]) for r in rows if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(r.get("session_id", "")))})
    if not session_ids:
        return

    staging_table = f"{BQ_TABLE}_staging_{uuid.uuid4().hex[:12]}"
    schema_path = os.path.join(BASE_DIR, "conversation_turns_schema.json")
    schema_fields = []
    if os.path.exists(schema_path):
        with open(schema_path, "r", encoding="utf-8") as sf:
            schema_fields = json.load(sf)
    if not schema_fields:
        schema_fields = [
            {"name": "session_id", "type": "STRING", "mode": "REQUIRED"},
            {"name": "turn_index", "type": "INTEGER", "mode": "REQUIRED"},
            {"name": "query_id", "type": "STRING", "mode": "NULLABLE"},
            {"name": "assist_answer_id", "type": "STRING", "mode": "NULLABLE"},
            {"name": "engine_id", "type": "STRING", "mode": "REQUIRED"},
            {"name": "location", "type": "STRING", "mode": "REQUIRED"},
            {"name": "user_iam_principal", "type": "STRING", "mode": "REQUIRED"},
            {"name": "session_display_name", "type": "STRING", "mode": "NULLABLE"},
            {"name": "prompt_text", "type": "STRING", "mode": "NULLABLE"},
            {"name": "response_text", "type": "STRING", "mode": "NULLABLE"},
            {"name": "thought_text", "type": "STRING", "mode": "NULLABLE"},
            {"name": "model_name", "type": "STRING", "mode": "NULLABLE"},
            {"name": "session_transcript_gcs_uri", "type": "STRING", "mode": "NULLABLE"},
            {"name": "session_transcript_console_url", "type": "STRING", "mode": "NULLABLE"},
            {
                "name": "files",
                "type": "RECORD",
                "mode": "REPEATED",
                "fields": [
                    {"name": "file_id", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "file_source", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "file_name", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "mime_type", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "byte_size", "type": "INTEGER", "mode": "NULLABLE"},
                    {"name": "sha256", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "crc32c", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "gcs_uri", "type": "STRING", "mode": "NULLABLE"},
                    {"name": "console_url", "type": "STRING", "mode": "NULLABLE"},
                ],
            },
            {"name": "event_timestamp", "type": "TIMESTAMP", "mode": "NULLABLE"},
            {"name": "harvested_at", "type": "TIMESTAMP", "mode": "REQUIRED"},
        ]

    try:
        # 1. Multipart Load Job into unique per-run staging table via BigQuery REST API
        boundary = "===============ge_ediscovery_bq_load_boundary=="
        load_cfg: dict = {
            "destinationTable": {
                "projectId": project_id,
                "datasetId": BQ_DATASET,
                "tableId": staging_table,
            },
            "sourceFormat": "NEWLINE_DELIMITED_JSON",
            "writeDisposition": "WRITE_TRUNCATE",
        }
        if schema_fields:
            load_cfg["schema"] = {"fields": schema_fields}

        job_config = {"configuration": {"load": load_cfg}}
        jsonl_bytes = "".join(json.dumps(r) + "\n" for r in rows).encode("utf-8")
        multipart_body = (
            f"--{boundary}\r\n"
            "Content-Type: application/json; charset=UTF-8\r\n\r\n"
            f"{json.dumps(job_config)}\r\n"
            f"--{boundary}\r\n"
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8") + jsonl_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")

        upload_url = f"https://bigquery.googleapis.com/upload/bigquery/v2/projects/{project_id}/jobs?uploadType=multipart"
        load_req = urllib.request.Request(
            upload_url,
            data=multipart_body,
            headers={
                "Authorization": f"Bearer {gcp_token}",
                "Content-Type": f"multipart/related; boundary={boundary}",
                "X-Goog-User-Project": project_id,
            },
            method="POST",
        )
        with urllib.request.urlopen(load_req, context=SSL_CTX) as resp:
            job_data = json.loads(resp.read().decode("utf-8"))

        job_id = job_data.get("jobReference", {}).get("jobId")
        job_loc = job_data.get("jobReference", {}).get("location", "US")
        while job_data.get("status", {}).get("state") != "DONE" and job_id:
            time.sleep(0.5)
            poll_req = urllib.request.Request(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/jobs/{job_id}?location={job_loc}",
                headers={"Authorization": f"Bearer {gcp_token}", "X-Goog-User-Project": project_id},
            )
            with urllib.request.urlopen(poll_req, context=SSL_CTX) as p_resp:
                job_data = json.loads(p_resp.read().decode("utf-8"))

        err_result = job_data.get("status", {}).get("errorResult")
        if err_result:
            raise RuntimeError(f"BigQuery staging load job failed: {err_result}")

        # 2. Atomic DML MERGE from per-run staging into destination table:
        #    - Never deletes un-staged rows
        #    - Pre-computes `merged_files` inside USING (...) AS S via ARRAY_CONCAT + ROW_NUMBER
        #      (avoiding BigQuery's restriction on correlated subqueries inside UPDATE SET) so
        #      historical USER_PROVIDED / NOTEBOOK_SOURCE / NOTEBOOK_STUDIO file metadata is NEVER
        #      wiped when Cloud Logging UploadSessionFile entries age past retention (mitigates ED-2).
        merge_url = f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries"
        merge_sql = f"""
            MERGE `{project_id}.{BQ_DATASET}.{BQ_TABLE}` AS T
            USING (
              WITH dedup_staging AS (
                SELECT * EXCEPT(rn) FROM (
                  SELECT *, ROW_NUMBER() OVER (PARTITION BY session_id, turn_index ORDER BY harvested_at DESC) AS rn
                  FROM `{project_id}.{BQ_DATASET}.{staging_table}`
                ) WHERE rn = 1
              )
              SELECT
                st.*,
                ARRAY(
                  SELECT AS STRUCT
                    f.file_id,
                    f.file_source,
                    f.file_name,
                    f.mime_type,
                    f.byte_size,
                    f.sha256,
                    f.crc32c,
                    f.gcs_uri,
                    f.console_url
                  FROM (
                    SELECT
                      raw_f AS f,
                      ROW_NUMBER() OVER (
                        PARTITION BY COALESCE(NULLIF(raw_f.file_id, ''), NULLIF(raw_f.gcs_uri, ''), IFNULL(raw_f.file_name, ''))
                        ORDER BY ord ASC
                      ) AS file_rn
                    FROM UNNEST(ARRAY_CONCAT(st.files, IFNULL(ex.files, []))) AS raw_f WITH OFFSET AS ord
                  )
                  WHERE file_rn = 1
                  ORDER BY file_id, file_name
                ) AS merged_files
              FROM dedup_staging AS st
              LEFT JOIN `{project_id}.{BQ_DATASET}.{BQ_TABLE}` AS ex
                ON ex.session_id = st.session_id AND ex.turn_index = st.turn_index
            ) AS S
            ON T.session_id = S.session_id AND T.turn_index = S.turn_index
            WHEN MATCHED AND S.harvested_at >= T.harvested_at THEN UPDATE SET
              query_id = COALESCE(NULLIF(S.query_id, ''), T.query_id),
              assist_answer_id = COALESCE(NULLIF(S.assist_answer_id, ''), T.assist_answer_id),
              engine_id = S.engine_id,
              location = S.location,
              user_iam_principal = COALESCE(NULLIF(S.user_iam_principal, ''), T.user_iam_principal),
              session_display_name = COALESCE(NULLIF(S.session_display_name, ''), T.session_display_name),
              prompt_text = COALESCE(NULLIF(S.prompt_text, ''), T.prompt_text),
              response_text = COALESCE(NULLIF(S.response_text, ''), T.response_text),
              thought_text = COALESCE(NULLIF(S.thought_text, ''), T.thought_text),
              model_name = COALESCE(NULLIF(S.model_name, ''), T.model_name),
              session_transcript_gcs_uri = COALESCE(NULLIF(S.session_transcript_gcs_uri, ''), T.session_transcript_gcs_uri),
              session_transcript_console_url = COALESCE(NULLIF(S.session_transcript_console_url, ''), T.session_transcript_console_url),
              files = S.merged_files,
              event_timestamp = COALESCE(S.event_timestamp, T.event_timestamp),
              harvested_at = S.harvested_at
            WHEN NOT MATCHED THEN INSERT (
              session_id, turn_index, query_id, assist_answer_id, engine_id, location,
              user_iam_principal, session_display_name, prompt_text, response_text,
              thought_text, model_name, session_transcript_gcs_uri,
              session_transcript_console_url, files, event_timestamp, harvested_at
            ) VALUES (
              S.session_id, S.turn_index, S.query_id, S.assist_answer_id, S.engine_id, S.location,
              S.user_iam_principal, S.session_display_name, S.prompt_text, S.response_text,
              S.thought_text, S.model_name, S.session_transcript_gcs_uri,
              S.session_transcript_console_url, S.files, S.event_timestamp, S.harvested_at
            )
        """
        merge_req = urllib.request.Request(
            merge_url,
            data=json.dumps({"query": merge_sql, "useLegacySql": False}).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {gcp_token}",
                "Content-Type": "application/json",
                "X-Goog-User-Project": project_id,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(merge_req, context=SSL_CTX) as resp:
                merge_resp = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_detail = e.read().decode("utf-8", errors="replace")[:1000]
            raise RuntimeError(f"BigQuery MERGE HTTP {e.code}: {err_detail}") from e
        m_job_id = merge_resp.get("jobReference", {}).get("jobId")
        m_job_loc = merge_resp.get("jobReference", {}).get("location", "US")
        while not merge_resp.get("jobComplete", False) and m_job_id:
            time.sleep(0.5)
            poll_req = urllib.request.Request(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries/{m_job_id}?location={m_job_loc}",
                headers={"Authorization": f"Bearer {gcp_token}", "X-Goog-User-Project": project_id},
            )
            with urllib.request.urlopen(poll_req, context=SSL_CTX) as p_resp:
                merge_resp = json.loads(p_resp.read().decode("utf-8"))
        merge_errors = merge_resp.get("errors")
        if merge_errors:
            raise RuntimeError(f"BigQuery MERGE query failed: {merge_errors}")
    finally:
        # 3. Clean up per-invocation staging table via BigQuery tables.delete REST API
        try:
            del_url = f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/datasets/{BQ_DATASET}/tables/{staging_table}"
            del_req = urllib.request.Request(
                del_url,
                headers={"Authorization": f"Bearer {gcp_token}", "X-Goog-User-Project": project_id},
                method="DELETE",
            )
            with urllib.request.urlopen(del_req, context=SSL_CTX, timeout=10) as _:
                pass
        except Exception:
            pass

    table_ref = f"{project_id}:{BQ_DATASET}.{BQ_TABLE}"
    print(f"\n[+] Successfully merged {len(rows)} turn row(s) across {len(session_ids)} session(s) into {table_ref}!")

    purview_fail_closed = os.environ.get("PURVIEW_FAIL_CLOSED", "true").lower() == "true"
    try:
        import purview_connector
        if purview_connector.is_purview_configured():
            print("[*] Forwarding harvested turn(s) and binary attachments to Microsoft Purview eDiscovery...")
            purview_connector.forward_turns_to_purview(rows, gcp_token=gcp_token, project_id=project_id)
    except Exception as e:
        if purview_fail_closed:
            raise RuntimeError(f"Microsoft Purview eDiscovery archival failed (PURVIEW_FAIL_CLOSED=true): {e}") from e
        print(f"  [!] Microsoft Purview forwarding warning (PURVIEW_FAIL_CLOSED=false): {e}")


def clean_notebooklm_streamed_reply(text: str) -> str:
    """
    Deduplicates cumulative streaming chunks in NotebookLM Enterprise's
    GenerateFreeFormStreamed serviceTextReply field.
    """
    if not text or len(text) < 40:
        return (text or "").strip()
    prefix = text[:40]
    last_idx = text.rfind(prefix)
    if last_idx > 0:
        text = text[last_idx:]
    text = re.sub(r"(.{15,200}?)\1+$", r"\1", text.strip(), flags=re.DOTALL)
    return text.strip()


def mint_dwd_token(user_email: str, dwd_sa_email: str, project_id: str) -> str:
    """
    Optional keyless Google Workspace Domain-Wide Delegation (DWD) token minting
    via IAM Credentials signJwt -> oauth2.googleapis.com/token when DWD_SA_EMAIL is set.
    """
    cache_key = f"dwd:{user_email}"
    now = int(time.time())
    cached = _STS_TOKEN_CACHE.get(cache_key)
    if cached and cached[1] > now + 60:
        return cached[0]

    gcp_token = get_gcp_access_token()
    sign_url = f"https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/{dwd_sa_email}:signJwt"
    jwt_claims = {
        "iss": dwd_sa_email,
        "sub": user_email,
        "scope": "https://www.googleapis.com/auth/discoveryengine.readwrite",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now - 60,
        "exp": now + 3600,
    }
    req = urllib.request.Request(
        sign_url,
        data=json.dumps({"payload": json.dumps(jwt_claims)}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        signed_jwt = json.loads(resp.read().decode("utf-8"))["signedJwt"]

    token_body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": signed_jwt,
    }).encode("utf-8")
    t_req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=token_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(t_req, context=SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        token = data["access_token"]
        expires_in = float(data.get("expires_in", 3600))
        _STS_TOKEN_CACHE[cache_key] = (token, now + expires_in)
        return token


def get_token_for_principal(principal: str, project_id: str, workforce_pool_id: str) -> str:
    """
    Returns an impersonated user token:
      1. WIF STS token via Cloud KMS asymmetricSign (primary path for Workforce Identity Federation).
      2. Optional Google Workspace DWD token if DWD_SA_EMAIL is configured and principal is a Workspace email.
      3. Harvester GCP access token fallback.
    """
    if not principal:
        return get_gcp_access_token()
    if workforce_pool_id:
        try:
            return mint_sts_token(principal, project_id, workforce_pool_id)
        except Exception:
            pass
    dwd_sa = os.environ.get("DWD_SA_EMAIL", "").strip()
    if dwd_sa and "@" in principal:
        email = principal.split("/")[-1]
        try:
            return mint_dwd_token(email, dwd_sa, project_id)
        except Exception:
            pass
    return get_gcp_access_token()


def download_notebook_scotty_media(
    res_name: str,
    loc: str,
    token: str,
    project_id: str,
) -> tuple[bytes, str] | None:
    """
    Downloads a binary NotebookLM source or Studio media artifact (Audio Overview,
    Video Overview, Slide Deck PDF, Infographic PNG) via Discovery Engine's
    Scotty media download endpoint (`/download/v1alpha/{res_name}:download?alt=media`).
    """
    if not NOTEBOOK_CHILD_RESOURCE_RE.fullmatch((res_name or "").strip()):
        return None
    host = get_discovery_engine_host(loc)
    url = f"https://{host}/download/v1alpha/{res_name}:download?alt=media"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": project_id,
        },
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=30) as resp:
            data = resp.read()
            if not data:
                return None
            ctype = resp.headers.get("Content-Type", "application/octet-stream")
            return data, ctype
    except Exception:
        return None


def harvest_notebooklm_studio_and_notes(
    nb_name: str,
    nb_id: str,
    loc: str,
    nb_detail: dict,
    logged_note_ids: set[str],
    token: str,
    bucket_name: str,
    project_id: str,
) -> list[dict]:
    """
    Discovers and archives all 12 NotebookLM Studio modalities:
      - Audio Overviews (.wav)
      - Video Overviews (.mp4)
      - Slide Decks (.pdf / .json)
      - Infographics (.png)
      - Flashcards, Quizzes, Mind Maps (.json)
      - Reports, Briefing Docs, Study Guides, FAQs, Timelines, Studio Notes (.md)
    Uploads each artifact to gs://{bucket_name}/notebooks/{loc}/{nb_id}/studio/
    and returns structured studio artifact records.
    """
    parse_notebook_resource(nb_name)
    host = get_discovery_engine_host(loc)
    studio_records: list[dict] = []
    seen_ids: set[str] = set()

    # 1. Check audioOverview embedded on the notebook resource
    audio_ov = nb_detail.get("audioOverview")
    if isinstance(audio_ov, dict) and (audio_ov.get("name") or audio_ov.get("audioOverviewId") or audio_ov.get("status")):
        ao_name = audio_ov.get("name") or f"{nb_name}/audioOverviews/default"
        ao_id = audio_ov.get("audioOverviewId") or ao_name.split("/")[-1] or "audio_overview"
        seen_ids.add(ao_id)
        dl = download_notebook_scotty_media(ao_name, loc, token, project_id)
        if dl:
            raw_bytes, dl_mime = dl
            mime_type, ext = detect_mime_and_extension(dl_mime or "audio/wav", raw_bytes)
        else:
            raw_bytes = json.dumps(audio_ov, indent=2).encode("utf-8")
            mime_type, ext = "application/json", ".json"
        gcs_path = f"notebooks/{loc}/{nb_id}/studio/{ao_id}{ext}"
        gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, bucket_name, project_id, mime_type)
        studio_records.append({
            "artifact_id": ao_id,
            "modality": "AUDIO_OVERVIEW",
            "title": audio_ov.get("title") or "Audio Overview",
            "state": audio_ov.get("status") or "COMPLETED",
            "mime_type": mime_type,
            "byte_size": len(raw_bytes),
            "sha256": hashlib.sha256(raw_bytes).hexdigest(),
            "crc32c": compute_crc32c_base64(raw_bytes),
            "gcs_uri": gcs_uri,
            "console_url": console_url,
            "extracted_text": audio_ov.get("transcript") or "",
            "created_at": audio_ov.get("createTime") or "",
        })

    # 2. ListArtifacts on the notebook (with nextPageToken pagination)
    raw_artifacts: list[dict] = []
    art_page_token = ""
    for _ in range(50):
        list_url = f"https://{host}/v1alpha/{nb_name}/artifacts?pageSize=100"
        if art_page_token:
            list_url += f"&pageToken={urllib.parse.quote(art_page_token, safe='')}"
        try:
            req = urllib.request.Request(
                list_url,
                headers={"Authorization": f"Bearer {token}", "X-Goog-User-Project": project_id},
            )
            resp_data = json.loads(urllib.request.urlopen(req, context=SSL_CTX, timeout=15).read().decode("utf-8"))
            raw_artifacts.extend(resp_data.get("artifacts", []))
            art_page_token = resp_data.get("nextPageToken", "")
            if not art_page_token:
                break
        except Exception:
            break

    for art in raw_artifacts:
        art_name = art.get("name", "")
        art_id = art.get("artifactId") or art_name.split("/")[-1]
        if not art_id or art_id in seen_ids:
            continue
        seen_ids.add(art_id)

        art_detail = art
        if art_name and NOTEBOOK_CHILD_RESOURCE_RE.fullmatch(art_name):
            try:
                g_req = urllib.request.Request(
                    f"https://{host}/v1alpha/{art_name}",
                    headers={"Authorization": f"Bearer {token}", "X-Goog-User-Project": project_id},
                )
                art_detail = json.loads(urllib.request.urlopen(g_req, context=SSL_CTX, timeout=15).read().decode("utf-8"))
            except Exception:
                pass

        art_type = (art_detail.get("artifactType") or art_detail.get("type") or "REPORT").upper()
        title = art_detail.get("title") or art_detail.get("displayName") or f"Studio {art_type.title()} ({art_id[:8]})"
        state = art_detail.get("state") or "COMPLETED"
        created_at = art_detail.get("createTime") or ""

        # Try binary download via Scotty first for media artifacts
        dl = download_notebook_scotty_media(art_name, loc, token, project_id) if art_name else None
        extracted_text = ""
        if dl:
            raw_bytes, dl_mime = dl
            mime_type, ext = detect_mime_and_extension(dl_mime, raw_bytes, title)
        else:
            # Extract text or JSON representation from artifact payload
            extracted_text = (
                art_detail.get("markdown")
                or art_detail.get("text")
                or art_detail.get("report", {}).get("markdown", "")
                or json.dumps(art_detail, indent=2)
            )
            if art_type in ("FLASHCARDS", "QUIZ", "MIND_MAP"):
                raw_bytes = json.dumps(art_detail, indent=2).encode("utf-8")
                mime_type, ext = "application/json", ".json"
            else:
                raw_bytes = extracted_text.encode("utf-8")
                mime_type, ext = "text/markdown", ".md"

        art_sha = hashlib.sha256(raw_bytes).hexdigest()
        gcs_path = f"notebooks/{loc}/{nb_id}/studio/{art_id}_{art_sha[:12]}{ext}"
        gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, bucket_name, project_id, mime_type)
        studio_records.append({
            "artifact_id": f"{art_id}:{art_sha[:12]}",
            "modality": art_type,
            "title": title,
            "state": state,
            "mime_type": mime_type,
            "byte_size": len(raw_bytes),
            "sha256": art_sha,
            "crc32c": compute_crc32c_base64(raw_bytes),
            "gcs_uri": gcs_uri,
            "console_url": console_url,
            "extracted_text": extracted_text if extracted_text else "",
            "created_at": created_at,
        })

    # 3. BatchGetNotes for any discovered note IDs (chunked in batches of 50 to avoid HTTP 414)
    if logged_note_ids:
        note_names = [
            f"{nb_name}/notes/{nid}"
            for nid in sorted(logged_note_ids)
            if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", nid or "")
        ]
        for chunk_start in range(0, len(note_names), 50):
            chunk = note_names[chunk_start : chunk_start + 50]
            q_params = "&".join(f"names={urllib.parse.quote(n, safe='/')}" for n in chunk)
            notes_url = f"https://{host}/v1alpha/{nb_name}/notes:batchGet?{q_params}"
            try:
                n_req = urllib.request.Request(
                    notes_url,
                    headers={"Authorization": f"Bearer {token}", "X-Goog-User-Project": project_id},
                )
                n_resp = json.loads(urllib.request.urlopen(n_req, context=SSL_CTX, timeout=15).read().decode("utf-8"))
                for note in n_resp.get("notes", []):
                    if not isinstance(note, dict):
                        continue
                    nid = note.get("noteId") or note.get("name", "").split("/")[-1]
                    if not nid or nid in seen_ids:
                        continue
                    seen_ids.add(nid)
                    ntitle = note.get("title") or f"Studio Note ({nid[:8]})"
                    ncontent = note.get("content") or note.get("text") or json.dumps(note, indent=2)
                    raw_bytes = ncontent.encode("utf-8")
                    note_sha = hashlib.sha256(raw_bytes).hexdigest()
                    gcs_path = f"notebooks/{loc}/{nb_id}/studio/note_{nid}_{note_sha[:12]}.md"
                    gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, bucket_name, project_id, "text/markdown")
                    studio_records.append({
                        "artifact_id": f"{nid}:{note_sha[:12]}",
                        "modality": "STUDIO_NOTE",
                        "title": ntitle,
                        "state": "COMPLETED",
                        "mime_type": "text/markdown",
                        "byte_size": len(raw_bytes),
                        "sha256": note_sha,
                        "crc32c": compute_crc32c_base64(raw_bytes),
                        "gcs_uri": gcs_uri,
                        "console_url": console_url,
                        "extracted_text": ncontent,
                        "created_at": note.get("createTime") or "",
                    })
            except Exception:
                pass

    return studio_records


def compute_immutable_notebook_turn_index(ts_str: str, unique_key: str) -> int:
    """
    Computes a deterministic, immutable, chronologically ordered INT64 turn_index (>= 1)
    for NotebookLM log-sourced turns that fits well within JS Number.MAX_SAFE_INTEGER (9.007e15).
    Prevents rolling 30-day Cloud Logging windows from re-numbering newer turns back to 1
    and overwriting historical legal-hold turns in BigQuery or Purview (mitigates ED-2).
    """
    epoch_ms = 0
    raw_ts = (ts_str or "").strip()
    if raw_ts:
        try:
            norm = raw_ts[:-1] + "+00:00" if raw_ts.endswith("Z") else raw_ts
            dt = datetime.datetime.fromisoformat(norm)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            epoch_ms = max(0, int(dt.timestamp() * 1000))
        except Exception:
            epoch_ms = 0
    digest_num = int.from_bytes(
        hashlib.sha256(f"{raw_ts}|{unique_key}".encode("utf-8")).digest()[:6],
        "big",
    )
    if epoch_ms > 0:
        return (epoch_ms * 100) + (digest_num % 100)
    return max(1, digest_num % 9_000_000_000_000_000)


def harvest_notebooklm_enterprise(
    project_id: str,
    workforce_pool_id: str,
    bucket_name: str,
    hours: int = 720,
    known_principals: set[str] | None = None,
    target_notebook_id: str | None = None,
) -> list[dict]:
    """
    Harvests NotebookLM Enterprise activity, sources, and 12-modality Studio artifacts
    across global, us, and eu.
    """
    print("\n======================================================================")
    print("Harvesting NotebookLM Enterprise (Prompts, Responses, Sources & Studio)")
    print("======================================================================")
    cutoff = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=hours)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    log_filter = (
        f'logName="projects/{project_id}/logs/discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity" '
        f'AND timestamp>="{cutoff}"'
    )
    entries = read_cloud_logging_entries(project_id, log_filter, page_size=500)
    print(f"Found {len(entries)} log entries in notebooklm_enterprise_user_activity.")

    notebooks: dict[str, dict] = {}
    principals_to_probe: set[str] = set(known_principals or set())

    for entry in reversed(entries):
        jp = entry.get("jsonPayload", {})
        meta = jp.get("logMetadata", {})
        method = meta.get("methodName", "")
        raw_principal = jp.get("userIamPrincipal", "")
        user_principal = "" if raw_principal == "<elided>" else raw_principal
        ts = entry.get("timestamp") or meta.get("timestamp")
        insert_id = entry.get("insertId", "")

        if user_principal and not target_notebook_id:
            principals_to_probe.add(user_principal)

        raw_res_name = (
            meta.get("name")
            or jp.get("request", {}).get("name")
            or jp.get("request", {}).get("parent")
            or jp.get("response", {}).get("name")
            or ""
        )
        if "/notebooks/" not in raw_res_name:
            continue
        nb_name = (
            raw_res_name.split("/sources/")[0]
            .split("/audioOverviews/")[0]
            .split("/artifacts/")[0]
            .split("/notes/")[0]
        )
        try:
            loc, nb_id = parse_notebook_resource(nb_name)
        except ValueError as e:
            print(f"  [!] Skipping invalid notebook resource in log: {e}")
            continue
        if target_notebook_id and nb_id != target_notebook_id:
            continue

        nb_info = notebooks.setdefault(nb_id, {
            "notebook_id": nb_id,
            "notebook_name": nb_name,
            "location": loc,
            "user_iam_principal": user_principal,
            "title": jp.get("response", {}).get("title", ""),
            "chat_turns": [],
            "logged_sources": {},
            "logged_note_ids": set(),
            "latest_timestamp": ts,
        })
        if user_principal and not nb_info["user_iam_principal"]:
            nb_info["user_iam_principal"] = user_principal
        if jp.get("response", {}).get("title") and not nb_info["title"]:
            nb_info["title"] = jp["response"]["title"]
        if ts:
            nb_info["latest_timestamp"] = ts

        if "/notes/" in raw_res_name:
            nid = raw_res_name.split("/notes/")[1].split("/")[0]
            if nid:
                nb_info["logged_note_ids"].add(nid)

        if method == "GenerateFreeFormStreamed":
            user_query = jp.get("request", {}).get("userQuery", "")
            raw_reply = jp.get("serviceTextReply", "")
            clean_reply = clean_notebooklm_streamed_reply(raw_reply)
            nb_info["chat_turns"].append({
                "query_id": insert_id or f"nb-turn-{len(nb_info['chat_turns']) + 1}",
                "log_insert_id": insert_id,
                "receive_timestamp": entry.get("receiveTimestamp") or ts or "",
                "provenance": "UNVERIFIED_CLOUD_LOGGING_ENTRY",
                "user_principal": user_principal or nb_info["user_iam_principal"],
                "prompt_text": user_query,
                "response_text": clean_reply,
                "timestamp": ts,
            })
        elif method == "BatchCreateSources":
            for s in jp.get("response", {}).get("sources", []):
                sid = s.get("sourceId", {}).get("id") or s.get("name", "").split("/")[-1]
                if sid:
                    nb_info["logged_sources"][sid] = {
                        "source_id": sid,
                        "title": s.get("title", f"source_{sid}"),
                        "name": s.get("name", ""),
                        "added_timestamp": ts,
                    }
            status_msg = jp.get("status", {}).get("message", "")
            if status_msg and "url:" in status_msg:
                nb_info["chat_turns"].append({
                    "query_id": insert_id or "nb-src-error",
                    "log_insert_id": insert_id,
                    "receive_timestamp": entry.get("receiveTimestamp") or ts or "",
                    "provenance": "UNVERIFIED_CLOUD_LOGGING_ENTRY",
                    "user_principal": user_principal or nb_info["user_iam_principal"],
                    "prompt_text": f"[NotebookLM BatchCreateSources Failed Ingestion] {status_msg.splitlines()[0]}",
                    "response_text": status_msg,
                    "timestamp": ts,
                })

    for principal in sorted(principals_to_probe):
        if target_notebook_id:
            break
        tok = get_token_for_principal(principal, project_id, workforce_pool_id)
        for loc in ["global", "us", "eu"]:
            host = get_discovery_engine_host(loc)
            nb_page_token = ""
            for _ in range(25):
                url = (
                    f"https://{host}/v1alpha/"
                    f"projects/{project_id}/locations/{loc}/notebooks:listRecentlyViewed?pageSize=100"
                )
                if nb_page_token:
                    url += f"&pageToken={urllib.parse.quote(nb_page_token, safe='')}"
                req = urllib.request.Request(
                    url,
                    headers={"Authorization": f"Bearer {tok}", "X-Goog-User-Project": project_id},
                )
                try:
                    resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
                    for nb in resp.get("notebooks", []):
                        nb_id = nb.get("notebookId") or nb.get("name", "").split("/")[-1]
                        if not nb_id or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", nb_id):
                            continue
                        candidate_nb_name = nb.get("name", f"projects/{project_id}/locations/{loc}/notebooks/{nb_id}")
                        try:
                            parse_notebook_resource(candidate_nb_name)
                        except ValueError:
                            continue
                        nb_info = notebooks.setdefault(nb_id, {
                            "notebook_id": nb_id,
                            "notebook_name": candidate_nb_name,
                            "location": loc,
                            "user_iam_principal": principal,
                            "title": nb.get("title", ""),
                            "chat_turns": [],
                            "logged_sources": {},
                            "logged_note_ids": set(),
                            "latest_timestamp": nb.get("metadata", {}).get("lastViewed") or nb.get("metadata", {}).get("createTime"),
                        })
                        if nb.get("title") and not nb_info["title"]:
                            nb_info["title"] = nb["title"]
                    nb_page_token = resp.get("nextPageToken", "")
                    if not nb_page_token:
                        break
                except Exception:
                    break

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    bq_rows: list[dict] = []

    for nb_id, nb_info in notebooks.items():
        loc = nb_info["location"]
        nb_name = nb_info["notebook_name"]
        try:
            parse_notebook_resource(nb_name)
            host = get_discovery_engine_host(loc)
        except ValueError as e:
            print(f"  [!] Skipping invalid notebook {nb_name}: {e}")
            continue
        principal = nb_info["user_iam_principal"]
        tok = get_token_for_principal(principal, project_id, workforce_pool_id) if principal else ""

        nb_detail = {}
        nb_url = f"https://{host}/v1alpha/{nb_name}"
        cand_principals: list[tuple[str, str]] = []
        if principal and tok:
            cand_principals.append((principal, tok))
        for fp in FALLBACK_PRINCIPALS:
            try:
                fp_tok = get_token_for_principal(fp, project_id, workforce_pool_id)
                if fp_tok and all(t != fp_tok for _, t in cand_principals):
                    cand_principals.append((fp, fp_tok))
            except Exception:
                pass

        last_nb_err = None
        verified_owner_principal = principal
        for c_princ, c_tok in cand_principals:
            try:
                req = urllib.request.Request(
                    nb_url,
                    headers={"Authorization": f"Bearer {c_tok}", "X-Goog-User-Project": project_id},
                )
                nb_detail = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
                tok = c_tok
                verified_owner_principal = c_princ
                break
            except Exception as e:
                last_nb_err = e
                continue
        if not nb_detail:
            # Mitigates H1: Reject unverified NotebookLM log entries if notebooks.get cannot confirm ownership/existence
            print(f"  [!] Skipping unverified notebook {nb_id} ({loc}): could not confirm via notebooks.get ({last_nb_err})")
            continue

        principal = verified_owner_principal
        # Mitigates H1 residual: Filter out any log-sourced chat turns claiming a different userIamPrincipal
        # than the API-verified notebook owner (`verified_owner_principal`).
        verified_chat_turns: list[dict] = []
        for ct in nb_info["chat_turns"]:
            turn_princ = ct.get("user_principal") or ""
            if turn_princ and principal and turn_princ != principal:
                print(
                    f"  [!] Skipping NotebookLM turn {ct.get('query_id')} on {nb_id}: "
                    f"log userIamPrincipal '{turn_princ}' does not match verified owner '{principal}'"
                )
                continue
            ct["user_principal"] = principal
            verified_chat_turns.append(ct)
        nb_info["chat_turns"] = verified_chat_turns

        title = nb_detail.get("title") or nb_info.get("title") or f"Untitled Notebook ({nb_id[:8]})"
        create_time = nb_detail.get("metadata", {}).get("createTime") or nb_info.get("latest_timestamp") or now_iso

        enriched_sources: list[dict] = []
        raw_sources = nb_detail.get("sources", [])
        seen_source_ids: set[str] = set()
        for src in raw_sources:
            sname = src.get("name", "")
            sid = src.get("sourceId", {}).get("id") or sname.split("/")[-1]
            seen_source_ids.add(sid)
            s_detail = src
            if sname and NOTEBOOK_CHILD_RESOURCE_RE.fullmatch(sname):
                try:
                    s_url = f"https://{host}/v1alpha/{sname}"
                    s_req = urllib.request.Request(
                        s_url,
                        headers={"Authorization": f"Bearer {tok}", "X-Goog-User-Project": project_id},
                    )
                    s_detail = json.loads(urllib.request.urlopen(s_req, context=SSL_CTX).read().decode("utf-8"))
                except Exception:
                    pass
            enriched_sources.append(s_detail)

        for sid, lsrc in nb_info["logged_sources"].items():
            if sid not in seen_source_ids:
                enriched_sources.append({
                    "sourceId": {"id": sid},
                    "title": lsrc["title"],
                    "name": lsrc["name"],
                    "metadata": {"sourceAddedTimestamp": lsrc["added_timestamp"]},
                })

        studio_artifacts = harvest_notebooklm_studio_and_notes(
            nb_name=nb_name,
            nb_id=nb_id,
            loc=loc,
            nb_detail=nb_detail,
            logged_note_ids=nb_info.get("logged_note_ids", set()),
            token=tok,
            bucket_name=bucket_name,
            project_id=project_id,
        )

        archive_payload = {
            "notebook_id": nb_id,
            "notebook_name": nb_name,
            "location": loc,
            "user_iam_principal": principal,
            "title": title,
            "notebook_resource": nb_detail,
            "enriched_sources": enriched_sources,
            "studio_artifacts": studio_artifacts,
            "chat_turns": nb_info["chat_turns"],
            "harvested_at": now_iso,
        }
        archive_bytes = json.dumps(archive_payload, indent=2).encode("utf-8")
        archive_sha256 = hashlib.sha256(archive_bytes).hexdigest()
        archive_crc32c = compute_crc32c_base64(archive_bytes)
        gcs_path = f"notebooks/{loc}/{nb_id}/notebook_archive_{archive_sha256[:16]}.json"
        archive_gcs_uri, archive_console_url = upload_bytes_to_gcs(
            archive_bytes, gcs_path, bucket_name, project_id, "application/json"
        )
        print(
            f"  [+] Archived NotebookLM '{title}' ({nb_id}, {loc}, User: {principal}, "
            f"{len(enriched_sources)} sources, {len(studio_artifacts)} studio artifacts, "
            f"{len(nb_info['chat_turns'])} chat turns) -> {archive_gcs_uri}"
        )

        nb_files: list[dict] = []
        source_titles: list[str] = []
        for s in enriched_sources:
            sid = s.get("sourceId", {}).get("id") or s.get("name", "").split("/")[-1] or "source"
            stitle = s.get("title") or f"notebook_source_{sid}"
            source_titles.append(stitle)
            smeta = s.get("metadata", {})
            words = int(smeta.get("wordCount") or 0)
            tokens = int(smeta.get("tokenCount") or 0)
            nb_files.append({
                "file_id": sid,
                "file_source": "NOTEBOOK_SOURCE",
                "file_name": stitle,
                "mime_type": f"application/x-notebooklm-source ({words} words, {tokens} tokens)",
                "byte_size": words if words > 0 else len(archive_bytes),
                "sha256": archive_sha256,
                "crc32c": archive_crc32c,
                "gcs_uri": archive_gcs_uri,
                "console_url": archive_console_url,
            })

        for st_art in studio_artifacts:
            nb_files.append({
                "file_id": st_art["artifact_id"],
                "file_source": "NOTEBOOK_STUDIO",
                "file_name": f"[{st_art['modality']}] {st_art['title']}",
                "mime_type": st_art["mime_type"],
                "byte_size": st_art["byte_size"],
                "sha256": st_art["sha256"],
                "crc32c": st_art["crc32c"],
                "gcs_uri": st_art["gcs_uri"],
                "console_url": st_art["console_url"],
            })

        engine_label = f"notebooklm-enterprise-{loc}"
        display_label = f"[NotebookLM] {title}"
        thought_summary = (
            f"NotebookLM Enterprise grounded over {len(enriched_sources)} source(s): "
            + (", ".join(source_titles) if source_titles else "No sources attached")
        )

        # Always emit a dedicated immutable turn_index = 0 inventory row for NotebookLM sources & Studio
        # artifacts so new chat turns (which receive immutable timestamp+hash turn_index >= 1) never
        # overwrite Turn 1 or wipe historical source/Studio manifests after 30 days (mitigates ED-2).
        if enriched_sources or studio_artifacts or title or nb_info["chat_turns"]:
            inv_qid = f"nb-inventory-{nb_id}"
            bq_rows.append({
                "session_id": nb_id,
                "turn_index": 0,
                "query_id": inv_qid,
                "assist_answer_id": inv_qid,
                "engine_id": engine_label,
                "location": loc,
                "user_iam_principal": principal,
                "session_display_name": display_label,
                "prompt_text": f"[NotebookLM Notebook & Source Inventory] Title: {title}",
                "response_text": (
                    f"Notebook '{title}' ({nb_id}) contains {len(enriched_sources)} source(s): "
                    + (", ".join(source_titles) if source_titles else "None")
                ),
                "thought_text": thought_summary,
                "model_name": "notebooklm-enterprise",
                "session_transcript_gcs_uri": archive_gcs_uri,
                "session_transcript_console_url": archive_console_url,
                "files": nb_files,
                "event_timestamp": create_time or now_iso,
                "harvested_at": now_iso,
            })

        used_nb_turn_indices: set[int] = {0}
        for ct in nb_info["chat_turns"]:
            turn_ts_val = ct.get("timestamp") or ct.get("receive_timestamp") or create_time or now_iso
            unique_turn_key = ct.get("log_insert_id") or ct.get("query_id") or ct.get("prompt_text", "")
            immutable_idx = compute_immutable_notebook_turn_index(turn_ts_val, unique_turn_key)
            while immutable_idx in used_nb_turn_indices:
                immutable_idx += 1
            used_nb_turn_indices.add(immutable_idx)

            provenance_note = (
                f"[PROVENANCE: UNVERIFIED_LOG_SOURCED_TURN | log_insert_id={ct.get('log_insert_id') or 'none'} "
                f"| receive_timestamp={ct.get('receive_timestamp') or 'unknown'}]\n{thought_summary}"
            )
            bq_rows.append({
                "session_id": nb_id,
                "turn_index": immutable_idx,
                "query_id": ct["query_id"],
                "assist_answer_id": ct["query_id"],
                "engine_id": engine_label,
                "location": loc,
                "user_iam_principal": principal,
                "session_display_name": display_label,
                "prompt_text": ct["prompt_text"],
                "response_text": ct["response_text"],
                "thought_text": provenance_note,
                "model_name": "notebooklm-enterprise",
                "session_transcript_gcs_uri": archive_gcs_uri,
                "session_transcript_console_url": archive_console_url,
                "files": [],
                "event_timestamp": turn_ts_val,
                "harvested_at": now_iso,
            })

    return bq_rows


def harvest_single_event(log_entry: dict) -> dict:
    """
    Real-time event handler invoked by the Cloud Run Pub/Sub push endpoint.
    Inspects a single Cloud Logging entry and immediately harvests the affected
    Gemini Enterprise session or NotebookLM Enterprise notebook to GCS and BigQuery.
    """
    project_id = PROJECT_ID
    workforce_pool_id = WORKFORCE_POOL_ID
    bucket_name = get_bucket_name(project_id)

    log_name = log_entry.get("logName", "")
    jp = log_entry.get("jsonPayload", {})
    meta = jp.get("logMetadata", {})
    method = meta.get("methodName", "")
    raw_principal = jp.get("userIamPrincipal", "")
    user_principal = "" if raw_principal == "<elided>" else raw_principal

    if "gemini_enterprise_user_activity" in log_name:
        session_name = ""
        if method in ("StreamAssist", "Assist"):
            ans_name = jp.get("response", {}).get("answer", {}).get("name", "")
            if "/sessions/" in ans_name:
                session_name = ans_name.split("/assistAnswers/")[0]
        elif method in ("UploadSessionFile", "AddContextFile"):
            session_name = (
                jp.get("response", {}).get("session")
                or jp.get("request", {}).get("name")
                or meta.get("name", "")
            )
            if not jp.get("response", {}).get("fileId"):
                return {"status": "skipped", "reason": "UploadSessionFile initiation entry without fileId"}

        if "/sessions/" not in session_name:
            return {"status": "skipped", "reason": f"No session resource name found in {method}"}

        _, _, session_id = parse_session_resource(session_name)
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session_id):
            raise ValueError("Invalid session_id format")

        sessions = discover_from_cloud_logging(project_id, hours=720, extra_filter=f'"{session_id}"')
        sinfo = sessions.get(session_name) or {
            "session_name": session_name,
            "user_iam_principal": user_principal,
            "uploaded_file_ids": set(),
            "logged_file_names": {},
            "turn_models": {},
            "turn_timestamps": {},
            "latest_timestamp": log_entry.get("timestamp") or meta.get("timestamp"),
        }
        if user_principal and not sinfo.get("user_iam_principal"):
            sinfo["user_iam_principal"] = user_principal

        rows = harvest_session(sinfo, project_id, workforce_pool_id, bucket_name)
        load_rows_to_bigquery(rows, project_id)
        return {
            "status": "harvested",
            "type": "gemini_enterprise_session",
            "session_id": session_id,
            "turns_loaded": len(rows),
        }

    elif "notebooklm_enterprise_user_activity" in log_name:
        nb_supported_methods = {
            "GenerateFreeFormStreamed",
            "BatchCreateSources",
            "CreateNotebook",
            "CreateArtifact",
            "GetArtifact",
            "ListArtifacts",
            "CreateAudioOverview",
            "CreateNote",
            "MutateNote",
            "BatchGetNotes",
        }
        if method not in nb_supported_methods:
            return {"status": "skipped", "reason": f"Ignored NotebookLM method {method}"}

        nb_name = (
            meta.get("name")
            or jp.get("request", {}).get("name")
            or jp.get("request", {}).get("parent")
            or jp.get("response", {}).get("name")
            or ""
        )
        if "/notebooks/" not in nb_name:
            return {"status": "skipped", "reason": "No notebook resource name in log entry"}

        nb_name = (
            nb_name.split("/sources/")[0]
            .split("/audioOverviews/")[0]
            .split("/artifacts/")[0]
            .split("/notes/")[0]
        )
        _, nb_id = parse_notebook_resource(nb_name)

        rows = harvest_notebooklm_enterprise(
            project_id=project_id,
            workforce_pool_id=workforce_pool_id,
            bucket_name=bucket_name,
            hours=720,
            known_principals={user_principal} if user_principal else None,
            target_notebook_id=nb_id,
        )
        load_rows_to_bigquery(rows, project_id)
        return {
            "status": "harvested",
            "type": "notebooklm_notebook",
            "notebook_id": nb_id,
            "rows_loaded": len(rows),
        }

    return {"status": "skipped", "reason": f"Unhandled logName: {log_name}"}


def main() -> None:
    global PROJECT_ID, WORKFORCE_POOL_ID
    parser = argparse.ArgumentParser(description="Harvest Gemini Enterprise sessions, NotebookLM notebooks, and files to GCS & BigQuery.")
    parser.add_argument("--project-id", "--project", dest="project_id", default=PROJECT_ID, help="Google Cloud Project ID")
    parser.add_argument("--workforce-pool-id", default=WORKFORCE_POOL_ID, help="Workforce Identity Pool ID")
    parser.add_argument("--bucket-name", default="", help="Cloud Storage bucket name (default: <project_id>-ge-ediscovery)")
    parser.add_argument("--hours", type=int, default=168, help="Cloud Logging lookback window in hours (default: 168)")
    parser.add_argument(
        "--extra-session",
        action="append",
        default=[],
        help="Optional explicit session_name=user_iam_principal to harvest in addition to Cloud Logging discovery",
    )
    args = parser.parse_args()

    if not args.project_id or not args.workforce_pool_id:
        print("Error: --project-id (or GCP_PROJECT_ID) and --workforce-pool-id (or WORKFORCE_POOL_ID) are required.")
        sys.exit(1)

    PROJECT_ID = args.project_id
    WORKFORCE_POOL_ID = args.workforce_pool_id

    bucket_name = args.bucket_name or get_bucket_name(args.project_id)
    sessions = discover_from_cloud_logging(args.project_id, hours=args.hours)
    for item in args.extra_session:
        if "=" in item:
            sname, uprinc = item.split("=", 1)
            info = sessions.setdefault(sname, {
                "session_name": sname,
                "user_iam_principal": uprinc,
                "uploaded_file_ids": set(),
                "logged_file_names": {},
                "turn_models": {},
                "turn_timestamps": {},
                "latest_timestamp": None,
            })
            if uprinc:
                info["user_iam_principal"] = uprinc

    print(f"Discovered {len(sessions)} Gemini Enterprise session(s) to harvest.")
    all_rows: list[dict] = []
    known_principals: set[str] = set()
    for sname, sinfo in sessions.items():
        if sinfo.get("user_iam_principal"):
            known_principals.add(sinfo["user_iam_principal"])
        try:
            rows = harvest_session(sinfo, args.project_id, args.workforce_pool_id, bucket_name)
            all_rows.extend(rows)
        except Exception as e:
            print(f"  [!] Error harvesting {sname}: {e}")

    try:
        nb_rows = harvest_notebooklm_enterprise(
            project_id=args.project_id,
            workforce_pool_id=args.workforce_pool_id,
            bucket_name=bucket_name,
            hours=max(args.hours, 720),
            known_principals=known_principals,
        )
        all_rows.extend(nb_rows)
    except Exception as e:
        print(f"  [!] Error harvesting NotebookLM Enterprise: {e}")

    load_rows_to_bigquery(all_rows, args.project_id)


if __name__ == "__main__":
    main()
