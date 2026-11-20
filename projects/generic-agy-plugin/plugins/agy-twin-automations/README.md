# AGY Twin Scheduled Automations (`agy-twin-automations` — Opt-In)

Packages four zero-idle-CPU scheduled automations (`"builtin": "schedule"`) directly inside an **opt-in** Antigravity plugin (`"disabled": true` by default so background schedules never run until a user explicitly turns them on).

## Bundled Schedules (Default Timezone: `America/New_York` - Customizable via `/twin-automations`)

1. **Morning Twin Kickoff Brief** (`Weekdays 8:30 AM`): Runs `/daily-brief` across `~/antigravity-twin/memory/` and any connected MCPs (`agy-ge-bridge`), surfacing Top 3 daily priorities, `P0`/`P1` tasks, and `>21d` stale stakeholder alerts.
2. **Twice-Daily Follow-Up Action Plan** (`Weekdays 9:30 AM & 2:30 PM`): Runs `/twin-followup-plan` to audit completed items, update `followups/latest_action_plan.md` and `gtd_board.md`, and prepare `[Draft-Only]` replies.
3. **Evening Notes & Vault Compactor** (`Weekdays 6:00 PM`): Runs `/twin-meeting-notes` maintenance to compact Tier-1 notes older than 7 days into Tier-2 bullets across `initiatives/*/running_notes.md` and refresh contact staleness flags.
4. **Friday 3-Altitude Weekly Impact** (`Fridays 4:00 PM`): Runs `/twin-weekly-impact` to write `weekly/YYYY-WXX.md` and append weekly outcomes to `impact/ledger.json` for 1:1s and quarterly reviews.

## How to Enable
1. Toggle on **Scheduled Twin Automations (Opt-In)** inside **`Extensions -> AGY Skills`** (or enable `agy-twin-automations` on the Customizations page).
2. Run **`/twin-automations`** to set your IANA timezone, then toggle individual schedules anytime in the Antigravity **Automations** dashboard (`sidecar://dashboard`).
