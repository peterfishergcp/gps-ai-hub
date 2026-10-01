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

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
WORKFORCE_POOL_ID = os.environ.get("WORKFORCE_POOL_ID", "")
PROVIDER_ID = os.environ.get("ARCHIVER_PROVIDER_ID", "ediscovery-archiver")
CLIENT_ID = os.environ.get("ARCHIVER_CLIENT_ID", "ediscovery-archiver")

KMS_LOCATION = os.environ.get("KMS_LOCATION", "us-central1")
KMS_KEYRING = os.environ.get("KMS_KEYRING", "ge-ediscovery-kr")
KMS_KEY = os.environ.get("KMS_KEY", "ediscovery-archiver-jwt-key")
KMS_KEY_VERSION = os.environ.get("KMS_KEY_VERSION", "1")
KMS_KEY_ID = os.environ.get("KMS_KEY_ID", "archiver-kms-key-1")
LOCAL_KEY_ID = os.environ.get("ARCHIVER_KEY_ID", "archiver-key-1")

BQ_DATASET = os.environ.get("BQ_DATASET", "ge_ediscovery")
BQ_TABLE = os.environ.get("BQ_TABLE", "conversation_turns")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_KEY_PATH = os.environ.get(
    "ARCHIVER_PRIVATE_KEY_PATH",
    os.path.join(BASE_DIR, ".archiver_private_key.pem"),
)

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


def guess_extension(mime_type: str, data: bytes) -> str:
    mime = (mime_type or "").lower().split(";")[0].strip()
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "application/pdf": ".pdf",
        "text/plain": ".txt",
        "text/csv": ".csv",
        "text/markdown": ".md",
        "application/json": ".json",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    }
    if mime in ext_map:
        return ext_map[mime]
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"%PDF-"):
        return ".pdf"
    if data.startswith(b"PK\x03\x04"):
        return ".docx"
    return ".bin"


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


