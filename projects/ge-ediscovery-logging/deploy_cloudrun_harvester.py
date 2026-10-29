#!/usr/bin/env python3
"""
deploy_cloudrun_harvester.py — Deploys the Real-Time Event-Driven GE eDiscovery Harvester

Provisions:
  1. Dedicated Service Account (ge-ediscovery-harvester-sa) with least-privilege IAM:
     - roles/cloudkms.signerVerifier on CryptoKey ediscovery-archiver-jwt-key
     - roles/storage.objectCreator + roles/storage.objectViewer on gs://<GCP_PROJECT_ID>-ge-ediscovery
     - roles/bigquery.dataEditor + roles/bigquery.jobUser + roles/logging.viewer
     - roles/serviceusage.serviceUsageConsumer (for X-Goog-User-Project quota headers)
  2. Cloud Run Service (ge-ediscovery-harvester) with --no-allow-unauthenticated
  3. Pub/Sub Topic (ge-ediscovery-events)
  4. Cloud Logging -> Pub/Sub Sink (ge-ediscovery-pubsub-sink) with loop-safe filter
  5. Authenticated Pub/Sub Push Subscription (ge-ediscovery-push-sub) -> Cloud Run /pubsub

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  export WORKFORCE_POOL_ID="<YOUR_WORKFORCE_POOL_ID>"
  python3 deploy_cloudrun_harvester.py
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()
WORKFORCE_POOL_ID = os.environ.get("WORKFORCE_POOL_ID", "").strip()
REGION = os.environ.get("CLOUD_RUN_REGION", "us-central1").strip()
SERVICE_NAME = os.environ.get("CLOUD_RUN_SERVICE", "ge-ediscovery-harvester").strip()
SA_NAME = "ge-ediscovery-harvester-sa"

KMS_LOCATION = os.environ.get("KMS_LOCATION", "us-central1").strip()
KMS_KEYRING = os.environ.get("KMS_KEYRING", "ge-ediscovery-kr").strip()
KMS_KEY = os.environ.get("KMS_KEY", "ediscovery-archiver-jwt-key").strip()

BQ_DATASET = os.environ.get("BQ_DATASET", "ge_ediscovery").strip()
BQ_TABLE = os.environ.get("BQ_TABLE", "conversation_turns").strip()
PROVIDER_ID = os.environ.get("ARCHIVER_PROVIDER_ID", "ediscovery-archiver").strip()

PUBSUB_TOPIC = "ge-ediscovery-events"
PUBSUB_SUB = "ge-ediscovery-push-sub"
PUBSUB_DLQ_TOPIC = "ge-ediscovery-dlq"
PUBSUB_DLQ_SUB = "ge-ediscovery-dlq-hold"
LOGGING_SINK = "ge-ediscovery-pubsub-sink"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def run_cmd(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check, capture_output=True, text=True)


def main() -> None:
    global PROJECT_ID, WORKFORCE_POOL_ID, REGION, SERVICE_NAME
    parser = argparse.ArgumentParser(
        description="Deploy the Real-Time Event-Driven GE eDiscovery Harvester to Cloud Run and wire up Pub/Sub push."
    )
    parser.add_argument(
        "--project-id",
        "--project",
        dest="project_id",
        default=PROJECT_ID,
        help="Google Cloud Project ID (or set GCP_PROJECT_ID)",
    )
    parser.add_argument(
        "--workforce-pool-id",
        dest="workforce_pool_id",
        default=WORKFORCE_POOL_ID,
        help="Workforce Identity Pool ID (or set WORKFORCE_POOL_ID)",
    )
    parser.add_argument(
        "--region",
        dest="region",
        default=REGION,
        help="Cloud Run region (default: us-central1)",
    )
    parser.add_argument(
        "--service-name",
        dest="service_name",
        default=SERVICE_NAME,
        help="Cloud Run service name (default: ge-ediscovery-harvester)",
    )
    parser.add_argument(
        "--ms-client-secret-name",
        dest="ms_client_secret_name",
        default=os.environ.get("MS_CLIENT_SECRET_SECRET_NAME", ""),
        help="Optional Secret Manager secret name holding MS_CLIENT_SECRET for Purview eDiscovery forwarding",
    )
    args = parser.parse_args()
    PROJECT_ID = (args.project_id or "").strip()
    WORKFORCE_POOL_ID = (args.workforce_pool_id or "").strip()
    REGION = (args.region or "us-central1").strip()
    SERVICE_NAME = (args.service_name or "ge-ediscovery-harvester").strip()

    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please pass --project-id or set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")
    if not WORKFORCE_POOL_ID or WORKFORCE_POOL_ID.startswith("<"):
        sys.exit("ERROR: Please pass --workforce-pool-id or set WORKFORCE_POOL_ID (e.g., export WORKFORCE_POOL_ID='your-workforce-pool-id').")

    sa_email = f"{SA_NAME}@{PROJECT_ID}.iam.gserviceaccount.com"
    gcs_bucket_name = os.environ.get("GCS_BUCKET_NAME") or f"{PROJECT_ID}-ge-ediscovery"

    print(f"=== [1/6] Enabling Cloud Run, Pub/Sub, Cloud Build & KMS APIs in {PROJECT_ID} ===")
    run_cmd([
        "gcloud", "services", "enable",
        "run.googleapis.com",
        "pubsub.googleapis.com",
        "cloudbuild.googleapis.com",
        "artifactregistry.googleapis.com",
        "cloudkms.googleapis.com",
        f"--project={PROJECT_ID}",
    ])

    proj_num = run_cmd([
        "gcloud", "projects", "describe", PROJECT_ID, "--format=value(projectNumber)"
    ]).stdout.strip()

    print(f"\n=== [2/6] Provisioning Least-Privilege Service Account {sa_email} ===")
    sa_desc = run_cmd(
        ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={PROJECT_ID}"],
        check=False,
    )
    if sa_desc.returncode != 0:
        run_cmd([
            "gcloud", "iam", "service-accounts", "create", SA_NAME,
            "--display-name=GE eDiscovery Real-Time Harvester SA",
            f"--project={PROJECT_ID}",
        ])

    run_cmd([
        "gcloud", "kms", "keys", "add-iam-policy-binding", KMS_KEY,
        f"--keyring={KMS_KEYRING}",
        f"--location={KMS_LOCATION}",
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/cloudkms.signerVerifier",
        f"--project={PROJECT_ID}",
    ])

    # Anti-spoliation least privilege: grant objectCreator + objectViewer (never objectAdmin / storage.objects.delete)
    for bucket_role in ("roles/storage.objectCreator", "roles/storage.objectViewer"):
        run_cmd([
            "gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{gcs_bucket_name}",
            f"--member=serviceAccount:{sa_email}",
            f"--role={bucket_role}",
            f"--project={PROJECT_ID}",
        ])

    # Scope BigQuery write access strictly to BQ_DATASET rather than project-wide roles/bigquery.dataEditor
    ds_show = run_cmd(
        ["bq", f"--project_id={PROJECT_ID}", "show", "--format=prettyjson", f"{PROJECT_ID}:{BQ_DATASET}"],
        check=False,
    )
    if ds_show.returncode == 0 and ds_show.stdout.strip():
        ds_json = json.loads(ds_show.stdout)
        access_list = ds_json.get("access", [])
        if not any(a.get("userByEmail") == sa_email and a.get("role") == "WRITER" for a in access_list):
            access_list.append({"role": "WRITER", "userByEmail": sa_email})
            ds_json["access"] = access_list
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
                tmp_ds_path = tf.name
                json.dump(ds_json, tf)
            try:
                run_cmd(["bq", f"--project_id={PROJECT_ID}", "update", "--source", tmp_ds_path, f"{PROJECT_ID}:{BQ_DATASET}"])
            finally:
                if os.path.exists(tmp_ds_path):
                    os.remove(tmp_ds_path)

    for role in [
        "roles/bigquery.jobUser",
        "roles/logging.viewer",
        "roles/discoveryengine.viewer",
        "roles/serviceusage.serviceUsageConsumer",
    ]:
        run_cmd([
            "gcloud", "projects", "add-iam-policy-binding", PROJECT_ID,
            f"--member=serviceAccount:{sa_email}",
            f"--role={role}",
            "--condition=None",
            "--quiet",
        ])

    ms_secret_name = (args.ms_client_secret_name or "").strip()
    if ms_secret_name:
        run_cmd([
            "gcloud", "secrets", "add-iam-policy-binding", ms_secret_name,
            f"--member=serviceAccount:{sa_email}",
            "--role=roles/secretmanager.secretAccessor",
            f"--project={PROJECT_ID}",
        ])

    print(f"\n=== [3/6] Deploying Cloud Run Service '{SERVICE_NAME}' ({REGION}) ===")
    env_pairs = [
        f"GCP_PROJECT_ID={PROJECT_ID}",
        f"GCP_PROJECT_NUMBER={proj_num}",
        f"WORKFORCE_POOL_ID={WORKFORCE_POOL_ID}",
        f"ARCHIVER_PROVIDER_ID={PROVIDER_ID}",
        f"KMS_LOCATION={KMS_LOCATION}",
        f"KMS_KEYRING={KMS_KEYRING}",
        f"KMS_KEY={KMS_KEY}",
        f"GCS_BUCKET_NAME={gcs_bucket_name}",
        f"BQ_DATASET={BQ_DATASET}",
        f"BQ_TABLE={BQ_TABLE}",
        f"EXPECTED_INVOKER_SA={sa_email}",
    ]
    for passthrough_var in (
        "MS_TENANT_ID",
        "MS_CLIENT_ID",
        "PURVIEW_COMPLIANCE_JOURNAL_UPN",
        "PURVIEW_TARGET_CUSTODIAN_UPN",
        "PURVIEW_FALLBACK_UPN",
        "PURVIEW_EDISCOVERY_FOLDER",
        "PURVIEW_FAIL_CLOSED",
        "ARCHIVER_ALLOWED_SUBJECT_DOMAINS",
        "ARCHIVER_DENIED_SUBJECTS",
    ):
        val = os.environ.get(passthrough_var, "").strip()
        if val:
            env_pairs.append(f"{passthrough_var}={val}")
    env_vars = ",".join(env_pairs)

    deploy_cmd = [
        "gcloud", "run", "deploy", SERVICE_NAME,
        f"--source={BASE_DIR}",
        f"--region={REGION}",
        f"--service-account={sa_email}",
        "--no-allow-unauthenticated",
        "--concurrency=10",
        "--max-instances=5",
        "--memory=1Gi",
        "--timeout=300",
        f"--set-env-vars={env_vars}",
        f"--project={PROJECT_ID}",
        "--quiet",
    ]
    if ms_secret_name:
        deploy_cmd.append(f"--set-secrets=MS_CLIENT_SECRET={ms_secret_name}:latest")
    run_cmd(deploy_cmd)

    service_url = run_cmd([
        "gcloud", "run", "services", "describe", SERVICE_NAME,
        f"--region={REGION}",
        f"--project={PROJECT_ID}",
        "--format=value(status.url)",
    ]).stdout.strip()
    print(f"  [+] Cloud Run Service URL: {service_url}")

    # Pin EXPECTED_OIDC_AUDIENCE to the deployed /pubsub push endpoint URL
    run_cmd([
        "gcloud", "run", "services", "update", SERVICE_NAME,
        f"--region={REGION}",
        f"--update-env-vars=EXPECTED_OIDC_AUDIENCE={service_url}/pubsub",
        f"--project={PROJECT_ID}",
        "--quiet",
    ])

    run_cmd([
        "gcloud", "run", "services", "add-iam-policy-binding", SERVICE_NAME,
        f"--region={REGION}",
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/run.invoker",
        f"--project={PROJECT_ID}",
    ])

    pubsub_agent = f"service-{proj_num}@gcp-sa-pubsub.iam.gserviceaccount.com"
    run_cmd([
        "gcloud", "iam", "service-accounts", "add-iam-policy-binding", sa_email,
        f"--member=serviceAccount:{pubsub_agent}",
        "--role=roles/iam.serviceAccountTokenCreator",
        f"--project={PROJECT_ID}",
    ], check=False)

    print(f"\n=== [4/6] Creating Pub/Sub Topic '{PUBSUB_TOPIC}' & Dead-Letter Queue '{PUBSUB_DLQ_TOPIC}' ===")
    for tname in (PUBSUB_TOPIC, PUBSUB_DLQ_TOPIC):
        topic_desc = run_cmd(
            ["gcloud", "pubsub", "topics", "describe", tname, f"--project={PROJECT_ID}"],
            check=False,
        )
        if topic_desc.returncode != 0:
            run_cmd(["gcloud", "pubsub", "topics", "create", tname, f"--project={PROJECT_ID}"])

    dlq_sub_desc = run_cmd(
        ["gcloud", "pubsub", "subscriptions", "describe", PUBSUB_DLQ_SUB, f"--project={PROJECT_ID}"],
        check=False,
    )
    if dlq_sub_desc.returncode != 0:
        run_cmd([
            "gcloud", "pubsub", "subscriptions", "create", PUBSUB_DLQ_SUB,
            f"--topic={PUBSUB_DLQ_TOPIC}",
            "--ack-deadline=60",
            "--message-retention-duration=7d",
            "--expiration-period=never",
            f"--project={PROJECT_ID}",
        ])

    run_cmd([
        "gcloud", "pubsub", "topics", "add-iam-policy-binding", PUBSUB_DLQ_TOPIC,
        f"--member=serviceAccount:{pubsub_agent}",
        "--role=roles/pubsub.publisher",
        f"--project={PROJECT_ID}",
    ])

    print(f"\n=== [5/6] Configuring Cloud Logging -> Pub/Sub Sink '{LOGGING_SINK}' ===")
    sink_filter = (
        f'resource.type="consumed_api" AND '
        f'NOT jsonPayload.userIamPrincipal:"gserviceaccount.com" AND ('
        f'(logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" '
        f'AND (jsonPayload.logMetadata.methodName="StreamAssist" '
        f'OR jsonPayload.logMetadata.methodName="Assist" '
        f'OR jsonPayload.logMetadata.methodName="UploadSessionFile" '
        f'OR jsonPayload.logMetadata.methodName="AddContextFile")) '
        f'OR '
        f'(logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity" '
        f'AND (jsonPayload.logMetadata.methodName="GenerateFreeFormStreamed" '
        f'OR jsonPayload.logMetadata.methodName="BatchCreateSources" '
        f'OR jsonPayload.logMetadata.methodName="CreateNotebook" '
        f'OR jsonPayload.logMetadata.methodName="CreateArtifact" '
        f'OR jsonPayload.logMetadata.methodName="CreateAudioOverview" '
        f'OR jsonPayload.logMetadata.methodName="CreateNote" '
        f'OR jsonPayload.logMetadata.methodName="MutateNote")))'
    )
    topic_dest = f"pubsub.googleapis.com/projects/{PROJECT_ID}/topics/{PUBSUB_TOPIC}"
    sink_desc = run_cmd(
        ["gcloud", "logging", "sinks", "describe", LOGGING_SINK, f"--project={PROJECT_ID}", "--format=json"],
        check=False,
    )
    if sink_desc.returncode == 0:
        run_cmd([
            "gcloud", "logging", "sinks", "update", LOGGING_SINK, topic_dest,
            f"--log-filter={sink_filter}",
            f"--project={PROJECT_ID}",
        ])
    else:
        run_cmd([
            "gcloud", "logging", "sinks", "create", LOGGING_SINK, topic_dest,
            f"--log-filter={sink_filter}",
            f"--project={PROJECT_ID}",
        ])

    sink_info = json.loads(
        run_cmd(["gcloud", "logging", "sinks", "describe", LOGGING_SINK, f"--project={PROJECT_ID}", "--format=json"]).stdout
    )
    writer_identity = sink_info["writerIdentity"]
    print(f"  [+] Granting roles/pubsub.publisher on '{PUBSUB_TOPIC}' to sink writer '{writer_identity}'...")
    run_cmd([
        "gcloud", "pubsub", "topics", "add-iam-policy-binding", PUBSUB_TOPIC,
        f"--member={writer_identity}",
        "--role=roles/pubsub.publisher",
        f"--project={PROJECT_ID}",
    ])

    print(f"\n=== [6/6] Configuring Authenticated Pub/Sub Push Subscription '{PUBSUB_SUB}' ===")
    push_endpoint = f"{service_url}/pubsub"
    sub_desc = run_cmd(
        ["gcloud", "pubsub", "subscriptions", "describe", PUBSUB_SUB, f"--project={PROJECT_ID}"],
        check=False,
    )
    if sub_desc.returncode == 0:
        run_cmd([
            "gcloud", "pubsub", "subscriptions", "update", PUBSUB_SUB,
            f"--push-endpoint={push_endpoint}",
            f"--push-auth-service-account={sa_email}",
            "--ack-deadline=120",
            f"--dead-letter-topic={PUBSUB_DLQ_TOPIC}",
            "--max-delivery-attempts=10",
            f"--project={PROJECT_ID}",
        ])
    else:
        run_cmd([
            "gcloud", "pubsub", "subscriptions", "create", PUBSUB_SUB,
            f"--topic={PUBSUB_TOPIC}",
            f"--push-endpoint={push_endpoint}",
            f"--push-auth-service-account={sa_email}",
            "--ack-deadline=120",
            "--min-retry-delay=10s",
            "--max-retry-delay=600s",
            f"--dead-letter-topic={PUBSUB_DLQ_TOPIC}",
            "--max-delivery-attempts=10",
            f"--project={PROJECT_ID}",
        ])

    run_cmd([
        "gcloud", "pubsub", "subscriptions", "add-iam-policy-binding", PUBSUB_SUB,
        f"--member=serviceAccount:{pubsub_agent}",
        "--role=roles/pubsub.subscriber",
        f"--project={PROJECT_ID}",
    ])

    print("\n======================================================================")
    print("Real-Time Event-Driven GE eDiscovery Pipeline is LIVE!")
    print(f"  Cloud KMS Key        : projects/{PROJECT_ID}/locations/{KMS_LOCATION}/keyRings/{KMS_KEYRING}/cryptoKeys/{KMS_KEY}")
    print(f"  Cloud Run Service    : {service_url}")
    print(f"  Pub/Sub Push Endpoint: {push_endpoint}")
    print(f"  Dead-Letter Queue    : {PUBSUB_DLQ_TOPIC} (hold sub: {PUBSUB_DLQ_SUB})")
    print(f"  Logging Sink         : {LOGGING_SINK} -> {PUBSUB_TOPIC}")
    print("======================================================================")


if __name__ == "__main__":
    main()
