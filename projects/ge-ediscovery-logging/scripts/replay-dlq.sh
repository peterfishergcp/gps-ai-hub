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

# Inspect or replay dead-lettered eDiscovery events from ge-ediscovery-dlq-hold
# back to ge-ediscovery-events.
#
#   scripts/replay-dlq.sh PROJECT_ID --peek        # show what is waiting without acking
#   scripts/replay-dlq.sh PROJECT_ID --replay      # republish to ge-ediscovery-events and ack

set -euo pipefail

P=${1:?usage: $0 PROJECT_ID [--peek|--replay]}
MODE=${2:---peek}
SUB=${PUBSUB_DLQ_SUB:-ge-ediscovery-dlq-hold}
TOPIC=${PUBSUB_TOPIC:-ge-ediscovery-events}

if command -v uv >/dev/null 2>&1; then
  PY_CMD=(uv run python)
else
  PY_CMD=(python3)
fi

"${PY_CMD[@]}" - "$P" "$MODE" "$SUB" "$TOPIC" <<'PYEOF'
import base64
import json
import ssl
import subprocess
import sys
import urllib.request

project_id, mode, sub_name, topic_name = sys.argv[1:5]
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

sub_url = f"https://pubsub.googleapis.com/v1/projects/{project_id}/subscriptions/{sub_name}"
topic_url = f"https://pubsub.googleapis.com/v1/projects/{project_id}/topics/{topic_name}"

if mode == "--peek":
    resp = api("POST", f"{sub_url}:pull", {"returnImmediately": True, "maxMessages": 20})
    msgs = resp.get("receivedMessages", [])
    if not msgs:
        print(f"(0 messages waiting in {sub_name})")
        sys.exit(0)
    ack_ids = []
    for m in msgs:
        ack_ids.append(m["ackId"])
        msg = m.get("message", {})
        raw = base64.b64decode(msg.get("data", ""))
        e = json.loads(raw.decode("utf-8", errors="ignore") or "{}")
        md = (e.get("jsonPayload") or {}).get("logMetadata") or {}
        attempts = (msg.get("attributes") or {}).get("CloudPubSubDeadLetterSourceDeliveryCount", "?")
        print(f"{attempts} attempts | {md.get('methodName')} | {md.get('timestamp')} | {e.get('insertId')}")
    api("POST", f"{sub_url}:modifyAckDeadline", {"ackIds": ack_ids, "ackDeadlineSeconds": 0})
    print(f"(peek does not ack; {len(msgs)} message(s) remain in {sub_name})")
    sys.exit(0)

replayed = 0
while True:
    resp = api("POST", f"{sub_url}:pull", {"returnImmediately": True, "maxMessages": 50})
    msgs = resp.get("receivedMessages", [])
    if not msgs:
        break
    for m in msgs:
        data_b64 = m["message"]["data"]
        api("POST", f"{topic_url}:publish", {"messages": [{"data": data_b64}]})
        api("POST", f"{sub_url}:acknowledge", {"ackIds": [m["ackId"]]})
        replayed += 1
        print(f"replayed {replayed}")
print(f"done (replayed {replayed} message(s))")
PYEOF
