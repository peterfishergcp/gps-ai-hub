---
name: followup-plan
description: Executes a structured Follow-Up & Action Item sweep across ~/.gemini/config/plugin_data/my-antigravity/memory/action_items.md, recent meeting notes, and any connected Mail/Chat/Calendar MCPs. Audits already-sent replies first to prevent false positives, writes followups/latest_action_plan.md, syncs action_items.md, and prepares concise [Draft-Only] replies without cluttering external Drafts folders. Trigger on /followup-plan, "follow-up action plan", "action plan sweep", or "stage follow-up drafts".
---

# Follow-Up & Action Item Sweep (`/followup-plan`)

Turn scattered post-meeting promises, unanswered threads, and open `action_items.md` to-dos into one prioritized, source-linked action plan with ready-to-review `[Draft-Only]` messages.

## Step 1 - Delta Sweep (Sent Audit First)

1. **Sent / Completed Check First (Prevent Duplicate Nudges):**
   - If Mail/Chat/GE MCP tools (`agy-ge-bridge` or Workspace/M365 MCP) are connected, check recent sent messages and latest thread replies first so any item already answered by you or a teammate is marked `[x]` in `~/.gemini/config/plugin_data/my-antigravity/memory/action_items.md` instead of surfacing as a false alarm.
   - Check `initiatives/*/running_notes.md` and any pasted updates for completed items.
2. **Collect True Open Action Items:**
   - Pull all open `[ ]` tasks from `action_items.md`, overdue `STALE (>21d)` contacts from `contacts.md`, and unanswered inbound questions from connected sources or pasted threads.

## Step 2 - Write `followups/latest_action_plan.md` & Sync `action_items.md`

Save the prioritized plan to `~/.gemini/config/plugin_data/my-antigravity/memory/followups/latest_action_plan.md` (and update `action_items.md`), grouped into:
- **P0 - Action Today:** Urgent blockers, executive/client responses due today, or pre-reads for tomorrow's calls.
- **P1 - Active Follow-Ups This Week:** Post-meeting recaps, design/policy reviews, and milestone handoffs.
- **P2 - Relationship & Backlog Hygiene:** `>21d` stakeholder check-ins and documentation updates.

For each `P0` and `P1` item (`Action 1`, `Action 2`, ...), include:
1. **Context & Source Line (1-2 sentences):** Where the item came from and what it unblocks, with clickable file or thread references.
2. **Succinct `[Draft-Only]` Message (Calibrated to `profile/voice.md` & `/my-voice`):**
   - Clear header: `[Draft: Email -> Recipient | Subject: ...]` or `[Draft: Chat/Teams -> Recipient]`
   - 1-2 sentence direct opening, 2-4 crisp bullets with concrete dates/links, and 1-sentence next step.

## Step 3 - Interactive Review Prompt

Present a numbered summary in chat and invite quick edits such as *"Shorten Action 1"*, *"Mark Action 2 done"*, or *"Run /outbound-scrub on Action 1"*.
