---
name: twin-automations
description: Configures IANA timezone, run hours, and workspace permissions for the 4 opt-in Antigravity Scheduled Automations (Morning Twin Kickoff Brief via /daily-brief, Twice-Daily Follow-Up Action Plan, Evening Notes & Vault Compactor, and Friday 3-Altitude Weekly Impact) using native file editing (zero Node on PATH required) and guides enabling them in the Automations dashboard. Trigger on /twin-automations, "configure my twin schedules", or "enable my scheduled briefings".
---

# Digital Twin Scheduled Automations Manager (`/twin-automations`)

Help the user customize and activate the 4 opt-in `"builtin": "schedule"` automations bundled in `agy-twin-automations/sidecars/`.

## Bundled Opt-In Automations

| Sidecar ID | Display Name | Default Schedule | Invoked Workflow |
| :--- | :--- | :--- | :--- |
| `morning-twin-brief` | `Morning Twin Kickoff Brief` | `CRON_TZ=America/New_York 30 8 * * 1-5` | `/daily-brief` |
| `twice-daily-followup-plan` | `Twice-Daily Follow-Up Action Plan` | `CRON_TZ=America/New_York 30 9,14 * * 1-5` | `/twin-followup-plan` |
| `nightly-notes-compactor` | `Evening Notes & Vault Compactor` | `CRON_TZ=America/New_York 0 18 * * 1-5` | `/twin-meeting-notes` |
| `friday-weekly-impact` | `Friday 3-Altitude Weekly Impact` | `CRON_TZ=America/New_York 0 16 * * 5` | `/twin-weekly-impact` |

## Configuration & Activation Steps

1. **Set the User's IANA Timezone (Native `edit_file` First — Zero `node` on `PATH` Required):**
   - Read `~/antigravity-twin/memory/profile/identity.md` or `~/.gemini/agy-twin-profile.md` (or ask for their IANA timezone such as `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, or `Europe/London` — never 3-letter abbreviations like `EST`).
   - **Primary Method (Works on All Locked-Down Corporate Laptops):** Use native `edit_file` directly on the four `~/.gemini/config/plugins/agy-twin-automations/sidecars/*/sidecar.json` files (or the active workspace's `plugins/agy-twin-automations/sidecars/*/sidecar.json`) to update `CRON_TZ=<IANA_Zone>` and any custom hour/minute in `args[0]`.
   - **Optional CLI Helper (When `node` Is on `PATH`):** `node ~/.gemini/config/plugins/agy-twin-automations/scripts/configure_schedules.mjs --timezone <IANA_Zone>`.
2. **Offer a Live Test Run & Scoped Permissions:**
   - Scheduled automations run unattended using only verified permissions. Offer to execute one test run right now (for example running `/daily-brief`) and add exact scoped `workspace_uris` (`file://<user-home>/antigravity-twin/memory` on macOS/Linux) or `read_file` / `write_file` grants in `agent_permissions` for the user's actual vault directory (never wildcards like `read_file(*)` or `command(*)`).
3. **Enable Opt-In Plugin & Dashboard Toggle:**
   - Never modify internal `config.json` files directly to force-enable a sidecar. Remind the user that `agy-twin-automations` ships disabled by default (`[agy-twin-automations](customization://agy-twin-automations)` or toggle **Scheduled Twin Automations** in **`Extensions -> AGY Skills`**), and give them the action link `[Open Automations Dashboard](sidecar://dashboard)` to toggle individual schedules on or off.
