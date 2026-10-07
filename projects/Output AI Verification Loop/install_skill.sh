#!/usr/bin/env bash
# Installs the `output-engineer` skill into the user's local Jetski / Antigravity
# customization directories (~/.gemini/config/skills/ and ~/.gemini/skills/).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="${SCRIPT_DIR}/skill/output-engineer"

TARGET_CONFIG_DIR="${HOME}/.gemini/config/skills/output-engineer"
TARGET_LEGACY_DIR="${HOME}/.gemini/skills"

echo "Installing output-engineer skill for Jetski / Antigravity..."
mkdir -p "${TARGET_CONFIG_DIR}"
cp -R "${SKILL_SRC}/"* "${TARGET_CONFIG_DIR}/"

mkdir -p "${TARGET_LEGACY_DIR}"
ln -sfn "${TARGET_CONFIG_DIR}" "${TARGET_LEGACY_DIR}/output-engineer"

echo "✅ Installed output-engineer skill to:"
echo "   - ${TARGET_CONFIG_DIR}/SKILL.md"
echo "   - ${TARGET_LEGACY_DIR}/output-engineer (symlink)"
echo ""
echo "You can now invoke the skill in Jetski or Antigravity by asking:"
echo '   "Run the output-engineer skill on this security review draft and compare Gemini Pro vs Claude Opus."'
