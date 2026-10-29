#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-18085}"
BASE_URL="http://127.0.0.1:${PORT}"

DOTENV_CONFIG_PATH=/dev/null \
HOST=127.0.0.1 \
PORT="${PORT}" \
ALLOW_LOCAL_MOCK_AUTH="true" \
ALLOW_APP_CREDENTIALS="true" \
MCP_OAUTH_CLIENT_ID="test-client-id" \
MCP_OAUTH_CLIENT_SECRET="test-client-secret-0123456789" \
ALLOWED_SHAREPOINT_SITES="https://example.sharepoint.com/sites/Finance" \
node index.js >/tmp/least_priv_sp_test.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 25); do
  if curl -fsS "${BASE_URL}/healthz" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "[1/6] Verifying unauthenticated & 'Bearer mock' requests return HTTP 401..."
CODE1="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
CODE2="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer mock' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
[ "${CODE1}" = "401" ] && [ "${CODE2}" = "401" ] || { echo "Expected 401/401, got ${CODE1}/${CODE2}"; exit 1; }

echo "[2/6] Verifying *.googleusercontent.com redirect_uri is rejected with HTTP 400 (S-04)..."
GCODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/auth?redirect_uri=https://evil-app.googleusercontent.com/cb&client_id=test-client-id")"
[ "${GCODE}" = "400" ] || { echo "Expected 400, got ${GCODE}"; exit 1; }

echo "[3/6] Verifying malformed URI %E0%A4%A returns HTTP 400 without crashing server (S-10)..."
MCODE="$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "${BASE_URL}/%E0%A4%A")"
[ "${MCODE}" = "400" ] || { echo "Expected 400, got ${MCODE}"; exit 1; }

echo "[4/6] Verifying signed /auth -> /token -> mcp_st_ session handshake..."
REDIRECT_LOC="$(curl -s -D - -o /dev/null "${BASE_URL}/auth?redirect_uri=https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html&state=xyz&client_id=test-client-id" | awk 'tolower($1)=="location:" {print $2}' | tr -d '\r')"
AUTH_CODE="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.parse_qs(urllib.parse.urlparse(sys.argv[1]).query)["code"][0])' "${REDIRECT_LOC}")"
TOKEN_JSON="$(curl -fsS -X POST "${BASE_URL}/token" \
  -d "grant_type=authorization_code&code=${AUTH_CODE}&client_id=test-client-id&client_secret=test-client-secret-0123456789")"
SESSION_TOKEN="$(python3 -c 'import sys, json; print(json.loads(sys.argv[1])["access_token"])' "${TOKEN_JSON}")"

echo "[5/6] Verifying 7 strictly read-only tools via signed session token..."
TOOLS_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
python3 - "${TOOLS_JSON}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
tools = data["result"]["tools"]
assert len(tools) == 7, len(tools)
for t in tools:
    assert t["annotations"]["readOnlyHint"] is True, t["name"]
    assert t["annotations"]["destructiveHint"] is False, t["name"]
PY

echo "[6/6] Verifying ALLOWED_SHAREPOINT_SITES fail-closed site guard..."
DENY_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_document_libraries_lookup","arguments":{"siteId":"UnauthorizedSite"}}}')"
python3 - "${DENY_JSON}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
assert data["result"]["isError"] is True, data
assert "Least-Privilege Access Denied" in data["result"]["content"][0]["text"], data
PY

echo "least-privilege-sharepoint-mcp-server smoke tests passed."
