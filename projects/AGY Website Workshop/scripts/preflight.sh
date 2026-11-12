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
#
# Read-only preflight & environment discovery for the AGY Website & ADK Workshop.
# Mutates nothing on disk or in Google Cloud.

set -euo pipefail

# Include ~/.local/bin so GUI-launched IDEs find uv and agents-cli reliably.
export PATH="$HOME/.local/bin:$PATH"

echo "=================================================================="
echo " Google Antigravity + ADK Workshop — Read-Only Preflight Check"
echo "=================================================================="

# 1. Detect execution environment
ENV_SURFACE="Local Workstation"
if [ "${CLOUD_SHELL:-}" = "true" ]; then
  ENV_SURFACE="Google Cloud Shell"
elif [ -n "${WORKSTATION_ID:-}" ] || [ -d "/google/scripts" ] && [ -n "${GOOGLE_CLOUD_WORKSTATIONS:-}" ]; then
  ENV_SURFACE="Google Cloud Workstations"
fi
echo "[INFO] Environment Surface : ${ENV_SURFACE} ($(uname -s)/$(uname -m))"

# 2. Check required local binaries
MISSING_BINS=0
for bin in python3 gcloud; do
  if command -v "$bin" >/dev/null 2>&1; then
    echo "[OK]   Binary found        : $bin ($(command -v "$bin"))"
  else
    echo "[WARN] Binary missing      : $bin"
    MISSING_BINS=1
  fi
done

if command -v uv >/dev/null 2>&1; then
  echo "[OK]   Binary found        : uv ($(uv --version 2>/dev/null || echo 'installed'))"
else
  echo "[WARN] Binary missing      : uv (run: bash scripts/bootstrap_tools.sh)"
fi

if command -v agents-cli >/dev/null 2>&1; then
  echo "[OK]   Binary found        : agents-cli ($(command -v agents-cli))"
else
  echo "[WARN] Binary missing      : agents-cli (run: bash scripts/bootstrap_tools.sh)"
fi

# 3. Check workspace-local ADK skills
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSHOP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [ -d "$WORKSHOP_ROOT/.agents/skills" ] && [ -n "$(ls -A "$WORKSHOP_ROOT/.agents/skills" 2>/dev/null || true)" ]; then
  echo "[OK]   Workspace Skills    : Present in .agents/skills/"
else
  echo "[INFO] Workspace Skills    : Not yet vendored locally (run: bash scripts/bootstrap_tools.sh)"
fi

# 4. Auto-discover Google Cloud identity, project & Vertex AI ADC
if command -v gcloud >/dev/null 2>&1; then
  ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n 1 || true)"
  GCP_PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
  if [ "$GCP_PROJECT_ID" = "(unset)" ]; then
    GCP_PROJECT_ID=""
  fi
  GCP_LOCATION="${GOOGLE_CLOUD_LOCATION:-us-central1}"

  if [ -n "$ACTIVE_ACCOUNT" ]; then
    echo "[OK]   Active gcloud User  : $ACTIVE_ACCOUNT"
  else
    echo "[WARN] Active gcloud User  : Not signed in (run: gcloud auth login)"
  fi

  if [ -n "$GCP_PROJECT_ID" ]; then
    echo "[OK]   Discovered Project  : $GCP_PROJECT_ID (default region: $GCP_LOCATION)"
  else
    echo "[WARN] Discovered Project  : Unset (run: gcloud config set project YOUR_PROJECT_ID)"
  fi

  # Check Application Default Credentials (keyless Vertex AI auth)
  if gcloud auth application-default print-access-token >/dev/null 2>&1; then
    echo "[OK]   Vertex AI ADC       : Valid Application Default Credentials detected"
    ADC_READY=1
  else
    echo "[WARN] Vertex AI ADC       : Missing or expired (run: gcloud auth application-default login)"
    ADC_READY=0
  fi

  # If project and token exist, check aiplatform.googleapis.com & predict permission
  if [ -n "$GCP_PROJECT_ID" ]; then
    TOKEN="$(gcloud auth print-access-token 2>/dev/null || gcloud auth application-default print-access-token 2>/dev/null || true)"
    if [ -n "$TOKEN" ]; then
      python3 - "$GCP_PROJECT_ID" "$TOKEN" <<'PYEOF'
import json
import sys
import urllib.error
import urllib.request

project_id, token = sys.argv[1], sys.argv[2]
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

# Check Vertex AI API state via Service Usage
svc_url = f"https://serviceusage.googleapis.com/v1/projects/{project_id}/services/aiplatform.googleapis.com"
try:
    req = urllib.request.Request(svc_url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=8) as resp:
        state = json.loads(resp.read().decode()).get("state", "UNKNOWN")
    if state == "ENABLED":
        print(f"[OK]   Vertex AI API       : aiplatform.googleapis.com is ENABLED on {project_id}")
    else:
        print(f"[WARN] Vertex AI API       : state={state} (run: gcloud services enable aiplatform.googleapis.com --project={project_id})")
except urllib.error.HTTPError as exc:
    print(f"[INFO] Vertex AI API Check : Could not query Service Usage (HTTP {exc.code}); verify aiplatform.googleapis.com is enabled.")
except Exception:
    print("[INFO] Vertex AI API Check : Skipped network check.")

# Check Vertex AI prediction IAM permission
iam_url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:testIamPermissions"
try:
    body = json.dumps({"permissions": ["aiplatform.endpoints.predict"]}).encode()
    req = urllib.request.Request(iam_url, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=8) as resp:
        granted = set(json.loads(resp.read().decode()).get("permissions", []))
    if "aiplatform.endpoints.predict" in granted:
        print(f"[OK]   IAM Permission      : aiplatform.endpoints.predict verified on {project_id}")
    else:
        print(f"[WARN] IAM Permission      : Missing roles/aiplatform.user (aiplatform.endpoints.predict) on {project_id}")
except Exception:
    print("[INFO] IAM Permission Check: Could not run testIamPermissions; verify roles/aiplatform.user.")
PYEOF
    fi
  fi
fi

echo "------------------------------------------------------------------"
echo " Preflight complete (read-only). Confirm the Project ID & Region"
echo " with the participant before running bootstrap or scaffolding."
echo "=================================================================="
exit "$MISSING_BINS"
