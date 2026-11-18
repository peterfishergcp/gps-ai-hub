#!/bin/bash
set -euo pipefail

# Project ID resolution: Use environment variable or active gcloud configuration
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-ge-smart-router}"
SA_NAME="${SA_NAME:-${SERVICE_NAME}-sa}"
RUNTIME_SA="${RUNTIME_SA:-${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP Project ID specified. Please set PROJECT_ID environment variable or run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "=========================================================="
echo " Deploying Gemini Enterprise Smart Router to Cloud Run"
echo " Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"
echo " Runtime SA: $RUNTIME_SA"
echo "=========================================================="

# Ensure dedicated least-privilege runtime service account exists (never use Default Compute SA)
if ! gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  echo "Creating dedicated least-privilege runtime service account: $RUNTIME_SA..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Gemini Smart Router Runtime SA" \
    --project "$PROJECT_ID"
fi

INGRESS="${INGRESS:-all}"
ALLOW_UNAUTH="${ALLOW_UNAUTH:---allow-unauthenticated}"

ENV_VARS="DEV_MODE=${DEV_MODE:-false},LOG_LEVEL=INFO,COOKIE_SECURE=true"
if [ -n "${IAP_AUDIENCE:-}" ]; then
  ENV_VARS="$ENV_VARS,IAP_AUDIENCE=$IAP_AUDIENCE,REQUIRE_IAP_JWT=true"
fi
if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
  ENV_VARS="$ENV_VARS,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,REQUIRE_REAL_AUTH=${REQUIRE_REAL_AUTH:-true}"
fi

DEPLOY_ARGS=(
  "$SERVICE_NAME"
  --source .
  --project "$PROJECT_ID"
  --region "$REGION"
  --service-account "$RUNTIME_SA"
  --ingress "$INGRESS"
  --set-env-vars "$ENV_VARS"
  "$ALLOW_UNAUTH"
)

# Mount secrets from Secret Manager (--set-secrets) when configured
if [ -n "${SET_SECRETS:-}" ]; then
  DEPLOY_ARGS+=(--set-secrets "$SET_SECRETS")
fi

# Build and deploy directly using Cloud Build and Cloud Run
gcloud run deploy "${DEPLOY_ARGS[@]}"

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format="value(status.url)")

echo "=========================================================="
echo " Deployment Complete!"
echo " Service Endpoint: $SERVICE_URL"
echo " Health Check: $SERVICE_URL/health"
echo "=========================================================="
