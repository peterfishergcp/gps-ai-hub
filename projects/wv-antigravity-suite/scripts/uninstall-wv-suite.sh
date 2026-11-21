#!/usr/bin/env bash
# 1-Command Clean Uninstaller for the State of West Virginia Antigravity Suite (Zero-Residue Audit).
set -euo pipefail

TARGET_CONFIG_DIR="${HOME}/.gemini/config"
PURGE_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-config-dir) TARGET_CONFIG_DIR="$2"; shift 2 ;;
    --purge-data) PURGE_DATA=1; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

for p in wv-onboarding wv-connectors wv-design-studio wv-state-workflows wv-engineering-cloud wv-security wv-second-brain wv-automations; do
  rm -rf "${TARGET_CONFIG_DIR:?}/plugins/${p}"
done

rm -f "${TARGET_CONFIG_DIR}/rules/wv-voice-profile.md"

if [[ "${PURGE_DATA}" -eq 1 ]]; then
  for d in wv-onboarding wv-connectors wv-design-studio wv-antigravity; do
    rm -rf "${TARGET_CONFIG_DIR:?}/plugin_data/${d}"
  done
fi

echo "Cleanly removed WV Antigravity Suite from ${TARGET_CONFIG_DIR}"
