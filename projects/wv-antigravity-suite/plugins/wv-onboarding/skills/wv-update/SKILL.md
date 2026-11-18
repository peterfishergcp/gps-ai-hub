---
name: wv-update
description: Incrementally checks and updates individual or modified State of West Virginia skills and templates in under 1 second using SHA-256 file diffing over HTTPS 443 (zero git required, and no full plugin re-install needed)—preserving user skill toggles and Gemini Enterprise settings. Use when a user says /wv-update, "/wv-update <skill-name>", "update my West Virginia skills", "sync only updated skills", or "install the latest skill update".
---

# West Virginia Incremental Skill & Suite Updater (`/wv-update`)

Update **only new or modified skills in under 1 second**—without wiping or reinstalling all 6 plugins, and with **zero `git` required** on state corporate laptops.

## Step 1: Run the Zero-Git Incremental SHA-256 Sync Engine (Default — `< 1 Second`)

Run the bundled `incremental-sync.mjs` script using Antigravity's built-in Node runtime:

- **To incrementally check & update ALL changed/new skills across all 6 plugins:**
  ```bash
  node ~/.gemini/config/plugins/wv-onboarding/skills/wv-update/scripts/incremental-sync.mjs
  ```
- **To incrementally update or repair ONE specific skill** (for example, if the user says `/wv-update wv-dashboard` or `/wv-update model-guide`):
  ```bash
  node ~/.gemini/config/plugins/wv-onboarding/skills/wv-update/scripts/incremental-sync.mjs --skill <skill-id>
  ```
- **To preview available updates without writing to disk (`--check`):**
  ```bash
  node ~/.gemini/config/plugins/wv-onboarding/skills/wv-update/scripts/incremental-sync.mjs --check
  ```

### What `incremental-sync.mjs` Does Automatically:
1. Fetches `https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite/version-manifest.json` over HTTPS `443`.
2. Compares the SHA-256 hash of every local skill file in `~/.gemini/config/plugins/<plugin>/skills/<skill>/` against `version-manifest.json.skillManifest`.
3. Downloads **only** the specific files whose SHA-256 hash changed (or any newly added skill), writes them atomically in place, and **preserves**:
   - Your per-skill enable/disable toggles (`SKILL.md.disabled` / `skill-toggles.json`),
   - Your saved Gemini Enterprise (`GE`) instance configuration (`~/.gemini/config/plugin_data/wv-connectors/ge-instance.json`), and
   - Your personal Digital Twin profile (`wv-twin-profile.md`).

> **Tip for 1-Click UI Updates:** Users can also click **`Sync Git Updates`** (or the **`↻`** icon next to any individual skill) directly inside the **`WV Skills`** panel in Antigravity's left sidebar (`Extensions -> WV Skills`) to run this incremental sync without typing a command!

---

## Step 2: Optional Full Suite Re-Install (Only When a New Sidecar or MCP Binary Is Added)

If a major suite upgrade adds a brand-new plugin or UI sidecar (such as `WV Preview`), run the full installer:
```bash
agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/wv-antigravity-suite
```
*(Or on laptops without `git`, run `bash ~/.gemini/config/plugins/wv-onboarding/skills/wv-update/scripts/install-wv-suite.sh --zip-url "https://github.com/peterfishergcp/gps-ai-hub/raw/main/projects/wv-antigravity-suite/dist/wv-antigravity-suite.zip"` on macOS/Linux or `install-wv-suite.ps1 -ZipUrl "..."` on Windows PowerShell.)*
