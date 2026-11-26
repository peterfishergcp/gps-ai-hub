#!/usr/bin/env bash
# Fast (<2 second) Zero-Footprint installer & updater for the State of West Virginia Antigravity Suite (v2.3.3).
# Stages strictly inside ~/.gemini/config/.install_stage_$$ — zero /tmp or /private/tmp writes,
# zero home-directory clutter, zero local MCP subprocesses, and zero external runtime dependencies.
# Automatically removes deprecated legacy plugins (wv-connectors, wv-coordinator) on upgrade.
set -euo pipefail

DEFAULT_ZIP_URL="https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite/dist/wv-antigravity-suite.zip"
ZIP_URL=""
TARGET_CONFIG_DIR="${HOME}/.gemini/config"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url) ZIP_URL="${2:-}"; shift 2 ;;
    --ge-instance|--oauth-client-id|--oauth-client-secret)
      # Retained for backward CLI compatibility; connectors now use native Antigravity Customizations -> Google Workspace.
      shift 2
      ;;
    --target-config-dir|--config-dir) TARGET_CONFIG_DIR="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--zip-url <https-zip>] [--target-config-dir <dir>]"
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

PLUGINS_DEST="${TARGET_CONFIG_DIR}/plugins"
MEM_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-antigravity/memory"

mkdir -p -m 700 "${PLUGINS_DEST}" "${MEM_DATA_DIR}"
chmod 700 "${MEM_DATA_DIR}" 2>/dev/null || true

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SUITE_ROOT=""
if [[ -n "${SCRIPT_PATH}" && -f "${SCRIPT_PATH}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
  SUITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

STAGE_DIR=""
cleanup() {
  if [[ -n "${STAGE_DIR}" && -d "${STAGE_DIR}" ]]; then
    rm -rf "${STAGE_DIR}"
  fi
}
trap cleanup EXIT

init_stage_dir() {
  if [[ -z "${STAGE_DIR}" ]]; then
    STAGE_DIR="${TARGET_CONFIG_DIR}/.install_stage_$$"
    rm -rf "${STAGE_DIR}"
    mkdir -p -m 700 "${STAGE_DIR}"
  fi
}

validate_and_extract_zip() {
  local zip_path="$1"
  local dest_dir="$2"
  if command -v unzip >/dev/null 2>&1; then
    local entries
    entries="$(unzip -Z1 "${zip_path}")"
    while IFS= read -r entry; do
      [[ -z "${entry}" ]] && continue
      if [[ "${entry}" == /* || "${entry}" == *".."* || "${entry}" == *"\\"* ]]; then
        echo "Refusing unsafe archive entry in ZIP: ${entry}" >&2
        exit 1
      fi
    done <<< "${entries}"
    unzip -q -o "${zip_path}" -d "${dest_dir}"
  else
    echo "Error: 'unzip' is required to extract ${zip_path}." >&2
    exit 1
  fi
}

if [[ -z "${ZIP_URL}" ]]; then
  if [[ -z "${SUITE_ROOT}" ]] || [[ ! -d "${SUITE_ROOT}/plugins" && ! -f "${SUITE_ROOT}/dist/wv-antigravity-suite.zip" ]]; then
    ZIP_URL="${DEFAULT_ZIP_URL}"
  fi
fi

SOURCE_PLUGINS_DIR=""
if [[ -n "${ZIP_URL}" ]]; then
  if [[ "${ZIP_URL}" != https://* ]]; then
    echo "Refusing non-HTTPS --zip-url: ${ZIP_URL}" >&2
    exit 1
  fi
  init_stage_dir
  echo "Downloading State of West Virginia Antigravity Suite v2.3.3..."
  curl -fsSL "${ZIP_URL}" -o "${STAGE_DIR}/wv.zip"
  mkdir -p -m 700 "${STAGE_DIR}/extracted"
  validate_and_extract_zip "${STAGE_DIR}/wv.zip" "${STAGE_DIR}/extracted"
  if [[ -d "${STAGE_DIR}/extracted/plugins" ]]; then
    SOURCE_PLUGINS_DIR="${STAGE_DIR}/extracted/plugins"
  else
    FIRST_SUB="$(find "${STAGE_DIR}/extracted" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    SOURCE_PLUGINS_DIR="${FIRST_SUB}/plugins"
  fi
elif [[ -n "${SUITE_ROOT}" && -d "${SUITE_ROOT}/plugins" ]]; then
  SOURCE_PLUGINS_DIR="${SUITE_ROOT}/plugins"
elif [[ -n "${SUITE_ROOT}" && -f "${SUITE_ROOT}/dist/wv-antigravity-suite.zip" ]]; then
  init_stage_dir
  mkdir -p -m 700 "${STAGE_DIR}/extracted"
  validate_and_extract_zip "${SUITE_ROOT}/dist/wv-antigravity-suite.zip" "${STAGE_DIR}/extracted"
  SOURCE_PLUGINS_DIR="${STAGE_DIR}/extracted/plugins"
fi

if [[ -z "${SOURCE_PLUGINS_DIR}" || ! -d "${SOURCE_PLUGINS_DIR}" ]]; then
  echo "Could not locate plugins/ directory." >&2
  exit 1
fi

# Clean up deprecated plugins from pre-v2.3.0 installs so orphaned sidebar icons disappear cleanly
for legacy_p in wv-connectors wv-coordinator; do
  rm -rf "${PLUGINS_DEST:?}/${legacy_p}"
done

COUNT=0
for pdir in "${SOURCE_PLUGINS_DIR}"/*; do
  [[ -d "${pdir}" && ! -L "${pdir}" ]] || continue
  pname="$(basename "${pdir}")"
  [[ "${pname}" == .* ]] && continue
  [[ -f "${pdir}/plugin.json" ]] || continue
  if find "${pdir}" -type l | grep -q .; then
    echo "Refusing symlink inside ${pname}" >&2
    exit 1
  fi
  rm -rf "${PLUGINS_DEST:?}/${pname}"
  cp -R "${pdir}" "${PLUGINS_DEST}/${pname}"
  COUNT=$((COUNT + 1))
done

# Restart running WV sidecars cleanly so upgraded UI/API code loads immediately
restart_wv_sidecars() {
  if command -v pkill >/dev/null 2>&1; then
    pkill -f "[w]v-sidecar=wv-" 2>/dev/null || true
    pkill -f "[w]v-coordinator-ui/main.mjs" 2>/dev/null || true
  fi
  # Also catch pre-v2.3.2 sidecars invoked as `node ... main.mjs` whose CWD is inside ${PLUGINS_DEST}/wv-*
  if command -v pgrep >/dev/null 2>&1; then
    local pid cwd_path
    for pid in $(pgrep -f "main\.mjs" 2>/dev/null || true); do
      cwd_path=""
      if [[ -L "/proc/${pid}/cwd" ]]; then
        cwd_path="$(readlink "/proc/${pid}/cwd" 2>/dev/null || true)"
      elif command -v lsof >/dev/null 2>&1; then
        cwd_path="$(lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1 || true)"
      fi
      case "${cwd_path}" in
        "${PLUGINS_DEST}"/wv-*)
          kill "${pid}" 2>/dev/null || true
          ;;
      esac
    done
  fi
}
restart_wv_sidecars || true

echo "Installed ${COUNT} zero-footprint WV plugins (v2.3.3) into ${PLUGINS_DEST} (3 UI panels: WV My Hub, WV Skills [with Ask Clawy], WV Preview)"
