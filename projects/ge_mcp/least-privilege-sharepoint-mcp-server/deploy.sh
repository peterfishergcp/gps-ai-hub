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

set -euo pipefail

# Configuration
SERVICE_NAME="${SERVICE_NAME:-least-privilege-sharepoint-mcp-server}"
REGION="${REGION:-us-central1}"
PROJECT_ID="${GCP_PROJECT:-<INSERTYOURPROJECT_ID>}"

# Load environment variables from .env if it exists
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ "$PROJECT_ID" == "<INSERTYOURPROJECT_ID>" && -n "${GCP_PROJECT:-}" ]]; then
  PROJECT_ID="$GCP_PROJECT"
fi

if [[ -z "${MS_GRAPH_TENANT_ID:-}" || -z "${MS_GRAPH_CLIENT_ID:-}" || -z "${MS_GRAPH_CLIENT_SECRET:-}" || -z "${ALLOWED_SHAREPOINT_SITES:-}" ]]; then
  echo "❌ Missing required environment variables. Please set in .env or environment:"
  echo "   - MS_GRAPH_TENANT_ID"
  echo "   - MS_GRAPH_CLIENT_ID"
  echo "   - MS_GRAPH_CLIENT_SECRET"
  echo "   - ALLOWED_SHAREPOINT_SITES (comma-separated SharePoint site URLs)"
  exit 1
fi

echo "🚀 Starting deployment of $SERVICE_NAME to Cloud Run ($REGION)..."

# Use ^|^ delimiter in --set-env-vars so comma-separated ALLOWED_SHAREPOINT_SITES is preserved intact
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --allow-unauthenticated \
  --port 3000 \
  --quiet \
  --set-env-vars "^|^MS_GRAPH_TENANT_ID=${MS_GRAPH_TENANT_ID}|MS_GRAPH_CLIENT_ID=${MS_GRAPH_CLIENT_ID}|MS_GRAPH_CLIENT_SECRET=${MS_GRAPH_CLIENT_SECRET}|SHAREPOINT_HOSTNAME=${SHAREPOINT_HOSTNAME:-}|ALLOWED_SHAREPOINT_SITES=${ALLOWED_SHAREPOINT_SITES}"

echo "✅ Deployment complete!"
