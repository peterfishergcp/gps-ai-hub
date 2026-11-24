#!/usr/bin/env bash
# 1-Command Clean Uninstaller for the Generic AGY Plugin Suite (Zero-Residue Audit).
set -euo pipefail

TARGET_CONFIG_DIR="${HOME}/.gemini/config"
PURGE_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target-config-dir|--config-dir) TARGET_CONFIG_DIR="$2"; shift 2 ;;
    --purge-data) PURGE_DATA=1; shift ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

for p in agy-onboarding agy-coordinator agy-connectors agy-design-studio agy-public-workflows agy-engineering-cloud agy-security agy-second-brain agy-twin-automations; do
  rm -rf "${TARGET_CONFIG_DIR:?}/plugins/${p}"
done

rm -f "${TARGET_CONFIG_DIR}/rules/my-voice-profile.md"

if [[ "${PURGE_DATA}" -eq 1 ]]; then
  for d in agy-onboarding agy-coordinator agy-connectors agy-design-studio my-antigravity updates-feed token-telemetry; do
    rm -rf "${TARGET_CONFIG_DIR:?}/plugin_data/${d}"
  done
fi

echo "Cleanly removed Generic AGY Plugin Suite from ${TARGET_CONFIG_DIR}"
