---
name: weekly-impact
description: Friday Closeout, 3-Altitude Visibility Narrator & Body-of-Work Ledger updater. Summarizes weekly completions from ~/my-antigravity/memory/action_items.md and initiatives/*/running_notes.md across 3 altitudes (Executive/Leadership Outcomes, Cross-Team Reusable Assets, and Workstream Velocity), saving to weekly/YYYY-WXX.md and impact/ledger.json for 1:1s, QBRs, and performance reviews. Trigger on /weekly-impact, "friday closeout", "weekly impact summary", or "update my accomplishment ledger".
---

# Friday Closeout & 3-Altitude Impact Narrator (`/weekly-impact`)

Never scramble at quarter-end or annual review time to remember what shipped. Distill each week's real work from `~/my-antigravity/memory/` into a structured weekly record and accomplishment ledger.

## Step 1 - Harvest This Week's Evidence

1. Read `~/my-antigravity/memory/action_items.md` (`[x]` items completed this week and active `P0`/`P1` carry-overs).
2. Read Tier-1 (`0-7d`) entries across `~/my-antigravity/memory/initiatives/*/running_notes.md` and `status.md`.
3. Read `~/my-antigravity/memory/impact/ledger.json` and `profile/identity.md`.

## Step 2 - Author the 3-Altitude Narrative

Write `~/my-antigravity/memory/weekly/YYYY-WXX.md` (using the current ISO year and week) structured across three distinct altitudes:

1. **Altitude 1 - Leadership & Executive Outcomes (For Manager 1:1s & Steering Readouts):**
   - Quantified milestones reached, risks retired, cost/time saved, or constituent/customer outcomes delivered.
2. **Altitude 2 - Cross-Team & Reusable Assets (Peer Multiplier Impact):**
   - Templates, runbooks, SQL/code modules, policy checklists, or playbooks added to `topics/` or shared across teams.
3. **Altitude 3 - Workstream Velocity & Next Week's Top 3:**
   - Per-initiative status summary (`GREEN` / `AMBER` / `RED`) and next Monday's top 3 `P0` priorities.

## Step 3 - Append to `impact/ledger.json`

Append a structured JSON entry to `entries` inside `~/my-antigravity/memory/impact/ledger.json` with `date`, `isoWeek`, `initiative`, `altitude1ExecutiveOutcome`, `altitude2ReusableAsset`, and `altitude3WorkstreamVelocity`, then present a ready-to-paste `[Draft: Manager 1:1 / Weekly Update]` snippet in chat.
