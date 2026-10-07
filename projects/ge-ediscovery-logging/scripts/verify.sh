#!/usr/bin/env bash
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

# End-to-end read-only health check of the ge-ediscovery-logging deployment.
#
# Usage:
#   scripts/verify.sh [GE_PROJECT_ID]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

P="${1:-${GCP_PROJECT_ID:-}}"
if [ -z "$P" ]; then
  P=$(python3 -c '
import google.auth
try:
    _, proj = google.auth.default()
    print(proj or "")
except Exception:
    pass
' 2>/dev/null || true)
fi

if [ -z "$P" ]; then
  echo "Usage: $0 GE_PROJECT_ID (or export GCP_PROJECT_ID)" >&2
  exit 1
fi

if command -v uv >/dev/null 2>&1; then
  PY_CMD=(uv run python)
else
  PY_CMD=(python3)
fi

"${PY_CMD[@]}" - "$P" <<'PYEOF'
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

project_id = sys.argv[1]
region = os.environ.get("CLOUD_RUN_REGION", "us-central1")
service_name = os.environ.get("CLOUD_RUN_SERVICE", "ge-ediscovery-harvester")
custom_role_id = os.environ.get("CUSTOM_ROLE_ID", "geUserNoDelete")
custom_role_full = f"projects/{project_id}/roles/{custom_role_id}"
dlq_sub = os.environ.get("PUBSUB_DLQ_SUB", "ge-ediscovery-dlq-hold")

ctx = ssl.create_default_context()

def get_token() -> str:
    try:
        import google.auth
        import google.auth.transport.requests
        creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        if not creds.valid:
            creds.refresh(google.auth.transport.requests.Request())
        if creds.token:
            return creds.token
    except Exception:
        pass
    return subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()

token = get_token()
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "X-Goog-User-Project": project_id,
}

def api(method: str, url: str, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}

def ok(msg: str):
    print(f"  [OK]   {msg}")

def warn(msg: str):
    print(f"  [WARN] {msg}")

def fail(msg: str):
    print(f"  [FAIL] {msg}")

print(f"== engines ({project_id})")
for loc in ("global", "us", "eu"):
    host = "discoveryengine.googleapis.com" if loc == "global" else f"{loc}-discoveryengine.googleapis.com"
    url = f"https://{host}/v1alpha/projects/{project_id}/locations/{loc}/collections/default_collection/engines"
    try:
        engines = api("GET", url).get("engines", [])
        for eng in engines:
            eid = eng["name"].rsplit("/", 1)[-1]
            obs = eng.get("observabilityConfig", {})
            if obs.get("observabilityEnabled") and obs.get("sensitiveLoggingEnabled"):
                ok(f"{loc}/{eid}: observabilityEnabled=true, sensitiveLoggingEnabled=true")
            else:
                warn(f"{loc}/{eid}: observabilityConfig={obs}")
    except Exception:
        pass

print("== log sinks")
try:
    sinks = {s["name"]: s for s in api("GET", f"https://logging.googleapis.com/v2/projects/{project_id}/sinks").get("sinks", [])}
    for sname in ("ge-ediscovery-pubsub-sink", "ge-ediscovery-bq-sink"):
        if sname in sinks:
            ok(f"sink {sname} -> {sinks[sname].get('destination')}")
        else:
            fail(f"sink {sname} missing")
except Exception as e:
    fail(f"could not inspect sinks: {e}")

print("== services")
try:
    svc = api("GET", f"https://run.googleapis.com/v2/projects/{project_id}/locations/{region}/services/{service_name}")
    term = svc.get("terminalCondition", {})
    if term.get("state") == "CONDITION_SUCCEEDED":
        ok(f"{service_name} ready ({svc.get('uri')})")
    else:
        warn(f"{service_name} condition: {term}")
except Exception as e:
    fail(f"{service_name} not deployed/ready: {e}")

