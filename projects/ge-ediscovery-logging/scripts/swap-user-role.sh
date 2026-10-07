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

# Ensure the custom no-delete role (projects/<PROJECT_ID>/roles/geUserNoDelete)
# exists and is additively bound to PRINCIPAL, and optionally swap out
# roles/discoveryengine.user for that single principal.
#
#   scripts/swap-user-role.sh GE_PROJECT_ID PRINCIPAL             # dry run (creates/grants custom role + reports bindings)
#   scripts/swap-user-role.sh GE_PROJECT_ID PRINCIPAL --apply     # backs up IAM policy & removes roles/discoveryengine.user from PRINCIPAL
#   scripts/swap-user-role.sh GE_PROJECT_ID PRINCIPAL --rollback  # restores roles/discoveryengine.user to PRINCIPAL
#
# PRINCIPAL e.g. 'principalSet://iam.googleapis.com/locations/global/workforcePools/POOL/*'
#             or 'group:gemini-enterprise-users@example.com'
# Changes take ~1-2 minutes to propagate.

set -euo pipefail

P=${1:?usage: $0 GE_PROJECT_ID PRINCIPAL [--apply|--rollback]}
M=${2:?principal required}
MODE=${3:-dry-run}
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if command -v uv >/dev/null 2>&1; then
  PY_CMD=(uv run python)
else
  PY_CMD=(python3)
fi

case "$MODE" in
  --apply)
    "${PY_CMD[@]}" "$ROOT_DIR/setup_no_delete_role.py" \
      --project="$P" \
      --principal="$M" \
      --ensure-custom-role \
      --apply
    ;;
  --rollback)
    "${PY_CMD[@]}" "$ROOT_DIR/setup_no_delete_role.py" \
      --project="$P" \
      --principal="$M" \
      --rollback
    ;;
  *)
    "${PY_CMD[@]}" "$ROOT_DIR/setup_no_delete_role.py" \
      --project="$P" \
      --principal="$M" \
      --ensure-custom-role
    ;;
esac
