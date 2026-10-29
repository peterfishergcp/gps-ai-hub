#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-18081}"
BASE_URL="http://127.0.0.1:${PORT}"

HOST=127.0.0.1 \
PORT="${PORT}" \
PROJECT_ID="example-project-12345" \
REGION="global" \
DEFAULT_MODEL="claude-sonnet-4-6" \
ALLOW_LOCAL_MOCK_AUTH="true" \
ALLOW_ADC_FALLBACK="false" \
node index.mjs >/tmp/claude_mcp_test.log 2>&1 &
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

echo "[1/5] Verifying scrubbed /health endpoint..."
HEALTH_JSON="$(curl -fsS "${BASE_URL}/health")"
python3 - "${HEALTH_JSON}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
assert data.get("status") == "ok", data
assert "project" not in data, f"Project ID leaked in /health: {data}"
PY

echo "[2/5] Verifying unauthenticated POST /mcp is rejected with HTTP 401..."
UNAUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
if [ "${UNAUTH_CODE}" != "401" ]; then
  echo "Expected HTTP 401 for unauthenticated /mcp, got ${UNAUTH_CODE}"
  exit 1
fi

echo "[3/5] Verifying authenticated tools/list..."
TOOLS_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
python3 - "${TOOLS_JSON}" << 'PY'
import json, sys
data = json.loads(sys.argv[1])
tools = data["result"]["tools"]
assert len(tools) == 1 and tools[0]["name"] == "ask_claude", tools
assert tools[0]["inputSchema"]["properties"]["max_tokens"]["maximum"] == 8192
PY

echo "[4/5] Verifying server-side max_tokens clamp (999999 -> 8192)..."
CALL_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ask_claude","arguments":{"prompt":"Hello","max_tokens":999999}}}')"
python3 - "${CALL_JSON}" << 'PY'
import json, sys
outer = json.loads(sys.argv[1])
inner = json.loads(outer["result"]["content"][0]["text"])
assert inner["clamped_max_tokens"] == 8192, inner
PY

echo "[5/5] Verifying model path-traversal rejection..."
BAD_MODEL_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"ask_claude","arguments":{"prompt":"Hello","model":"../../other"}}}')"
python3 - "${BAD_MODEL_JSON}" << 'PY'
import json, sys
outer = json.loads(sys.argv[1])
assert outer["result"]["isError"] is True, outer
PY

echo "claude_mcp_sonnet smoke tests passed."
