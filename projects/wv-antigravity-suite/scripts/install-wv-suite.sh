#!/usr/bin/env bash
# Fast (<2 second) Zero-Footprint installer & updater for the State of West Virginia Antigravity Suite (v2.0.0).
# Creates files ONLY inside ~/.gemini/config/ (zero home-directory clutter, zero external runtime dependencies).
set -euo pipefail

ZIP_URL=""
GE_INSTANCE=""
OAUTH_CLIENT_ID=""
OAUTH_CLIENT_SECRET=""
TARGET_CONFIG_DIR="${HOME}/.gemini/config"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url) ZIP_URL="$2"; shift 2 ;;
    --ge-instance) GE_INSTANCE="$2"; shift 2 ;;
    --oauth-client-id) OAUTH_CLIENT_ID="$2"; shift 2 ;;
    --oauth-client-secret) OAUTH_CLIENT_SECRET="$2"; shift 2 ;;
    --target-config-dir) TARGET_CONFIG_DIR="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

PLUGINS_DEST="${TARGET_CONFIG_DIR}/plugins"
CONN_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-connectors"
MEM_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/wv-antigravity/memory"

mkdir -p -m 700 "${PLUGINS_DEST}" "${CONN_DATA_DIR}" "${MEM_DATA_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR=""
trap '[[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]] && rm -rf "${TMP_DIR}"' EXIT

SOURCE_PLUGINS_DIR=""
if [[ -n "${ZIP_URL}" ]]; then
  if [[ "${ZIP_URL}" != https://* ]]; then
    echo "Refusing non-HTTPS --zip-url: ${ZIP_URL}" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  curl -fsSL "${ZIP_URL}" -o "${TMP_DIR}/wv.zip"
  mkdir -p "${TMP_DIR}/extracted"
  unzip -q "${TMP_DIR}/wv.zip" -d "${TMP_DIR}/extracted"
  SOURCE_PLUGINS_DIR="${TMP_DIR}/extracted/plugins"
elif [[ -d "${SUITE_ROOT}/plugins" ]]; then
  SOURCE_PLUGINS_DIR="${SUITE_ROOT}/plugins"
elif [[ -f "${SUITE_ROOT}/dist/wv-antigravity-suite.zip" ]]; then
  TMP_DIR="$(mktemp -d)"
  mkdir -p "${TMP_DIR}/extracted"
  unzip -q "${SUITE_ROOT}/dist/wv-antigravity-suite.zip" -d "${TMP_DIR}/extracted"
  SOURCE_PLUGINS_DIR="${TMP_DIR}/extracted/plugins"
fi

if [[ -z "${SOURCE_PLUGINS_DIR}" || ! -d "${SOURCE_PLUGINS_DIR}" ]]; then
  echo "Could not locate plugins/ directory." >&2
  exit 1
fi

COUNT=0
for pdir in "${SOURCE_PLUGINS_DIR}"/wv-*; do
  [[ -d "${pdir}" && ! -L "${pdir}" ]] || continue
  [[ -f "${pdir}/plugin.json" ]] || continue
  if find "${pdir}" -type l | grep -q .; then
    echo "Refusing symlink inside $(basename "${pdir}")" >&2
    exit 1
  fi
  pname="$(basename "${pdir}")"
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

echo "Installed ${COUNT} zero-footprint WV plugins into ${PLUGINS_DEST}"
