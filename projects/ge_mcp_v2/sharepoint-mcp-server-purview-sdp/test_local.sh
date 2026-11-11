#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

PORT="${TEST_PORT:-28087}"
BASE_URL="http://127.0.0.1:${PORT}"
LOG_FILE="$(mktemp)"

HOST=127.0.0.1 PORT="${PORT}" DOTENV_CONFIG_PATH=/dev/null ALLOW_LOCAL_MOCK_AUTH="true" ALLOW_APP_CREDENTIALS="false" node index.js >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

cleanup() {
  kill "${SERVER_PID}" >/dev/null 2>&1 || true
  wait "${SERVER_PID}" >/dev/null 2>&1 || true
  rm -f "${LOG_FILE}"
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

echo "[1/6] Verifying HTTP 401 on unauthenticated POST /mcp..."
UNAUTH="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${BASE_URL}/mcp" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')"
[ "${UNAUTH}" = "401" ] || { echo "Expected 401, got ${UNAUTH}"; exit 1; }

echo "[2/6] Verifying v2.0 initialize capabilities (SEP-2640 Skills + SEP-1865 MCP Apps)..."
python3 - "${BASE_URL}" << 'PY'
import hashlib, json, sys, urllib.request

base = sys.argv[1]

def rpc(method, params=None):
    req = urllib.request.Request(
        f"{base}/mcp",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "Authorization": "Bearer local-test-token-0000",
        },
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}).encode(),
    )
    raw = urllib.request.urlopen(req, timeout=10).read().decode()
    for line in raw.splitlines():
        if line.startswith("data: "):
            raw = line[6:]
            break
    return json.loads(raw)

init_res = rpc("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "smoke", "version": "2.0"}})
caps = init_res["result"]["capabilities"]
assert "resources" in caps and "tools" in caps, caps
assert caps["extensions"]["io.modelcontextprotocol/skills"]["directoryRead"] is True, caps
assert "text/html;profile=mcp-app" in caps["extensions"]["io.modelcontextprotocol/ui"]["mimeTypes"], caps

# 3. Verify SEP-2640 skills/list, skills/get, resources/directory/read, and SHA-256 integrity
skills_res = rpc("skills/list")
assert skills_res["result"]["resultType"] == "complete", skills_res
skills = skills_res["result"]["skills"]
assert any(s["uri"] == "skill://purview-sdp-enforcement/SKILL.md" for s in skills), skills
target_skill = next(s for s in skills if s["uri"] == "skill://purview-sdp-enforcement/SKILL.md")
manifest_entry = next(r for r in target_skill["resources"] if r["uri"] == "skill://purview-sdp-enforcement/SKILL.md")

get_res = rpc("skills/get", {"uri": "skill://purview-sdp-enforcement/SKILL.md"})
assert get_res["result"]["skill"]["frontmatter"]["name"] == target_skill["frontmatter"]["name"], get_res

missing_skill = rpc("skills/get", {"uri": "skill://nonexistent/SKILL.md"})
assert missing_skill["error"]["code"] == -32602, missing_skill

dir_res = rpc("resources/directory/read", {"uri": "skill://purview-sdp-enforcement"})
assert any(r["mimeType"] == "inode/directory" and r["name"] == "references" for r in dir_res["result"]["resources"]), dir_res

read_skill = rpc("resources/read", {"uri": "skill://purview-sdp-enforcement/SKILL.md"})
skill_text = read_skill["result"]["contents"][0]["text"]
raw_bytes = skill_text.encode("utf-8")
assert len(raw_bytes) == manifest_entry["size"], (len(raw_bytes), manifest_entry["size"])
assert "sha256:" + hashlib.sha256(raw_bytes).hexdigest() == manifest_entry["digest"], "SHA-256 mismatch!"

# 4. Verify SEP-1865 MCP App resource & Dual-Delivery launcher tool (and zero innerHTML sinks!)
read_app = rpc("resources/read", {"uri": "ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html"})
app_content = read_app["result"]["contents"][0]
assert app_content["mimeType"] == "text/html;profile=mcp-app", app_content
assert "ui/initialize" in app_content["text"], "Missing SEP-1865 ui/initialize bridge!"
assert "innerHTML" not in app_content["text"], "Forbidden innerHTML sink found in MCP App!"

launch_res = rpc("tools/call", {"name": "open_purview_sdp_governance_matrix", "arguments": {}})
blocks = launch_res["result"]["content"]
assert any(b.get("type") == "resource" and b["resource"]["uri"] == "ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html" for b in blocks), blocks
assert "structuredContent" in launch_res["result"], launch_res
PY

echo "v2/sharepoint-mcp-server-purview-sdp SEP-2640 Skills + SEP-1865 MCP Apps + Security smoke tests passed."
