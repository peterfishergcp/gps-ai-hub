#!/usr/bin/env python3
"""
deploy_dashboard.py — Deploys the Gemini Enterprise Token Consumption & WIF Usage Dashboard
(`ge-token-tracking-dashboard`) to Google Cloud Run.

Provisions a dedicated least-privilege read-only service account (`ge-token-dashboard-sa`)
with strictly `roles/bigquery.dataViewer` and `roles/bigquery.jobUser`, builds the container
image (`dashboard/Dockerfile`), and deploys to Cloud Run with `--no-allow-unauthenticated`
and Identity-Aware Proxy (`--iap`) enabled by default.

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  python3 deploy_dashboard.py
"""

import argparse
import os
import re
import subprocess
import sys
import time

DEFAULT_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", os.environ.get("PROJECT_ID", "")).strip()
DEFAULT_REGION = os.environ.get("CLOUD_RUN_REGION", "us-central1").strip()
DEFAULT_SERVICE_NAME = os.environ.get("DASHBOARD_SERVICE_NAME", "ge-token-tracking-dashboard").strip()

PROJECT_ID_RE = re.compile(r"^[a-z][a-z0-9\-]{4,28}[a-z0-9]$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-\.]{1,100}$")


def run_cmd(cmd: list[str]) -> str:
    print(f"  $ {' '.join(cmd)}")
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        return out.decode("utf-8").strip()
    except subprocess.CalledProcessError as e:
        print(e.output.decode("utf-8", errors="replace"))
        raise


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deploy the Gemini Enterprise Token Consumption & WIF Usage Dashboard to Cloud Run."
    )
    parser.add_argument("--project-id", default=DEFAULT_PROJECT_ID, help="Google Cloud Project ID")
    parser.add_argument("--region", default=DEFAULT_REGION, help="Cloud Run region (default: us-central1)")
    parser.add_argument(
        "--service-name",
        default=DEFAULT_SERVICE_NAME,
        help="Cloud Run service name (default: ge-token-tracking-dashboard)",
    )
    parser.add_argument(
        "--bq-dataset",
        default=os.environ.get("BQ_DATASET", "ge_token_analytics"),
        help="Primary BigQuery dataset (default: ge_token_analytics)",
    )
    parser.add_argument(
        "--ge-transformed-dataset",
        default=os.environ.get("GE_TRANSFORMED_DATASET", "ge_transformed"),
        help="Fallback transformed logs dataset (default: ge_transformed)",
    )
    parser.add_argument(
        "--token-view-dataset",
        default=os.environ.get("TOKEN_VIEW_DATASET", "agent_analytics"),
        help="Dataset containing gemini_token_usage_by_user (default: agent_analytics)",
    )
    parser.add_argument(
        "--iap",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Enable native Cloud Run Identity-Aware Proxy (IAP) for browser Google Sign-In (default: True; use --no-iap to disable)",
    )
    parser.add_argument(
        "--iap-accessor",
        default="",
        help="Optional IAM principal to grant roles/iap.httpsResourceAccessor (e.g. domain:mines.edu or user:admin@mines.edu)",
    )
    args = parser.parse_args()

    project_id = (args.project_id or "").strip()
    if not project_id or not PROJECT_ID_RE.match(project_id):
        sys.exit("Error: A valid --project-id (or GCP_PROJECT_ID) is required.")
    if not SAFE_ID_RE.match(args.region) or not SAFE_ID_RE.match(args.service_name):
        sys.exit("Error: Invalid --region or --service-name format.")

    sa_name = "ge-token-dashboard-sa"
    sa_email = f"{sa_name}@{project_id}.iam.gserviceaccount.com"
    dashboard_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dashboard")

    print("======================================================================")
    print(f"Provisioning Dedicated Read-Only Service Account ({sa_email})")
    print("======================================================================")
    sa_check = subprocess.run(
        ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={project_id}"],
        capture_output=True,
        text=True,
    )
    if sa_check.returncode != 0:
        run_cmd([
            "gcloud",
            "iam",
            "service-accounts",
            "create",
            sa_name,
            "--display-name=GE Token Tracking Read-Only Dashboard SA",
            f"--project={project_id}",
        ])

    for role in [
        "roles/bigquery.dataViewer",
        "roles/bigquery.jobUser",
    ]:
        run_cmd([
            "gcloud",
            "projects",
            "add-iam-policy-binding",
            project_id,
            f"--member=serviceAccount:{sa_email}",
            f"--role={role}",
            "--condition=None",
            "--quiet",
        ])

    now = time.time()
    for root, _dirs, files in os.walk(dashboard_dir):
        if "__pycache__" in root or ".pytest_cache" in root:
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

    env_vars = [
        f"PROJECT_ID={project_id}",
        f"GCP_PROJECT_ID={project_id}",
        f"BQ_DATASET={args.bq_dataset}",
        f"GE_TRANSFORMED_DATASET={args.ge_transformed_dataset}",
        f"TOKEN_VIEW_DATASET={args.token_view_dataset}",
    ]

    print("======================================================================")
    print(f"Deploying Token Tracking Dashboard ({args.service_name}) to Cloud Run")
    print("======================================================================")
    deploy_cmd = [
        "gcloud",
        "run",
        "deploy",
        args.service_name,
        f"--project={project_id}",
        f"--region={args.region}",
        f"--source={dashboard_dir}",
        f"--service-account={sa_email}",
        "--no-allow-unauthenticated",
        f"--set-env-vars={','.join(env_vars)}",
        "--memory=512Mi",
        "--cpu=1",
        "--quiet",
    ]
    if args.iap:
        run_cmd(["gcloud", "services", "enable", "iap.googleapis.com", f"--project={project_id}"])
        deploy_cmd.append("--iap")
    run_cmd(deploy_cmd)

    if args.iap and args.iap_accessor:
        run_cmd([
            "gcloud",
            "iap",
            "web",
            "add-iam-policy-binding",
            f"--project={project_id}",
            "--resource-type=cloud-run",
            f"--service={args.service_name}",
            f"--region={args.region}",
            f"--member={args.iap_accessor}",
            "--role=roles/iap.httpsResourceAccessor",
        ])

    service_url = run_cmd([
        "gcloud",
        "run",
        "services",
        "describe",
        args.service_name,
        f"--project={project_id}",
        f"--region={args.region}",
        "--format=value(status.url)",
    ])
    print("\n======================================================================")
    print("TOKEN TRACKING DASHBOARD DEPLOYMENT COMPLETE")
    print("======================================================================")
    print(f"  Cloud Run Service URL: {service_url}")
    print(
        f"  Local Authenticated Proxy: gcloud run services proxy {args.service_name} "
        f"--project={project_id} --region={args.region} --port=8080"
    )


if __name__ == "__main__":
    main()
