#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-18087}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "[1/6] Unit-testing CWE-918 SDP_CONTENT_POLICY URL allowlist & MASK redaction..."
DOTENV_CONFIG_PATH=/dev/null node - << 'JS'
const assert = require("assert");
const { resolveAllowedPolicyUrl, evaluateSdpVerdict } = require("./index.js");

assert.strictEqual(
  resolveAllowedPolicyUrl("projects/my-proj/locations/us/contentPolicies/pol1"),
  "https://dlp.googleapis.com/v2/projects/my-proj/locations/us/contentPolicies/pol1"
);
assert.strictEqual(
  resolveAllowedPolicyUrl("https://storage.googleapis.com/my-bucket/policy.json"),
  "https://storage.googleapis.com/my-bucket/policy.json"
);
assert.throws(() => resolveAllowedPolicyUrl("https://evil.example/steal-token"), /Blocked untrusted/);
assert.throws(() => resolveAllowedPolicyUrl("http://storage.googleapis.com/insecure"), /Blocked untrusted/);

const blocked = evaluateSdpVerdict({
  itemData: { name: "Payroll.docx" },
  extractedText: "Employee SSN: 123-45-6789",
  labelInfo: null,
});
assert.strictEqual(blocked.blocked, true);
assert(!blocked.content.includes("123-45-6789"), "SSN leaked in BLOCK response!");
JS

DOTENV_CONFIG_PATH=/dev/null \
HOST=127.0.0.1 \
PORT="${PORT}" \
ALLOW_LOCAL_MOCK_AUTH="true" \
ALLOW_APP_CREDENTIALS="false" \
node index.js >/tmp/sp_purview_sdp_test.log 2>&1 &
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

echo "[2/6] Verifying /health does NOT leak SDP policy, GUIDs, regexes, or project ID (S-07)..."
HEALTH_JSON="$(curl -fsS "${BASE_URL}/health")"
python3 - "${HEALTH_JSON}" << 'PY'
import json, sys
h = json.loads(sys.argv[1])
assert set(h.keys()) == {"status", "service", "version"}, h
PY

echo "[3/6] Verifying unauthenticated /mcp returns HTTP 401 (S-01)..."
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
[ "${CODE}" = "401" ] || { echo "Expected 401, got ${CODE}"; exit 1; }

echo "[4/6] Verifying /auth open redirect protection returns HTTP 400 (S-04)..."
RCODE="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/auth?redirect_uri=javascript:alert(1)")"
[ "${RCODE}" = "400" ] || { echo "Expected 400, got ${RCODE}"; exit 1; }

echo "[5/6] Verifying fail-closed BLOCK verdict withholds cleartext AND emits msip_labels + assigned_labels (S-07)..."
BLOCK_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_file_content_lookup","arguments":{"itemId":"Restricted_Source_Selection.docx"}}}')"
python3 - "${BLOCK_JSON}" << 'PY'
import json, sys
outer = json.loads(sys.argv[1])
inner = json.loads(outer["result"]["content"][0]["text"])
assert inner["blocked"] is True, inner
assert "ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY" in inner["content"], inner
assert "123-45-6789" not in inner["content"], "Sensitive SSN leaked!"
assert "SEE FAR 2.101" not in inner["content"], "Source Selection text leaked!"
assert "MSIP_Label_11111111-2222-3333-4444-555555555555_Enabled=True" in inner["msip_labels"], inner
assert inner["assigned_labels"][0]["labelId"] == "11111111-2222-3333-4444-555555555555", inner
PY

echo "[6/6] Verifying benign document ALLOW path returns clean content..."
ALLOW_JSON="$(curl -fsS -X POST "${BASE_URL}/mcp" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Authorization: Bearer local-test-token-0000' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"query_file_content_lookup","arguments":{"itemId":"Public_Quarterly_Summary.docx"}}}')"
python3 - "${ALLOW_JSON}" << 'PY'
import json, sys
outer = json.loads(sys.argv[1])
inner = json.loads(outer["result"]["content"][0]["text"])
assert inner.get("blocked") is None, inner
assert "Cloud modernization milestones" in inner["content"], inner
PY

echo "sharepoint-mcp-server-purview-sdp smoke tests passed."
