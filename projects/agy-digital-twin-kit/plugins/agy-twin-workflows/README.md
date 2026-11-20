# AGY Twin Daily, SCQA & Swarm Workflows (`agy-twin-workflows`)

Turns the Second Brain Memory Vault (`~/antigravity-twin/memory/`) into daily execution habits for Program Managers, Engineers, Public Sector Analysts, and Team Leads.

## Included Slash Skills & Subagents

- **`/twin-brief`:** Morning kickoff brief combining `gtd_board.md` (`P0`/`P1`), `contacts.md` (`>21d` stale check-ins), active initiatives, and connected calendar/inbox MCPs into Top 3 daily actions.
- **`/twin-jit-prep`:** 15-minute pre-meeting 1-card brief featuring an **Adversarial Minto Pyramid (SCQA) Critic** (*Situation -> Complication -> Hard Question -> Evidence-Backed Counter-Move*).
- **`/twin-followup-plan`:** Twice-daily multi-channel sweep that checks sent/completed items first to avoid false positives, writes `followups/latest_action_plan.md`, syncs `gtd_board.md`, and stages `[Draft-Only]` replies.
- **`/twin-swarm-prep`:** Fans out 4 specialized subagents (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`) in parallel for 360-degree milestone prep or post-meeting blitzes.
- **`/twin-weekly-impact`:** Friday closeout and **3-Altitude Visibility Narrator** (Leadership Outcomes, Cross-Team Reusable Assets, Workstream Velocity) logged to `weekly/YYYY-WXX.md` and `impact/ledger.json`.
- **`/twin-progress-tracker`:** Maintains a live `Plan.md` checklist (`[x]`, `[~]`, `[ ]`) and labelled resource manifest during multi-step engineering, analytics, or policy builds.
