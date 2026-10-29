#!/usr/bin/env bash
# ==============================================================================
# prepare_clean_gtm_repo.sh
#
# Creates a zero-history, single-commit export of the scrubbed working tree for
# compliant publication to an approved Google Cloud GTM GitHub organization
# repository (github.com/cloud-gtm/...).
#
# WHY THIS SCRIPT IS REQUIRED:
#   Historical commit 445c33ddd974223cf4e3b098f68a3ed501d847a0 in the legacy
#   repository history contained a 21-row internal CRM activity report CSV and
#   HTML dashboard (deleted in f9d7f4a, plus historical project/issue IDs in
#   9d31beb, 905fe80, and 465452e). Deleting files in a subsequent commit does
#   NOT purge them from public `.git` packfiles.
#
# USAGE:
#   ./prepare_clean_gtm_repo.sh [TARGET_DIR]
#   Default TARGET_DIR: /tmp/gps-ai-hub-clean-export
# ==============================================================================
set -euo pipefail

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${1:-/tmp/gps-ai-hub-clean-export}"

if [[ -e "${DEST_DIR}" ]]; then
  echo "[!] Target directory already exists: ${DEST_DIR}" >&2
  echo "    Remove it first or specify a new path." >&2
  exit 1
fi

mkdir -p "${DEST_DIR}"

echo "[*] Exporting clean working tree from ${SRC_ROOT} -> ${DEST_DIR} ..."
python3 - "${SRC_ROOT}" "${DEST_DIR}" << 'PYEOF'
import os
import pathlib
import shutil
import sys

src_root = pathlib.Path(sys.argv[1]).resolve()
dest_root = pathlib.Path(sys.argv[2]).resolve()

EXCLUDED_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    ".terraform",
    "dist",
    "build",
    ".gcloud",
    ".config",
    ".vscode",
    ".idea",
}

EXCLUDED_FILES = {
    ".env",
    ".purview_token_cache.json",
    ".msal_token_cache.bin",
    ".DS_Store",
}


def should_skip_file(name: str) -> bool:
    if name in EXCLUDED_FILES or name.startswith("._"):
        return True
    if (name.startswith(".env.") and name != ".env.example") or name.endswith(".env"):
        return True
    if any(
        pat in name.lower()
        for pat in ("token_cache", "service_account", "credentials.json", "sa_key", "gcp_key")
    ):
        return True
    if name.endswith((".pyc", ".pyo", ".pem", ".key", ".p12", ".pfx", ".tfstate", ".log")):
        return True
    return False


copied = 0
for dirpath, dirnames, filenames in os.walk(src_root):
    rel_dir = pathlib.Path(dirpath).relative_to(src_root)
    dirnames[:] = [
        d for d in dirnames if d not in EXCLUDED_DIRS and not d.endswith(".venv")
    ]
    target_dir = dest_root / rel_dir
    target_dir.mkdir(parents=True, exist_ok=True)
    for fname in filenames:
        if should_skip_file(fname):
            continue
        s_file = pathlib.Path(dirpath) / fname
        if s_file.is_symlink():
            continue
        d_file = target_dir / fname
        shutil.copy2(s_file, d_file)
        copied += 1

print(f"[+] Copied {copied} clean source files (zero .git history, zero .env/token caches).")
PYEOF

git -C "${DEST_DIR}" init --initial-branch=main >/dev/null
git -C "${DEST_DIR}" add -A
git -C "${DEST_DIR}" commit -m "Initial clean release of GPS AI Hub reference architectures" >/dev/null

COMMIT_COUNT="$(git -C "${DEST_DIR}" rev-list --count HEAD)"
echo "[+] Initialized fresh Git repository at ${DEST_DIR} (commit count: ${COMMIT_COUNT})."
echo ""
echo "Next steps:"
echo "  1. Immediately set any legacy personal mirror to PRIVATE (or delete it after backup)"
echo "     so historical packfiles (commit 445c33d) are no longer publicly reachable."
echo "  2. Create a feature branch in your approved github.com/cloud-gtm repository:"
echo "       cd ${DEST_DIR}"
echo "       git checkout -b feat/gps-ai-hub-clean-release"
echo "       git remote add origin https://github.com/cloud-gtm/<YOUR_APPROVED_REPO>.git"
echo "       git push -u origin feat/gps-ai-hub-clean-release"
