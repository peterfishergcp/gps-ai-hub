#!/bin/bash

# Configuration
SERVICE_NAME="customize-outlook-mcp-server"
REGION="us-central1"

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🚀 Starting deployment of $SERVICE_NAME to Cloud Run..."

# Build and deploy
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 3000 \
  --project <INSERTYOURPROJECT_ID> \
  --set-env-vars "MS_GRAPH_TENANT_ID=$MS_GRAPH_TENANT_ID,MS_GRAPH_CLIENT_ID=$MS_GRAPH_CLIENT_ID,MS_GRAPH_CLIENT_SECRET=$MS_GRAPH_CLIENT_SECRET,MS_GRAPH_USER_PRINCIPAL_NAME=$MS_GRAPH_USER_PRINCIPAL_NAME"

echo "✅ Deployment complete!"
