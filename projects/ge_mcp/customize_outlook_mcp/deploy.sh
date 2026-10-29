#!/usr/bin/env bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

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
SERVICE_NAME="${SERVICE_NAME:-outlook-mcp-server}"
SA_NAME="${SA_NAME:-outlook-mcp-sa}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-${SA_NAME}@${GCP_PROJECT}.iam.gserviceaccount.com}"
MS_GRAPH_SECRET_NAME="${MS_GRAPH_SECRET_NAME:-ms-graph-client-secret}"

if [ -z "${MS_GRAPH_TENANT_ID:-}" ] || [ -z "${MS_GRAPH_CLIENT_ID:-}" ]; then
  echo "Error: MS_GRAPH_TENANT_ID and MS_GRAPH_CLIENT_ID must be set."
  exit 1
fi

echo "Ensuring dedicated least-privilege Service Account (${SERVICE_ACCOUNT_EMAIL})..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${GCP_PROJECT}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Microsoft Outlook MCP Cloud Run SA" \
    --project="${GCP_PROJECT}"
fi

gcloud secrets describe "${MS_GRAPH_SECRET_NAME}" --project="${GCP_PROJECT}" >/dev/null 2>&1 || {
  echo "Error: Secret '${MS_GRAPH_SECRET_NAME}' not found in Secret Manager (${GCP_PROJECT})."
  echo "Create it first: printf '%s' \"\$MS_GRAPH_CLIENT_SECRET\" | gcloud secrets create ${MS_GRAPH_SECRET_NAME} --data-file=- --project=${GCP_PROJECT}"
  exit 1
}

gcloud secrets add-iam-policy-binding "${MS_GRAPH_SECRET_NAME}" \
  --project="${GCP_PROJECT}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null

# NOTE: --allow-unauthenticated is retained for quick evaluation with app-layer OAuth Bearer validation.
# For production deployments, switch to --no-allow-unauthenticated and grant roles/run.invoker (see README.md).
echo "Deploying ${SERVICE_NAME} to Cloud Run in ${GCP_PROJECT} (${GCP_REGION})..."
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${GCP_PROJECT}" \
  --region "${GCP_REGION}" \
  --service-account "${SERVICE_ACCOUNT_EMAIL}" \
  --allow-unauthenticated \
  --set-env-vars="MS_GRAPH_TENANT_ID=${MS_GRAPH_TENANT_ID},MS_GRAPH_CLIENT_ID=${MS_GRAPH_CLIENT_ID}" \
  --set-secrets="MS_GRAPH_CLIENT_SECRET=${MS_GRAPH_SECRET_NAME}:latest"

echo "Deployment complete. See README.md to harden ingress with --no-allow-unauthenticated and roles/run.invoker."
