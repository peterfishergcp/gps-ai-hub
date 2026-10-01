#!/bin/bash
set -euo pipefail

echo "🚀 Starting local Least-Privilege SharePoint MCP Server on 127.0.0.1:3007 for validation..."

# Start with sample ALLOWED_SHAREPOINT_SITES and dummy token for local policy & schema verification
HOST=127.0.0.1 \
PORT=3007 \
MS_GRAPH_ACCESS_TOKEN="local_test_token" \
SHAREPOINT_HOSTNAME="your-tenant.sharepoint.com" \
ALLOWED_SHAREPOINT_SITES="https://your-tenant.sharepoint.com/sites/Finance,https://your-tenant.sharepoint.com/sites/HR" \
node index.js &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sleep 2

echo "--------------------------------------------------"
echo "🧪 1. Validating Health Endpoint & Security Headers (/healthz)..."
curl -s -i http://127.0.0.1:3007/healthz | head -n 15

echo ""
echo "--------------------------------------------------"
echo "🧪 2. Validating Read-Only Tool Discovery (tools/list)..."
curl -s -X POST http://127.0.0.1:3007/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

echo ""
echo "--------------------------------------------------"
echo "🧪 3. Validating HTTP Method Allow-List (DELETE should return 405)..."
curl -s -o /dev/null -w "HTTP Status for DELETE: %{http_code}\n" -X DELETE http://127.0.0.1:3007/mcp

echo ""
echo "--------------------------------------------------"
echo "🧪 4. Validating OAuth Helper Endpoints (/auth open-redirect protection & /token)..."
curl -s -o /dev/null -w "Trusted Google Console redirect HTTP Status: %{http_code}\n" \
  "http://127.0.0.1:3007/auth?redirect_uri=https://console.cloud.google.com/vertex-ai&state=abc"
curl -s -o /dev/null -w "Untrusted external redirect HTTP Status (expected 400): %{http_code}\n" \
  "http://127.0.0.1:3007/auth?redirect_uri=https://evil.example.com/callback&state=abc"
echo "--- /token Response Payload ---"
curl -s "http://127.0.0.1:3007/token"

echo ""
echo "--------------------------------------------------"
echo "✅ Local validation complete!"
