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

echo "================================================================="
echo " Deploying Vertex AI Claude Sonnet 4.6 MCP Server to Cloud Run"
echo "================================================================="
echo ""

PROJECT_ID="${PROJECT_ID:-}"
if [ -z "${PROJECT_ID}" ]; then
  read -r -p "Enter your Google Cloud Project ID: " PROJECT_ID
fi
if [ -z "${PROJECT_ID}" ]; then
  echo "Error: PROJECT_ID cannot be empty."
  exit 1
fi

DEPLOY_REGION="${DEPLOY_REGION:-us-central1}"
VERTEX_REGION="${VERTEX_REGION:-global}"
DEFAULT_MODEL="${DEFAULT_MODEL:-claude-sonnet-4-6}"
SERVICE_NAME="${SERVICE_NAME:-vertex-claude-mcp}"
SA_NAME="${SA_NAME:-vertex-claude-mcp-sa}"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_EMAIL:-${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"

echo ""
echo "Summary of Configuration:"
echo "  Project ID:            ${PROJECT_ID}"
echo "  Cloud Run Region:      ${DEPLOY_REGION}"
echo "  Vertex AI Region:      ${VERTEX_REGION}"
echo "  Default Model:         ${DEFAULT_MODEL}"
echo "  Service Name:          ${SERVICE_NAME}"
echo "  Service Account:       ${SERVICE_ACCOUNT_EMAIL}"
echo ""

echo "[1/4] Setting active gcloud project and enabling required APIs..."
gcloud config set project "${PROJECT_ID}"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com \
  iam.googleapis.com \
  --project="${PROJECT_ID}"

echo "[2/4] Ensuring dedicated least-privilege Service Account (${SA_NAME})..."
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="Vertex AI Claude MCP Cloud Run SA" \
    --project="${PROJECT_ID}"
fi

echo "[3/4] Granting roles/aiplatform.user to ${SERVICE_ACCOUNT_EMAIL}..."
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/aiplatform.user" \
  --condition=None \
  --quiet >/dev/null

# NOTE: --allow-unauthenticated is retained here for quick evaluation with app-layer Bearer token enforcement.
# For production deployments, switch to --no-allow-unauthenticated and grant roles/run.invoker (see README.md).
echo "[4/4] Building and deploying ${SERVICE_NAME} to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --source . \
  --project "${PROJECT_ID}" \
  --region "${DEPLOY_REGION}" \
  --service-account "${SERVICE_ACCOUNT_EMAIL}" \
  --allow-unauthenticated \
  --set-env-vars="PROJECT_ID=${PROJECT_ID},REGION=${VERTEX_REGION},DEFAULT_MODEL=${DEFAULT_MODEL}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${DEPLOY_REGION}" --format='value(status.url)')"

echo ""
echo "================================================================="
echo " Deployment Complete!"
echo "================================================================="
echo "Your MCP Endpoint URL is:"
echo "  ${SERVICE_URL}/mcp"
echo ""
echo "Production Hardening Reminder:"
echo "  Lock down network ingress with --no-allow-unauthenticated and grant roles/run.invoker"
echo "  to your Gemini Enterprise / Discovery Engine service agent (see README.md)."
echo "================================================================="
