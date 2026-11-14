---
name: install-ge-deployment-dashboard
description: >-
  Audits Cloud Run MCP pre-warming & least-privilege service accounts, enables
  FERPA-safe metadata observability (--no-sensitive-logging), provisions BigQuery
  Model Armor, Jailbreak, PII SDP, Governance & WIF Token views, and deploys the
  IAP-protected Gemini Security, Governance & Deployment Readiness Dashboard via
  Antigravity CLI.
---

# Install Gemini Security, Governance & Deployment Readiness Dashboard (`AGY CLI`)

Use this skill in **Antigravity CLI (`agy`)** to audit a Google Cloud project's launch readiness and deploy the **Gemini Security, Governance & Deployment Command Center** in under two minutes.

## Step 1 — Run Pre-Flight Cloud Run MCP Security & Pre-Warming Audit (Read-Only)

Always run the non-destructive audit first and review findings with the administrator before mutating resources:

```bash
python3 install_deployment_dashboard.py \
  --project-id "${GCP_PROJECT_ID}" \
  --region "${CLOUD_RUN_REGION:-us-central1}" \
  --audit-only
```

### What Phase 1 Verifies
1. **Least-Privilege Runtime Identity:** Flags any Cloud Run MCP or custom agent service running on the Default Compute Service Account (`*-compute@developer.gserviceaccount.com`).
2. **MCP CPU & Memory Pre-Warming:** Verifies `minScale >= 2` (`--min-instances=2`), `startup-cpu-boost=true` (`--cpu-boost`), `--no-cpu-throttling` (so background OpenTelemetry span batch exporters and TTL catalog caches do not freeze between requests), and `2 vCPU / 2 GiB` sizing.

## Step 2 — Confirm SIEM Augmentation Mode & Execute Turnkey Provisioning

By default, `install_deployment_dashboard.py` runs in **Non-Disruptive SIEM Augmentation Mode (`--preserve-siem-logging`)**: it leaves the customer's existing SIEM prompt/response logging untouched while creating a **parallel Cloud Logging + OpenTelemetry `_Trace` pipeline** in BigQuery for Deployment Readiness, Usage Metrics, Security/SDP/Jailbreak Governance, and Per-Model/Per-User Token Consumption.

Ask the user to confirm:
- **Target `GCP_PROJECT_ID`** (e.g., `Student-Prod` vs. `Staff-Prod` — recommend `1 Project : 1 Application`).
- **IAP Accessor Group:** Synced Google/Entra admin group (e.g., `group:ai-governance-admins@example.edu`).

Then execute:

```bash
python3 install_deployment_dashboard.py \
  --project-id "${GCP_PROJECT_ID}" \
  --region "${CLOUD_RUN_REGION:-us-central1}" \
  --preserve-siem-logging \
  --iap \
  --iap-accessor "group:${ADMIN_GROUP_EMAIL}"
```

## Step 3 — Run Unit & Security Verification Suite

Verify CSP nonces, `Cache-Control: no-store`, zero `innerHTML` sinks, PII principal masking, and governance endpoints:

```bash
python3 -m pytest dashboard/test_app.py -v
```
