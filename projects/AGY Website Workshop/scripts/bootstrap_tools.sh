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
# Idempotent tooling & workspace-scoped ADK skill bootstrapper.
# Installs google-agents-cli via uv (if missing) and vendors ADK skills into
# ./.agents/skills (--workspace) so Antigravity IDE and AGY CLI never hit
# global ~/.gemini symlink race conditions.

set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSHOP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$WORKSHOP_ROOT"

echo "[1/3] Checking uv package manager..."
if ! command -v uv >/dev/null 2>&1; then
  echo "  [ERROR] 'uv' is not installed on PATH."
  echo "  Install uv via your organization's approved package manager (e.g., 'pipx install uv', 'brew install uv', or https://docs.astral.sh/uv/getting-started/installation/) and re-run."
  exit 1
fi
echo "  [OK] $(uv --version)"

echo "[2/3] Ensuring google-agents-cli is installed..."
if ! command -v agents-cli >/dev/null 2>&1; then
  uv tool install google-agents-cli
else
  echo "  [OK] agents-cli already installed at $(command -v agents-cli)"
fi

echo "[3/3] Installing ADK skills at workspace scope (./.agents/skills)..."
agents-cli setup --workspace --skip-auth

# Also refresh global Antigravity skill links if ~/.gemini already exists
if [ -d "$HOME/.gemini" ]; then
  agents-cli setup --skip-auth >/dev/null 2>&1 || true
fi

echo "[DONE] Tooling & workspace skills ready. Binary: $(command -v agents-cli)"
