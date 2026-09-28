#!/usr/bin/env python3
"""
ge_harvest.py — Gemini Enterprise Server-Side eDiscovery Harvester

Discovers Gemini Enterprise user sessions and file uploads from Cloud Logging
(discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity), mints
per-user Workforce Identity Federation STS tokens via the 'ediscovery-archiver'
OIDC provider, fetches full untruncated session transcripts
(GetSession?includeAnswerDetails=true), downloads all USER_PROVIDED and
AI_GENERATED files via the :downloadFile endpoint, archives transcripts and
binaries to Cloud Storage, and loads structured reporting rows into BigQuery.
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
KEY_ID = os.environ.get("ARCHIVER_KEY_ID", "archiver-key-1")

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

_STS_TOKEN_CACHE: dict[str, str] = {}


def get_bucket_name(project_id: str) -> str:
    return os.environ.get("GCS_BUCKET_NAME") or f"{project_id}-ge-ediscovery"


def get_issuer_uri(project_id: str) -> str:
    return os.environ.get("ARCHIVER_ISSUER_URI") or f"https://ediscovery.{project_id}.internal"


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


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


def mint_sts_token(
    subject: str,
    project_id: str | None = None,
    workforce_pool_id: str | None = None,
) -> str:
    """Mints an OAuth2 access token for the given WIF subject via STS token exchange."""
    proj = project_id or PROJECT_ID
    pool = workforce_pool_id or WORKFORCE_POOL_ID
    cache_key = f"{proj}:{pool}:{subject}"
    if cache_key in _STS_TOKEN_CACHE:
        return _STS_TOKEN_CACHE[cache_key]

    if not os.path.exists(PRIVATE_KEY_PATH):
        raise FileNotFoundError(
            f"Archiver private key not found at {PRIVATE_KEY_PATH}. "
            "Run setup_ediscovery_archiver_provider.py first."
        )

    now = int(time.time())
    header = {"alg": "RS256", "typ": "JWT", "kid": KEY_ID}
    payload = {
        "iss": get_issuer_uri(proj),
        "sub": subject,
        "aud": CLIENT_ID,
        "iat": now - 60,
        "exp": now + 3600,
    }
    signing_input = (
        f"{b64url_encode(json.dumps(header).encode('utf-8'))}."
        f"{b64url_encode(json.dumps(payload).encode('utf-8'))}"
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
        "audience": f"//iam.googleapis.com/locations/global/workforcePools/{pool}/providers/{PROVIDER_ID}",
        "scope": "https://www.googleapis.com/auth/cloud-platform",
        "requested_token_type": "urn:ietf:params:oauth:token-type:access_token",
        "subject_token": jwt_token,
        "subject_token_type": "urn:ietf:params:oauth:token-type:id_token",
        "options": json.dumps({"userProject": proj}),
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://sts.googleapis.com/v1/token",
        data=sts_body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        token = json.loads(resp.read().decode("utf-8"))["access_token"]
        _STS_TOKEN_CACHE[cache_key] = token
        return token


def discover_from_cloud_logging(project_id: str, hours: int = 72) -> dict[str, dict]:
    """
    Reads discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity logs
    and returns a mapping of session_resource_name -> metadata dict:
      {
        "session_name": "projects/.../sessions/...",
        "user_iam_principal": "...",
        "uploaded_file_ids": set([...]),
        "turn_models": {assist_answer_id: model_name},
        "turn_timestamps": {assist_answer_id: timestamp_str},
        "latest_timestamp": timestamp_str,
      }
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
    out = subprocess.check_output(
        [
            "gcloud", "logging", "read", log_filter,
            f"--project={project_id}",
            "--limit=500",
            "--format=json",
        ]
    ).decode("utf-8")
    entries = json.loads(out) if out.strip() else []

    sessions: dict[str, dict] = {}
    for entry in entries:
        jp = entry.get("jsonPayload", {})
        meta = jp.get("logMetadata", {})
        method = meta.get("methodName", "")
        user_principal = jp.get("userIamPrincipal", "")
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

            info = sessions.setdefault(session_name, {
                "session_name": session_name,
                "user_iam_principal": user_principal,
                "uploaded_file_ids": set(),
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
                jp.get("request", {}).get("name")
                or jp.get("request", {}).get("parent")
                or meta.get("name", "")
            )
            if "/sessions/" not in session_name:
                continue
            file_id = jp.get("response", {}).get("fileId", "")
            if not file_id or severity == "ERROR" or status_code != 0:
                continue
            info = sessions.setdefault(session_name, {
                "session_name": session_name,
                "user_iam_principal": user_principal,
                "uploaded_file_ids": set(),
                "turn_models": {},
                "turn_timestamps": {},
                "latest_timestamp": ts,
            })
            if user_principal and not info["user_iam_principal"]:
                info["user_iam_principal"] = user_principal
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


def fetch_session_details(session_name: str, token: str, project_id: str | None = None) -> dict:
    proj = project_id or PROJECT_ID
    loc, _, _ = parse_session_resource(session_name)
    prefix = f"{loc}-" if loc != "global" else ""
    url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/{session_name}?includeAnswerDetails=true"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": proj,
        },
    )
    with urllib.request.urlopen(req, context=SSL_CTX) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_session_file(
    session_name: str,
    file_id: str,
    token: str,
    project_id: str | None = None,
) -> tuple[bytes, str, str]:
    """
    Downloads a binary file from Discovery Engine using the :downloadFile endpoint.
    Returns (raw_bytes, mime_type, filename).
    """
    proj = project_id or PROJECT_ID
    loc, _, _ = parse_session_resource(session_name)
    prefix = f"{loc}-" if loc != "global" else ""
    url = f"https://{prefix}discoveryengine.googleapis.com/v1/{session_name}:downloadFile?file_id={file_id}&alt=media"
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": proj,
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
    project_id: str,
    bucket_name: str,
    content_type: str = "application/octet-stream",
) -> tuple[str, str]:
    """Uploads bytes to gs://{bucket_name}/{gcs_object_path} and returns (gcs_uri, console_url)."""
    gcs_uri = f"gs://{bucket_name}/{gcs_object_path}"
    console_url = f"https://storage.cloud.google.com/{bucket_name}/{urllib.parse.quote(gcs_object_path, safe='/')}"
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    try:
        subprocess.run(
            [
                "gcloud", "storage", "cp", tmp_path, gcs_uri,
                f"--content-type={content_type}",
                f"--project={project_id}",
                "--quiet",
            ],
            check=True,
        )
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
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


