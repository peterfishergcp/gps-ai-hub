#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

if [ -f .env ]; then
  echo "Loading configuration from .env..."
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

GCP_PROJECT="${GCP_PROJECT:?Error: Set GCP_PROJECT in .env or environment}"
GCP_REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-least-privilege-sharepoint-mcp-server}"
SA_NAME="${SA_NAME:-least-priv-sp-sa}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com}"
MS_GRAPH_SECRET_NAME="${MS_GRAPH_SECRET_NAME:-ms-graph-client-secret}"

if [ -z "${MS_GRAPH_TENANT_ID:-}" ] || [ -z "${MS_GRAPH_CLIENT_ID:-}" ] || [ -z "${ALLOWED_SHAREPOINT_SITES:-}" ]; then
  echo "Error: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and ALLOWED_SHAREPOINT_SITES must be set."
  exit 1
fi

if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Least-Privilege SharePoint MCP Cloud Run SA" \
    --project="${GCP_PROJECT}"
fi

gcloud secrets describe "${MS_GRAPH_SECRET_NAME}" --project="${GCP_PROJECT}" >/dev/null 2>&1 || {
  echo "Error: Secret '${MS_GRAPH_SECRET_NAME}' not found in Secret Manager (${GCP_PROJECT})."
  exit 1
}

gcloud secrets add-iam-policy-binding "${MS_GRAPH_SECRET_NAME}" \
  --project="${GCP_PROJECT}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

# NOTE: --allow-unauthenticated is retained for quick evaluation with signed OAuth Bearer validation.
# For production deployments, switch to --no-allow-unauthenticated and grant roles/run.invoker (see README.md).
# Note: ALLOWED_SHAREPOINT_SITES may contain commas, so use ^|^ custom gcloud delimiter.
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${GCP_PROJECT}" \
  --region "${GCP_REGION}" \
  --service-account "${SERVICE_ACCOUNT_EMAIL}" \
  --allow-unauthenticated \
  --set-env-vars="^|^MS_GRAPH_TENANT_ID=${MS_GRAPH_TENANT_ID}|MS_GRAPH_CLIENT_ID=${MS_GRAPH_CLIENT_ID}|SHAREPOINT_HOSTNAME=${SHAREPOINT_HOSTNAME:-}|ALLOWED_SHAREPOINT_SITES=${ALLOWED_SHAREPOINT_SITES}|ALLOW_APP_CREDENTIALS=true" \
  --set-secrets="MS_GRAPH_CLIENT_SECRET=${MS_GRAPH_SECRET_NAME}:latest"
