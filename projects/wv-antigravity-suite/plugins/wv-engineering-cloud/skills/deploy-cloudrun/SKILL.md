---
name: deploy-cloudrun
description: Prepares, hardens, and deploys web apps, APIs, and MCP services to Google Cloud Run directly from source (gcloud run deploy --source . via remote Cloud Build—zero local Docker required) with non-root containers, dedicated least-privilege service accounts, .gcloudignore, and Secret Manager. Trigger on /deploy-cloudrun, "deploy to Cloud Run", "containerize this service", or "create a Cloud Run deployment".
---

# Zero-Docker Cloud Run Source Deployment (`/deploy-cloudrun`)

Deploy services to **Google Cloud Run** cleanly from corporate laptops where **local Docker Desktop is not installed**—using Cloud Build remote source builds (`gcloud run deploy --source .`) and strict production hardening.

## Mandatory Pre-Deploy Hardening Checklist (Enforce Every Item!)
1. **`.gcloudignore` & `.dockerignore` Present:**
   - Exclude `.env`, `.env.*`, `*.pem`, `*.key`, `*credentials*.json`, `.git/`, and `node_modules/` / `.venv/` so local secrets never upload to Cloud Build staging buckets.
2. **Never Use the Default Compute Service Account:**
   - Create or bind a **dedicated least-privilege runtime service account** (`<service>-sa@<PROJECT_ID>.iam.gserviceaccount.com`) with only the exact IAM roles required (e.g., `roles/bigquery.jobUser` + dataset `roles/bigquery.dataViewer`).
   - **NEVER** combine `--allow-unauthenticated` with `*-compute@developer.gserviceaccount.com`!
3. **Secrets via Secret Manager Only (`--set-secrets`):**
   - Never pass API keys, database passwords, or OAuth secrets inline via `--set-env-vars`. Use `--set-secrets="DB_PASS=my-secret:latest"` or keyless Google Cloud ADC.
4. **Non-Root Container & `PORT` Binding:**
   - Ensure `Dockerfile` (when included) runs as an unprivileged user (`USER node` / `USER nonroot`) and listens on `process.env.PORT || 8080` (`127.0.0.1` locally during dev tests; `0.0.0.0` inside Cloud Run when `K_SERVICE` is set).
5. **Authentication Default (`--no-allow-unauthenticated` / IAP):**
   - Default internal agency tools and APIs to **IAM-authenticated (`--no-allow-unauthenticated`)** or **Identity-Aware Proxy (IAP)** integrated with West Virginia's Entra-synced Google Identity groups. Only pass `--allow-unauthenticated` when deploying an intentionally public citizen web portal after security sign-off.

## Canonical Deployment Command Template
Always confirm target `PROJECT_ID`, `REGION` (default `us-east4` Northern Virginia for West Virginia proximity!), and auth mode with the user before running:

```bash
gcloud run deploy SERVICE_NAME \
  --source . \
  --project YOUR_PROJECT_ID \
  --region us-east4 \
  --service-account SERVICE_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --no-allow-unauthenticated
```
