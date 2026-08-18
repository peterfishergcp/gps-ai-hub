#!/bin/bash

# Configuration
SERVICE_NAME="customize-sharepoint-mcp-w-sdp"
REGION="us-central1"
PROJECT_ID="ai-hub-459714"

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🚀 Starting deployment of $SERVICE_NAME to Cloud Run project $PROJECT_ID..."

# Build and deploy
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 3000 \
  --project "$PROJECT_ID" \
  --set-env-vars "MS_GRAPH_TENANT_ID=$MS_GRAPH_TENANT_ID,MS_GRAPH_CLIENT_ID=$MS_GRAPH_CLIENT_ID,MS_GRAPH_CLIENT_SECRET=$MS_GRAPH_CLIENT_SECRET,SHAREPOINT_INSTANCE_URL=$SHAREPOINT_INSTANCE_URL,SDP_CONTENT_POLICY=projects/ai-hub-459714/locations/us/contentPolicies/purview_cepf"

echo "✅ Deployment complete!"
