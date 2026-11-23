---
name: wv-coordinator
description: State of West Virginia Multi-Agent Command Center & Gemini Live Voice Hub ("Clawy") for triaging active Antigravity agent conversations (Needs You, Working, Ready for Review, Idle), popping conversations open side-by-side, closing idle chats, organizing 2-level Group -> Goal -> Task sprints, and customizing IDENTITY.md / SOUL.md + Gemini Live Voice inside ~/.gemini/config/plugin_data/wv-coordinator/. Use when a user says /wv-coordinator, asks to coordinate multiple agents, check which agent needs attention, track Group -> Goal -> Task progress, or open the WV Clawy panel.
---

# WV Clawy (`Clawy`) — Multi-Agent Command Center & Gemini Live Voice Hub

Coordinates parallel Antigravity agent conversations (`🤖 Agents`), side-by-side split pop-outs (`↗ Pop Out`), live attention triage (`🔔 Updates` / `Notifications`), strict 2-level `Group -> Goal -> Task` sprints, and `Gemini Live` voice commands with **100% zero footprint** inside `~/.gemini/config/plugin_data/wv-coordinator/`.

## Key Capabilities
- **Agents-Dash-Style Triage (`🤖 Agents` + `🔔 Notifications`):** Surfaces active agent conversations in priority order (`🔴 Needs You`, `⚠️ Stalled`, `🔵 Working`, `🟡 Ready for Review`, `🟢 Idle`), strips raw UUIDs and CLI install URLs into clean human titles, and auto-archives older idle chats into `🗄️ Closed & History`.
- **True Side-by-Side Split View (`↗ Pop Out`):** Clicking an agent title or `↗ Pop Out` opens that live Antigravity conversation right next to Clawy (`{ split: true, replace: true }`), with `▾` inline 3-turn peek, `✏️` custom rename, `⏸` Read Later, `✕` Close, and `✓ Close Idle`.

## State of West Virginia (`WVOT`) Zero-Footprint Guarantees
- **Zero Extra Software & Zero `mcp_config.json` Processes:** Runs natively on Antigravity Desktop's built-in sidecar Node runtime with zero npm packages, zero `/tmp` or `%TEMP%` writes, and BOM-free UTF-8 JSON storage.
- **Works With or Without `gcloud`:** Automatically enables `Gemini Live` neural voice when ADC or `gcloud` credentials are present, and cleanly runs 100% of agent discovery, side-by-side split pop-outs, sprint management, and `window.sidecar.agent` relays on locked-down agency laptops without `gcloud`.

## CLI Helper (`coord_ctl.mjs`)

Run commands with Antigravity's Node runtime (or inspect `~/.gemini/config/plugin_data/wv-coordinator/state.json` directly):

```bash
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs status
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs goal add --group group-default --title "Q4 Agency Readiness"
node ~/.gemini/config/plugins/wv-coordinator/scripts/coord_ctl.mjs task add --goal <goalId> --title "Validate FOIA & Grant Audit Deliverables"
```

## Opening the Panel
Direct the user to click **`WV Clawy`** (`Clawy` 3D Mascot icon) in the Antigravity left sidebar (`Extensions -> WV Clawy`).
