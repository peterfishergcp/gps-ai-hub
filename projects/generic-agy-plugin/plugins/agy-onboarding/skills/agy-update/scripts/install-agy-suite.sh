#!/usr/bin/env bash
# Fast (<2 second) Zero-/tmp installer & updater for the Public Sector Antigravity Suite (v1.7.4).
# Stages strictly inside ~/.gemini/config/.install_stage_$$ (zero /tmp or /private/tmp writes,
# zero 'agy plugin install' /tmp/lsrpc.sh prompts, and zero files outside ~/.gemini/config/).

set -euo pipefail

DEFAULT_ZIP_URL="https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/feat/agy-coordinator-prototype/projects/generic-agy-plugin/dist/generic-agy-plugin.zip"
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
    --config-dir|--target-config-dir)
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

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
SUITE_ROOT=""
if [[ -n "${SCRIPT_PATH}" && -f "${SCRIPT_PATH}" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
  SUITE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
fi

PLUGINS_DEST="${TARGET_CONFIG_DIR}/plugins"
PLUGIN_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/agy-connectors"
MEM_DATA_DIR="${TARGET_CONFIG_DIR}/plugin_data/my-antigravity/memory"

mkdir -p -m 700 "${PLUGINS_DEST}" "${PLUGIN_DATA_DIR}" "${MEM_DATA_DIR}"
chmod 700 "${PLUGIN_DATA_DIR}" "${MEM_DATA_DIR}" 2>/dev/null || true

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

# Default to HTTPS pre-built ZIP when piped via `curl -fsSL ... | bash` without local checkout
if [[ -z "${ZIP_URL}" && -z "${GIT_REPO_URL}" ]]; then
  if [[ -z "${SUITE_ROOT}" ]] || [[ ! -d "${SUITE_ROOT}/plugins" && ! -f "${SUITE_ROOT}/dist/generic-agy-plugin.zip" ]]; then
    ZIP_URL="${DEFAULT_ZIP_URL}"
  fi
fi

SOURCE_SUITE_DIR=""

if [[ -n "${ZIP_URL}" ]]; then
  if [[ "${ZIP_URL}" != https://* ]]; then
    echo "Error: --zip-url must start with https://" >&2
    exit 1
  fi
  init_stage_dir
  ZIP_FILE="${STAGE_DIR}/generic-agy-plugin.zip"
  EXTRACT_DIR="${STAGE_DIR}/extracted"
  mkdir -p -m 700 "${EXTRACT_DIR}"
  echo "Downloading Generic AGY Plugin Suite v1.7.4 (<500 KB)..."
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
  init_stage_dir
  REPO_DIR="${STAGE_DIR}/repo"
  echo "Fetching projects/generic-agy-plugin via fast git sparse-checkout..."
  git clone --depth 1 --filter=blob:none --sparse "${GIT_REPO_URL}" "${REPO_DIR}" >/dev/null
  git -C "${REPO_DIR}" sparse-checkout set projects/generic-agy-plugin >/dev/null
  SOURCE_SUITE_DIR="${REPO_DIR}/projects/generic-agy-plugin"
elif [[ -n "${SUITE_ROOT}" && -d "${SUITE_ROOT}/plugins" ]]; then
  SOURCE_SUITE_DIR="${SUITE_ROOT}"
elif [[ -n "${SUITE_ROOT}" && -f "${SUITE_ROOT}/dist/generic-agy-plugin.zip" ]]; then
  init_stage_dir
  EXTRACT_DIR="${STAGE_DIR}/extracted"
  mkdir -p -m 700 "${EXTRACT_DIR}"
  validate_and_extract_zip "${SUITE_ROOT}/dist/generic-agy-plugin.zip" "${EXTRACT_DIR}"
  SOURCE_SUITE_DIR="${EXTRACT_DIR}"
fi

if [[ -z "${SOURCE_SUITE_DIR}" || ! -d "${SOURCE_SUITE_DIR}/plugins" ]]; then
  echo "Error: Could not find plugins/ directory to install." >&2
  exit 1
fi

# Protect any stock SKILL.md that the user customized locally before upgrading plugin folders
PERSONAL_SKILLS_DIR="${TARGET_CONFIG_DIR}/skills"
BASELINE_JSON="${TARGET_CONFIG_DIR}/plugin_data/agy-onboarding/baseline-hashes.json"
sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  fi
}

if [[ -f "${BASELINE_JSON}" && -d "${PLUGINS_DEST}" ]]; then
  for new_pdir in "${SOURCE_SUITE_DIR}/plugins"/*; do
    [[ -d "${new_pdir}/skills" ]] || continue
    pname="$(basename "${new_pdir}")"
    for new_sdir in "${new_pdir}/skills"/*; do
      [[ -d "${new_sdir}" ]] || continue
      sid="$(basename "${new_sdir}")"
      old_sdir="${PLUGINS_DEST}/${pname}/skills/${sid}"
      old_md="${old_sdir}/SKILL.md"
      [[ -f "${old_md}" && ! -L "${old_md}" ]] || continue
      new_md="${new_sdir}/SKILL.md"
      [[ -f "${new_md}" ]] || continue
      old_sha="$(sha256_of "${old_md}")"
      new_sha="$(sha256_of "${new_md}")"
      if [[ -n "${old_sha}" && "${old_sha}" != "${new_sha}" ]] && ! grep -q "${old_sha}" "${BASELINE_JSON}" 2>/dev/null; then
        mkdir -p -m 700 "${PERSONAL_SKILLS_DIR}"
        chmod 700 "${PERSONAL_SKILLS_DIR}" 2>/dev/null || true
        backup_slug="${sid}-saved"
        if [[ -d "${PERSONAL_SKILLS_DIR}/${backup_slug}" ]]; then
          backup_slug="${sid}-saved-$(date -u +%Y%m%d%H%M%S)"
        fi
        cp -R "${old_sdir}" "${PERSONAL_SKILLS_DIR}/${backup_slug}"
        ts_now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        cat > "${PERSONAL_SKILLS_DIR}/${backup_slug}/.agy-skill-meta.json" <<METAEOF
{
  "slug": "${backup_slug}",
  "forkedFrom": "${sid}",
  "sourcePlugin": "${pname}",
  "mode": "copy",
  "title": "${sid} (Saved Local Edits)",
  "subtitle": "Auto-preserved local edits before plugin upgrade",
  "seedPrompt": "/${backup_slug} Run my customized workflow.",
  "createdAt": "${ts_now}",
  "updatedAt": "${ts_now}"
}
METAEOF
        echo "Protected your local edits to /${sid} -> ${PERSONAL_SKILLS_DIR}/${backup_slug}/"
      fi
    done
  done
fi

INSTALLED=()
for pdir in "${SOURCE_SUITE_DIR}/plugins"/*; do
  [[ -d "${pdir}" && ! -L "${pdir}" ]] || continue
  pname="$(basename "${pdir}")"
  [[ "${pname}" == .* ]] && continue
  [[ -f "${pdir}/plugin.json" ]] || continue
  if find "${pdir}" -type l | grep -q .; then
    echo "Error: Refusing symlink inside plugin ${pname}" >&2
    exit 1
  fi
  rm -rf "${PLUGINS_DEST:?}/${pname}"
  cp -R "${pdir}" "${PLUGINS_DEST}/${pname}"
  INSTALLED+=("${pname}")
done
echo "Installed ${#INSTALLED[@]} zero-footprint AGY plugins to ${PLUGINS_DEST}: ${INSTALLED[*]}"

if [[ -n "${GE_INSTANCE}" ]]; then
  GE_CFG="${PLUGIN_DATA_DIR}/ge-instance.json"
  umask 077
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
  chmod 600 "${GE_CFG}" 2>/dev/null || true
  if [[ -d "${HOME}/.gemini/antigravity" ]]; then
    AGY_DATA_DIR="${HOME}/.gemini/antigravity/plugin_data/agy-connectors"
    mkdir -p -m 700 "${AGY_DATA_DIR}" 2>/dev/null || true
    cp "${GE_CFG}" "${AGY_DATA_DIR}/ge-instance.json" 2>/dev/null || true
    chmod 600 "${AGY_DATA_DIR}/ge-instance.json" 2>/dev/null || true
  fi
  echo "Saved default Gemini Enterprise instance to ${GE_CFG}"
fi

echo "Ready! Open Google Antigravity -> Extensions -> My Antigravity or Skills (or run /agy-onboard) to begin."
