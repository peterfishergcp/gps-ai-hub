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


echo "🚀 Starting local SharePoint MCP Server on port 3005 for validation..."

# Run server on an isolated port in background
PORT=3005 node index.js &
SERVER_PID=$!

# Give the server 2 seconds to bind
sleep 2

echo "--------------------------------------------------"
echo "🧪 1. Validating Tool Discovery (tools/list)..."
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

echo ""
echo "--------------------------------------------------"
echo "🧪 2. Validating Action Execution (search_sharepoint_sites)..."
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 2, "params": {"name": "search_sharepoint_sites", "arguments": {"query": "Finance"}}}'

echo ""
echo "--------------------------------------------------"
echo "🧪 3. Validating Action Execution (list_document_libraries)..."
curl -s -X POST http://localhost:3005/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 3, "params": {"name": "list_document_libraries", "arguments": {"siteId": "syc52.sharepoint.com"}}}'

echo ""
echo "--------------------------------------------------"
echo "🧪 4. Validating OAuth Registration Endpoints (/auth & /token)..."
echo "--- /auth Redirect Headers ---"
curl -s -I "http://localhost:3005/auth?redirect_uri=https://console.cloud.google.com&state=123" | grep -E "(HTTP/|Location)"
echo "--- /token Response Payload ---"
curl -s "http://localhost:3005/token"

echo ""
echo "--------------------------------------------------"
echo "🧹 Cleaning up server background process (PID: $SERVER_PID)..."
kill $SERVER_PID
echo "✅ Validation complete!"
