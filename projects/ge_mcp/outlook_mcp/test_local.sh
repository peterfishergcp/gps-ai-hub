#!/bin/bash

echo "🚀 Starting local Outlook MCP Server on port 3006 for validation..."

# Run server on an isolated port in background
PORT=3006 node index.js &
SERVER_PID=$!

# Give the server 2 seconds to bind
sleep 2

echo "--------------------------------------------------"
echo "🧪 1. Validating Tool Discovery (tools/list)..."
curl -s -X POST http://localhost:3006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'

echo ""
echo "--------------------------------------------------"
echo "🧪 2. Validating Action Execution (query_messages_lookup)..."
curl -s -X POST http://localhost:3006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 2, "params": {"name": "query_messages_lookup", "arguments": {"query": "project", "top": 5}}}'

echo ""
echo "--------------------------------------------------"
echo "🧪 3. Validating Action Execution (query_calendar_events_lookup)..."
curl -s -X POST http://localhost:3006/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "id": 3, "params": {"name": "query_calendar_events_lookup", "arguments": {"top": 5}}}'

echo ""
echo "--------------------------------------------------"
echo "🧪 4. Validating OAuth Registration Endpoints (/auth & /token)..."
echo "--- /auth Redirect Headers ---"
curl -s -I "http://localhost:3006/auth?redirect_uri=https://console.cloud.google.com&state=123" | grep -E "(HTTP/|Location)"
echo "--- /token Response Payload ---"
curl -s "http://localhost:3006/token"

echo ""
echo "--------------------------------------------------"
echo "🧹 Cleaning up server background process (PID: $SERVER_PID)..."
kill $SERVER_PID
echo "✅ Validation complete!"
