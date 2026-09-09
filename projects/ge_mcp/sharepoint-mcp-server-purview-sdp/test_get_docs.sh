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


echo "🚀 Starting local SharePoint MCP Server on port 3006 to retrieve documents..."

PORT=3006 node index.js &
SERVER_PID=$!

sleep 2

echo "--------------------------------------------------"
echo "📂 Listing actual documents inside your primary library..."
curl -s -X POST http://localhost:3006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 1, "params": {"name": "list_library_items", "arguments": {"driveId": "b!GoeAD3cKwE6Q2hd5Lx6X-tqk4QlBHuBCrNVC-wS2hsPZ9eOIUturSLuj_L4R9y4t"}}}'

echo ""
echo "--------------------------------------------------"
kill $SERVER_PID
echo "✅ Document retrieval test complete!"
