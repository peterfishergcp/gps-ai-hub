#!/usr/bin/env bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
#
# Creates a clean, zero-history staging snapshot of projects/ge_mcp (plus LICENSE and CI workflow)
# suitable for opening a fresh pull request in an approved public/GTM repository without carrying
# legacy git commit history.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXPORT_DIR="${1:-/tmp/ge_mcp_clean_export}"

if [ -e "${EXPORT_DIR}" ]; then
  echo "Error: Target directory '${EXPORT_DIR}' already exists. Provide a new path or remove it first."
  exit 1
fi

mkdir -p "${EXPORT_DIR}/projects/ge_mcp" "${EXPORT_DIR}/.github/workflows"

cp "${REPO_ROOT}/LICENSE" "${EXPORT_DIR}/LICENSE"
cp "${REPO_ROOT}/.gitignore" "${EXPORT_DIR}/.gitignore"
if [ -f "${REPO_ROOT}/.github/workflows/ge-mcp-ci.yml" ]; then
  cp "${REPO_ROOT}/.github/workflows/ge-mcp-ci.yml" "${EXPORT_DIR}/.github/workflows/ge-mcp-ci.yml"
fi

rsync -a \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='__pycache__/' \
  --exclude='.venv/' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='.env.production' \
  --exclude='*.log' \
  --exclude='.msal_token_cache.bin' \
  "${SCRIPT_DIR}/" "${EXPORT_DIR}/projects/ge_mcp/"

(
  cd "${EXPORT_DIR}"
  git init -q -b main
  git add .
  git -c user.name="Repository Maintainer" -c user.email="noreply@example.com" \
    commit -q -m "Initial hardened release of Gemini Enterprise MCP connectors"
)

echo "Clean zero-history export staged at: ${EXPORT_DIR}"
echo "Commit count in export: $(git -C "${EXPORT_DIR}" rev-list --count HEAD)"
