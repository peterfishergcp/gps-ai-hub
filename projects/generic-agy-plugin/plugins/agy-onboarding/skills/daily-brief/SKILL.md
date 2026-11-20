---
name: daily-brief
description: Generates a concise morning kickoff or weekly executive briefing combining the user's federated Gemini Enterprise (GE) connectors (Outlook/Gmail, Calendar, SharePoint/OneDrive, Teams) AND their Personal Workspace Memory (~/my-antigravity/memory/: P0/P1 Action Items, active 4-file initiative milestones, and >21-day stale stakeholder check-ins) or pasted notes. Trigger on /daily-brief, "morning kickoff", "morning brief", "daily update", "what needs my attention", "prep me for today's meetings", or "weekly status report".
---

# Daily Executive Update & Kickoff Brief (`/daily-brief`)

Produce an actionable, scannable daily kickoff brief or weekly rollup tailored to the user's role and primary timezone (check `~/my-antigravity/memory/profile/identity.md`, `./agy-profile.md`, or `~/.gemini/agy-profile.md` first if present).

## Step 1: Gather Context (Federated GE Connectors + Personal Memory + Local Fallback)

1. **Check Federated Gemini Enterprise (`GE`) Bridge (`agy-ge-bridge`):**
   - If `ge_ask_instance` is available and configured, run a single consolidated query against the user's GE instance summarizing upcoming meetings, unread high-priority messages, and open deadlines across Outlook/Gmail, Calendar, Teams, and SharePoint/OneDrive over the last 48 hours with citations.
   - If not configured yet, note in one friendly line (`Tip: Run /connect-ge anytime to pull live Outlook, Teams, and SharePoint updates automatically`) and continue without blocking.
2. **Check Personal Workspace Memory (`~/my-antigravity/memory/`, If Initialized):**
   - Pull open `P0` and `P1` action items from `action_items.md`.
   - Pull current `GREEN` / `AMBER` / `RED` health and next milestones from `initiatives/*/status.md`.
   - Check `contacts.md` for any stakeholders marked `STALE (>21d)`.
3. **No Connector / Pasted Notes Fallback:**
   - Synthesize directly from any pasted schedule, email thread, or meeting notes alongside open action items.

## Step 2: Additional Meeting & Project Recipes
Consult `./references/meetings_project_playbook.md` for single-meeting agendas, project charters, and RAID trackers (and recommend `/meeting-prep` when they want an Adversarial Minto SCQA red-team pushback brief).

## Step 3: Output Structure (Scannable BLUF Format)

1. **Bottom Line Up Front (Top 3 Moves Today):** The 3 highest-leverage actions across `P0` to-dos, `RED`/`AMBER` initiatives, and today's deadlines.
2. **Schedule & Milestone Snapshot (Local Time):** Chronological table of meetings and active initiative milestones (`Time / Target | Session or Initiative | Goal / Decision Needed | Prep Doc or /meeting-prep Candidate`).
3. **Suggested To-Dos & Open Replies:** Messages waiting on the user's decision plus open `P0`/`P1` items from `action_items.md`.
4. **Topics & Stakeholder Check-Ins (`>21 Days`):** List active topics and any `STALE (>21d)` stakeholders from `contacts.md`, offering to draft replies via `/my-voice`, sweep follow-ups via `/followup-plan`, or build a visual tracker via `/agy-dashboard`.
