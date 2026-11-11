#!/usr/bin/env python3
"""
setup_bigquery_token_tracking.py — Lightweight BigQuery & Cloud Trace Token Tracking Provisioner
for Gemini Enterprise and NotebookLM Enterprise.

Provisions:
  1. BigQuery Analytics Dataset (`ge_token_analytics` by default, configurable via `BQ_DATASET`).
  2. Partitioned Cloud Logging -> BigQuery Sink (`ge-token-tracking-bq-sink`) capturing
     `discoveryengine.googleapis.com/gemini_enterprise_user_activity` and
     `discoveryengine.googleapis.com/notebooklm_enterprise_user_activity`.
  3. Cloud Logging `_Trace` BigQuery Linked Dataset (`trace_link` -> `trace_link._AllSpans`)
     exposing OpenTelemetry `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`,
     `gen_ai.request.model`, and `gen_ai.conversation.id` spans in real time.
  4. Three Pre-Built BigQuery Token & Usage Views:
     - `v_ge_activity_logs` (and compatibility alias `ge_logs`)
     - `v_gemini_token_usage_by_user` (plus optional `agent_analytics.gemini_token_usage_by_user` view)
     - `v_token_usage_summary_by_principal`

Zero KMS keys, zero Cloud Storage buckets, zero WIF impersonation, and zero custom IAM roles required.

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  python3 setup_bigquery_token_tracking.py
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

DEFAULT_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", os.environ.get("PROJECT_ID", "")).strip()
DEFAULT_BQ_DATASET = os.environ.get("BQ_DATASET", "ge_token_analytics").strip()
DEFAULT_BQ_LOCATION = os.environ.get("BQ_LOCATION", "US").strip()
DEFAULT_TRACE_DATASET = os.environ.get("TRACE_LINK_DATASET", "trace_link").strip()
DEFAULT_SINK_NAME = os.environ.get("LOGGING_SINK_NAME", "ge-token-tracking-bq-sink").strip()

PROJECT_ID_RE = re.compile(r"^[a-z][a-z0-9\-]{4,28}[a-z0-9]$")
DATASET_ID_RE = re.compile(r"^[a-zA-Z0-9_]{1,1024}$")
SINK_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-\.]{1,100}$")


def ensure_bq_dataset(project_id: str, dataset_id: str, location: str) -> None:
    print(f"[1/4] Ensuring BigQuery dataset {project_id}:{dataset_id} (location={location})...")
    ds_check = subprocess.run(
        ["bq", f"--project_id={project_id}", "show", f"{project_id}:{dataset_id}"],
        capture_output=True,
        text=True,
    )
    if ds_check.returncode != 0:
        subprocess.run(
            [
                "bq",
                f"--location={location}",
                "mk",
                "--dataset",
                "--description=Gemini Enterprise Token Consumption and WIF Usage Telemetry Dataset",
                f"{project_id}:{dataset_id}",
            ],
            check=True,
        )
        print(f"      Created dataset {project_id}:{dataset_id}.")
    else:
        print(f"      Dataset {project_id}:{dataset_id} already exists.")


def ensure_logging_sink(project_id: str, dataset_id: str, sink_name: str) -> None:
    print(f"[2/4] Ensuring Cloud Logging sink '{sink_name}' -> BigQuery dataset '{dataset_id}'...")
    destination = f"bigquery.googleapis.com/projects/{project_id}/datasets/{dataset_id}"
    log_filter = (
        f'resource.type="consumed_api" AND ('
        f'logName="projects/{project_id}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" '
        f'OR logName="projects/{project_id}/logs/discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity")'
    )

    sink_check = subprocess.run(
        ["gcloud", "logging", "sinks", "describe", sink_name, f"--project={project_id}", "--format=json"],
        capture_output=True,
        text=True,
    )
    if sink_check.returncode != 0:
        subprocess.run(
            [
                "gcloud",
                "logging",
                "sinks",
                "create",
                sink_name,
                destination,
                f"--log-filter={log_filter}",
                "--use-partitioned-tables",
                f"--project={project_id}",
            ],
            check=True,
        )
    else:
        subprocess.run(
            [
                "gcloud",
                "logging",
                "sinks",
                "update",
                sink_name,
                destination,
                f"--log-filter={log_filter}",
                f"--project={project_id}",
            ],
            check=True,
        )

    sink_info = json.loads(
        subprocess.check_output(
            ["gcloud", "logging", "sinks", "describe", sink_name, f"--project={project_id}", "--format=json"]
        ).decode("utf-8")
    )
    writer_identity = sink_info["writerIdentity"]
    print(f"      Sink writerIdentity: {writer_identity}")

    ds_json = json.loads(
        subprocess.check_output(
            ["bq", f"--project_id={project_id}", "show", "--format=prettyjson", f"{project_id}:{dataset_id}"]
        ).decode("utf-8")
    )
    sa_email = writer_identity.split(":", 1)[1] if ":" in writer_identity else writer_identity
    access_list = ds_json.get("access", [])
    if not any(a.get("userByEmail") == sa_email and a.get("role") == "WRITER" for a in access_list):
        access_list.append({"role": "WRITER", "userByEmail": sa_email})
        ds_json["access"] = access_list
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tmp_f:
            json.dump(ds_json, tmp_f)
            tmp_ds_path = tmp_f.name
        try:
            subprocess.run(
                ["bq", f"--project_id={project_id}", "update", "--source", tmp_ds_path, f"{project_id}:{dataset_id}"],
                check=True,
            )
        finally:
            if os.path.exists(tmp_ds_path):
                os.remove(tmp_ds_path)
        print(f"      Granted WRITER (roles/bigquery.dataEditor) on {dataset_id} to {sa_email}.")
    else:
        print(f"      {sa_email} already has WRITER access on {dataset_id}.")


def ensure_trace_link(project_id: str, trace_dataset: str) -> None:
    print(f"[3/4] Ensuring Cloud Logging link '{trace_dataset}' to _Trace bucket...")
    check = subprocess.run(
        [
            "gcloud",
            "logging",
            "links",
            "describe",
            trace_dataset,
            "--bucket=_Trace",
            "--location=global",
            f"--project={project_id}",
        ],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        res = subprocess.run(
            [
                "gcloud",
                "logging",
                "links",
                "create",
                trace_dataset,
                "--bucket=_Trace",
                "--location=global",
                f"--project={project_id}",
            ],
            capture_output=True,
            text=True,
        )
        if res.returncode == 0:
            print(f"      Created linked BigQuery dataset '{project_id}.{trace_dataset}' (_AllSpans).")
        else:
            print(f"      Note: Link creation returned ({res.returncode}): {res.stderr.strip()[:200]}")
    else:
        print(f"      Linked BigQuery dataset '{project_id}.{trace_dataset}' already exists.")


def ensure_seed_activity_table(project_id: str, dataset_id: str) -> None:
    """
    Ensures the destination partitioned table `discoveryengine_googleapis_com_gemini_enterprise_user_activity`
    exists even before the first user query is logged, so the SQL views compile cleanly immediately on fresh projects.
    """
    table_ref = f"{project_id}:{dataset_id}.discoveryengine_googleapis_com_gemini_enterprise_user_activity"
    check = subprocess.run(
        ["bq", f"--project_id={project_id}", "show", table_ref],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        print("      Creating initial placeholder schema for discoveryengine_googleapis_com_gemini_enterprise_user_activity...")
        seed_ddl = f"""
        CREATE TABLE IF NOT EXISTS `{project_id}.{dataset_id}.discoveryengine_googleapis_com_gemini_enterprise_user_activity` (
          timestamp TIMESTAMP,
          insertId STRING,
          trace STRING,
          logName STRING,
          jsonPayload JSON
        )
        PARTITION BY DATE(timestamp);
        """
        subprocess.run(
            ["bq", f"--project_id={project_id}", "query", "--use_legacy_sql=false", seed_ddl],
            check=True,
        )


def ensure_token_views(project_id: str, dataset_id: str, trace_dataset: str, create_legacy_alias: bool) -> None:
    print(f"[4/4] Creating BigQuery token tracking & WIF attribution views in {project_id}.{dataset_id}...")
    ensure_seed_activity_table(project_id, dataset_id)

    ddl = f"""
    -- 1. Normalized Gemini Enterprise Activity Logs View
    CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.v_ge_activity_logs` AS
    WITH base_logs AS (
      SELECT
        timestamp,
        trace,
        REGEXP_EXTRACT(trace, r'([^/]+)$') AS trace_id,
        TO_JSON_STRING(jsonPayload) AS json_str
      FROM `{project_id}.{dataset_id}.discoveryengine_googleapis_com_gemini_enterprise_user_activity`
    ),
    agent_mappings AS (
      SELECT DISTINCT
        COALESCE(
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.parent'), r'/engines/([^/]+)')
        ) AS engine_id,
        COALESCE(
          JSON_VALUE(json_str, '$.request.agent.displayname'),
          JSON_VALUE(json_str, '$.request.agent.displayName'),
          JSON_VALUE(json_str, '$.response.displayname'),
          JSON_VALUE(json_str, '$.response.displayName')
        ) AS agent_display_name
      FROM base_logs
      WHERE COALESCE(
        JSON_VALUE(json_str, '$.logmetadata.methodname'),
        JSON_VALUE(json_str, '$.logMetadata.methodName')
      ) = 'CreateAgent'
    ),
    flattened AS (
      SELECT
        timestamp,
        trace_id,
        COALESCE(
          JSON_VALUE(json_str, '$.logmetadata.methodname'),
          JSON_VALUE(json_str, '$.logMetadata.methodName')
        ) AS methodName,
        COALESCE(
          JSON_VALUE(json_str, '$.useriamprincipal'),
          JSON_VALUE(json_str, '$.userIamPrincipal')
        ) AS userIamPrincipal,
        COALESCE(
          JSON_VALUE(json_str, '$.usertextquery'),
          JSON_VALUE(json_str, '$.userTextQuery'),
          JSON_VALUE(json_str, '$.request.query.text'),
          JSON_VALUE(json_str, '$.request.query.parts[0].text'),
          JSON_VALUE(json_str, '$.request.query')
        ) AS userQuery,
        COALESCE(
          JSON_VALUE(json_str, '$.servicetextreply'),
          JSON_VALUE(json_str, '$.serviceTextReply')
        ) AS serviceTextReply,
        COALESCE(
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.answer.name'), r'/sessions/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.session'), r'/sessions/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.name'), r'/sessions/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.logmetadata.name'), r'/sessions/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.logMetadata.name'), r'/sessions/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.userEvent.feedback.conversationInfo.session'), r'/sessions/([^/]+)')
        ) AS session_id,
        REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.answer.name'), r'/assistAnswers/([^/]+)') AS answer_id,
        COALESCE(
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.answer.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.session'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.request.parent'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.logmetadata.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.logMetadata.name'), r'/engines/([^/]+)'),
          REGEXP_EXTRACT(JSON_VALUE(json_str, '$.response.name'), r'/engines/([^/]+)')
        ) AS engine_id
      FROM base_logs
    )
    SELECT
      f.*,
      COALESCE(m.agent_display_name, f.engine_id) AS agent_display_name
    FROM flattened f
    LEFT JOIN agent_mappings m
      ON f.engine_id = m.engine_id;

    -- Compatibility alias `ge_logs`
    CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.ge_logs` AS
    SELECT * FROM `{project_id}.{dataset_id}.v_ge_activity_logs`;

    -- 2. Unified Token Usage by WIF Principal View (Joins Cloud Trace _AllSpans with Activity Logs)
    CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.v_gemini_token_usage_by_user` AS
    WITH trace_owners AS (
      SELECT
        trace_id,
        ANY_VALUE(userIamPrincipal) AS user_principal,
        ANY_VALUE(engine_id) AS engine_id,
        ANY_VALUE(session_id) AS session_id,
        ANY_VALUE(userQuery) AS query_text
      FROM `{project_id}.{dataset_id}.v_ge_activity_logs`
      WHERE trace_id IS NOT NULL
        AND userIamPrincipal IS NOT NULL
        AND userIamPrincipal NOT IN ('', '<elided>')
      GROUP BY trace_id
    ),
    session_owners AS (
      SELECT
        session_id,
        ARRAY_AGG(userIamPrincipal IGNORE NULLS ORDER BY timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS user_principal,
        ANY_VALUE(engine_id) AS engine_id,
        ARRAY_AGG(userQuery IGNORE NULLS ORDER BY timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS query_text
      FROM `{project_id}.{dataset_id}.v_ge_activity_logs`
      WHERE session_id IS NOT NULL
        AND userIamPrincipal IS NOT NULL
        AND userIamPrincipal NOT IN ('', '<elided>')
      GROUP BY session_id
    ),
    engine_owners AS (
      SELECT
        engine_id,
        ARRAY_AGG(userIamPrincipal IGNORE NULLS ORDER BY timestamp DESC LIMIT 1)[SAFE_OFFSET(0)] AS default_engine_principal
      FROM `{project_id}.{dataset_id}.v_ge_activity_logs`
      WHERE engine_id IS NOT NULL
        AND userIamPrincipal IS NOT NULL
        AND userIamPrincipal NOT IN ('', '<elided>')
      GROUP BY engine_id
    ),
    spans AS (
      SELECT
        trace_id,
        start_time,
        end_time,
        CAST(TIMESTAMP_DIFF(end_time, start_time, MILLISECOND) AS INT64) AS latency_ms,
        STRING(attributes['gen_ai.conversation.id']) AS conversation_id,
        REGEXP_EXTRACT(STRING(attributes['gen_ai.conversation.id']), r'/sessions/([^/]+)$') AS session_id,
        REGEXP_EXTRACT(STRING(attributes['gen_ai.conversation.id']), r'/engines/([^/]+)/sessions/') AS engine_id,
        STRING(attributes['gen_ai.request.model']) AS model,
        CAST(STRING(attributes['gen_ai.usage.input_tokens']) AS INT64) AS input_tokens,
        CAST(STRING(attributes['gen_ai.usage.output_tokens']) AS INT64) AS output_tokens
      FROM `{project_id}.{trace_dataset}._AllSpans`
      WHERE name LIKE 'generate_content%'
        AND attributes['gen_ai.usage.input_tokens'] IS NOT NULL
    )
    SELECT
      s.start_time,
      s.end_time,
      s.latency_ms,
      s.trace_id,
      COALESCE(
        tro.user_principal,
        so.user_principal,
        eo.default_engine_principal,
        'unattributed-wif-principal'
      ) AS user_principal,
      COALESCE(tro.query_text, so.query_text) AS query_text,
      s.conversation_id,
      COALESCE(s.session_id, tro.session_id, so.session_id) AS session_id,
      COALESCE(s.engine_id, tro.engine_id, so.engine_id, 'default-ge-engine') AS engine_id,
      s.model,
      s.input_tokens,
      s.output_tokens,
      COALESCE(s.input_tokens, 0) + COALESCE(s.output_tokens, 0) AS total_tokens,
      CASE
        WHEN tro.user_principal IS NOT NULL THEN 'EXACT_TRACE_MATCH'
        WHEN so.user_principal IS NOT NULL THEN 'EXACT_WIF_SESSION'
        WHEN eo.default_engine_principal IS NOT NULL THEN 'ENGINE_WIF_PRINCIPAL'
        ELSE 'UNATTRIBUTED_SPAN'
      END AS attribution_method
    FROM spans s
    LEFT JOIN trace_owners tro
      ON s.trace_id = tro.trace_id
    LEFT JOIN session_owners so
      ON s.session_id = so.session_id
    LEFT JOIN engine_owners eo
      ON s.engine_id = eo.engine_id;

    -- 3. Aggregated Token Summary by Workforce Identity (WIF) Principal View
    CREATE OR REPLACE VIEW `{project_id}.{dataset_id}.v_token_usage_summary_by_principal` AS
    SELECT
      user_principal,
      COUNT(*) AS llm_calls,
      COUNT(DISTINCT session_id) AS total_sessions,
      COUNT(DISTINCT engine_id) AS engines_used,
      STRING_AGG(DISTINCT engine_id, ', ' LIMIT 8) AS engine_list,
      STRING_AGG(DISTINCT model, ', ' LIMIT 6) AS models_used,
      SUM(COALESCE(input_tokens, 0)) AS input_tokens,
      SUM(COALESCE(output_tokens, 0)) AS output_tokens,
      SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)) AS total_tokens,
      CAST(ROUND(SAFE_DIVIDE(SUM(COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)), GREATEST(COUNT(*), 1))) AS INT64) AS avg_tokens_per_call
    FROM `{project_id}.{dataset_id}.v_gemini_token_usage_by_user`
    GROUP BY user_principal
    ORDER BY total_tokens DESC;
    """
    subprocess.run(
        ["bq", f"--project_id={project_id}", "query", "--use_legacy_sql=false", ddl],
        check=True,
    )
    print(f"      Created views: v_ge_activity_logs, ge_logs, v_gemini_token_usage_by_user, v_token_usage_summary_by_principal.")

    if create_legacy_alias:
        print(f"      Also creating compatibility view `{project_id}.agent_analytics.gemini_token_usage_by_user`...")
        ensure_bq_dataset(project_id, "agent_analytics", DEFAULT_BQ_LOCATION)
        alias_ddl = f"""
        CREATE OR REPLACE VIEW `{project_id}.agent_analytics.gemini_token_usage_by_user` AS
        SELECT * FROM `{project_id}.{dataset_id}.v_gemini_token_usage_by_user`;
        """
        subprocess.run(
            ["bq", f"--project_id={project_id}", "query", "--use_legacy_sql=false", alias_ddl],
            check=True,
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision BigQuery dataset, Cloud Logging sink, Cloud Trace link, and token views for Gemini Enterprise."
    )
    parser.add_argument("--project-id", default=DEFAULT_PROJECT_ID, help="Google Cloud Project ID (or set GCP_PROJECT_ID)")
    parser.add_argument("--bq-dataset", default=DEFAULT_BQ_DATASET, help="BigQuery dataset name (default: ge_token_analytics)")
    parser.add_argument("--bq-location", default=DEFAULT_BQ_LOCATION, help="BigQuery dataset location (default: US)")
    parser.add_argument("--trace-dataset", default=DEFAULT_TRACE_DATASET, help="Cloud Trace linked dataset name (default: trace_link)")
    parser.add_argument("--sink-name", default=DEFAULT_SINK_NAME, help="Cloud Logging sink name (default: ge-token-tracking-bq-sink)")
    parser.add_argument(
        "--create-agent-analytics-alias",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Also create `agent_analytics.gemini_token_usage_by_user` compatibility view (default: True)",
    )
    args = parser.parse_args()

    project_id = (args.project_id or "").strip()
    if not project_id or not PROJECT_ID_RE.match(project_id):
        sys.exit("ERROR: Please provide a valid --project-id or set GCP_PROJECT_ID='your-project-id'.")
    if not DATASET_ID_RE.match(args.bq_dataset) or not DATASET_ID_RE.match(args.trace_dataset):
        sys.exit("ERROR: Invalid BigQuery dataset identifier.")
    if not SINK_NAME_RE.match(args.sink_name):
        sys.exit("ERROR: Invalid Cloud Logging sink name.")

    ensure_bq_dataset(project_id, args.bq_dataset, args.bq_location)
    ensure_logging_sink(project_id, args.bq_dataset, args.sink_name)
    ensure_trace_link(project_id, args.trace_dataset)
    ensure_token_views(project_id, args.bq_dataset, args.trace_dataset, args.create_agent_analytics_alias)

    print("\n======================================================================")
    print("BigQuery Token Tracking & Cloud Trace Setup Complete!")
    print("======================================================================")
    print(f"  Project ID       : {project_id}")
    print(f"  BigQuery Dataset : {project_id}.{args.bq_dataset}")
    print(f"  Trace Link       : {project_id}.{args.trace_dataset}._AllSpans")
    print(f"  Token View       : {project_id}.{args.bq_dataset}.v_gemini_token_usage_by_user")
    print(f"  Summary View     : {project_id}.{args.bq_dataset}.v_token_usage_summary_by_principal")
    print("======================================================================")


if __name__ == "__main__":
    main()
