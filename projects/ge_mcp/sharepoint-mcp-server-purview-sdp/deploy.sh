#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.


# Configuration
SERVICE_NAME="sharepoint-mcp-purview-sdp"
REGION="us-central1"
PROJECT_ID="${GCP_PROJECT:-<INSERT_YOUR_PROJECT_ID>}"
SDP_CONTENT_POLICY="${SDP_CONTENT_POLICY:-projects/<INSERT_YOUR_PROJECT_ID>/locations/us/contentPolicies/<INSERT_YOUR_POLICY_NAME>}"
PURVIEW_LABEL_GUID="${PURVIEW_LABEL_GUID:-27c86af4-afb5-4c50-9816-2f0e144288d0}"

# Load environment variables from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

echo "🚀 Starting deployment of $SERVICE_NAME to Cloud Run ($REGION) in project $PROJECT_ID..."

# Build and deploy
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --port 3000 \
  --project "$PROJECT_ID" \
  --set-env-vars "MS_GRAPH_TENANT_ID=$MS_GRAPH_TENANT_ID,MS_GRAPH_CLIENT_ID=$MS_GRAPH_CLIENT_ID,MS_GRAPH_CLIENT_SECRET=$MS_GRAPH_CLIENT_SECRET,SHAREPOINT_INSTANCE_URL=$SHAREPOINT_INSTANCE_URL,SDP_CONTENT_POLICY=$SDP_CONTENT_POLICY,PURVIEW_LABEL_GUID=$PURVIEW_LABEL_GUID"

echo "✅ Deployment complete!"
