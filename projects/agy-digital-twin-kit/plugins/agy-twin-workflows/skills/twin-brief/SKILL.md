---
name: twin-brief
description: Generates the user's Morning Workday Kickoff Brief ("what needs my attention today") anchored in their local timezone. Combines ~/antigravity-twin/memory/gtd_board.md (P0/P1 commitments), contacts.md (>21d stale stakeholder alerts), active 4-file initiatives, and any connected Calendar/Inbox/Repo MCP bridges into a focused Top-3 Action Plan. Trigger on /twin-brief, "brief me", "what's on my plate", "morning kickoff", or "what needs attention today".
---

# Morning Workday Kickoff Brief (`/twin-brief`)

Produce a focused, high-signal morning brief so the user knows where to spend their first 90 minutes without sifting through dozens of tabs.

## Step 1 - Gather Second Brain & Connected Context

1. **Vault Snapshot:**
   - Read `~/antigravity-twin/memory/profile/identity.md` (for role, active lanes, and primary timezone), `gtd_board.md` (`P0` and `P1` sections), `contacts.md`, and `initiatives/*/status.md` (or run `node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs status --json` if `node` is on `PATH`).
   - If the vault has not been initialized yet, offer `/twin-setup` or create a starter vault first.
2. **Connected MCP Pulse (Optional):**
   - If `agy-ge-bridge` (`ge_ask_instance` / `ge_search_records`) or Calendar/Mail/GitHub MCP tools are available in `<mcp_servers>`, pull today's meetings (anchored in the user's primary timezone), urgent unread threads from the last 24 hours, and open pull-request or ticket blockers.
   - If no external MCP server is connected, build the brief cleanly from the Second Brain vault and any pasted updates.

## Step 2 - Structure the Brief (Direct, Zero Fluff)

Format the brief in four short sections:

1. **Today's Top 3 Actions (Do First):**
   - Rank the 3 highest-impact moves across `P0` commitments, `RED`/`AMBER` initiatives, and today's deadlines, stating the exact deliverable and why it unblocks downstream work.
2. **Calendar & Milestone Watch (Local Time):**
   - Upcoming meetings or initiative milestones from `initiatives/*/status.md`, noting any session that warrants `/twin-jit-prep`.
3. **Open `P0` / `P1` GTD Snapshot:**
   - Concise checklist of active commitments on `gtd_board.md`.
4. **Relationship Pulse (`>21 Days` Stale Check-Ins):**
   - List any stakeholder in `contacts.md` marked `STALE (>21d)` and offer to generate a 3-sentence `[Draft-Only]` check-in via `/twin-voice-draft`.
