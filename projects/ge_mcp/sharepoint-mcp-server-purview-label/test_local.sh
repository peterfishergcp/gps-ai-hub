#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-18086}"
BASE_URL="http://127.0.0.1:${PORT}"

DOTENV_CONFIG_PATH=/dev/null \
HOST=127.0.0.1 \
PORT="${PORT}" \
ALLOW_LOCAL_MOCK_AUTH="true" \
ALLOW_APP_CREDENTIALS="false" \
node index.js >/tmp/sp_purview_label_test.log 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in $(seq 1 25); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "[1/4] Verifying unauthenticated /mcp returns HTTP 401..."
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
[ "${CODE}" = "401" ] || { echo "Expected 401, got ${CODE}"; exit 1; }

echo "[2/4] Verifying /auth open redirect protection (HTTP 400)..."
RCODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/auth?redirect_uri=data:text/html,boom")"
[ "${RCODE}" = "400" ] || { echo "Expected 400, got ${RCODE}"; exit 1; }

echo "[3/4] Verifying 12 tools & required itemId schemas..."
TOOLS_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
python3 - "${TOOLS_JSON}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
assert len(data["result"]["tools"]) == 12
PY

echo "[4/4] Verifying MSIP label keys (msip_labels + assigned_labels) on restricted document..."
LABEL_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_file_content_lookup","arguments":{"itemId":"Restricted_Policy.docx"}}}')"
python3 - "${LABEL_JSON}" << 'PY'
import json, sys
outer = json.loads(sys.argv[1])
inner = json.loads(outer["result"]["content"][0]["text"])
assert "MSIP_Label_11111111-2222-3333-4444-555555555555_Enabled=True" in inner["msip_labels"], inner
assert inner["assigned_labels"][0]["labelId"] == "11111111-2222-3333-4444-555555555555", inner
assert inner["assigned_sensitivity_labels"][0]["labelId"] == "11111111-2222-3333-4444-555555555555", inner
PY

echo "sharepoint-mcp-server-purview-label smoke tests passed."
