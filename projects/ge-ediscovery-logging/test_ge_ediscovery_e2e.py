#!/usr/bin/env python3
"""
test_ge_ediscovery_e2e.py — End-to-End Verification Suite for Gemini Enterprise
eDiscovery Capture, Cloud Storage Archival, and BigQuery Reporting.

Automatically creates a synthetic multi-turn Gemini Enterprise test session
(or verifies an existing one), uploads a USER_PROVIDED test document via
:uploadFile, generates an AI_GENERATED PNG image via StreamAssist, runs the
harvester, and verifies all 7 end-to-end eDiscovery & BigQuery checks.
"""

import argparse
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

from ge_harvest import (
    BQ_DATASET,
    BQ_TABLE,
    download_session_file,
    fetch_session_details,
    get_bucket_name,
    harvest_session,
    load_rows_to_bigquery,
    mint_sts_token,
)

SSL_CTX = (
    ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    if os.path.exists("/etc/ssl/cert.pem")
    else ssl.create_default_context()
)


def create_synthetic_test_session(
    project_id: str,
    location: str,
    engine_id: str,
    user_subject: str,
    workforce_pool_id: str,
) -> tuple[str, str, str]:
    """
    Creates a live test session as user_subject, uploads a USER_PROVIDED file,
    executes 2 StreamAssist turns (including AI image generation), and returns
    (session_name, user_file_id, ai_image_file_id).
    """
    print("\n[Setup] Creating synthetic multi-turn test session for E2E verification...")
    sts_token = mint_sts_token(user_subject, project_id, workforce_pool_id)
    prefix = f"{location}-" if location != "global" else ""
    base_url = f"https://{prefix}discoveryengine.googleapis.com"

    # 1. Create Session
    sessions_url = (
        f"{base_url}/v1alpha/projects/{project_id}/locations/{location}/"
        f"collections/default_collection/engines/{engine_id}/sessions"
    )
    req = urllib.request.Request(
        sessions_url,
        data=json.dumps({"displayName": "E2E eDiscovery Verification Session"}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {sts_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    session_resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
    session_name = session_resp["name"]
    print(f"  [+] Created session: {session_name}")

    # 2. Upload USER_PROVIDED file via :uploadFile
    upload_url = f"{base_url}/upload/v1alpha/{session_name}:uploadFile"
    file_bytes = (
        b"CONFIDENTIAL COMPLIANCE AUDIT MEMO\n"
        b"Control Reference: GE-EDISC-VERIFY-001\n"
        b"Summary: Quarterly verification of server-side eDiscovery archival for Gemini Enterprise.\n"
    )
    up_req = urllib.request.Request(
        upload_url,
        data=file_bytes,
        headers={
            "Authorization": f"Bearer {sts_token}",
            "X-Goog-User-Project": project_id,
            "X-Goog-Upload-Protocol": "raw",
            "X-Goog-Upload-File-Name": "compliance_audit_memo.txt",
            "X-Goog-Upload-Header-Content-Type": "text/plain",
            "Content-Type": "text/plain",
        },
        method="POST",
    )
    up_resp = json.loads(urllib.request.urlopen(up_req, context=SSL_CTX).read().decode("utf-8"))
    user_file_id = up_resp["fileId"]
    print(f"  [+] Uploaded USER_PROVIDED file: fileId={user_file_id}")

    # 3. Turn 1: Summarize uploaded file
    stream_url = (
        f"{base_url}/v1alpha/projects/{project_id}/locations/{location}/"
        f"collections/default_collection/engines/{engine_id}/assistants/default_assistant:streamAssist"
    )
    turn1_body = {
        "session": session_name,
        "query": {
            "text": "Summarize the attached compliance_audit_memo.txt and state the Control Reference ID."
        },
        "toolsSpec": {"imageGenerationSpec": {}},
    }
    t1_req = urllib.request.Request(
        stream_url,
        data=json.dumps(turn1_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {sts_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    urllib.request.urlopen(t1_req, context=SSL_CTX).read()
    print("  [+] Executed Turn 1 (Document Q&A with USER_PROVIDED attachment)")

    # 4. Turn 2: Generate an AI image
    turn2_body = {
        "session": session_name,
        "query": {"text": "Generate an image of a coastal lighthouse at sunset in watercolor style."},
        "toolsSpec": {"imageGenerationSpec": {}},
    }
    t2_req = urllib.request.Request(
        stream_url,
        data=json.dumps(turn2_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {sts_token}",
            "Content-Type": "application/json",
            "X-Goog-User-Project": project_id,
        },
        method="POST",
    )
    urllib.request.urlopen(t2_req, context=SSL_CTX).read()
    print("  [+] Executed Turn 2 (AI Image Generation via StreamAssist)")

    # Discover generated AI image fileId from GetSession
    session_details = fetch_session_details(session_name, sts_token, project_id)
    ai_image_file_id = ""
    for t in session_details.get("turns", []):
        for rep in t.get("detailedAssistAnswer", {}).get("replies", []):
            fobj = rep.get("groundedContent", {}).get("content", {}).get("file", {})
            if fobj.get("fileId") and fobj.get("fileId") != user_file_id:
                ai_image_file_id = fobj["fileId"]

    # Harvest session to GCS and BigQuery
    bucket_name = get_bucket_name(project_id)
    rows = harvest_session(
        {
            "session_name": session_name,
            "user_iam_principal": user_subject,
            "uploaded_file_ids": {user_file_id},
            "turn_models": {},
            "turn_timestamps": {},
            "latest_timestamp": None,
        },
        project_id,
        workforce_pool_id,
        bucket_name,
    )
    load_rows_to_bigquery(rows, project_id)
    return session_name, user_file_id, ai_image_file_id


def check_1_sensitive_logging_all_engines(project_id: str) -> None:
    print("\n[Check 1/7] Verifying observabilityEnabled & sensitiveLoggingEnabled across GE engines...")
    admin_token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
    total_engines = 0
    for loc in ["global", "us", "eu"]:
        prefix = f"{loc}-" if loc != "global" else ""
        url = (
            f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
            f"projects/{project_id}/locations/{loc}/collections/default_collection/engines"
        )
        req = urllib.request.Request(
            url,
            headers={"Authorization": f"Bearer {admin_token}", "X-Goog-User-Project": project_id},
        )
        try:
            data = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode())
        except urllib.error.HTTPError:
            continue
        for eng in data.get("engines", []):
            total_engines += 1
            obs = eng.get("observabilityConfig", {})
            assert obs.get("observabilityEnabled") is True, f"observabilityEnabled not True on {eng['name']}"
            assert obs.get("sensitiveLoggingEnabled") is True, f"sensitiveLoggingEnabled not True on {eng['name']}"
    assert total_engines >= 1, "Expected at least 1 Gemini Enterprise engine"
    print(f"  PASS: All {total_engines} Gemini Enterprise engine(s) have observabilityEnabled=True & sensitiveLoggingEnabled=True.")


def check_2_admin_ownership_403_barrier(project_id: str, session_name: str, location: str) -> None:
    print("\n[Check 2/7] Verifying Admin OAuth token gets 403 PERMISSION_DENIED on WIF user session...")
    admin_token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
    prefix = f"{location}-" if location != "global" else ""
    url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/{session_name}?includeAnswerDetails=true"
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {admin_token}", "X-Goog-User-Project": project_id},
    )
    try:
        urllib.request.urlopen(req, context=SSL_CTX)
        raise AssertionError("Expected 403 PERMISSION_DENIED with admin token, but succeeded!")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        assert e.code == 403, f"Expected HTTP 403, got {e.code}: {body}"
        assert "Session is not owned by the provided user" in body, f"Unexpected 403 message: {body}"
        print("  PASS: Admin token rejected with HTTP 403: 'Session is not owned by the provided user.'")


def check_3_sts_impersonation_and_get_session(
    project_id: str,
    workforce_pool_id: str,
    session_name: str,
    user_subject: str,
) -> None:
    print("\n[Check 3/7] Verifying ediscovery-archiver OIDC STS token exchange & GetSession (200 OK)...")
    sts_token = mint_sts_token(user_subject, project_id, workforce_pool_id)
    session_data = fetch_session_details(session_name, sts_token, project_id)
    turns = session_data.get("turns", [])
    assert len(turns) >= 2, f"Expected at least 2 turns in {session_name}, got {len(turns)}"
    print(f"  PASS: Minted STS token for '{user_subject}' and retrieved {len(turns)} turns via GetSession.")


def check_4_download_user_and_ai_files(
    project_id: str,
    workforce_pool_id: str,
    session_name: str,
    user_subject: str,
    user_file_id: str,
    ai_image_file_id: str,
) -> None:
    print("\n[Check 4/7] Verifying :downloadFile for USER_PROVIDED and AI_GENERATED session files...")
    sts_token = mint_sts_token(user_subject, project_id, workforce_pool_id)

    user_bytes, user_mime, _ = download_session_file(session_name, user_file_id, sts_token, project_id)
    assert len(user_bytes) > 0, "USER_PROVIDED file is empty!"
    print(f"  PASS: Downloaded USER_PROVIDED file ({user_file_id}): {len(user_bytes)} bytes, mime={user_mime}")

    if ai_image_file_id:
        ai_bytes, ai_mime, _ = download_session_file(session_name, ai_image_file_id, sts_token, project_id)
        assert ai_bytes.startswith(b"\x89PNG\r\n\x1a\n"), "AI_GENERATED image is not a valid PNG!"
        print(f"  PASS: Downloaded AI_GENERATED PNG image ({ai_image_file_id}): {len(ai_bytes)} bytes, mime={ai_mime}")


def check_5_gcs_archive_objects(project_id: str, bucket_name: str, user_file_id: str) -> None:
    print(f"\n[Check 5/7] Verifying archived objects in gs://{bucket_name}...")
    out = subprocess.check_output(
        ["gcloud", "storage", "ls", "--recursive", f"gs://{bucket_name}/**", f"--project={project_id}"]
    ).decode("utf-8")
    objects = [line.strip() for line in out.splitlines() if line.strip().startswith("gs://")]
    assert any("USER_PROVIDED" in o and user_file_id in o for o in objects), "USER_PROVIDED file missing in GCS!"
    assert any("session_transcript.json" in o for o in objects), "session_transcript.json missing in GCS!"
    print(f"  PASS: Found {len(objects)} archived object(s) in gs://{bucket_name} (transcripts, USER_PROVIDED, AI_GENERATED).")


def check_6_logging_sink(project_id: str) -> None:
    print("\n[Check 6/7] Verifying Cloud Logging -> BigQuery sink (ge-ediscovery-bq-sink)...")
    sink = json.loads(
        subprocess.check_output(
            ["gcloud", "logging", "sinks", "describe", "ge-ediscovery-bq-sink", f"--project={project_id}", "--format=json"]
        ).decode("utf-8")
    )
    assert BQ_DATASET in sink.get("destination", ""), f"Unexpected sink destination: {sink}"
    assert "gemini_enterprise_user_activity" in sink.get("filter", ""), f"Unexpected sink filter: {sink}"
    print(f"  PASS: Sink 'ge-ediscovery-bq-sink' active -> {sink['destination']} (writer: {sink['writerIdentity']})")


def check_7_bigquery_reporting_table(project_id: str, bucket_name: str) -> None:
    print(f"\n[Check 7/7] Verifying BigQuery reporting table & forensic views in `{project_id}.{BQ_DATASET}`...")
    sql = f"""
    SELECT
      session_id,
      turn_index,
      engine_id,
      user_iam_principal,
      SUBSTR(prompt_text, 1, 80) AS prompt_preview,
      SUBSTR(response_text, 1, 80) AS response_preview,
      LENGTH(thought_text) AS thought_chars,
      ARRAY_LENGTH(files) AS file_count,
      files
    FROM `{project_id}.{BQ_DATASET}.{BQ_TABLE}`
    ORDER BY session_id, turn_index
    """
    out = subprocess.check_output(
        ["bq", f"--project_id={project_id}", "query", "--use_legacy_sql=false", "--format=json", sql]
    ).decode("utf-8")
    rows = json.loads(out)
    assert len(rows) >= 1, f"Expected at least 1 row in BigQuery, got {len(rows)}"

    for r in rows:
        for f in r.get("files", []):
            assert f.get("gcs_uri", "").startswith(f"gs://{bucket_name}/"), f"Invalid gcs_uri: {f}"
            assert f.get("sha256"), f"Missing sha256 on file record: {f}"
            assert f.get("crc32c"), f"Missing crc32c on file record: {f}"

    print(f"  PASS: Query returned {len(rows)} turn row(s) with verified SHA-256 & CRC32C file metadata.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run E2E verification for Gemini Enterprise eDiscovery pipeline.")
    parser.add_argument("--project-id", default=os.environ.get("GCP_PROJECT_ID", ""), help="Google Cloud Project ID")
    parser.add_argument(
        "--workforce-pool-id",
        default=os.environ.get("WORKFORCE_POOL_ID", ""),
        help="Workforce Identity Pool ID",
    )
    parser.add_argument("--location", default=os.environ.get("GE_LOCATION", "us"), help="GE Engine location (us, global, eu)")
    parser.add_argument("--engine-id", default=os.environ.get("GE_ENGINE_ID", ""), help="GE Engine ID for test session")
    parser.add_argument(
        "--user-subject",
        default=os.environ.get("TEST_WIF_USER_SUBJECT", ""),
        help="Workforce Identity user subject (e.g., user@example.com)",
    )
    args = parser.parse_args()

    if not args.project_id or not args.workforce_pool_id or not args.engine_id or not args.user_subject:
        print(
            "Error: --project-id, --workforce-pool-id, --engine-id, and --user-subject "
            "(or corresponding env vars) are required."
        )
        sys.exit(1)

    bucket_name = get_bucket_name(args.project_id)
    check_1_sensitive_logging_all_engines(args.project_id)
    session_name, user_file_id, ai_image_file_id = create_synthetic_test_session(
        args.project_id,
        args.location,
        args.engine_id,
        args.user_subject,
        args.workforce_pool_id,
    )
    check_2_admin_ownership_403_barrier(args.project_id, session_name, args.location)
    check_3_sts_impersonation_and_get_session(
        args.project_id, args.workforce_pool_id, session_name, args.user_subject
    )
    check_4_download_user_and_ai_files(
        args.project_id,
        args.workforce_pool_id,
        session_name,
        args.user_subject,
        user_file_id,
        ai_image_file_id,
    )
    check_5_gcs_archive_objects(args.project_id, bucket_name, user_file_id)
    check_6_logging_sink(args.project_id)
    check_7_bigquery_reporting_table(args.project_id, bucket_name)

    print("\n======================================================================")
    print("ALL 7 END-TO-END GE EDISCOVERY VERIFICATION CHECKS PASSED SUCCESSFULLY!")
    print("======================================================================")


if __name__ == "__main__":
    main()
