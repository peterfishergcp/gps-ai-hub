#!/usr/bin/env bash
# Fast (<2 second) installer & updater for the Public Sector Antigravity Suite.
# Supports local directory install, HTTPS ZIP fetch (zero git required), or git sparse-checkout,
# plus optional --ge-instance pre-configuration for Turn-1 federated connector access.

set -euo pipefail

ZIP_URL=""
GIT_REPO_URL=""
GE_INSTANCE=""
OAUTH_CLIENT_ID=""
OAUTH_CLIENT_SECRET=""
TARGET_CONFIG_DIR="${HOME}/.gemini/config"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url)
      ZIP_URL="${2:-}"
      shift 2
      ;;
    --git-sparse)
      GIT_REPO_URL="${2:-}"
      shift 2
      ;;
    --ge-instance)
      GE_INSTANCE="${2:-}"
      shift 2
      ;;
    --oauth-client-id)
      OAUTH_CLIENT_ID="${2:-}"
      shift 2
      ;;
    --oauth-client-secret)
      OAUTH_CLIENT_SECRET="${2:-}"
      shift 2
      ;;
    --config-dir)
      TARGET_CONFIG_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--zip-url <https-zip>] [--git-sparse <https-git-repo>] [--ge-instance <ge-url-or-resource>] [--oauth-client-id <id>] [--config-dir <dir>]"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGINS_DEST="${TARGET_CONFIG_DIR}/plugins"
PLUGIN_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/agy-connectors"

mkdir -p "${PLUGINS_DEST}" "${PLUGIN_DATA_DIR}"
chmod 700 "${PLUGIN_DATA_DIR}" 2>/dev/null || true

TMP_DIR=""
cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf "${TMP_DIR}"
  fi
}
trap cleanup EXIT

validate_and_extract_zip() {
  local zip_path="$1"
  local dest_dir="$2"
  # Validate archive entries against ZipSlip traversal or absolute paths before extraction
  if command -v unzip >/dev/null 2>&1; then
    local entries
    entries="$(unzip -Z1 "${zip_path}")"
    while IFS= read -r entry; do
      [[ -z "${entry}" ]] && continue
      if [[ "${entry}" == /* || "${entry}" == *".."* || "${entry}" == *"\\"* ]]; then
        echo "Error: Blocked unsafe archive entry in ZIP: ${entry}" >&2
        exit 1
      fi
    done <<< "${entries}"
    unzip -q -o "${zip_path}" -d "${dest_dir}"
  else
    echo "Error: 'unzip' is required to extract ${zip_path}." >&2
    exit 1
  fi
}

SOURCE_SUITE_DIR=""

if [[ -n "${ZIP_URL}" ]]; then
  if [[ "${ZIP_URL}" != https://* ]]; then
    echo "Error: --zip-url must start with https://" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  ZIP_FILE="${TMP_DIR}/generic-agy-plugin.zip"
  EXTRACT_DIR="${TMP_DIR}/extracted"
  mkdir -p "${EXTRACT_DIR}"
  echo "Downloading Generic AGY Plugin (~150 KB)..."
  curl -fsSL "${ZIP_URL}" -o "${ZIP_FILE}"
  validate_and_extract_zip "${ZIP_FILE}" "${EXTRACT_DIR}"
  if [[ -d "${EXTRACT_DIR}/plugins" ]]; then
    SOURCE_SUITE_DIR="${EXTRACT_DIR}"
  else
    FIRST_SUB="$(find "${EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    SOURCE_SUITE_DIR="${FIRST_SUB}"
  fi
elif [[ -n "${GIT_REPO_URL}" ]]; then
  if [[ "${GIT_REPO_URL}" != https://* ]]; then
    echo "Error: --git-sparse URL must start with https://" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  REPO_DIR="${TMP_DIR}/repo"
  echo "Fetching projects/generic-agy-plugin via fast git sparse-checkout..."
  git clone --depth 1 --filter=blob:none --sparse "${GIT_REPO_URL}" "${REPO_DIR}" >/dev/null
  git -C "${REPO_DIR}" sparse-checkout set projects/generic-agy-plugin >/dev/null
  SOURCE_SUITE_DIR="${REPO_DIR}/projects/generic-agy-plugin"
elif [[ -d "${SUITE_ROOT}/plugins" ]]; then
  SOURCE_SUITE_DIR="${SUITE_ROOT}"
elif [[ -f "${SUITE_ROOT}/dist/generic-agy-plugin.zip" ]]; then
  TMP_DIR="$(mktemp -d)"
  EXTRACT_DIR="${TMP_DIR}/extracted"
  mkdir -p "${EXTRACT_DIR}"
  validate_and_extract_zip "${SUITE_ROOT}/dist/generic-agy-plugin.zip" "${EXTRACT_DIR}"
  SOURCE_SUITE_DIR="${EXTRACT_DIR}"
fi

if [[ -z "${SOURCE_SUITE_DIR}" || ! -d "${SOURCE_SUITE_DIR}/plugins" ]]; then
  echo "Error: Could not find plugins/ directory to install." >&2
  exit 1
fi

if command -v agy >/dev/null 2>&1 && [[ "${TARGET_CONFIG_DIR}" == "${HOME}/.gemini/config" ]]; then
  echo "Installing Generic AGY Plugin via native 'agy plugin install'..."
  agy plugin install "${SOURCE_SUITE_DIR}"
else
  INSTALLED=()
  for pdir in "${SOURCE_SUITE_DIR}/plugins"/*; do
    [[ -d "${pdir}" ]] || continue
    pname="$(basename "${pdir}")"
    [[ "${pname}" == .* ]] && continue
    [[ -f "${pdir}/plugin.json" ]] || continue
    # Reject symlinks inside plugin source
    if find "${pdir}" -type l | grep -q .; then
      echo "Error: Refusing symlink inside plugin ${pname}" >&2
      exit 1
    fi
    rm -rf "${PLUGINS_DEST:?}/${pname}"
    cp -R "${pdir}" "${PLUGINS_DEST}/${pname}"
    INSTALLED+=("${pname}")
  done
  echo "Installed ${#INSTALLED[@]} AGY plugins to ${PLUGINS_DEST}: ${INSTALLED[*]}"
fi

if [[ -n "${GE_INSTANCE}" ]]; then
  GE_CFG="${PLUGIN_DATA_DIR}/ge-instance.json"
  umask 077
  # Escape JSON strings safely via parameter substitution (no python/node dependency required)
  esc_ge="${GE_INSTANCE//\\/\\\\}"
  esc_ge="${esc_ge//\"/\\\"}"
  esc_cid="${OAUTH_CLIENT_ID//\\/\\\\}"
  esc_cid="${esc_cid//\"/\\\"}"
  esc_csec="${OAUTH_CLIENT_SECRET//\\/\\\\}"
  esc_csec="${esc_csec//\"/\\\"}"
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  cat > "${GE_CFG}" <<EOF
{
  "rawInput": "${esc_ge}",
  "oauthClientId": "${esc_cid}",
  "oauthClientSecret": "${esc_csec}",
  "updatedAt": "${ts}"
}
EOF
  echo "Saved default Gemini Enterprise instance to ${GE_CFG}"
fi

echo "Ready! Open Google Antigravity -> Extensions -> AGY Skills (or run /agy-onboard) to begin."
