#!/usr/bin/env bash
# Fast (<2 second) installer & updater for the Antigravity Digital Twin & Second Brain Kit.
# Works from a local checkout, extracted offline .zip, or HTTPS .zip URL, and coexists
# cleanly alongside generic-agy-plugin without overwriting existing plugins.

set -euo pipefail

ZIP_URL=""
ROLE_PRESET=""
USER_NAME=""
USER_ORG=""
TARGET_CONFIG_DIR="${HOME}/.gemini/config"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --zip-url)
      ZIP_URL="${2:-}"
      shift 2
      ;;
    --role)
      ROLE_PRESET="${2:-}"
      shift 2
      ;;
    --name)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --org)
      USER_ORG="${2:-}"
      shift 2
      ;;
    --config-dir)
      TARGET_CONFIG_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [--zip-url <https-zip>] [--role pm|developer|public-sector|leader] [--name \"...\"] [--org \"...\"] [--config-dir <dir>]"
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
mkdir -p "${PLUGINS_DEST}"

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
  ZIP_FILE="${TMP_DIR}/antigravity-digital-twin-kit.zip"
  EXTRACT_DIR="${TMP_DIR}/extracted"
  mkdir -p "${EXTRACT_DIR}"
  echo "Downloading Antigravity Digital Twin Kit..."
  curl -fsSL "${ZIP_URL}" -o "${ZIP_FILE}"
  validate_and_extract_zip "${ZIP_FILE}" "${EXTRACT_DIR}"
  if [[ -d "${EXTRACT_DIR}/plugins" ]]; then
    SOURCE_SUITE_DIR="${EXTRACT_DIR}"
  else
    FIRST_SUB="$(find "${EXTRACT_DIR}" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    SOURCE_SUITE_DIR="${FIRST_SUB}"
  fi
elif [[ -d "${SUITE_ROOT}/plugins" ]]; then
  SOURCE_SUITE_DIR="${SUITE_ROOT}"
elif [[ -f "${SUITE_ROOT}/dist/antigravity-digital-twin-kit.zip" ]]; then
  TMP_DIR="$(mktemp -d)"
  EXTRACT_DIR="${TMP_DIR}/extracted"
  mkdir -p "${EXTRACT_DIR}"
  validate_and_extract_zip "${SUITE_ROOT}/dist/antigravity-digital-twin-kit.zip" "${EXTRACT_DIR}"
  SOURCE_SUITE_DIR="${EXTRACT_DIR}"
fi

if [[ -z "${SOURCE_SUITE_DIR}" || ! -d "${SOURCE_SUITE_DIR}/plugins" ]]; then
  echo "Error: Could not locate plugins/ directory to install." >&2
  exit 1
fi
if [[ -L "${SOURCE_SUITE_DIR}" || -L "${SOURCE_SUITE_DIR}/plugins" ]]; then
  echo "Error: Refusing symlinked suite or plugins directory." >&2
  exit 1
fi
if find -P "${SOURCE_SUITE_DIR}/plugins" -type l | grep -q .; then
  echo "Error: Refusing symlink inside plugins bundle." >&2
  exit 1
fi

if command -v agy >/dev/null 2>&1 && [[ "${TARGET_CONFIG_DIR}" == "${HOME}/.gemini/config" ]]; then
  echo "Installing Antigravity Digital Twin Kit via native 'agy plugin install'..."
  agy plugin install "${SOURCE_SUITE_DIR}"
else
  INSTALLED=()
  for pdir in "${SOURCE_SUITE_DIR}/plugins"/*; do
    if [[ -L "${pdir}" ]]; then
      echo "Error: Refusing symlink plugin directory: $(basename "${pdir}")" >&2
      exit 1
    fi
    [[ -d "${pdir}" ]] || continue
    pname="$(basename "${pdir}")"
    [[ "${pname}" == .* ]] && continue
    if [[ -L "${pdir}/plugin.json" ]]; then
      echo "Error: Refusing symlink plugin.json inside ${pname}" >&2
      exit 1
    fi
    [[ -f "${pdir}/plugin.json" ]] || continue
    if find -P "${pdir}" -type l | grep -q .; then
      echo "Error: Refusing symlink inside plugin ${pname}" >&2
      exit 1
    fi
    rm -rf "${PLUGINS_DEST:?}/${pname}"
    cp -R "${pdir}" "${PLUGINS_DEST}/${pname}"
    INSTALLED+=("${pname}")
  done
  echo "Installed ${#INSTALLED[@]} Digital Twin plugins to ${PLUGINS_DEST}: ${INSTALLED[*]}"
fi

if [[ -n "${ROLE_PRESET}" ]] && command -v node >/dev/null 2>&1; then
  VAULT_CLI="${PLUGINS_DEST}/agy-twin-memory/scripts/vault_cli.mjs"
  if [[ -f "${VAULT_CLI}" ]]; then
    node "${VAULT_CLI}" init --role "${ROLE_PRESET}" --name "${USER_NAME}" --org "${USER_ORG}" --seed-demo --force
  fi
fi

echo "Ready! Open Google Antigravity -> Extensions -> Twin Vault (or run /twin-setup) to begin."
