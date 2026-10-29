# Customer Deployment Playbook — Gemini Enterprise & NotebookLM Enterprise eDiscovery (`ge-ediscovery-logging`)

When a user or customer asks an AI coding assistant or operator to install, configure, verify, or troubleshoot the **Gemini Enterprise & NotebookLM Enterprise eDiscovery Pipeline**, follow this step-by-step runbook.

---

## 1. Zero-Guessing Rule & Automatic Environment Discovery

Before asking the customer to manually look up IDs, **run automatic read-only discovery first** and present what you found for confirmation:

```bash
# 1. Check active gcloud identity, project, and organization ID
gcloud auth list --filter=status:ACTIVE --format="value(account)"
gcloud config get-value project
GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
ORG_ID=$(gcloud projects get-ancestors "$GCP_PROJECT_ID" --format="json" 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); print(next((x['id'] for x in data if x.get('type')=='organization'), ''))")
echo "Project: $GCP_PROJECT_ID | Org ID: $ORG_ID"

# 2. Auto-discover Workforce Identity Pools in the Organization
if [ -n "$ORG_ID" ]; then
  gcloud iam workforce-pools list --location=global --organization="$ORG_ID" --format="table(name,displayName,state)"
fi

# 3. Auto-discover existing principalSet bindings for roles/discoveryengine.user on the project
gcloud projects get-iam-policy "$GCP_PROJECT_ID" --format=json | python3 -c '
import sys, json
pol = json.load(sys.stdin)
for b in pol.get("bindings", []):
    if "discoveryengine" in b.get("role", ""):
        print(b["role"], "->", b.get("members", []))
'
```

### Confirm These 5 Values with the Customer
After running discovery above, confirm (or ask for) any missing values:
1. **`GCP_PROJECT_ID`**: Target Google Cloud project hosting Gemini Enterprise.
2. **`WORKFORCE_POOL_ID`**: Workforce Identity Pool ID (just the short name, e.g. `my-entra-oidc-pool`, not the full `locations/global/workforcePools/...` path).
3. **`WIF_PRINCIPAL_SET`**: The IAM principal currently granted `roles/discoveryengine.user` that should be swapped to the no-delete role `geUserNoDelete` (usually `principalSet://iam.googleapis.com/locations/global/workforcePools/${WORKFORCE_POOL_ID}/*` or a specific group `principalSet://.../group/<GROUP_ID>`).
4. **`PORTAL_REVIEWER_EMAIL` & `--iap-accessor`**: The email address (e.g. `user:compliance-lead@customer.com`) or group (`group:ediscovery-reviewers@customer.com`) that should be granted Cloud Run IAP access (`roles/iap.httpsResourceAccessor`) to the Compliance Review Portal.
5. **Optional — Microsoft Purview Integration**: Ask if they want to enable real-time Microsoft Purview eDiscovery / DSPM for AI forwarding now or skip it for initial GCP deployment. (If enabling now, collect `MS_TENANT_ID`, `MS_CLIENT_ID`, and `MS_CLIENT_SECRET` or use `--device-login`).

---

## 2. Preflight Permission & Tooling Check (Run Before Installing)

Verify local CLI tools and test whether the active `gcloud` identity has both **Project-level** and **Organization-level (Workforce Pool)** permissions before running setup scripts:

