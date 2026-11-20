# AGY Twin Scheduled Automations (`agy-twin-automations`)

Packages four zero-idle-CPU scheduled automations (`"builtin": "schedule"`) directly inside an opt-in Antigravity plugin (`"disabled": true` by default) so your Digital Twin keeps your Second Brain vault fresh once you configure your timezone and enable it.

## Bundled Schedules (Default Timezone: `America/New_York` - Customizable via `/twin-automations`)

1. **Morning Twin Kickoff Brief** (`Weekdays 8:30 AM`): Reads `~/antigravity-twin/memory/`, surfaces Top 3 daily priorities, `P0`/`P1` tasks, and `>21d` stale stakeholder alerts.
2. **Twice-Daily Follow-Up Action Plan** (`Weekdays 9:30 AM & 2:30 PM`): Audits completed items, updates `followups/latest_action_plan.md` and `gtd_board.md`, and prepares `[Draft-Only]` replies.
3. **Evening Notes & Vault Compactor** (`Weekdays 6:00 PM`): Compacts Tier-1 notes older than 7 days into Tier-2 bullets across `initiatives/*/running_notes.md` and refreshes contact staleness flags.
4. **Friday 3-Altitude Weekly Impact** (`Fridays 4:00 PM`): Writes `weekly/YYYY-WXX.md` and appends weekly outcomes to `impact/ledger.json` for 1:1s and quarterly reviews.

Enable or pause individual schedules anytime in the Antigravity **Automations** dashboard (`sidecar://dashboard`).
