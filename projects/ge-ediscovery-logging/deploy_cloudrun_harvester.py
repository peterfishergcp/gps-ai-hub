#!/usr/bin/env python3
"""
deploy_cloudrun_harvester.py — Deploys the Real-Time Event-Driven GE eDiscovery Harvester

Provisions:
  1. Dedicated Service Account (ge-ediscovery-harvester-sa) with least-privilege IAM:
     - roles/cloudkms.signerVerifier on CryptoKey ediscovery-archiver-jwt-key
     - roles/storage.objectAdmin on gs://<GCP_PROJECT_ID>-ge-ediscovery
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

import json
import os
import subprocess
import sys

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
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")
    if not WORKFORCE_POOL_ID or WORKFORCE_POOL_ID.startswith("<"):
        sys.exit("ERROR: Please set WORKFORCE_POOL_ID (e.g., export WORKFORCE_POOL_ID='your-workforce-pool-id').")

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

    run_cmd([
        "gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{gcs_bucket_name}",
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/storage.objectAdmin",
        f"--project={PROJECT_ID}",
    ])

    for role in [
        "roles/bigquery.dataEditor",
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

    print(f"\n=== [3/6] Deploying Cloud Run Service '{SERVICE_NAME}' ({REGION}) ===")
    env_vars = (
        f"GCP_PROJECT_ID={PROJECT_ID},"
        f"WORKFORCE_POOL_ID={WORKFORCE_POOL_ID},"
        f"ARCHIVER_PROVIDER_ID={PROVIDER_ID},"
        f"KMS_LOCATION={KMS_LOCATION},"
        f"KMS_KEYRING={KMS_KEYRING},"
        f"KMS_KEY={KMS_KEY},"
        f"GCS_BUCKET_NAME={gcs_bucket_name},"
        f"BQ_DATASET={BQ_DATASET},"
        f"BQ_TABLE={BQ_TABLE}"
    )
    run_cmd([
        "gcloud", "run", "deploy", SERVICE_NAME,
        f"--source={BASE_DIR}",
        f"--region={REGION}",
        f"--service-account={sa_email}",
        "--no-allow-unauthenticated",
        "--concurrency=10",
        "--max-instances=5",
        "--memory=512Mi",
        "--timeout=300",
        f"--set-env-vars={env_vars}",
        f"--project={PROJECT_ID}",
        "--quiet",
    ])

    service_url = run_cmd([
        "gcloud", "run", "services", "describe", SERVICE_NAME,
        f"--region={REGION}",
        f"--project={PROJECT_ID}",
        "--format=value(status.url)",
    ]).stdout.strip()
    print(f"  [+] Cloud Run Service URL: {service_url}")

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
        f'(logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fgemini_enterprise_user_activity" '
        f'AND (jsonPayload.logMetadata.methodName="StreamAssist" '
        f'OR jsonPayload.logMetadata.methodName="UploadSessionFile" '
        f'OR jsonPayload.logMetadata.methodName="AddContextFile")) '
        f'OR '
        f'(logName="projects/{PROJECT_ID}/logs/discoveryengine.googleapis.com%2Fnotebooklm_enterprise_user_activity" '
        f'AND (jsonPayload.logMetadata.methodName="GenerateFreeFormStreamed" '
        f'OR jsonPayload.logMetadata.methodName="BatchCreateSources" '
        f'OR jsonPayload.logMetadata.methodName="CreateNotebook"))'
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