```bash
# 1. Check required local binaries
for bin in gcloud bq openssl python3; do
  command -v "$bin" >/dev/null 2>&1 && echo "[OK] $bin" || echo "[MISSING] $bin"
done

# 2. Test Project-level permissions required for Steps 2, 4, 5, 6, 7
python3 - "$GCP_PROJECT_ID" <<'PYEOF'
import json, subprocess, sys, urllib.request
project_id = sys.argv[1]
token = subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()
needed = [
    "resourcemanager.projects.getIamPolicy",
    "resourcemanager.projects.setIamPolicy",
    "iam.roles.create",
    "iam.roles.update",
    "iam.serviceAccounts.create",
    "iam.serviceAccounts.setIamPolicy",
    "cloudkms.keyRings.create",
    "cloudkms.cryptoKeys.create",
    "cloudkms.cryptoKeys.setIamPolicy",
    "storage.buckets.create",
    "storage.buckets.update",
    "storage.buckets.setIamPolicy",
    "bigquery.datasets.create",
    "logging.sinks.create",
    "logging.sinks.update",
    "logging.logMetrics.create",
    "pubsub.topics.create",
    "pubsub.subscriptions.create",
    "run.services.create",
    "serviceusage.services.enable",
]
req = urllib.request.Request(
    f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:testIamPermissions",
    data=json.dumps({"permissions": needed}).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
granted = set(json.loads(urllib.request.urlopen(req).read().decode()).get("permissions", []))
missing = [p for p in needed if p not in granted]
if not missing:
    print(f"[OK] All {len(needed)} core project-level permissions verified on {project_id}.")
else:
    print(f"[WARN] Missing project-level permissions on {project_id}: {missing}")
PYEOF

# 3. Test Organization-level Workforce Pool Admin permission required ONLY for Step 3
gcloud iam workforce-pools providers list \
  --workforce-pool="$WORKFORCE_POOL_ID" \
  --location=global \
  --format="table(name,displayName,state)"
```

### Handling Split Org Admin vs. Project Admin at Customer Sites
- **Why this matters**: Step 3 (`setup_ediscovery_archiver_provider.py`) creates/updates the `ediscovery-archiver` OIDC provider inside `locations/global/workforcePools/${WORKFORCE_POOL_ID}`, which requires **`roles/iam.workforcePoolAdmin`** on the Workforce Pool (an Organization-level resource). All other steps (Steps 2, 4, 5, 6, 7, 8) are strictly Project-scoped.
- **If the installer lacks `roles/iam.workforcePoolAdmin`**:
  1. Run Steps 2, 4, 5, 6, and 7 first as the Project Admin.
  2. In Step 3, `setup_ediscovery_archiver_provider.py` will create the Cloud KMS key (`ediscovery-archiver-jwt-key`) in the project and output the `gcloud iam workforce-pools providers create-oidc` command. Either:
     - Have the customer's Organization IAM Admin grant `roles/iam.workforcePoolAdmin` on `locations/global/workforcePools/${WORKFORCE_POOL_ID}` to the installer, **or**
     - Have the Organization IAM Admin run `python3 setup_ediscovery_archiver_provider.py --project-id "$GCP_PROJECT_ID" --workforce-pool-id "$WORKFORCE_POOL_ID"`.

---

## 3. Step-by-Step Turnkey Installation Sequence

All scripts in this repository are **idempotent** (safe to re-run at any time) and accept both `.env` environment variables and `--project-id` / `--workforce-pool-id` CLI flags.

### Step 1: Write `.env` (Never Commit `.env` to Git)
Create `.env` from `.env.example` with the customer's values and load it:
```bash
cp .env.example .env
# Populate GCP_PROJECT_ID, WORKFORCE_POOL_ID, GE_LOCATION, GE_ENGINE_ID, PORTAL_REVIEWER_EMAIL
set -a && source .env && set +a
```

### Step 2: Enable Sensitive & Observability Logging Across All GE Engines, Custom Agents & NotebookLM
```bash
python3 enable_ge_sensitive_logging.py --project-id "$GCP_PROJECT_ID"
```
*What to verify*: Output confirms `observabilityEnabled: true` and `sensitiveLoggingEnabled: true` on all Gemini Enterprise engines (`global`, `us`, `eu`), all custom No-Code/ADK agents, and NotebookLM Enterprise locations.
- **Important Note for Customer ADK Agents**: If the customer has custom ADK agents deployed on Vertex AI Agent Engine (`reasoningEngines`), remind them that capturing inner ADK tool/sub-agent plaintext logs also requires setting `GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY="true"` and `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT="true"` on their Reasoning Engine deployment.

