#!/usr/bin/env bash
# Copyright 2026 Google LLC
# Interactive Setup & Deployment Script for Claude Model MCP Server

set -e

echo "=================================================================="
echo "🚀 Claude MCP Server - Interactive Deployer for Cloud Run"
echo "=================================================================="

# 1. Detect or Prompt for GCP Project ID
DEFAULT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "ai-hub-459714")
read -p "Enter GCP Project ID [default: ${DEFAULT_PROJECT}]: " INPUT_PROJECT
PROJECT_ID="${INPUT_PROJECT:-$DEFAULT_PROJECT}"

# 2. Detect or Prompt for GCP Region
read -p "Enter GCP Region [default: us-central1]: " INPUT_REGION
REGION="${INPUT_REGION:-us-central1}"

# 3. Select Claude Model Choice with sonnet as default
echo ""
echo "Select Anthropic Claude Model:"
echo "  1) claude-sonnet-5 (Default - Latest Claude Sonnet)"
echo "  2) claude-3-5-sonnet-v2@20241022 (Claude 3.5 Sonnet v2)"
echo "  3) claude-3-5-haiku@20241022 (Claude 3.5 Haiku)"
echo "  4) claude-3-opus@20240229 (Claude 3 Opus)"
echo "  5) Custom Model ID"
read -p "Choose option [1-5, default: 1]: " MODEL_CHOICE

case "$MODEL_CHOICE" in
  2) MODEL_ID="claude-3-5-sonnet-v2@20241022" ;;
  3) MODEL_ID="claude-3-5-haiku@20241022" ;;
  4) MODEL_ID="claude-3-opus@20240229" ;;
  5) read -p "Enter custom model ID: " CUSTOM_MODEL; MODEL_ID="${CUSTOM_MODEL}" ;;
  *) MODEL_ID="claude-sonnet-5" ;;
esac

SERVICE_NAME="claude-mcp-sonnet"
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
echo "⚙️ Enabling required GCP APIs (Cloud Run, Cloud Build, Vertex AI / Agent Platform)..."
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
