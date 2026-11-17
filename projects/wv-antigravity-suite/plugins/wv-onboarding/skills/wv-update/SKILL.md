---
name: wv-update
description: Checks for new State of West Virginia Antigravity skills, templates, and plugin updates from Git or an agency HTTPS ZIP release and installs them in under 2 seconds while preserving user settings. Trigger on /wv-update, "update my WV skills", "check for plugin updates", or "sync latest West Virginia plugins".
---

# Fast Git & HTTPS Skill Suite Updater (`/wv-update`)

Keep the user's installed **State of West Virginia Antigravity Suite** up to date in **under 2 seconds**—even on locked-down corporate laptops without `git` installed.

Self-contained updater scripts ship directly inside this skill folder at `<skill_dir>/scripts/install-wv-suite.ps1` (Windows) and `<skill_dir>/scripts/install-wv-suite.sh` (macOS/Linux), so `/wv-update` works from **any** active workspace!

## Step 1: Inspect Currently Installed Versions
1. Read `~/.gemini/config/plugins/wv-onboarding/plugin.json` (and sibling `wv-*` plugin manifests) to note the currently installed version(s).
2. Confirm that user configuration files (`~/.gemini/config/plugin_data/wv-connectors/ge-instance.json` and any `wv-twin-profile.md`) are stored **outside** the plugin code folders so updating never overwrites personal settings.

## Step 2: Check Update Source & Confirm Before Updating
Ask or check which update source the user's cohort uses (an agency-hosted HTTPS release ZIP URL, an agency Git mirror, or `cloud-gtm/gps-ai-hub` for authorized GitHub members):

1. **Fast `< 2s` Zero-Git Mode (Windows PowerShell — Standard WV Corporate Laptops):**
   - Execute the bundled updater inside `<skill_dir>/scripts/install-wv-suite.ps1`:
     ```powershell
     powershell -ExecutionPolicy Bypass -File "$HOME\.gemini\config\plugins\wv-onboarding\skills\wv-update\scripts\install-wv-suite.ps1" -ZipUrl "<AGENCY_HTTPS_ZIP_URL>"
     ```
2. **Native Antigravity CLI Bulk Git Update (When `agy` and `git` Have Repo Access):**
   ```bash
   agy plugin install <GIT_SUITE_URL>
   ```
   *(For Google / `cloud-gtm` teams: `https://github.com/cloud-gtm/gps-ai-hub/tree/main/projects/wv-antigravity-suite`; for external state cohorts without `cloud-gtm` org membership, use the agency's public/internal Git mirror or HTTPS release ZIP.)*
3. **Fast Git Sparse-Checkout Mode (macOS / Linux / Developer Workstations — Fetches `< 200 KB` Only):**
   ```bash
   bash "$HOME/.gemini/config/plugins/wv-onboarding/skills/wv-update/scripts/install-wv-suite.sh" --git-sparse <GIT_REPO_HTTPS_URL>
   ```

## Step 3: Summarize What Changed
After updating, read `version-manifest.json` (if present) and give the user a 3-bullet plain-language summary of newly added `/skills`, templates, and fixes. Remind them that changes take effect live in **Customizations > Installed**.
