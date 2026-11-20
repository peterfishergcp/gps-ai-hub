---
name: daily-brief
description: Generates a concise morning kickoff or weekly executive briefing combining the user's federated Gemini Enterprise (GE) connectors (Outlook/Gmail, Calendar, SharePoint/OneDrive, Teams) AND their Second Brain Memory Vault (~/antigravity-twin/memory/: P0/P1 GTD commitments, active 4-file initiative milestones, and >21-day stale stakeholder check-ins) or pasted notes. Trigger on /daily-brief, "twin brief", "morning kickoff", "morning brief", "daily update", "what needs my attention", "prep me for today's meetings", or "weekly status report".
---

# Daily Executive Update & Second Brain Kickoff Brief (`/daily-brief`)

Produce an actionable, scannable daily kickoff brief or weekly rollup tailored to the user's role and primary timezone (check `~/antigravity-twin/memory/profile/identity.md`, `./agy-twin-profile.md`, or `~/.gemini/agy-twin-profile.md` first if present).

## Step 1: Gather Context (Federated GE Connectors + Second Brain Vault + Local Fallback)

1. **Check Federated Gemini Enterprise (`GE`) Bridge (`agy-ge-bridge`):**
   - If the `agy-ge-bridge` MCP tool `ge_ask_instance` is available and configured, run a single consolidated query against the user's GE instance:
     > *"Summarize my upcoming meetings today/this week, unread high-priority emails or Teams mentions requiring my response, and any open action items or deadlines shared with me across Outlook/Gmail, Calendar, Teams, and SharePoint/OneDrive over the last 48 hours. Cite every email, thread, or document title and date."*
   - If `ge_instance_status` indicates the GE instance is not configured yet—or if a federated connector needs a one-time **Authorize** click in the GE Web App—note in one friendly line (`Tip: Run /connect-ge anytime to pull live Outlook, Teams, and SharePoint updates automatically`) and continue without blocking.
2. **Check 2-Tier Second Brain Memory Vault (`~/antigravity-twin/memory/`, If Initialized):**
   - Check whether `~/antigravity-twin/memory/gtd_board.md` or `profile/identity.md` exists (or run `node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs status --json` when `node` is on `PATH`):
     - Pull open `P0` and `P1` commitments from `gtd_board.md` (preserving Zero Task Decay).
     - Pull current `GREEN` / `AMBER` / `RED` RAG health and next milestones from `initiatives/*/status.md`.
     - Check `contacts.md` for any stakeholders marked `STALE (>21d)` (`>21 days` since `Last_Touch_Date`).
3. **No Connector / Pasted Notes Fallback:**
   - Never block! If the user pasted a calendar schedule, email thread, meeting transcript, or bullet list (or attached `.eml`/`.docx`/`.txt` files), synthesize directly from those materials alongside any vault items. If neither GE, an initialized vault, nor pasted input is available, offer `/agy-onboard` (or `/twin-memory init` / `/connect-ge`) or ask them to paste today's schedule/notes.

## Step 2: Additional Meeting & Project Recipes
When the user asks specifically for a **Single-Meeting Prep Brief**, **Agenda Builder**, **Notes-to-Action-Items Extractor**, **Project Charter**, **RAID / Milestone Tracker**, or **Leadership Status Report**, consult `./references/meetings_project_playbook.md` (and recommend `/twin-jit-prep` when they want an Adversarial Minto SCQA red-team pushback brief).

## Step 3: Output Structure (Scannable BLUF Format)

1. **Bottom Line Up Front (Top 3 Moves Today):** The 3 highest-leverage actions across `P0` commitments, `RED`/`AMBER` initiatives, and today's deadlines, with owner and due time.
2. **Schedule & Milestone Snapshot (Local Time):** Chronological table of meetings and active initiative milestones (`Time / Target | Session or Initiative | Goal / Decision Needed | Prep Doc or /twin-jit-prep Candidate`).
3. **Open Replies, Escalations & `P0`/`P1` GTD Snapshot:** Messages waiting on the user's decision (with verified source citations) plus open `P0`/`P1` items from `gtd_board.md` when the Second Brain vault is active.
4. **Relationship Pulse (`>21 Days` Stale Check-Ins, When Vault Active) & Next Step:** List any `STALE (>21d)` stakeholders from `contacts.md` and offer to draft replies or check-in notes via `/digital-twin`, sweep follow-ups via `/twin-followup-plan`, or build a visual tracker via `/agy-dashboard`.

## Guardrails
- Cite real message subjects, senders, timestamps, vault files, and document names—never invent attendees, deadlines, or commitments.
- Flag `[VERIFY BEFORE SHARING]` on any sensitive personnel, budget, or statutory item.
