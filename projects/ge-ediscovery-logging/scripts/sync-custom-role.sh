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

# Compare Google's predefined roles/discoveryengine.user role against the
# project's custom geUserNoDelete role and optionally apply any newly added
# permissions without overriding the session/file delete removal.
#
# Usage:
#   scripts/sync-custom-role.sh GE_PROJECT_ID             # dry-run comparison report
#   scripts/sync-custom-role.sh GE_PROJECT_ID --apply     # patch custom role with new safe permissions
#   scripts/sync-custom-role.sh GE_PROJECT_ID --json      # machine-readable JSON drift report

set -euo pipefail

P=${1:?usage: $0 GE_PROJECT_ID [--apply|--json]}
shift
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if command -v uv >/dev/null 2>&1; then
  PY_CMD=(uv run python)
else
  PY_CMD=(python3)
fi

"${PY_CMD[@]}" "$ROOT_DIR/sync_no_delete_role.py" --project="$P" "$@"
