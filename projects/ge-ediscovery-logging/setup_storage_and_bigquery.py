#!/usr/bin/env python3
"""
Provisions the Cloud Storage archive bucket, BigQuery dataset, structured
reporting table (conversation_turns), Cloud Logging -> BigQuery sink, and
pre-built BigQuery analytical views & functions for Gemini Enterprise eDiscovery:
  - v_ediscovery_file_audit
  - v_realtime_agent_and_file_activity
  - v_notebooklm_forensic_audit
  - v_jailbreak_and_security_detections
  - fn_user_forensic_report(target_user STRING)

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  python3 setup_storage_and_bigquery.py
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()
GCS_BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", f"{PROJECT_ID}-ge-ediscovery" if PROJECT_ID else "").strip()
GCS_BUCKET = f"gs://{GCS_BUCKET_NAME}" if not GCS_BUCKET_NAME.startswith("gs://") else GCS_BUCKET_NAME
BQ_DATASET = os.environ.get("BQ_DATASET", "ge_ediscovery").strip()
BQ_TABLE = os.environ.get("BQ_TABLE", "conversation_turns").strip()
SINK_NAME = os.environ.get("LOGGING_SINK_NAME", "ge-ediscovery-bq-sink").strip()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_PATH = os.path.join(BASE_DIR, "conversation_turns_schema.json")


def ensure_gcs_bucket() -> None:
    print(f"[1/5] Ensuring Cloud Storage bucket {GCS_BUCKET}...")
    check = subprocess.run(
        ["gcloud", "storage", "buckets", "describe", GCS_BUCKET, f"--project={PROJECT_ID}"],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        print(f"      Creating bucket {GCS_BUCKET} in US with uniform bucket-level access and public access prevention...")
        subprocess.run(
            [
                "gcloud", "storage", "buckets", "create", GCS_BUCKET,
                f"--project={PROJECT_ID}",
                "--location=US",
                "--uniform-bucket-level-access",
                "--public-access-prevention",
            ],
            check=True,
        )
    else:
        print(f"      Bucket {GCS_BUCKET} already exists.")

    retention_period = os.environ.get("GCS_RETENTION_PERIOD", "").strip()
    cmek_key = os.environ.get("GCS_CMEK_KEY_NAME", "").strip()

    if retention_period:
        # Bucket retention policies and object versioning are mutually exclusive in GCS.
        # Use valid `--no-versioning` and `--lock-retention-period` flags (SEC 17a-4 / FOIA WORM holds).
        print(f"      Enforcing uniform bucket-level access, public access prevention, and WORM retention ({retention_period}) on {GCS_BUCKET}...")
        update_cmd = [
            "gcloud", "storage", "buckets", "update", GCS_BUCKET,
            "--no-versioning",
            "--uniform-bucket-level-access",
            "--public-access-prevention",
            f"--retention-period={retention_period}",
            f"--project={PROJECT_ID}",
        ]
        if cmek_key:
            update_cmd.append(f"--default-encryption-key={cmek_key}")
        subprocess.run(update_cmd, check=True)

        if os.environ.get("LOCK_GCS_RETENTION_POLICY", "false").lower() == "true":
            print(f"      Irreversibly locking WORM retention period on {GCS_BUCKET} (--lock-retention-period)...")
            subprocess.run(
                [
                    "gcloud", "storage", "buckets", "update", GCS_BUCKET,
                    "--lock-retention-period",
                    "--quiet",
                    f"--project={PROJECT_ID}",
                ],
                check=True,
            )
    else:
        print("      Enforcing object versioning, uniform bucket-level access, and public access prevention on bucket...")
        update_cmd = [
            "gcloud", "storage", "buckets", "update", GCS_BUCKET,
            "--versioning",
            "--uniform-bucket-level-access",
            "--public-access-prevention",
            f"--project={PROJECT_ID}",
        ]
        if cmek_key:
            update_cmd.append(f"--default-encryption-key={cmek_key}")
        subprocess.run(update_cmd, check=True)


def ensure_bq_dataset_and_table() -> None:
    print(f"[2/5] Ensuring BigQuery dataset {PROJECT_ID}:{BQ_DATASET}...")
    ds_check = subprocess.run(
        ["bq", f"--project_id={PROJECT_ID}", "show", f"{PROJECT_ID}:{BQ_DATASET}"],
        capture_output=True,
        text=True,
    )
    if ds_check.returncode != 0:
        subprocess.run(
            [
                "bq", "--location=US", "mk", "--dataset",
                "--description=Gemini Enterprise eDiscovery Archive and Reporting Dataset",
                f"{PROJECT_ID}:{BQ_DATASET}",
            ],
            check=True,
        )
    else:
        print(f"      Dataset {PROJECT_ID}:{BQ_DATASET} already exists.")

    table_ref = f"{PROJECT_ID}:{BQ_DATASET}.{BQ_TABLE}"
    print(f"[3/5] Ensuring BigQuery table {table_ref}...")
    tbl_check = subprocess.run(
        ["bq", f"--project_id={PROJECT_ID}", "show", table_ref],
        capture_output=True,
        text=True,
    )
    if tbl_check.returncode != 0:
        subprocess.run(
            [
                "bq", f"--project_id={PROJECT_ID}", "mk", "--table",
                "--description=Enriched Gemini Enterprise conversation turns with GCS links to uploaded and AI-generated files",
                table_ref,
                SCHEMA_PATH,
            ],
            check=True,
        )
    else:
        subprocess.run(
            ["bq", f"--project_id={PROJECT_ID}", "update", table_ref, SCHEMA_PATH],
            check=True,
        )
        print(f"      Updated schema on existing table {table_ref}.")


def ensure_logging_sink() -> None:
    print(f"[4/5] Ensuring Cloud Logging sink '{SINK_NAME}' -> BigQuery dataset '{BQ_DATASET}'...")
    destination = f"bigquery.googleapis.com/projects/{PROJECT_ID}/datasets/{BQ_DATASET}"
    log_filter = (
        f'resource.type="consumed_api" AND ('
        f'logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" '
        f'OR logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity")'
    )

    sink_check = subprocess.run(
        ["gcloud", "logging", "sinks", "describe", SINK_NAME, f"--project={PROJECT_ID}", "--format=json"],
        capture_output=True,
        text=True,
    )
    if sink_check.returncode != 0:
        subprocess.run(
            [
                "gcloud", "logging", "sinks", "create", SINK_NAME,
                destination,
                f"--log-filter={log_filter}",
                "--use-partitioned-tables",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )
    else:
        subprocess.run(
            [
                "gcloud", "logging", "sinks", "update", SINK_NAME,
                destination,
                f"--log-filter={log_filter}",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )

    sink_info = json.loads(
        subprocess.check_output(
            ["gcloud", "logging", "sinks", "describe", SINK_NAME, f"--project={PROJECT_ID}", "--format=json"]
        ).decode()
    )
    writer_identity = sink_info["writerIdentity"]
    print(f"      Sink writerIdentity: {writer_identity}")

    ds_json = json.loads(
        subprocess.check_output(
            ["bq", f"--project_id={PROJECT_ID}", "show", "--format=prettyjson", f"{PROJECT_ID}:{BQ_DATASET}"]
        ).decode()
    )
    sa_email = writer_identity.split(":", 1)[1] if ":" in writer_identity else writer_identity
    access_list = ds_json.get("access", [])
    if not any(a.get("userByEmail") == sa_email and a.get("role") == "WRITER" for a in access_list):
        access_list.append({"role": "WRITER", "userByEmail": sa_email})
        ds_json["access"] = access_list
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
            tmp_ds_path = tf.name
            json.dump(ds_json, tf)
        try:
            subprocess.run(
                ["bq", f"--project_id={PROJECT_ID}", "update", "--source", tmp_ds_path, f"{PROJECT_ID}:{BQ_DATASET}"],
                check=True,
            )
        finally:
            if os.path.exists(tmp_ds_path):
                os.remove(tmp_ds_path)
        print(f"      Granted WRITER (roles/bigquery.dataEditor) on {BQ_DATASET} to {sa_email}.")
    else:
        print(f"      {sa_email} already has WRITER access on {BQ_DATASET}.")


def ensure_bq_views_and_functions() -> None:
    print(f"[5/5] Creating BigQuery audit views & parameterized forensic table function in {PROJECT_ID}.{BQ_DATASET}...")
    raw_sink_table = f"{PROJECT_ID}:{BQ_DATASET}.discoveryengine_googleapis_com_gemini_enterprise_user_activity"
    sink_tbl_check = subprocess.run(
        ["bq", f"--project_id={PROJECT_ID}", "show", "--format=none", raw_sink_table],
        capture_output=True,
        text=True,
    )
    has_raw_sink_table = sink_tbl_check.returncode == 0

    if has_raw_sink_table:
        realtime_view_ddl = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_realtime_agent_and_file_activity` AS
    WITH raw_events AS (
      SELECT
        timestamp,
        insertId,
        jsonPayload.useriamprincipal AS user_iam_principal,
        jsonPayload.logmetadata.methodname AS method_name,
        REGEXP_EXTRACT(
          COALESCE(
            jsonPayload.response.answer.name,
            jsonPayload.response.session,
            jsonPayload.request.name,
            jsonPayload.logmetadata.name
          ),
          r"/engines/([^/]+)"
        ) AS engine_id,
        REGEXP_EXTRACT(
          COALESCE(
            jsonPayload.response.answer.name,
            jsonPayload.response.session,
            jsonPayload.request.name,
            jsonPayload.logmetadata.name
          ),
          r"/sessions/([^/]+)"
        ) AS session_id,
        REGEXP_EXTRACT(
          jsonPayload.response.answer.name,
          r"/assistAnswers/([^/]+)"
        ) AS assist_answer_id,
        COALESCE(
          jsonPayload.request.query.text,
          jsonPayload.request.query.parts[SAFE_OFFSET(0)].text
        ) AS user_prompt,
        jsonPayload.servicetextreply AS service_text_reply,
        COALESCE(
          jsonPayload.response.agentinfo.displayname,
          "core_assistant"
        ) AS agent_display_name,
        jsonPayload.response.agentinfo.spiffeid AS agent_spiffe_id,
        jsonPayload.response.agentinfo.agent AS agent_resource_name,
        jsonPayload.response.fileid AS file_id,
        COALESCE(
          jsonPayload.response.filename,
          jsonPayload.request.filename
        ) AS file_name,
        jsonPayload.response.mimetype AS mime_type,
        SAFE_CAST(jsonPayload.response.bytecount AS INT64) AS byte_count
      FROM `{PROJECT_ID}.{BQ_DATASET}.discoveryengine_googleapis_com_gemini_enterprise_user_activity`
    ),
    stream_turns AS (
      SELECT *
      FROM raw_events
      WHERE method_name = "StreamAssist"
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY session_id, COALESCE(assist_answer_id, user_prompt)
        ORDER BY LENGTH(IFNULL(service_text_reply, "")) DESC, timestamp DESC
      ) = 1
    ),
    file_events AS (
      SELECT
        session_id,
        ANY_VALUE(engine_id) AS engine_id,
        file_id,
        ANY_VALUE(file_name) AS file_name,
        ANY_VALUE(mime_type) AS mime_type,
        ANY_VALUE(byte_count) AS byte_count,
        ANY_VALUE(method_name) AS file_method_name,
        MIN(timestamp) AS file_timestamp
      FROM raw_events
      WHERE method_name IN ("AddContextFile", "UploadSessionFile")
        AND file_id IS NOT NULL
      GROUP BY session_id, file_id
    ),
    harvested_files AS (
      SELECT
        session_id,
        file_id,
        ANY_VALUE(file_source) AS file_source,
        ANY_VALUE(sha256) AS sha256,
        ANY_VALUE(gcs_uri) AS gcs_uri,
        ANY_VALUE(console_url) AS console_url,
        ARRAY_AGG(session_transcript_console_url IGNORE NULLS ORDER BY event_timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS session_transcript_console_url
      FROM `{PROJECT_ID}.{BQ_DATASET}.v_ediscovery_file_audit`
      WHERE file_id IS NOT NULL
      GROUP BY session_id, file_id
    ),
    harvested_sessions AS (
      SELECT
        session_id,
        ARRAY_AGG(session_transcript_gcs_uri IGNORE NULLS ORDER BY harvested_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS session_transcript_gcs_uri,
        ARRAY_AGG(session_transcript_console_url IGNORE NULLS ORDER BY harvested_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS session_transcript_console_url
      FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`
      WHERE session_id IS NOT NULL
      GROUP BY session_id
    )
    SELECT
      s.timestamp,
      s.user_iam_principal,
      COALESCE(s.engine_id, f.engine_id) AS engine_id,
      s.session_id,
      s.agent_display_name,
      s.agent_spiffe_id,
      s.user_prompt,
      s.service_text_reply,
      f.file_method_name,
      COALESCE(
        h.file_source,
        CASE
          WHEN f.file_method_name = "UploadSessionFile" THEN "USER_PROVIDED"
          WHEN f.file_method_name = "AddContextFile" THEN "AI_GENERATED"
          ELSE NULL
        END
      ) AS file_source,
      f.file_id,
      f.file_name,
      f.mime_type,
      f.byte_count,
      h.sha256,
      COALESCE(
        h.gcs_uri,
        IF(
          f.file_id IS NOT NULL,
          CONCAT(
            "gs://{GCS_BUCKET_NAME}/files/",
            COALESCE(s.engine_id, f.engine_id), "/",
            s.session_id, "/",
            IF(f.file_method_name = "UploadSessionFile", "USER_PROVIDED", "AI_GENERATED"), "/",
            f.file_id, "_",
            REGEXP_REPLACE(IFNULL(f.file_name, f.file_id), r"[^A-Za-z0-9._-]", "_")
          ),
          NULL
        )
      ) AS gcs_uri,
      COALESCE(
        h.console_url,
        IF(
          f.file_id IS NOT NULL,
          CONCAT(
            "https://storage.cloud.google.com/{GCS_BUCKET_NAME}/files/",
            COALESCE(s.engine_id, f.engine_id), "/",
            s.session_id, "/",
            IF(f.file_method_name = "UploadSessionFile", "USER_PROVIDED", "AI_GENERATED"), "/",
            f.file_id, "_",
            REGEXP_REPLACE(IFNULL(f.file_name, f.file_id), r"[^A-Za-z0-9._-]", "_")
          ),
          NULL
        )
      ) AS console_url,
      COALESCE(
        h.session_transcript_console_url,
        hs.session_transcript_console_url
      ) AS session_transcript_console_url
    FROM stream_turns s
    LEFT JOIN file_events f
      ON s.session_id = f.session_id
      AND ABS(TIMESTAMP_DIFF(s.timestamp, f.file_timestamp, SECOND)) <= 180
    LEFT JOIN harvested_files h
      ON s.session_id = h.session_id
      AND f.file_id = h.file_id
    LEFT JOIN harvested_sessions hs
      ON s.session_id = hs.session_id;
        """
    else:
        print(
            "      [Greenfield Project] Cloud Logging sink table "
            "'discoveryengine_googleapis_com_gemini_enterprise_user_activity' has not received "
            "its first event yet; creating schema-compatible greenfield 'v_realtime_agent_and_file_activity' "
            f"backed by '{BQ_TABLE}' (re-run this script anytime after first user activity to join raw sink rows)."
        )
        realtime_view_ddl = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_realtime_agent_and_file_activity` AS
    SELECT
      t.event_timestamp AS timestamp,
      t.user_iam_principal,
      t.engine_id,
      t.session_id,
      COALESCE(NULLIF(t.model_name, ""), "core_assistant") AS agent_display_name,
      CAST(NULL AS STRING) AS agent_spiffe_id,
      t.prompt_text AS user_prompt,
      t.response_text AS service_text_reply,
      CASE
        WHEN f.file_source = "USER_PROVIDED" THEN "UploadSessionFile"
        WHEN f.file_source = "AI_GENERATED" THEN "AddContextFile"
        ELSE CAST(NULL AS STRING)
      END AS file_method_name,
      f.file_source,
      f.file_id,
      f.file_name,
      f.mime_type,
      f.byte_size AS byte_count,
      f.sha256,
      f.gcs_uri,
      f.console_url,
      t.session_transcript_console_url
    FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}` AS t
    LEFT JOIN UNNEST(t.files) AS f;
        """

    ddl = f"""
    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_ediscovery_file_audit` AS
    SELECT
      t.event_timestamp,
      t.engine_id,
      t.session_id,
      t.turn_index,
      t.user_iam_principal,
      t.session_display_name,
      t.prompt_text,
      t.response_text,
      f.file_source,
      f.file_id,
      f.file_name,
      f.mime_type,
      f.byte_size,
      f.sha256,
      f.crc32c,
      f.gcs_uri,
      f.console_url,
      t.session_transcript_gcs_uri,
      t.session_transcript_console_url
    FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}` AS t
    LEFT JOIN UNNEST(t.files) AS f;

    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_ediscovery_custodian_export` AS
    WITH latest_session_archives AS (
      SELECT
        session_id,
        ARRAY_AGG(session_transcript_gcs_uri IGNORE NULLS ORDER BY harvested_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS latest_transcript_gcs_uri,
        ARRAY_AGG(session_transcript_console_url IGNORE NULLS ORDER BY harvested_at DESC LIMIT 1)[SAFE_OFFSET(0)] AS latest_transcript_console_url
      FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`
      WHERE session_id IS NOT NULL
      GROUP BY session_id
    )
    SELECT
      t.event_timestamp,
      t.harvested_at,
      t.user_iam_principal,
      REGEXP_EXTRACT(t.user_iam_principal, r'/subject/([^/]+)$') AS custodian_subject,
      t.location,
      t.engine_id,
      t.session_id,
      t.session_display_name,
      t.turn_index,
      t.query_id,
      t.assist_answer_id,
      t.model_name,
      t.prompt_text,
      t.response_text,
      t.thought_text,
      t.files,
      COALESCE(t.session_transcript_gcs_uri, lsa.latest_transcript_gcs_uri) AS session_transcript_gcs_uri,
      COALESCE(t.session_transcript_console_url, lsa.latest_transcript_console_url) AS session_transcript_console_url
    FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}` AS t
    LEFT JOIN latest_session_archives AS lsa
      ON t.session_id = lsa.session_id;

    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_jailbreak_and_security_detections` AS
    WITH analyzed AS (
      SELECT
        event_timestamp,
        engine_id,
        session_id,
        turn_index,
        user_iam_principal,
        session_display_name,
        prompt_text,
        response_text,
        thought_text,
        files,
        session_transcript_console_url,
        REGEXP_CONTAINS(LOWER(IFNULL(prompt_text, "")), r"official directive|office of the ciso|ciso|executive order|authorized security test|override policy|system administrator") AS flag_authority_spoofing,
        REGEXP_CONTAINS(LOWER(IFNULL(prompt_text, "")), r"ignore (all )?(previous|prior) instructions|do not call any other tools|system prompt|dan mode|jailbreak|bypass|without restriction") AS flag_instruction_override,
        REGEXP_CONTAINS(LOWER(IFNULL(prompt_text, "") || " " || IFNULL(response_text, "")), r"encrypted instruction|decrypt_instruction|ciphertext|aesgcm|aes-256-gcm|payload_b64|base64\\.b64decode|run the decryption code") AS flag_encrypted_payload_or_code_exec,
        REGEXP_CONTAINS(LOWER(IFNULL(prompt_text, "") || " " || IFNULL(response_text, "")), r"contacts an external address|external network callback|save it to my sharepoint|sensitivitylabel|purview|encrypted and restricted") AS flag_exfil_or_sensitivity_probe,
        REGEXP_CONTAINS(LOWER(IFNULL(response_text, "") || " " || IFNULL(thought_text, "")), r"i cannot generate|i cannot fulfill|impersonate executive|initiate external network callbacks|ethical implications|cannot be read, summarized, or extracted|access denied") AS model_refused_or_blocked
      FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}`
    )
    SELECT
      event_timestamp,
      CASE
        WHEN flag_authority_spoofing AND model_refused_or_blocked THEN "CRITICAL"
        WHEN flag_authority_spoofing OR flag_encrypted_payload_or_code_exec THEN "HIGH"
        WHEN flag_instruction_override OR flag_exfil_or_sensitivity_probe OR model_refused_or_blocked THEN "MEDIUM"
        ELSE "LOW"
      END AS risk_severity,
      ARRAY_TO_STRING([
        IF(flag_authority_spoofing, "AUTHORITY_SPOOFING", NULL),
        IF(flag_instruction_override, "INSTRUCTION_OR_TOOL_OVERRIDE", NULL),
        IF(flag_encrypted_payload_or_code_exec, "OBFUSCATED_OR_ENCRYPTED_PAYLOAD", NULL),
        IF(flag_exfil_or_sensitivity_probe, "EXFIL_OR_SENSITIVITY_LABEL_PROBE", NULL),
        IF(model_refused_or_blocked, "MODEL_SAFETY_OR_DLP_REFUSAL", NULL)
      ], ", ") AS matched_threat_signals,
      model_refused_or_blocked,
      user_iam_principal,
      engine_id,
      session_id,
      turn_index,
      session_display_name,
      prompt_text,
      response_text,
      thought_text,
      ARRAY_LENGTH(files) AS file_count,
      files,
      session_transcript_console_url
    FROM analyzed;

    CREATE OR REPLACE TABLE FUNCTION `{PROJECT_ID}.{BQ_DATASET}.fn_user_forensic_report`(target_user STRING) AS (
      SELECT
        d.event_timestamp,
        d.user_iam_principal,
        d.engine_id,
        d.session_id,
        d.turn_index,
        d.session_display_name,
        d.risk_severity,
        d.matched_threat_signals,
        d.model_refused_or_blocked,
        d.prompt_text,
        d.response_text,
        d.thought_text,
        d.file_count,
        ARRAY(
          SELECT AS STRUCT
            f.file_source,
            f.file_id,
            f.file_name,
            f.mime_type,
            f.byte_size,
            f.sha256,
            f.console_url,
            f.gcs_uri
          FROM UNNEST(d.files) AS f
        ) AS archived_files,
        d.session_transcript_console_url
      FROM `{PROJECT_ID}.{BQ_DATASET}.v_jailbreak_and_security_detections` AS d
      WHERE
        UPPER(TRIM(target_user)) IN ("ALL", "*", "")
        OR LOWER(d.user_iam_principal) = LOWER(TRIM(target_user))
        OR STRPOS(LOWER(d.user_iam_principal), LOWER(TRIM(target_user))) > 0
    );

    CREATE OR REPLACE VIEW `{PROJECT_ID}.{BQ_DATASET}.v_notebooklm_forensic_audit` AS
    SELECT
      t.event_timestamp,
      REGEXP_EXTRACT(t.user_iam_principal, r'/subject/([^/]+)$') AS user_subject,
      t.user_iam_principal,
      t.location,
      t.engine_id,
      t.session_id AS notebook_id,
      t.session_display_name AS notebook_title,
      t.turn_index,
      CASE
        WHEN STARTS_WITH(t.prompt_text, '[NotebookLM Source Ingestion]') THEN 'SOURCE_INGESTION_AUDIT'
        WHEN STARTS_WITH(t.prompt_text, '[NotebookLM BatchCreateSources Failed Ingestion]') THEN 'SOURCE_INGESTION_FAILED'
        WHEN STARTS_WITH(t.prompt_text, '[NotebookLM Notebook & Source Inventory]') THEN 'NOTEBOOK_INVENTORY_SNAPSHOT'
        ELSE 'NOTEBOOK_CHAT_PROMPT'
      END AS activity_type,
      t.prompt_text AS notebook_query_or_event,
      t.response_text AS notebook_grounded_response,
      t.thought_text AS notebook_forensic_metadata,
      ARRAY_LENGTH(t.files) AS source_count,
      ARRAY(
        SELECT AS STRUCT
          f.file_id AS source_id,
          f.file_name AS source_title_and_origin,
          f.mime_type AS source_type,
          f.file_source,
          f.console_url AS archive_console_url
        FROM UNNEST(t.files) AS f
      ) AS sources,
      t.session_transcript_gcs_uri AS notebook_archive_gcs_uri,
      t.session_transcript_console_url AS notebook_archive_console_url
    FROM `{PROJECT_ID}.{BQ_DATASET}.{BQ_TABLE}` AS t
    WHERE STARTS_WITH(t.engine_id, 'notebooklm-enterprise-');

    {realtime_view_ddl}
    """
    subprocess.run(
        ["bq", f"--project_id={PROJECT_ID}", "query", "--use_legacy_sql=false", "--quiet", ddl],
        check=True,
    )
    print(
        "      Created v_ediscovery_file_audit, v_ediscovery_custodian_export, "
        "v_jailbreak_and_security_detections, fn_user_forensic_report, "
        "v_notebooklm_forensic_audit, and v_realtime_agent_and_file_activity."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Provision Cloud Storage archive bucket, BigQuery dataset/table, Cloud Logging sink, and analytical views."
    )
    parser.add_argument(
        "--project-id",
        "--project",
        dest="project_id",
        default=PROJECT_ID,
        help="Google Cloud Project ID (or set GCP_PROJECT_ID)",
    )
    parser.add_argument(
        "--bucket-name",
        dest="bucket_name",
        default="",
        help="Cloud Storage bucket name (default: <project_id>-ge-ediscovery)",
    )
    parser.add_argument(
        "--bq-dataset",
        dest="bq_dataset",
        default=BQ_DATASET,
        help="BigQuery dataset name (default: ge_ediscovery)",
    )
    parser.add_argument(
        "--retention-period",
        dest="retention_period",
        default=os.environ.get("GCS_RETENTION_PERIOD", ""),
        help="Optional GCS WORM retention period (e.g., 365d or 7y; disables bucket versioning)",
    )
    parser.add_argument(
        "--lock-retention-period",
        dest="lock_retention_period",
        action="store_true",
        default=os.environ.get("LOCK_GCS_RETENTION_POLICY", "false").lower() == "true",
        help="Irreversibly lock GCS bucket retention policy for SEC 17a-4 / FOIA legal hold compliance",
    )
    args = parser.parse_args()
    if args.retention_period:
        os.environ["GCS_RETENTION_PERIOD"] = args.retention_period.strip()
    if args.lock_retention_period:
        os.environ["LOCK_GCS_RETENTION_POLICY"] = "true"
    PROJECT_ID = (args.project_id or "").strip()
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please pass --project-id or set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")

    GCS_BUCKET_NAME = (
        args.bucket_name.strip()
        or os.environ.get("GCS_BUCKET_NAME", "").strip()
        or f"{PROJECT_ID}-ge-ediscovery"
    )
    GCS_BUCKET = f"gs://{GCS_BUCKET_NAME}" if not GCS_BUCKET_NAME.startswith("gs://") else GCS_BUCKET_NAME
    BQ_DATASET = (args.bq_dataset or "ge_ediscovery").strip()

    ensure_gcs_bucket()
    ensure_bq_dataset_and_table()
    ensure_logging_sink()
    ensure_bq_views_and_functions()
    print("\nAll Cloud Storage, BigQuery, and Cloud Logging sink resources are ready!")
