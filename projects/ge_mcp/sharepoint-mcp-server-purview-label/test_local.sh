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

echo "🚀 Starting local SharePoint MCP Server on port 3008 for validation..."

PORT=3008 node index.js &
SERVER_PID=$!

sleep 2

echo "--------------------------------------------------"
echo "🧪 1. Validating Health Endpoint..."
curl -s http://localhost:3008/health | python3 -m json.tool

echo ""
echo "--------------------------------------------------"
echo "🧪 2. Validating Tool Discovery (tools/list)..."
curl -s -X POST http://localhost:3008/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}' | python3 -m json.tool

echo ""
echo "--------------------------------------------------"
echo "🧹 Cleaning up server background process (PID: $SERVER_PID)..."
kill $SERVER_PID
echo "✅ Validation complete!"
