#!/usr/bin/env python3
"""
install_deployment_dashboard.py — Turnkey Security, Governance & Deployment Dashboard
Installer + Cloud Run MCP Pre-Warming Auditor (Designed for Antigravity CLI & CI/CD).

Executes four deterministic phases:
  1. Pre-Flight Cloud Run MCP Security & Pre-Warming Audit (`--audit-only` supported):
     Checks existing MCP / custom agent services for Default Compute SA usage,
     `minScale >= 2`, `startup-cpu-boost`, `cpu-throttling` (OTel span freeze risk), and `>=2Gi` memory.
  2. Engine, Agent & NotebookLM Observability Enablement (`enable_ge_observability.py`),
     defaulting to `--no-sensitive-logging` when `--ferpa-metadata-only` is set.
  3. BigQuery Security (`v_security_and_sdp_alerts`), Governance (`v_deployment_and_governance_kpis`),
     and OpenTelemetry WIF Token Views (`setup_bigquery_token_tracking.py`).
  4. Least-Privilege IAP Cloud Run Deployment (`deploy_dashboard.py`).
"""

import argparse
import json
import os
import re
import subprocess
import sys
from typing import Any, Dict, List

PROJECT_ID_RE = re.compile(r"^[a-z][a-z0-9\-]{4,28}[a-z0-9]$")
SAFE_ID_RE = re.compile(r"^[a-zA-Z0-9_\-\.]{1,100}$")


def audit_cloud_run_mcp_services(project_id: str, region: str) -> List[Dict[str, Any]]:
    """Audits Cloud Run services in the target project for MCP pre-warming and SA least privilege."""
    print("======================================================================")
    print(f"[Phase 1/4] Auditing Cloud Run Services in {project_id} ({region})")
    print("======================================================================")
    cmd = [
        "gcloud",
        "run",
        "services",
        "list",
        f"--project={project_id}",
        f"--region={region}",
        "--format=json",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"  [WARN] Could not list Cloud Run services: {res.stderr.strip()[:180]}")
        return []

    services = json.loads(res.stdout or "[]")
    findings: List[Dict[str, Any]] = []
    for svc in services:
        name = svc.get("metadata", {}).get("name", "unknown")
        tmpl = svc.get("spec", {}).get("template", {})
        t_annotations = tmpl.get("metadata", {}).get("annotations", {}) or {}
        t_spec = tmpl.get("spec", {}) or {}
        sa = t_spec.get("serviceAccountName", "") or ""
        containers = t_spec.get("containers", [{}])
        limits = (containers[0].get("resources", {}) or {}).get("limits", {}) or {}

        min_scale = int(t_annotations.get("autoscaling.knative.dev/minScale", "0") or 0)
        cpu_boost = str(t_annotations.get("run.googleapis.com/startup-cpu-boost", "false")).lower() == "true"
        cpu_throttling = str(t_annotations.get("run.googleapis.com/cpu-throttling", "true")).lower() != "false"
        cpu_limit = str(limits.get("cpu", "1"))
        mem_limit = str(limits.get("memory", "512Mi"))
        uses_default_sa = sa.endswith("-compute@developer.gserviceaccount.com")

        issues = []
        if uses_default_sa:
            issues.append("HIGH: Uses Default Compute SA (*-compute@developer) — replace with dedicated least-privilege SA")
        if min_scale < 2:
            issues.append(f"WARN: minScale={min_scale} (<2 warm instances for bell-schedule surges)")
        if not cpu_boost:
            issues.append("WARN: startup-cpu-boost disabled (add --cpu-boost to cut cold-start latency ~45%)")
        if cpu_throttling and ("mcp" in name or "agent" in name):
            issues.append("INFO: cpu-throttling enabled (consider --no-cpu-throttling so background OTel exporters do not freeze)")

        status = "PASS" if not issues else ("DRIFT" if uses_default_sa else "TUNE")
        findings.append({
            "service": name,
            "status": status,
            "cpu": cpu_limit,
            "memory": mem_limit,
            "min_instances": min_scale,
            "cpu_boost": cpu_boost,
            "issues": issues,
        })
        print(f"  • {name:38s} [{status:5s}] cpu={cpu_limit} mem={mem_limit} minScale={min_scale} boost={cpu_boost}")
        for iss in issues:
            print(f"      -> {iss}")

    if not services:
        print("  No Cloud Run services found in this region yet.")
    return findings