### Step 3: Provision Cloud KMS Signing Key & Workforce Pool `ediscovery-archiver` OIDC Provider
```bash
python3 setup_ediscovery_archiver_provider.py \
  --project-id "$GCP_PROJECT_ID" \
  --workforce-pool-id "$WORKFORCE_POOL_ID"
```
*What this does*:
- Enables `cloudkms.googleapis.com` and creates KeyRing `ge-ediscovery-kr` + asymmetric signing key `ediscovery-archiver-jwt-key` (`RSA_SIGN_PKCS1_2048_SHA256`, zero private keys on disk).
- Registers/updates the `ediscovery-archiver` OIDC provider in `WORKFORCE_POOL_ID` with a hardened CEL `--attribute-condition` requiring `assertion.purpose == 'ediscovery_harvest'` and blocking `*.gserviceaccount.com` subjects.
- Locks down key-level IAM on `ediscovery-archiver-jwt-key` and creates the `ediscovery_kms_asymmetric_sign_calls` Cloud Logging metric.

### Step 4: Provision Cloud Storage Archive Bucket, BigQuery Dataset/Table, Sink & Forensic Views
```bash
python3 setup_storage_and_bigquery.py --project-id "$GCP_PROJECT_ID"
```
*Optional WORM Retention / CMEK env vars*:
- Set `export GCS_RETENTION_PERIOD="365d"` (or `"7y"`) before running if the customer wants a bucket-level WORM retention policy (and `export LOCK_GCS_RETENTION_POLICY="true"` only if they explicitly request an irreversible retention lock).
- Set `export GCS_CMEK_KEY_NAME="projects/.../cryptoKeys/..."` if the customer requires CMEK on the archive bucket.

### Step 5: Deploy the Real-Time Event-Driven Cloud Run Harvester (`<10s` Latency)
```bash
python3 deploy_cloudrun_harvester.py \
  --project-id "$GCP_PROJECT_ID" \
  --workforce-pool-id "$WORKFORCE_POOL_ID"
```
*What this does*:
- Creates dedicated least-privilege service account `ge-ediscovery-harvester-sa@<PROJECT_ID>.iam.gserviceaccount.com`.
- Builds and deploys `ge-ediscovery-harvester` to Cloud Run (`--no-allow-unauthenticated`).
- Creates Pub/Sub topic `ge-ediscovery-events`, Dead-Letter Queue `ge-ediscovery-dlq` (`ge-ediscovery-dlq-hold`), Cloud Logging sink `ge-ediscovery-pubsub-sink`, and OIDC-authenticated push subscription `ge-ediscovery-push-sub`.