def mint_sts_token(subject: str, project_id: str, workforce_pool_id: str) -> str:
    """
    Mints an OAuth2 access token for the given WIF subject via STS token exchange.
    Uses Google Cloud KMS asymmetricSign by default (falls back to local key only if KMS is disabled).
    """
    now = int(time.time())
    cached = _STS_TOKEN_CACHE.get(subject)
    if cached and cached[1] > now + 60:
        return cached[0]

    use_local = os.environ.get("USE_LOCAL_ARCHIVER_KEY", "").lower() in ("1", "true", "yes")
    kid = LOCAL_KEY_ID if use_local else KMS_KEY_ID

    header = {"alg": "RS256", "typ": "JWT", "kid": kid}
    payload = {
        "iss": get_issuer_uri(project_id),
        "sub": subject,
        "aud": CLIENT_ID,
        "iat": now - 60,
        "exp": now + 3600,
    }
    signing_input = (
        f"{b64url_encode(json.dumps(header).encode('utf-8'))}."
        f"{b64url_encode(json.dumps(payload).encode('utf-8'))}"
    )

    if not use_local:
        sig = sign_jwt_with_kms(signing_input, project_id)
    else:
        if not os.path.exists(PRIVATE_KEY_PATH):
            raise FileNotFoundError(
                f"Local archiver private key not found at {PRIVATE_KEY_PATH} and Cloud KMS signing disabled."
            )
        sig = subprocess.run(
            ["openssl", "dgst", "-sha256", "-sign", PRIVATE_KEY_PATH],
            input=signing_input.encode("ascii"),
            capture_output=True,
            check=True,
        ).stdout

    jwt_token = f"{signing_input}.{b64url_encode(sig)}"

    sts_body = urllib.parse.urlencode({
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "audience": f"//iam.googleapis.com/locations/global/workforcePools/{workforce_pool_id}/providers/{PROVIDER_ID}",
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "subject_token": jwt_token,
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "options": json.dumps({"userProject": project_id}),
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
        expires_in = float(data.get("expires_in", 3600))
        _STS_TOKEN_CACHE[subject] = (token, now + expires_in)
        return token


def read_cloud_logging_entries(project_id: str, log_filter: str, page_size: int = 500) -> list[dict]:
    """Reads log entries directly via the Cloud Logging REST API (entries:list)."""
    gcp_token = get_gcp_access_token()
    url = "https://logging.googleapis.com/v2/entries:list"
    body = json.dumps({
        "resourceNames": [f"projects/{project_id}"],
        "filter": log_filter,
        "orderBy": "timestamp desc",
        "pageSize": page_size,
    }).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data.get("entries", [])


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


def parse_session_resource(session_name: str) -> tuple[str, str, str]:
    """Returns (location, engine_id, session_id) from a full session resource name."""
    parts = session_name.split("/")
    loc = parts[parts.index("locations") + 1]
    engine_id = parts[parts.index("engines") + 1]
    session_id = parts[parts.index("sessions") + 1]
    return loc, engine_id, session_id


def fetch_session_details(session_name: str, token: str, project_id: str) -> dict:
    loc, _, _ = parse_session_resource(session_name)
    prefix = f"{loc}-" if loc != "global" else ""
    url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/{session_name}?includeAnswerDetails=true"
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
    prefix = f"{loc}-" if loc != "global" else ""
    url = f"https://{prefix}discoveryengine.googleapis.com/v1/{session_name}:downloadFile?file_id={file_id}&alt=media"
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
    req = urllib.request.Request(
        upload_url,
        data=data,
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": content_type,
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        resp.read()
    return gcs_uri, console_url


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
      5. Returns the BigQuery rows for conversation_turns.
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
                cand_token = mint_sts_token(candidate, project_id, workforce_pool_id)
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
    transcript_obj_path = f"sessions/{engine_id}/{session_id}/session_transcript.json"
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
            raw_bytes, mime_type, cd_fname = download_session_file(session_name, fid, token, project_id)
            ext = guess_extension(mime_type, raw_bytes)
            raw_name = logged_file_names.get(fid) or cd_fname or f"user_upload_{fid}{ext}"
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
            print(f"  [+] Archived USER_PROVIDED file {fid} ({len(raw_bytes)} bytes) -> {gcs_uri}")
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
        prompt_text = q.get("text", "")
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
                    mime_type = rf.get("mime_type") or dl_mime
                    ext = guess_extension(mime_type, raw_bytes)
                    source_label = "USER_PROVIDED" if fid in uploaded_file_ids else "AI_GENERATED"
                    raw_name = (
                        rf.get("file_name")
                        or logged_file_names.get(fid)
                        or cd_fname
                        or f"{source_label.lower()}_{fid}{ext}"
                    )
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
    Idempotently replaces rows for the harvested session_ids in BigQuery using the
    BigQuery REST API (parameterized DML DELETE followed by a multipart JSONL Load Job).
    """
    if not rows:
        print("No rows to load into BigQuery.")
        return

    gcp_token = get_gcp_access_token()
    session_ids = sorted({str(r["session_id"]) for r in rows if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(r.get("session_id", "")))})
    if not session_ids:
        return

    # 1. Parameterized DML DELETE via BigQuery REST API (jobs.query)
    delete_url = f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries"
    delete_payload = {
        "query": f"DELETE FROM `{project_id}.{BQ_DATASET}.{BQ_TABLE}` WHERE session_id IN UNNEST(@session_ids)",
        "useLegacySql": False,
        "parameterMode": "NAMED",
        "queryParameters": [
            {
                "name": "session_ids",
                "parameterType": {"type": "ARRAY", "arrayType": {"type": "STRING"}},
                "parameterValue": {"arrayValues": [{"value": sid} for sid in session_ids]},
            }
        ],
    }
    del_req = urllib.request.Request(
        delete_url,
        data=json.dumps(delete_payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {gcp_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    with urllib.request.urlopen(del_req, context=SSL_CTX) as resp:
        del_resp = json.loads(resp.read().decode("utf-8"))
        job_id = del_resp.get("jobReference", {}).get("jobId")
        job_loc = del_resp.get("jobReference", {}).get("location", "US")
        while not del_resp.get("jobComplete", False) and job_id:
            time.sleep(0.5)
            poll_req = urllib.request.Request(
                f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries/{job_id}?location={job_loc}",
                headers={"Authorization": f"Bearer {gcp_token}", "X-Goog-User-Project": project_id},
            )
            with urllib.request.urlopen(poll_req, context=SSL_CTX) as p_resp:
                del_resp = json.loads(p_resp.read().decode("utf-8"))

    # 2. Multipart Load Job via BigQuery REST API
    boundary = "===============ge_ediscovery_bq_load_boundary=="
    job_config = {
        "configuration": {
            "load": {
                "destinationTable": {
                    "projectId": project_id,
                    "datasetId": BQ_DATASET,
                    "tableId": BQ_TABLE,
                },
                "sourceFormat": "NEWLINE_DELIMITED_JSON",
                "writeDisposition": "WRITE_APPEND",
            }
        }
    }
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
        raise RuntimeError(f"BigQuery load job failed: {err_result}")

    table_ref = f"{project_id}:{BQ_DATASET}.{BQ_TABLE}"
    print(f"\n[+] Successfully loaded {len(rows)} turn row(s) across {len(session_ids)} session(s) into {table_ref}!")


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


def get_token_for_principal(principal: str, project_id: str, workforce_pool_id: str) -> str:
    """Returns a WIF STS token for WIF principals or GCP access token for Workspace admins."""
    if not principal:
        return get_gcp_access_token()
    try:
        return mint_sts_token(principal, project_id, workforce_pool_id)
    except Exception:
        return get_gcp_access_token()


def harvest_notebooklm_enterprise(
    project_id: str,
    workforce_pool_id: str,
    bucket_name: str,
    hours: int = 720,
    known_principals: set[str] | None = None,
    target_notebook_id: str | None = None,
) -> list[dict]:
    """
    Harvests NotebookLM Enterprise activity and notebooks across global, us, and eu.
    """
    print("\n======================================================================")
    print("Harvesting NotebookLM Enterprise (Prompts, Responses & Sources)")
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

        nb_name = (
            meta.get("name")
            or jp.get("request", {}).get("name")
            or jp.get("request", {}).get("parent")
            or jp.get("response", {}).get("name")
            or ""
        )
        if "/notebooks/" not in nb_name:
            continue
        nb_name = nb_name.split("/sources/")[0].split("/audioOverviews/")[0]
        parts = nb_name.split("/")
        loc = parts[parts.index("locations") + 1] if "locations" in parts else "global"
        nb_id = parts[parts.index("notebooks") + 1]
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
            "latest_timestamp": ts,
        })
        if user_principal and not nb_info["user_iam_principal"]:
            nb_info["user_iam_principal"] = user_principal
        if jp.get("response", {}).get("title") and not nb_info["title"]:
            nb_info["title"] = jp["response"]["title"]
        if ts:
            nb_info["latest_timestamp"] = ts

        if method == "GenerateFreeFormStreamed":
            user_query = jp.get("request", {}).get("userQuery", "")
            raw_reply = jp.get("serviceTextReply", "")
            clean_reply = clean_notebooklm_streamed_reply(raw_reply)
            nb_info["chat_turns"].append({
                "query_id": insert_id or f"nb-turn-{len(nb_info['chat_turns']) + 1}",
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
                    "user_principal": user_principal or nb_info["user_iam_principal"],
                    "prompt_text": f"[NotebookLM BatchCreateSources Failed Ingestion] {status_msg.splitlines()[0]}",
                    "response_text": status_msg,
                    "timestamp": ts,
                })

    for principal in sorted(principals_to_probe):
        if target_notebook_id:
            break
        tok = get_token_for_principal(principal, project_id, workforce_pool_id)
        for loc in ["global", "us"]:
            prefix = f"{loc}-" if loc != "global" else ""
            url = (
                f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
                f"projects/{project_id}/locations/{loc}/notebooks:listRecentlyViewed"
            )
            req = urllib.request.Request(
                url,
                headers={"Authorization": f"Bearer {tok}", "X-Goog-User-Project": project_id},
            )
            try:
                resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
                for nb in resp.get("notebooks", []):
                    nb_id = nb.get("notebookId") or nb.get("name", "").split("/")[-1]
                    if not nb_id:
                        continue
                    nb_info = notebooks.setdefault(nb_id, {
                        "notebook_id": nb_id,
                        "notebook_name": nb.get("name", f"projects/{project_id}/locations/{loc}/notebooks/{nb_id}"),
                        "location": loc,
                        "user_iam_principal": principal,
                        "title": nb.get("title", ""),
                        "chat_turns": [],
                        "logged_sources": {},
                        "latest_timestamp": nb.get("metadata", {}).get("lastViewed") or nb.get("metadata", {}).get("createTime"),
                    })
                    if nb.get("title") and not nb_info["title"]:
                        nb_info["title"] = nb["title"]
            except Exception:
                continue

    now_iso = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    bq_rows: list[dict] = []

    for nb_id, nb_info in notebooks.items():
        loc = nb_info["location"]
        nb_name = nb_info["notebook_name"]
        principal = nb_info["user_iam_principal"]
        tok = get_token_for_principal(principal, project_id, workforce_pool_id)
        prefix = f"{loc}-" if loc != "global" else ""

        nb_detail = {}
        try:
            nb_url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/{nb_name}"
            req = urllib.request.Request(
                nb_url,
                headers={"Authorization": f"Bearer {tok}", "X-Goog-User-Project": project_id},
            )
            nb_detail = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
        except Exception as e:
            print(f"  [!] Could not GET notebook {nb_id} ({loc}): {e}")

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
            if sname:
                try:
                    s_url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/{sname}"
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

        archive_payload = {
            "notebook_id": nb_id,
            "notebook_name": nb_name,
            "location": loc,
            "user_iam_principal": principal,
            "title": title,
            "notebook_resource": nb_detail,
            "enriched_sources": enriched_sources,
            "chat_turns": nb_info["chat_turns"],
            "harvested_at": now_iso,
        }
        archive_bytes = json.dumps(archive_payload, indent=2).encode("utf-8")
        archive_sha256 = hashlib.sha256(archive_bytes).hexdigest()
        archive_crc32c = compute_crc32c_base64(archive_bytes)
        gcs_path = f"notebooks/{loc}/{nb_id}/notebook_archive.json"
        archive_gcs_uri, archive_console_url = upload_bytes_to_gcs(
            archive_bytes, gcs_path, bucket_name, project_id, "application/json"
        )
        print(
            f"  [+] Archived NotebookLM '{title}' ({nb_id}, {loc}, User: {principal}, "
            f"{len(enriched_sources)} sources, {len(nb_info['chat_turns'])} chat turns) -> {archive_gcs_uri}"
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

        engine_label = f"notebooklm-enterprise-{loc}"
        display_label = f"[NotebookLM] {title}"
        thought_summary = (
            f"NotebookLM Enterprise grounded over {len(enriched_sources)} source(s): "
            + (", ".join(source_titles) if source_titles else "No sources attached")
        )

        if nb_info["chat_turns"]:
            for idx, ct in enumerate(nb_info["chat_turns"], start=1):
                bq_rows.append({
                    "session_id": nb_id,
                    "turn_index": idx,
                    "query_id": ct["query_id"],
                    "assist_answer_id": ct["query_id"],
                    "engine_id": engine_label,
                    "location": loc,
                    "user_iam_principal": ct["user_principal"] or principal,
                    "session_display_name": display_label,
                    "prompt_text": ct["prompt_text"],
                    "response_text": ct["response_text"],
                    "thought_text": thought_summary,
                    "model_name": "notebooklm-enterprise",
                    "session_transcript_gcs_uri": archive_gcs_uri,
                    "session_transcript_console_url": archive_console_url,
                    "files": nb_files if idx == 1 else [],
                    "event_timestamp": ct["timestamp"] or create_time,
                    "harvested_at": now_iso,
                })
        elif enriched_sources or title:
            bq_rows.append({
                "session_id": nb_id,
                "turn_index": 1,
                "query_id": f"nb-inventory-{nb_id[:8]}",
                "assist_answer_id": f"nb-inventory-{nb_id[:8]}",
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
                "event_timestamp": create_time,
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
        if method == "StreamAssist":
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

        sessions = discover_from_cloud_logging(project_id, hours=72, extra_filter=f'"{session_id}"')
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
        if method not in ("GenerateFreeFormStreamed", "BatchCreateSources", "CreateNotebook"):
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

        nb_name = nb_name.split("/sources/")[0].split("/audioOverviews/")[0]
        parts = nb_name.split("/")
        nb_id = parts[parts.index("notebooks") + 1]
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", nb_id):
            raise ValueError("Invalid notebook_id format")

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
    parser = argparse.ArgumentParser(description="Harvest Gemini Enterprise sessions, NotebookLM notebooks, and files to GCS & BigQuery.")
    parser.add_argument("--project-id", default=PROJECT_ID, help="Google Cloud Project ID")
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

    bucket_name = args.bucket_name or get_bucket_name(args.project_id)
    sessions = discover_from_cloud_logging(args.project_id, hours=args.hours)
    for item in args.extra_session:
        if "=" in item:
            sname, uprinc = item.split("=", 1)
            info = sessions.setdefault(sname, {
                "session_name": sname,
                "user_iam_principal": uprinc,
                "uploaded_file_ids": set(),
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
