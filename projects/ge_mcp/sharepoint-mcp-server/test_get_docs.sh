#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

DRIVE_ID="${SHAREPOINT_DRIVE_ID:-Documents}"
BEARER_TOKEN="${MS_GRAPH_DELEGATED_TOKEN:?Set MS_GRAPH_DELEGATED_TOKEN to test live SharePoint document listing}"
PORT="${TEST_PORT:-13006}"

HOST=127.0.0.1 PORT="${PORT}" node index.js >/tmp/sp_get_docs.log 2>&1 &
SERVER_PID=$!
trap 'kill "${SERVER_PID}" >/dev/null 2>&1 || true' EXIT

sleep 1
curl -fsS -X POST "http://127.0.0.1:${PORT}/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer ${BEARER_TOKEN}" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"id\":1,\"params\":{\"name\":\"query_library_items_lookup\",\"arguments\":{\"driveId\":\"${DRIVE_ID}\"}}}" | python3 -m json.tool