print("== delivery & dead-letter queue")
try:
    sub_info = api("GET", f"https://pubsub.googleapis.com/v1/projects/{project_id}/subscriptions/ge-ediscovery-push-sub")
    dlp = sub_info.get("deadLetterPolicy", {})
    if dlp.get("deadLetterTopic"):
        ok(f"ge-ediscovery-push-sub deadLetterTopic -> {dlp['deadLetterTopic'].rsplit('/', 1)[-1]} (maxDeliveryAttempts={dlp.get('maxDeliveryAttempts')})")
    else:
        warn("ge-ediscovery-push-sub has no deadLetterPolicy configured")
    pull_resp = api(
        "POST",
        f"https://pubsub.googleapis.com/v1/projects/{project_id}/subscriptions/{dlq_sub}:pull",
        {"returnImmediately": True, "maxMessages": 1},
    )
    msgs = pull_resp.get("receivedMessages", [])
    if not msgs:
        ok(f"dead-letter queue ({dlq_sub}) empty")
    else:
        ack_ids = [m["ackId"] for m in msgs]
        api(
            "POST",
            f"https://pubsub.googleapis.com/v1/projects/{project_id}/subscriptions/{dlq_sub}:modifyAckDeadline",
            {"ackIds": ack_ids, "ackDeadlineSeconds": 0},
        )
        fail(f"dead-letter queue ({dlq_sub}) has messages (run: scripts/replay-dlq.sh {project_id} --peek)")
except urllib.error.HTTPError as e:
    if e.code == 404:
        warn(f"dead-letter subscription {dlq_sub} not yet created")
    else:
        fail(f"DLQ check error: HTTP {e.code}")

print("== custom role & IAM bindings")
try:
    rdesc = api("GET", f"https://iam.googleapis.com/v1/{custom_role_full}")
    perms = set(rdesc.get("includedPermissions", []))
    bad = [x for x in ("discoveryengine.sessions.delete", "discoveryengine.sessions.removeContextFile") if x in perms]
    if bad:
        fail(f"role {custom_role_id} still has {', '.join(bad)}")
    else:
        ok(f"{custom_role_id}: {len(perms)} permissions, no delete permissions (sessions.delete & sessions.removeContextFile removed)")
except urllib.error.HTTPError as e:
    fail(f"custom role {custom_role_full} missing (HTTP {e.code})")

try:
    pol = api("POST", f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy", {"options": {"requestedPolicyVersion": 3}})
    for b in pol.get("bindings", []):
        if b.get("role") in ("roles/discoveryengine.user", custom_role_full):
            rshort = b["role"].rsplit("/", 1)[-1]
            for m in b.get("members", []):
                tag = "[WARN]" if (b["role"] == "roles/discoveryengine.user" and m.startswith("principalSet://")) else "[OK]  "
                print(f"  {tag} {rshort:28s} {m}")
except Exception as e:
    fail(f"IAM policy check failed: {e}")

print("== last 5 archived turns in BigQuery (conversation_turns)")
try:
    q = (
        f"SELECT FORMAT_TIMESTAMP('%Y-%m-%d %H:%M:%S', event_timestamp) AS ts, "
        f"session_id, user_iam_principal, SUBSTR(prompt_text, 1, 55) AS prompt, "
        f"ARRAY_LENGTH(files) AS file_count "
        f"FROM `{project_id}.ge_ediscovery.conversation_turns` "
        f"ORDER BY event_timestamp DESC LIMIT 5"
    )
    qr = api("POST", f"https://bigquery.googleapis.com/bigquery/v2/projects/{project_id}/queries", {"query": q, "useLegacySql": False})
    for row in qr.get("rows", []):
        vals = [f.get("v") for f in row.get("f", [])]
        print(f"   {vals[0]} | session={vals[1]} | user={vals[2]} | files={vals[4]} | prompt={vals[3]!r}")
except Exception as e:
    warn(f"BigQuery query skipped: {e}")
PYEOF
