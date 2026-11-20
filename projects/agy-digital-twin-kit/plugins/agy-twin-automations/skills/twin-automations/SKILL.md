---
name: twin-automations
description: Configures timezone, run hours, and workspace permissions for the 4 bundled Antigravity Scheduled Automations (Morning Twin Kickoff Brief, Twice-Daily Follow-Up Action Plan, Evening Notes & Vault Compactor, and Friday 3-Altitude Weekly Impact) and guides enabling them in Customizations and the Automations dashboard. Trigger on /twin-automations, "configure my twin schedules", or "enable my scheduled briefings".
---

# Digital Twin Scheduled Automations Manager (`/twin-automations`)

Help the user customize and verify the 4 `"builtin": "schedule"` automations bundled in `agy-twin-automations/sidecars/`. Note that `agy-twin-automations` ships opt-in (`"disabled": true` by default) so weekday cron schedules never fire before the user confirms their timezone.

## Bundled Automations

| Sidecar ID | Display Name | Default Schedule |
| :--- | :--- | :--- |
| `morning-twin-brief` | `Morning Twin Kickoff Brief` | `CRON_TZ=America/New_York 30 8 * * 1-5` |
| `twice-daily-followup-plan` | `Twice-Daily Follow-Up Action Plan` | `CRON_TZ=America/New_York 30 9,14 * * 1-5` |
| `nightly-notes-compactor` | `Evening Notes & Vault Compactor` | `CRON_TZ=America/New_York 0 18 * * 1-5` |
| `friday-weekly-impact` | `Friday 3-Altitude Weekly Impact` | `CRON_TZ=America/New_York 0 16 * * 5` |

## Configuration & Activation Steps

1. **Set the User's IANA Timezone (Direct `edit_file` First - Zero Laptop CLI Required):**
   - Read `~/antigravity-twin/memory/profile/identity.md` (or ask for their IANA timezone such as `America/New_York`, `America/Chicago`, `America/Denver`, `America/Los_Angeles`, or `Europe/London` - never 3-letter abbreviations like `EST`).
   - Edit `CRON_TZ=<IANA_Zone>` in `args[0]` directly with `edit_file` across all 4 `~/.gemini/config/plugins/agy-twin-automations/sidecars/*/sidecar.json` files (`morning-twin-brief`, `twice-daily-followup-plan`, `nightly-notes-compactor`, and `friday-weekly-impact`). This works on every workstation, including locked-down corporate Windows laptops without `node` on `PATH`.
   - *(Optional CLI helper: only if `node` is confirmed on `PATH`, you may alternatively run `node ~/.gemini/config/plugins/agy-twin-automations/scripts/configure_schedules.mjs --timezone <Zone>`.)*
2. **Offer a Live Test Run & Scoped Permissions:**
   - Scheduled automations run unattended using only verified permissions. Offer to execute one test run right now (for example running `/twin-brief`) and add exact scoped `workspace_uris` (`file://<user-home>/antigravity-twin/memory` on macOS/Linux) or `read_file` / `write_file` grants in `agent_permissions` for the user's actual vault directory (never wildcards like `read_file(*)` or `command(*)`).
3. **Enable the Opt-In Plugin & Toggle Schedules:**
   - Never modify internal `config.json` files directly to force-enable a plugin or sidecar.
   - Give the user `[agy-twin-automations](customization://agy-twin-automations)` to enable the opt-in plugin on the Customizations page, plus the exact automation display names above and `[Open Automations Dashboard](sidecar://dashboard)` so they can toggle on whichever schedules they want.
