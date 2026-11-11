#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-18082}"
BASE_URL="http://127.0.0.1:${PORT}"

DOTENV_CONFIG_PATH=/dev/null \
HOST=127.0.0.1 \
PORT="${PORT}" \
ALLOW_LOCAL_MOCK_AUTH="true" \
ALLOW_APP_CREDENTIALS="false" \
node index.js >/tmp/outlook_mcp_test.log 2>&1 &
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

echo "[1/5] Verifying unauthenticated POST /mcp returns HTTP 401..."
UNAUTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
[ "${UNAUTH_CODE}" = "401" ] || { echo "Expected 401, got ${UNAUTH_CODE}"; exit 1; }

echo "[2/5] Verifying open redirect on /auth is blocked (HTTP 400)..."
REDIR_CODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/auth?redirect_uri=https://evil.example.com/cb&state=abc")"
[ "${REDIR_CODE}" = "400" ] || { echo "Expected 400 for untrusted redirect_uri, got ${REDIR_CODE}"; exit 1; }

echo "[3/5] Verifying tools/list annotations (destructiveHint on write tools)..."
TOOLS_RESP="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')"
python3 - "${TOOLS_RESP}" << 'PY'
import json, sys
raw = sys.argv[1]
for line in raw.splitlines():
    if line.startswith("data: "):
        raw = line[6:]
        break
data = json.loads(raw)
tools = {t["name"]: t for t in data["result"]["tools"]}
assert len(tools) == 6, tools.keys()
assert tools["send_mail_action_lookup"]["annotations"]["destructiveHint"] is True
assert tools["create_event_action_lookup"]["annotations"]["destructiveHint"] is True
assert tools["query_recent_emails_lookup"]["annotations"]["readOnlyHint"] is True
PY

echo "[4/5] Verifying startDateTime & endDateTime wire to /calendarView (C-05)..."
CAL_RESP="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_calendar_events_lookup","arguments":{"startDateTime":"2026-03-01T00:00:00Z","endDateTime":"2026-03-31T23:59:59Z","sortOrder":"desc"}}}')"
python3 - "${CAL_RESP}" << 'PY'
import json, sys
raw = sys.argv[1]
for line in raw.splitlines():
    if line.startswith("data: "):
        raw = line[6:]
        break
outer = json.loads(raw)
inner = json.loads(outer["result"]["content"][0]["text"])
assert "/calendarView?" in inner["url"], inner
assert "startDateTime=2026-03-01T00%3A00%3A00Z" in inner["url"], inner
assert "endDateTime=2026-03-31T23%3A59%3A59Z" in inner["url"], inner
PY

echo "[5/5] Verifying OData injection & invalid sortOrder rejection (S-08)..."
BAD_SORT="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"query_calendar_events_lookup","arguments":{"sortOrder":"asc;$top=999"}}}')"
python3 - "${BAD_SORT}" << 'PY'
import json, sys
raw = sys.argv[1]
for line in raw.splitlines():
    if line.startswith("data: "):
        raw = line[6:]
        break
outer = json.loads(raw)
assert outer["result"]["isError"] is True, outer
PY

echo "customize_outlook_mcp smoke tests passed."
