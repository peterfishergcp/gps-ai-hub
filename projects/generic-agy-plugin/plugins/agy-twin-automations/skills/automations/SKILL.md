---
name: automations
description: Configures IANA timezone, run hours, and workspace permissions for the 4 opt-in Antigravity Scheduled Automations (Morning Kickoff Brief via /daily-brief, Twice-Daily Follow-Up Plan via /followup-plan, Evening Notes Compactor via /meeting-notes, and Friday 3-Altitude Weekly Impact via /weekly-impact) using native file editing (zero Node on PATH required) and guides enabling them in the Automations dashboard. Trigger on /automations, "configure my schedules", or "enable my scheduled briefings".
---

# Scheduled Automations Manager (`/automations`)

Help the user customize and activate the 4 opt-in `"builtin": "schedule"` automations bundled in `agy-twin-automations/sidecars/`.

## Bundled Opt-In Automations

| Sidecar ID | Display Name | Default Schedule | Invoked Workflow |
| :--- | :--- | :--- | :--- |
| `morning-twin-brief` | `Morning Kickoff Brief` | `CRON_TZ=America/New_York 30 8 * * 1-5` | `/daily-brief` |
| `twice-daily-followup-plan` | `Twice-Daily Follow-Up Action Plan` | `CRON_TZ=America/New_York 30 9,14 * * 1-5` | `/followup-plan` |
| `nightly-notes-compactor` | `Evening Notes & Memory Compactor` | `CRON_TZ=America/New_York 0 18 * * 1-5` | `/meeting-notes` |
| `friday-weekly-impact` | `Friday 3-Altitude Weekly Impact` | `CRON_TZ=America/New_York 0 16 * * 5` | `/weekly-impact` |

## Configuration & Activation Steps

1. **Set the User's IANA Timezone (Native `edit_file` First — Zero `node` on `PATH` Required):**
   - Read `~/my-antigravity/memory/profile/identity.md` or `~/.gemini/agy-profile.md` (or ask for their IANA timezone such as `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, or `Europe/London` — never 3-letter abbreviations like `EST`).
   - Use native `edit_file` directly on the four `~/.gemini/config/plugins/agy-twin-automations/sidecars/*/sidecar.json` files to update `CRON_TZ=<IANA_Zone>` and any custom hour/minute in `args[0]`.
2. **Offer a Live Test Run & Scoped Permissions:**
   - Offer to execute one test run right now (for example running `/daily-brief`) and add exact scoped `workspace_uris` (`file://<user-home>/my-antigravity/memory` on macOS/Linux) or `read_file` / `write_file` grants in `agent_permissions`.
3. **Enable Opt-In Plugin & Dashboard Toggle:**
   - Remind the user that the scheduled automations plugin ships disabled by default (toggle **Scheduled Automations** in **`Extensions -> Skills`**), and give them the action link `[Open Automations Dashboard](sidecar://dashboard)` to toggle individual schedules on or off.
