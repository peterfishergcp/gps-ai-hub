---
name: wv-coordinator
description: State of West Virginia Multi-Agent Coordinator & Gemini Live Voice Hub ("Clawy") for listing active Antigravity Workers, organizing 2-level Group -> Goal -> Task sprints, dispatching or relaying worker instructions, and customizing IDENTITY.md / SOUL.md + Gemini Live Voice inside ~/.gemini/config/plugin_data/wv-coordinator/. Use when a user says /wv-coordinator, asks to coordinate multiple agents, track Group -> Goal -> Task progress, relay instructions to another conversation, or open the WV Coordinator panel.
---

# WV Coordinator (`Clawy`) — Multi-Agent & Gemini Live Voice Hub

Coordinates parallel Antigravity conversations, strict 2-level `Group -> Goal -> Task` sprints, and `Gemini Live` voice commands with **100% zero footprint** inside `~/.gemini/config/plugin_data/wv-coordinator/`.

## State of West Virginia (`WVOT`) Zero-Footprint Guarantees
- **Zero Extra Software & Zero `mcp_config.json` Processes:** Runs natively on Antigravity Desktop's built-in sidecar Node runtime with zero npm packages, zero `/tmp` or `%TEMP%` writes, and BOM-free UTF-8 JSON storage.
- **Works With or Without `gcloud`:** Automatically enables `Gemini Live` neural voice when ADC or `gcloud` credentials are present, and cleanly runs 100% of worker discovery, sprint management, and `window.sidecar.agent` relays on locked-down agency laptops without `gcloud`.

## CLI Helper (`coord_ctl.mjs`)

Run commands with Antigravity's Node runtime (or inspect `~/.gemini/config/plugin_data/wv-coordinator/state.json` directly):

```bash
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs status
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs goal add --group group-default --title "Q4 Agency Readiness"
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs task add --goal <goalId> --title "Validate FOIA & Grant Audit Deliverables"
```

## Opening the Panel
Direct the user to click **`WV Coordinator`** (`Clawy` 3D Mascot icon) in the Antigravity left sidebar (`Extensions -> WV Coordinator`).
