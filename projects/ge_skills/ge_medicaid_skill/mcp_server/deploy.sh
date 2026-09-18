#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-ai-hub-459714}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="medicaid-fraud-bq-mcp"

echo "======================================================================"
echo "Deploying Medicaid Fraud BigQuery BYO MCP Server to Cloud Run"
echo "Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE_NAME"
echo "======================================================================"

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT_ID},BQ_DATASET_ID=frauddector" \
  --memory 512Mi \
  --cpu 1

echo "======================================================================"
echo "Deployment complete!"
echo "Use the Service URL above when registering your BYO MCP Connector in Gemini Enterprise:"
echo "  - Streamable HTTP MCP Endpoint: <Service_URL>/mcp"
echo "  - Authorization URL:            <Service_URL>/auth"
echo "  - Token URL:                    <Service_URL>/token"
echo "======================================================================"
