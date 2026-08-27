#!/usr/bin/env bash
# Copyright 2026 Google LLC

PROJECT_ID="ai-hub-459714"
REGION="us-central1"
SERVICE_NAME="claude-mcp-sonnet"
IMAGE_NAME="us-central1-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:latest"

echo "Building container image using Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}" --project "${PROJECT_ID}"

echo "Deploying ${SERVICE_NAME} to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID="${PROJECT_ID}",LOCATION_ID="global",MODEL_ID="claude-sonnet-5"

echo "Deployment finished successfully!"
