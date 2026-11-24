---
name: memory
description: Initialize, inspect, search, update, and organize persistent Personal Workspace Memory (~/.gemini/config/plugin_data/my-antigravity/memory/), including preset setup (public-sector, pm, developer, leader), Action Items (action_items.md), 21-day stakeholder relationship tracker, 4-file isolated initiatives, and reusable topic notes. Trigger on /memory, "/memory init", "initialize my memory", "check my action items", "add an action item", "create a new initiative", or "who is overdue for a check-in".
---

# Personal Workspace Memory & Action Items Manager (`/memory`)

Initialize and manage the user's persistent **Personal Workspace Memory** at `~/.gemini/config/plugin_data/my-antigravity/memory/` (viewable and editable inside **`Extensions -> My Antigravity`**).

## Sub-Mode: Initialize or Switch Role Preset (`/memory init` or `"initialize my memory"`)

When `~/.gemini/config/plugin_data/my-antigravity/memory/profile/identity.md` does not exist yet, or when the user asks to initialize/switch their role preset (`public-sector`, `pm`, `developer`, or `leader`):

1. **Gather Role Details (If Not Provided):** Ask concisely for Role Preset (`public-sector` default for government staff, `pm`, `developer`, or `leader`), Name & Title, Agency/Team, and IANA Timezone (e.g., `America/New_York`).
2. **Initialize Personal Memory:**
   - **When `node` is on `PATH`:**
     ```bash
     node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs init \
       --role <public-sector|pm|developer|leader> \
       --name "<User Name>" \
       --role-title "<Job Title>" \
       --org "<Agency or Team>" \
       --timezone "<IANA Timezone>" \
       --seed-demo \
       --force
     ```
   - **No-`node`-on-PATH Fallback:** Create the Markdown and JSON files directly in `~/.gemini/config/plugin_data/my-antigravity/memory/` using file tools:
     - `profile/{identity,portfolio,playbooks,voice}.md` (plus sync `~/.gemini/config/plugin_data/my-antigravity/agy-profile.md`)
     - `action_items.md` (`## P0`, `## P1`, `## P2`, `## P3`, `## Completed Archive`)
     - `contacts.md` (`Name | Email | Role | Initiative | Key Priorities | Last_Touch_Date | Status`)
     - `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md`
     - `topics/lessons-learned.md`, `followups/latest_action_plan.md`, and `impact/ledger.json`.
3. Point the user to **`Extensions -> My Antigravity`** (`Action Items` and the top-right **Customize** icon) and suggest running **`/daily-brief`** next.

---

## Core Memory Invariants

1. **Zero Action-Item Decay (`action_items.md`):**
   - Format every item under `## P0`, `## P1`, `## P2`, or `## P3`:
     `- [ ] [<Initiative>] <Verb + Concrete Deliverable> [Owner: <Name>] (Added: YYYY-MM-DD)`
   - Never delete or auto-expire open `[ ]` items. Only mark `[x]` when confirmed completed, or `[-]` when explicitly dropped.
2. **4-File Initiative Isolation (`initiatives/<slug>/`):**
   - Keep each project, program, service, or grant workstream isolated in four focused Markdown files (`status.md`, `running_notes.md`, `context_and_decisions.md`, `stakeholders.md`).
3. **21-Day Stakeholder Pulse (`contacts.md`):**
   - Track `Last_Touch_Date` (`YYYY-MM-DD`). Flag any key collaborator or sponsor with `>21 days` since last contact as `STALE (>21d)` and offer a `[Draft-Only]` check-in note via **`/my-voice`**.