def harvest_session(
    session_info: dict,
    project_id: str,
    workforce_pool_id: str,
    bucket_name: str,
) -> list[dict]:
    """
    Harvests a single session:
      1. Mints STS token for the owning user_iam_principal (or falls back to gcloud token for Workspace users).
      2. Calls GetSession?includeAnswerDetails=true.
      3. Archives the raw session JSON transcript to GCS.
      4. Downloads all USER_PROVIDED and AI_GENERATED files via :downloadFile and archives them to GCS.
      5. Returns the BigQuery rows for conversation_turns.
    """
    session_name = session_info["session_name"]
    user_principal = session_info["user_iam_principal"]
    loc, engine_id, session_id = parse_session_resource(session_name)

    print(f"\n=== Harvesting Session {session_id} (Engine: {engine_id}, User: {user_principal}) ===")
    try:
        token = mint_sts_token(user_principal, project_id, workforce_pool_id)
    except Exception:
        token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()

    session_data = fetch_session_details(session_name, token, project_id)
    display_name = session_data.get("displayName", "")
    session_start = session_data.get("startTime", "")

    transcript_bytes = json.dumps(session_data, indent=2).encode("utf-8")
    transcript_obj_path = f"sessions/{engine_id}/{session_id}/session_transcript.json"
    transcript_gcs_uri, transcript_console_url = upload_bytes_to_gcs(
        transcript_bytes, transcript_obj_path, project_id, bucket_name, "application/json"
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

    for fid in sorted(uploaded_file_ids):
        try:
            raw_bytes, mime_type, cd_fname = download_session_file(session_name, fid, token, project_id)
            ext = guess_extension(mime_type, raw_bytes)
            fname = sanitize_filename(cd_fname) if cd_fname else f"user_upload_{fid}{ext}"
            if not os.path.splitext(fname)[1]:
                fname += ext
            gcs_path = f"files/{engine_id}/{session_id}/USER_PROVIDED/{fid}_{fname}"
            gcs_uri, console_url = upload_bytes_to_gcs(raw_bytes, gcs_path, project_id, bucket_name, mime_type)
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
                    fname = sanitize_filename(rf.get("file_name") or cd_fname or f"{source_label.lower()}_{fid}{ext}")
                    if not os.path.splitext(fname)[1]:
                        fname += ext
                    gcs_path = f"files/{engine_id}/{session_id}/{source_label}/{fid}_{fname}"
                    gcs_uri, console_url = upload_bytes_to_gcs(
                        raw_bytes, gcs_path, project_id, bucket_name, mime_type
                    )
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
        model_name = session_info.get("turn_models", {}).get(assist_answer_id) or ""

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
    if not rows:
        print("No rows to load into BigQuery.")
        return

    session_ids = sorted({r["session_id"] for r in rows})
    quoted_ids = ", ".join(f"'{re.sub(r'[^A-Za-z0-9_-]', '', sid)}'" for sid in session_ids)
    delete_sql = f"DELETE FROM `{project_id}.{BQ_DATASET}.{BQ_TABLE}` WHERE session_id IN ({quoted_ids})"
    subprocess.run(
        ["bq", f"--project_id={project_id}", "query", "--use_legacy_sql=false", "--quiet", delete_sql],
        check=True,
    )

    with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as tmp:
        for r in rows:
            tmp.write(json.dumps(r) + "\n")
        tmp_path = tmp.name

    try:
        table_ref = f"{project_id}:{BQ_DATASET}.{BQ_TABLE}"
        subprocess.run(
            [
                "bq", f"--project_id={project_id}", "load",
                "--source_format=NEWLINE_DELIMITED_JSON",
                table_ref,
                tmp_path,
            ],
            check=True,
        )
        print(f"\n[+] Successfully loaded {len(rows)} turn row(s) across {len(session_ids)} session(s) into {table_ref}!")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="Harvest Gemini Enterprise sessions and files to GCS & BigQuery.")
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

    print(f"Discovered {len(sessions)} session(s) to harvest.")
    all_rows: list[dict] = []
    for sname, sinfo in sessions.items():
        try:
            rows = harvest_session(sinfo, args.project_id, args.workforce_pool_id, bucket_name)
            all_rows.extend(rows)
        except Exception as e:
            print(f"  [!] Error harvesting {sname}: {e}")

    load_rows_to_bigquery(all_rows, args.project_id)


if __name__ == "__main__":
    main()
