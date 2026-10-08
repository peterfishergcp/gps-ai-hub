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

DRIVE_NAME="${SHAREPOINT_DRIVE_ID:-Documents}"

echo "🚀 Starting local SharePoint MCP Server on port 3009 to test Purview label extraction..."

PORT=3009 node index.js &
SERVER_PID=$!

sleep 2

echo "--------------------------------------------------"
echo "📂 Listing documents with Purview sensitivity labels (Drive: $DRIVE_NAME)..."
curl -s -X POST http://localhost:3009/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "{\"jsonrpc\": \"2.0\", \"method\": \"tools/call\", \"id\": 1, \"params\": {\"name\": \"query_library_items_lookup\", \"arguments\": {\"driveId\": \"$DRIVE_NAME\"}}}" | python3 -m json.tool

echo ""
echo "--------------------------------------------------"
kill $SERVER_PID
echo "✅ Purview label extraction test complete!"
