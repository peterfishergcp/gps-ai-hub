#!/usr/bin/env bash
# Fast (<2 second) Zero-Footprint installer & updater for the State of West Virginia Antigravity Suite (v2.1.3).
# Stages strictly inside ~/.gemini/config/.install_stage_$$ — zero /tmp or /private/tmp writes,
# zero home-directory clutter, zero local MCP subprocesses, and zero external runtime dependencies.
set -euo pipefail

DEFAULT_ZIP_URL="https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/feat/wv-clawy-coordinator/projects/wv-antigravity-suite/dist/wv-antigravity-suite.zip"
ZIP_URL=""
GE_INSTANCE=""
OAUTH_CLIENT_ID=""
OAUTH_CLIENT_SECRET=""
TARGET_CONFIG_DIR="${HOME}/.gemini/config"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url) ZIP_URL="${2:-}"; shift 2 ;;
    --ge-instance) GE_INSTANCE="${2:-}"; shift 2 ;;
    --oauth-client-id) OAUTH_CLIENT_ID="${2:-}"; shift 2 ;;
    --oauth-client-secret) OAUTH_CLIENT_SECRET="${2:-}"; shift 2 ;;
    --target-config-dir|--config-dir) TARGET_CONFIG_DIR="${2:-}"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [--zip-url <https-zip>] [--ge-instance <ge-resource>] [--oauth-client-id <id>] [--target-config-dir <dir>]"
      exit 0
      ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

PLUGINS_DEST="${TARGET_CONFIG_DIR}/plugins"
CONN_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-connectors"
MEM_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-antigravity/memory"
COORD_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-coordinator"

mkdir -p -m 700 "${PLUGINS_DEST}" "${CONN_DATA_DIR}" "${MEM_DATA_DIR}" "${COORD_DATA_DIR}"
chmod 700 "${CONN_DATA_DIR}" "${MEM_DATA_DIR}" "${COORD_DATA_DIR}" 2>/dev/null || true

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
  echo "Downloading State of West Virginia Antigravity Suite v2.1.3 (<500 KB)..."
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

if [[ -n "${GE_INSTANCE}" ]]; then
  GE_JSON="${CONN_DATA_DIR}/ge-instance.json"
  esc_ge="${GE_INSTANCE//\\/\\\\}"; esc_ge="${esc_ge//\"/\\\"}"
  esc_cid="${OAUTH_CLIENT_ID//\\/\\\\}"; esc_cid="${esc_cid//\"/\\\"}"
  esc_sec="${OAUTH_CLIENT_SECRET//\\/\\\\}"; esc_sec="${esc_sec//\"/\\\"}"
  TS_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '{\n  "rawInput": "%s",\n  "oauthClientId": "%s",\n  "oauthClientSecret": "%s",\n  "updatedAt": "%s"\n}\n' \
    "${esc_ge}" "${esc_cid}" "${esc_sec}" "${TS_UTC}" > "${GE_JSON}"
  chmod 600 "${GE_JSON}"
fi

if command -v pkill >/dev/null 2>&1; then
  pkill -f "[n]ode .*wv-coordinator-ui/main.mjs" 2>/dev/null || true
  pkill -f "[n]ode .*wv-antigravity-ui/main.mjs" 2>/dev/null || true
  pkill -f "[n]ode .*wv-skill-manager/main.mjs" 2>/dev/null || true
  pkill -f "[n]ode .*wv-design-preview/main.mjs" 2>/dev/null || true
fi

echo "Installed ${COUNT} zero-footprint WV plugins into ${PLUGINS_DEST} (4 UI extensions: WV Antigravity, WV Clawy [Clawy], WV Skills, WV Preview)"