### Step 6: Deploy the Self-Contained Compliance Review Portal (`ge-ediscovery-portal`)
```bash
python3 deploy_portal.py \
  --project-id "$GCP_PROJECT_ID" \
  --reviewer-email "$PORTAL_REVIEWER_EMAIL" \
  --iap-accessor "user:${PORTAL_REVIEWER_EMAIL}"
```
*(If the customer's Org Policy or setup does not use Cloud Run native IAP, pass `--no-iap` and access the portal via `gcloud run services proxy ge-ediscovery-portal --project "$GCP_PROJECT_ID" --region us-central1 --port 8085`)*

### Step 7: Provision `geUserNoDelete` Custom Role & Swap WIF User Binding (Spoliation Prevention)
Always run the **dry-run first** (which creates `projects/<PROJECT_ID>/roles/geUserNoDelete` and binds it additively to the WIF principal), verify output, and then run `--apply` (which saves a timestamped IAM policy backup JSON and removes `roles/discoveryengine.user` from that single principal):
```bash
# 1. Dry-run + additive grant of geUserNoDelete:
scripts/swap-user-role.sh "$GCP_PROJECT_ID" \
  "principalSet://iam.googleapis.com/locations/global/workforcePools/${WORKFORCE_POOL_ID}/*"

# 2. Apply swap (backs up IAM policy & removes roles/discoveryengine.user from this principal):
scripts/swap-user-role.sh "$GCP_PROJECT_ID" \
  "principalSet://iam.googleapis.com/locations/global/workforcePools/${WORKFORCE_POOL_ID}/*" \
  --apply
```

### Step 8: Run Read-Only Health Check & End-to-End Verification Suite
```bash
# 1. Read-only infrastructure & drift health check:
scripts/verify.sh "$GCP_PROJECT_ID"

# 2. Full 8-check E2E test (requires a valid GE_ENGINE_ID and TEST_WIF_USER_SUBJECT):
python3 test_ge_ediscovery_e2e.py \
  --project-id "$GCP_PROJECT_ID" \
  --workforce-pool-id "$WORKFORCE_POOL_ID" \
  --location "$GE_LOCATION" \
  --engine-id "$GE_ENGINE_ID" \
  --user-subject "$TEST_WIF_USER_SUBJECT"
```

---

## 4. Common Customer Site Troubleshooting

| Symptom / Error | Root Cause | Fix |
| :--- | :--- | :--- |
| **`PERMISSION_DENIED` during Step 3 (`workforce-pools providers create-oidc`)** | Installer has Project Owner/Admin, but lacks Org-level Workforce Pool Admin (`roles/iam.workforcePoolAdmin`). | Have an Org Admin grant `roles/iam.workforcePoolAdmin` on `locations/global/workforcePools/${WORKFORCE_POOL_ID}`, or have the Org Admin run `setup_ediscovery_archiver_provider.py`. |
| **Cloud Build fails during `deploy_cloudrun_harvester.py` or `deploy_portal.py`** | Custom Org Policy restricts default Compute Engine SA or Cloud Build SA permissions. | Ensure the project's Cloud Build service account (`<PROJECT_NUMBER>@cloudbuild.gserviceaccount.com` or custom build SA) has `roles/storage.objectUser`, `roles/artifactregistry.writer`, and `roles/logging.logWriter`. |
| **`test_ge_ediscovery_e2e.py` Check 3/4 returns `403` on existing session, or user subject mismatch** | Customer's Workforce Pool maps `google.subject` to an Entra ID Object GUID (`assertion.oid`) instead of email (`assertion.upn` / `assertion.mail`). | Inspect `gcloud iam workforce-pools providers describe <IDP_PROVIDER> --workforce-pool=$WORKFORCE_POOL_ID --location=global --format="value(attributeMapping)"` and pass a matching `--user-subject` to `test_ge_ediscovery_e2e.py`. Note: `ge_harvest.py` handles both GUIDs and emails automatically in production because it reads the exact `userIamPrincipal` from Cloud Logging. |
| **Historical sessions created before installation are missing from BigQuery** | Real-time Pub/Sub push only captures events after sink creation. | Run a one-time historical sweep: `python3 ge_harvest.py --project-id "$GCP_PROJECT_ID" --workforce-pool-id "$WORKFORCE_POOL_ID" --hours 720`. |
| **BigQuery `InsertJob` / `load_rows_to_bigquery` fails with `HTTP Error 400: Bad Request` (`No schema specified on job or table`)** | `Dockerfile` omitted `conversation_turns_schema.json` (and `purview_connector.py`) when copying `/app/` into the Cloud Run container image, so per-run staging table (`conversation_turns_staging_<uuid>`) multipart load jobs were submitted without a `schema.fields` definition. | Ensure `Dockerfile` copies `conversation_turns_schema.json` and `purview_connector.py` into `/app/` (`COPY ge_harvest.py cloudrun_harvester_server.py purview_connector.py conversation_turns_schema.json /app/`), ensure `ge_harvest.py` includes the inline fallback schema in `load_rows_to_bigquery()`, and re-run `python3 deploy_cloudrun_harvester.py --project-id "$GCP_PROJECT_ID" --workforce-pool-id "$WORKFORCE_POOL_ID"`. |
