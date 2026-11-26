---
name: agy-update
description: Incrementally checks and updates individual or modified Public Sector skills and templates in under 1 second using SHA-256 file diffing over HTTPS 443 (zero git required, and no full plugin re-install needed)—preserving user skill toggles and Gemini Enterprise settings. Use when a user says /agy-update, "/agy-update <skill-name>", "update my Public Sector skills", "sync only updated skills", or "install the latest skill update".
---

# Public Sector Incremental Skill & Suite Updater (`/agy-update`)

Update **only new or modified skills in under 1 second**—without wiping or reinstalling all 7 zero-footprint AGY plugins, and with **zero `git` required** on corporate laptops.

## Step 1: Run the Zero-Git Incremental SHA-256 Sync Engine (Default — `< 1 Second`)

Run the bundled `incremental-sync.mjs` script using Antigravity's built-in Node runtime:

- **To incrementally check & update ALL changed/new skills & sidecars across all 7 plugins:**
  ```bash
  node ~/.gemini/config/plugins/agy-onboarding/skills/agy-update/scripts/incremental-sync.mjs
  ```
- **To incrementally update or repair ONE specific skill** (for example, if the user says `/agy-update agy-dashboard` or `/agy-update model-guide`):
  ```bash
  node ~/.gemini/config/plugins/agy-onboarding/skills/agy-update/scripts/incremental-sync.mjs --skill <skill-id>
  ```
- **To preview available updates without writing to disk (`--check`):**
  ```bash
  node ~/.gemini/config/plugins/agy-onboarding/skills/agy-update/scripts/incremental-sync.mjs --check
  ```

### What `incremental-sync.mjs` Does Automatically:
1. Fetches `https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/version-manifest.json` over HTTPS `443`.
2. Compares the SHA-256 hash of every local skill and sidecar file in `~/.gemini/config/plugins/<plugin>/` against `version-manifest.json`.
3. Downloads **only** the specific files whose SHA-256 hash changed (or any newly added skill), removes deprecated legacy `agy-connectors` and `agy-coordinator` folders on upgrade, writes updates atomically in place, and **preserves**:
   - Your per-skill enable/disable toggles (`SKILL.md.disabled` / `skill-toggles.json`),
   - Your personal skills (`~/.gemini/config/skills/`), and
   - Your Personal Memory (`~/.gemini/config/plugin_data/my-antigravity/memory/` and `agy-profile.md`).

> **Tip for 1-Click UI Updates:** Users can also click **`Sync Updates`** directly inside the **`Skills`** panel in Antigravity's left sidebar (`Plugins -> Skills`) to run this incremental sync without typing a command!

---

## Step 2: Optional Full Suite Re-Install (Only When a New Sidecar or MCP Binary Is Added)

If a major suite upgrade adds a brand-new plugin or UI sidecar (such as `Preview` or `My Antigravity`), run the full installer:
```bash
curl -fsSL https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/scripts/install-agy-suite.sh | bash
```
*(Or on laptops without `git`, run `bash ~/.gemini/config/plugins/agy-onboarding/skills/agy-update/scripts/install-agy-suite.sh --zip-url "https://github.com/peterfishergcp/gps-ai-hub/raw/main/projects/generic-agy-plugin/dist/generic-agy-plugin.zip"` on macOS/Linux or `install-agy-suite.ps1 -ZipUrl "..."` on Windows PowerShell.)*
