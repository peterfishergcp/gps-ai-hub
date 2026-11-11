#!/usr/bin/env python3
"""
deploy_portal.py — Deploys the Self-Contained Compliance & eDiscovery Review Portal
(`ge-ediscovery-portal`) to Google Cloud Run.

Builds the multi-stage container image (`portal/Dockerfile` -> React 18 SPA + Python
BigQuery/GCS API server) and deploys it to Cloud Run using the least-privilege
harvester/portal service account.
"""

import argparse
import os
import subprocess
import sys

DEFAULT_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
DEFAULT_REGION = os.environ.get("CLOUD_RUN_REGION", "us-central1")
SERVICE_NAME = os.environ.get("PORTAL_SERVICE_NAME", "ge-ediscovery-portal")


def run_cmd(cmd: list[str]) -> str:
    print(f"  $ {' '.join(cmd)}")
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        return out.decode("utf-8").strip()
    except subprocess.CalledProcessError as e:
        print(e.output.decode("utf-8", errors="replace"))
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Deploy the Gemini Enterprise eDiscovery Review Portal to Cloud Run.")
    parser.add_argument("--project-id", "--project", dest="project_id", default=DEFAULT_PROJECT_ID, help="Google Cloud Project ID")
    parser.add_argument("--region", default=DEFAULT_REGION, help="Cloud Run region (default: us-central1)")
    parser.add_argument("--service-name", default=SERVICE_NAME, help="Cloud Run service name (default: ge-ediscovery-portal)")
    parser.add_argument("--bucket-name", default="", help="GCS compliance archive bucket (default: <project_id>-ge-ediscovery)")
    parser.add_argument("--bq-dataset", default="ge_ediscovery", help="BigQuery dataset name (default: ge_ediscovery)")
    parser.add_argument("--reviewer-email", default="", help="Authorized compliance reviewer email (also added to ALLOWED_REVIEWER_EMAILS)")
    parser.add_argument(
        "--allowed-reviewers",
        default=os.environ.get("ALLOWED_REVIEWER_EMAILS", ""),
        help="Comma-separated list of authorized compliance reviewer emails enforced server-side (RBAC)",
    )
    parser.add_argument(
        "--allowed-reviewer-domains",
        default=os.environ.get("ALLOWED_REVIEWER_DOMAINS", ""),
        help="Optional comma-separated list of authorized compliance reviewer email domains",
    )
    parser.add_argument(
        "--iap-audience",
        default=os.environ.get("IAP_AUDIENCE", ""),
        help="Expected Google IAP JWT audience (/projects/<PROJECT_NUMBER>/locations/<REGION>/services/<SERVICE_NAME>)",
    )
    parser.add_argument(
        "--oauth-client-id",
        default=os.environ.get("EXPECTED_OAUTH_CLIENT_ID", ""),
        help="Optional Google OIDC audience when invoking portal via Authorization: Bearer <id_token>",
    )
    parser.add_argument(
        "--iap",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable native Cloud Run Identity-Aware Proxy (IAP) for direct browser Google Sign-In (default: True; use --no-iap to disable)",
    )
    parser.add_argument(
        "--iap-accessor",
        default="",
        help="Specific compliance principal to grant roles/iap.httpsResourceAccessor (e.g. user:reviewer@agency.gov or group:ediscovery-legal@agency.gov — never whole-domain)",
    )
    args = parser.parse_args()

    if not args.project_id:
        print("Error: --project-id (or GCP_PROJECT_ID) is required.")
        sys.exit(1)

    bucket_name = args.bucket_name or f"{args.project_id}-ge-ediscovery"
    sa_name = "ge-ediscovery-portal-sa"
    sa_email = f"{sa_name}@{args.project_id}.iam.gserviceaccount.com"
    portal_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portal")

    print("======================================================================")
    print(f"Provisioning Dedicated Read-Only Service Account ({sa_email})")
    print("======================================================================")
    sa_check = subprocess.run(
        ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={args.project_id}"],
        capture_output=True,
        text=True,
    )
    if sa_check.returncode != 0:
        run_cmd([
            "gcloud", "iam", "service-accounts", "create", sa_name,
            "--display-name=GE eDiscovery Read-Only Compliance Portal SA",
            f"--project={args.project_id}",
        ])

    # Grant strictly read-only permissions on GCS archive bucket and dataset-scoped BigQuery READER
    # (no KMS signing, no project-wide dataViewer, and no write roles; mitigates N3 / ED-6)
    run_cmd([
        "gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{bucket_name}",
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/storage.objectViewer",
        f"--project={args.project_id}",
    ])
    run_cmd([
        "gcloud", "projects", "add-iam-policy-binding", args.project_id,
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/bigquery.jobUser",
        "--condition=None",
        "--quiet",
    ])
    import json
    import tempfile
    ds_ref = f"{args.project_id}:{args.bq_dataset}"
    ds_json_raw = run_cmd(["bq", "show", "--format=prettyjson", ds_ref])
    ds_meta = json.loads(ds_json_raw)
    access_list = ds_meta.get("access", [])
    reader_entry = {"role": "READER", "userByEmail": sa_email}
    if reader_entry not in access_list:
        access_list.append(reader_entry)
        ds_meta["access"] = access_list
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
            tmp_ds_path = tf.name
            json.dump(ds_meta, tf)
        try:
            run_cmd(["bq", "update", f"--source={tmp_ds_path}", ds_ref])
        finally:
            if os.path.exists(tmp_ds_path):
                os.remove(tmp_ds_path)

    # Ensure all file timestamps in portal/ are >= 1980 for Cloud Build ZIP packaging
    import time
    now = time.time()
    for root, _dirs, files in os.walk(portal_dir):
        if "node_modules" in root:
            continue
        try:
            os.utime(root, (now, now))
        except OSError:
            pass
        for fname in files:
            try:
                os.utime(os.path.join(root, fname), (now, now))
            except OSError:
                pass

    allowed_emails_set = {
        e.strip().lower()
        for e in (args.allowed_reviewers.split(",") + ([args.reviewer_email] if args.reviewer_email else []))
        if e.strip() and not e.strip().startswith("<")
    }
    iap_acc_clean = args.iap_accessor.strip()
    if iap_acc_clean.lower().startswith("user:"):
        iap_user_email = iap_acc_clean.split(":", 1)[1].strip().lower()
        if "@" in iap_user_email and not iap_user_email.startswith("<"):
            allowed_emails_set.add(iap_user_email)
    if args.iap_accessor.strip().lower().startswith(("domain:", "allauthenticatedusers", "allusers")):
        print(
            "Error: Domain-wide or public --iap-accessor bindings (domain:*, allAuthenticatedUsers, allUsers) "
            "are prohibited on eDiscovery compliance portals. Specify an individual user:... or compliance group:..."
        )
        sys.exit(1)
    if not allowed_emails_set and not args.allowed_reviewer_domains.strip():
        print(
            "Error: At least one authorized reviewer (--reviewer-email, --allowed-reviewers, or "
            "--allowed-reviewer-domains) is required so the Compliance Portal enforces fail-closed RBAC."
        )
        sys.exit(1)

    iap_aud = args.iap_audience.strip()
    if args.iap and not iap_aud:
        proj_num = run_cmd([
            "gcloud", "projects", "describe", args.project_id, "--format=value(projectNumber)"
        ])
        if proj_num:
            iap_aud = f"/projects/{proj_num}/locations/{args.region}/services/{args.service_name}"

    # Use ^;^ custom delimiter in gcloud --set-env-vars so comma-separated email lists parse cleanly
    env_pairs = [
        f"GCP_PROJECT_ID={args.project_id}",
        f"GCS_BUCKET_NAME={bucket_name}",
        f"BQ_DATASET={args.bq_dataset}",
    ]
    if args.reviewer_email:
        env_pairs.append(f"PORTAL_REVIEWER_EMAIL={args.reviewer_email}")
    if allowed_emails_set:
        env_pairs.append(f"ALLOWED_REVIEWER_EMAILS={','.join(sorted(allowed_emails_set))}")
    if args.allowed_reviewer_domains.strip():
        env_pairs.append(f"ALLOWED_REVIEWER_DOMAINS={args.allowed_reviewer_domains.strip()}")
    if iap_aud:
        env_pairs.append(f"IAP_AUDIENCE={iap_aud}")
    if args.oauth_client_id.strip():
        env_pairs.append(f"EXPECTED_OAUTH_CLIENT_ID={args.oauth_client_id.strip()}")

    print("======================================================================")
    print(f"Deploying Compliance Review Portal ({args.service_name}) to Cloud Run")
    print("======================================================================")
    deploy_cmd = [
        "gcloud", "run", "deploy", args.service_name,
        f"--project={args.project_id}",
        f"--region={args.region}",
        f"--source={portal_dir}",
        f"--service-account={sa_email}",
        "--no-allow-unauthenticated",
        f"--set-env-vars=^;^{';'.join(env_pairs)}",
        "--memory=1Gi",
        "--cpu=1",
        "--quiet",
    ]
    if args.iap:
        run_cmd(["gcloud", "services", "enable", "iap.googleapis.com", f"--project={args.project_id}"])
        deploy_cmd.append("--iap")
    run_cmd(deploy_cmd)

    if args.iap and args.iap_accessor:
        run_cmd([
            "gcloud", "iap", "web", "add-iam-policy-binding",
            f"--project={args.project_id}",
            "--resource-type=cloud-run",
            f"--service={args.service_name}",
            f"--region={args.region}",
            f"--member={args.iap_accessor}",
            "--role=roles/iap.httpsResourceAccessor",
        ])

    service_url = run_cmd([
        "gcloud", "run", "services", "describe", args.service_name,
        f"--project={args.project_id}",
        f"--region={args.region}",
        "--format=value(status.url)",
    ])
    print("\n======================================================================")
    print("PORTAL DEPLOYMENT COMPLETE")
    print("======================================================================")
    print(f"  Cloud Run Service URL: {service_url}")
    print(f"  Local Authenticated Proxy: gcloud run services proxy {args.service_name} --project={args.project_id} --region={args.region} --port=8085")


if __name__ == "__main__":
    main()