def run_step(label: str, cmd: List[str]) -> None:
    print("\n======================================================================")
    print(label)
    print("======================================================================")
    print(f"  $ {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Install and verify the Gemini Security, Governance & Deployment Readiness Dashboard."
    )
    parser.add_argument("--project-id", default=os.environ.get("GCP_PROJECT_ID", ""), help="Target Google Cloud Project ID")
    parser.add_argument("--region", default="us-central1", help="Cloud Run region (default: us-central1)")
    parser.add_argument("--bq-dataset", default="ge_token_analytics", help="BigQuery analytics dataset (default: ge_token_analytics)")
    parser.add_argument("--service-name", default="ge-token-tracking-dashboard", help="Cloud Run dashboard service name")
    parser.add_argument(
        "--preserve-siem-logging",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Preserve customer's existing SIEM sensitiveLoggingEnabled settings while enabling OpenTelemetry traces (default: True)",
    )
    parser.add_argument(
        "--ferpa-metadata-only",
        action="store_true",
        help="Optional override: explicitly set --no-sensitive-logging if customer wants metadata-only mode",
    )
    parser.add_argument(
        "--iap",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Protect Cloud Run dashboard with Identity-Aware Proxy (default: True)",
    )
    parser.add_argument("--iap-accessor", default="", help="Optional IAM group/domain for IAP access (e.g. group:ai-admins@example.edu)")
    parser.add_argument("--audit-only", action="store_true", help="Run Phase 1 Cloud Run MCP pre-warming & SA security audit without deploying")
    args = parser.parse_args()

    project_id = (args.project_id or "").strip()
    if not project_id or not PROJECT_ID_RE.match(project_id):
        sys.exit("Error: Provide a valid --project-id (or set GCP_PROJECT_ID).")
    if not SAFE_ID_RE.match(args.region) or not SAFE_ID_RE.match(args.service_name):
        sys.exit("Error: Invalid --region or --service-name.")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    audit_cloud_run_mcp_services(project_id, args.region)

    if args.audit_only:
        print("\nAudit-only mode complete. Re-run without --audit-only to provision observability, BigQuery views, and Cloud Run dashboard.")
        return

    obs_cmd = [sys.executable, os.path.join(base_dir, "enable_ge_observability.py"), f"--project-id={project_id}"]
    if args.ferpa_metadata_only:
        obs_cmd.append("--no-sensitive-logging")
    elif args.preserve_siem_logging:
        obs_cmd.append("--preserve-sensitive-logging")
    run_step("[Phase 2/4] Enabling OpenTelemetry Traces (Preserving Existing SIEM Logging)", obs_cmd)

    bq_cmd = [
        sys.executable,
        os.path.join(base_dir, "setup_bigquery_token_tracking.py"),
        f"--project-id={project_id}",
        f"--bq-dataset={args.bq_dataset}",
    ]
    run_step("[Phase 3/4] Provisioning BigQuery Security, SDP, Governance & Token Views", bq_cmd)

    deploy_cmd = [
        sys.executable,
        os.path.join(base_dir, "deploy_dashboard.py"),
        f"--project-id={project_id}",
        f"--region={args.region}",
        f"--service-name={args.service_name}",
        f"--bq-dataset={args.bq_dataset}",
        "--iap" if args.iap else "--no-iap",
    ]
    if args.iap_accessor:
        deploy_cmd.append(f"--iap-accessor={args.iap_accessor}")
    run_step("[Phase 4/4] Deploying IAP-Protected Security, Governance & Token Dashboard", deploy_cmd)


if __name__ == "__main__":
    main()
