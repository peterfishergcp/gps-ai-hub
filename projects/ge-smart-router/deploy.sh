#!/bin/bash
set -e

# Project ID resolution: Use environment variable or active gcloud configuration
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-ge-smart-router}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP Project ID specified. Please set PROJECT_ID environment variable or run 'gcloud config set project <PROJECT_ID>'."
  exit 1
fi

echo "=========================================================="
echo " Deploying Gemini Enterprise Smart Router to Cloud Run"
echo " Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"
echo "=========================================================="

# Build and deploy directly using Cloud Build and Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --set-env-vars "DEV_MODE=false,LOG_LEVEL=INFO" \
  --allow-unauthenticated

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format="value(status.url)")

echo "=========================================================="
echo " Deployment Complete!"
echo " Service Endpoint: $SERVICE_URL"
echo " Health Check: $SERVICE_URL/health"
echo "=========================================================="
