#!/usr/bin/env bash
# Copyright 2026 Google LLC
# Interactive Setup & Deployment Script for Claude Sonnet MCP Server

set -e

echo "=================================================================="
echo "🚀 Claude Sonnet MCP Server - Interactive Deployer for Cloud Run"
echo "=================================================================="

# 1. Detect or Prompt for GCP Project ID
DEFAULT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "ai-hub-459714")
read -p "Enter GCP Project ID [default: ${DEFAULT_PROJECT}]: " INPUT_PROJECT
PROJECT_ID="${INPUT_PROJECT:-$DEFAULT_PROJECT}"

# 2. Detect or Prompt for GCP Region
read -p "Enter GCP Region [default: us-central1]: " INPUT_REGION
REGION="${INPUT_REGION:-us-central1}"

# 3. Service Name & Model Choice
SERVICE_NAME="claude-mcp-sonnet"
read -p "Enter Claude Model ID [default: claude-sonnet-5]: " INPUT_MODEL
MODEL_ID="${INPUT_MODEL:-claude-sonnet-5}"

IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}:latest"

echo ""
echo "📌 Deployment Configuration:"
echo "   - Project ID:   ${PROJECT_ID}"
echo "   - Region:       ${REGION}"
echo "   - Service Name: ${SERVICE_NAME}"
echo "   - Model ID:     ${MODEL_ID}"
echo "=================================================================="
echo ""

# Enable required Google Cloud APIs
echo "⚙️ Enabling required GCP APIs (Cloud Run, Cloud Build, Vertex AI)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com --project="${PROJECT_ID}"

# Build container image with Cloud Build
echo "📦 Building container image using Cloud Build..."
gcloud builds submit --tag "${IMAGE_NAME}" --project "${PROJECT_ID}"

# Deploy container image to Cloud Run
echo "🚀 Deploying ${SERVICE_NAME} to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID="${PROJECT_ID}",LOCATION_ID="global",MODEL_ID="${MODEL_ID}"

SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" --project="${PROJECT_ID}" --region="${REGION}" --format='value(status.url)' 2>/dev/null || echo "")

echo ""
echo "=================================================================="
echo "🎉 DEPLOYMENT COMPLETE!"
echo "=================================================================="
echo "🔗 Your MCP SSE Endpoint URL:"
echo "   ${SERVICE_URL}/mcp"
echo ""
echo "📋 Next Steps (Gemini Enterprise BYO MCP Connector Setup):"
echo "   1. Open Gemini Enterprise Admin Console -> Connectors & Tools."
echo "   2. Click 'Add BYO MCP Connector' -> Select 'Remote MCP Server (SSE)'."
echo "   3. Paste the URL: ${SERVICE_URL}/mcp"
echo "   4. Test in Gemini Enterprise chat!"
echo "=================================================================="
