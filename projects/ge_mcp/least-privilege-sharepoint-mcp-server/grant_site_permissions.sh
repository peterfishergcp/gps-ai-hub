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

# ============================================================================
# Grant / Inspect / Revoke Microsoft Entra ID "Sites.Selected" Read Permission
# on a Specific SharePoint Site via Microsoft Graph REST API
#
# Prerequisites:
#   1. Your target MCP App Registration (TARGET_APP_CLIENT_ID) has been granted:
#      Microsoft Graph -> Application permissions -> Sites.Selected (Admin Consented)
#   2. To run THIS one-time admin script, you need an Admin token (ADMIN_BEARER_TOKEN)
#      obtained from Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer)
#      or Azure CLI (`az account get-access-token --resource-type ms-graph --query accessToken -o tsv`)
#      signed in as a SharePoint Admin / Global Admin with `Sites.FullControl.All`.
# ============================================================================
set -euo pipefail

ACTION="${1:-help}"
SITE_URL_OR_PATH="${2:-}"
TARGET_APP_CLIENT_ID="${3:-${MS_GRAPH_CLIENT_ID:-}}"
TARGET_APP_DISPLAY_NAME="${4:-Least-Privilege SharePoint MCP Server}"

if [[ "$ACTION" == "help" || -z "$SITE_URL_OR_PATH" ]]; then
  cat <<EOF
Usage:
  export ADMIN_BEARER_TOKEN="<admin-graph-access-token-with-Sites.FullControl.All>"

  # 1. Grant READ-ONLY ('read') permission on a specific SharePoint site to your MCP App:
  ./grant_site_permissions.sh grant "https://your-tenant.sharepoint.com/sites/Finance" "<TARGET_APP_CLIENT_ID>" "Least-Privilege SharePoint MCP"

  # 2. List all app permissions currently granted on a specific SharePoint site:
  ./grant_site_permissions.sh list "https://your-tenant.sharepoint.com/sites/Finance"

  # 3. Revoke an app permission ID from a specific SharePoint site:
  ./grant_site_permissions.sh revoke "https://your-tenant.sharepoint.com/sites/Finance" "<PERMISSION_ID>"
EOF
  exit 0
fi

if [[ -z "${ADMIN_BEARER_TOKEN:-}" ]]; then
  echo "❌ Error: ADMIN_BEARER_TOKEN environment variable is required."
  echo "   Tip: Run 'az account get-access-token --resource-type ms-graph --query accessToken -o tsv'"
  echo "   or copy your token from Microsoft Graph Explorer (https://developer.microsoft.com/en-us/graph/graph-explorer)."
  exit 1
fi

# Convert full URL (https://your-tenant.sharepoint.com/sites/Finance) to Graph path (your-tenant.sharepoint.com:/sites/Finance)
if [[ "$SITE_URL_OR_PATH" =~ ^https?://([^/]+)(/.+)$ ]]; then
  GRAPH_SITE_SPEC="${BASH_REMATCH[1]}:${BASH_REMATCH[2]%/}"
else
  GRAPH_SITE_SPEC="$SITE_URL_OR_PATH"
fi

echo "🔍 Resolving SharePoint site: $GRAPH_SITE_SPEC ..."
SITE_JSON=$(curl -sS -f -H "Authorization: Bearer $ADMIN_BEARER_TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/${GRAPH_SITE_SPEC}?\$select=id,displayName,webUrl")

SITE_ID=$(echo "$SITE_JSON" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("id", ""))')
SITE_NAME=$(echo "$SITE_JSON" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("displayName", ""))')
SITE_WEB_URL=$(echo "$SITE_JSON" | python3 -c 'import sys, json; print(json.load(sys.stdin).get("webUrl", ""))')

if [[ -z "$SITE_ID" ]]; then
  echo "❌ Failed to resolve site ID. Response: $SITE_JSON"
  exit 1
fi

echo "✅ Resolved Site: $SITE_NAME ($SITE_WEB_URL)"
echo "   Canonical Graph Site ID: $SITE_ID"

case "$ACTION" in
  list)
    echo "📋 Listing Sites.Selected permissions on '$SITE_NAME'..."
    curl -sS -H "Authorization: Bearer $ADMIN_BEARER_TOKEN" \
      "https://graph.microsoft.com/v1.0/sites/${SITE_ID}/permissions" | python3 -m json.tool
    ;;

  grant)
    if [[ -z "$TARGET_APP_CLIENT_ID" ]]; then
      echo "❌ Error: TARGET_APP_CLIENT_ID is required for 'grant'."
      exit 1
    fi
    echo "🔒 Granting least-privilege READ-ONLY ('read') permission on '$SITE_NAME' to App ID: $TARGET_APP_CLIENT_ID ..."
    PAYLOAD=$(python3 -c '
import sys, json
print(json.dumps({
  "roles": ["read"],
  "grantedToIdentities": [{
    "application": {
      "id": sys.argv[1],
      "displayName": sys.argv[2]
    }
  }]
}))
' "$TARGET_APP_CLIENT_ID" "$TARGET_APP_DISPLAY_NAME")

    curl -sS -X POST "https://graph.microsoft.com/v1.0/sites/${SITE_ID}/permissions" \
      -H "Authorization: Bearer $ADMIN_BEARER_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" | python3 -m json.tool
    echo "✅ Done! Your Entra ID app now has read-only access to '$SITE_WEB_URL'."
    ;;

  revoke)
    PERMISSION_ID="$TARGET_APP_CLIENT_ID"
    if [[ -z "$PERMISSION_ID" ]]; then
      echo "❌ Error: PERMISSION_ID is required as the 3rd argument for 'revoke'."
      exit 1
    fi
    echo "🗑️ Revoking permission ID '$PERMISSION_ID' from '$SITE_NAME'..."
    curl -sS -X DELETE "https://graph.microsoft.com/v1.0/sites/${SITE_ID}/permissions/${PERMISSION_ID}" \
      -H "Authorization: Bearer $ADMIN_BEARER_TOKEN"
    echo "✅ Permission '$PERMISSION_ID' revoked."
    ;;

  *)
    echo "❌ Unknown action '$ACTION'. Use 'grant', 'list', or 'revoke'."
    exit 1
    ;;
esac
