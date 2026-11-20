---
name: twin-memory
description: Initialize, inspect, search, update, and organize the persistent 2-Tier Second Brain Memory Vault (~/antigravity-twin/memory/), including preset vault setup (public-sector, pm, developer, leader), the Zero-Task-Decay GTD board, 21-day stakeholder relationship tracker, 4-file isolated initiatives, and reusable topic notes. Trigger on /twin-memory, "/twin-memory init", "initialize my vault", "initialize my second brain", "check my memory vault", "add to my GTD board", "create a new initiative", or "who is overdue for a check-in".
---

# Second Brain Memory Vault Manager & Initializer (`/twin-memory`)

Initialize and manage the user's persistent **2-Tier Second Brain Memory Vault** at `~/antigravity-twin/memory/` (also viewable and editable live inside **`Extensions -> Twin Vault`**).

## Sub-Mode: Initialize or Switch Vault Role Preset (`/twin-memory init` or `"initialize my vault"`)

When `~/antigravity-twin/memory/profile/identity.md` does not exist yet, or when the user asks to initialize/reset their vault with a role preset (`public-sector`, `pm`, `developer`, or `leader`):

1. **Gather Role Details (If Not Provided):** Ask concisely for Role Preset (`public-sector` default for government staff, `pm`, `developer`, or `leader`), Name & Title, Agency/Team, and IANA Timezone (e.g., `America/New_York`).
2. **Initialize the Vault:**
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
   - **No-`node`-on-PATH Fallback (Locked-Down Windows/Corporate Laptops):** Create the Markdown and JSON files directly in `~/antigravity-twin/memory/` using file tools:
     - `profile/{identity,portfolio,playbooks,voice}.md` (plus sync `~/.gemini/agy-twin-profile.md`)
     - `gtd_board.md` (`## P0`, `## P1`, `## P2`, `## P3`, `## Completed Archive`)
     - `contacts.md` (table with `Name | Email | Role | Initiative | Key Priorities | Last_Touch_Date | Status`)
     - `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md`
     - `topics/lessons-learned.md`, `followups/latest_action_plan.md`, and `impact/ledger.json`.
3. Point the user to **`Extensions -> Twin Vault`** and suggest running **`/daily-brief`** next.

---

## Core Vault Invariants

1. **Zero Task Decay (`gtd_board.md`):**
   - Every task uses strict GTD format under `## P0`, `## P1`, `## P2`, or `## P3`:
     `- [ ] [<Initiative>] <Verb + Concrete Deliverable> [Owner: <Name>] (Added: YYYY-MM-DD)`
   - Never delete or auto-expire open `[ ]` tasks. Only mark `[x]` when confirmed completed, or `[-]` when the user explicitly drops the task.
2. **4-File Initiative Isolation (`initiatives/<slug>/`):**
   - Keep each project, program, microservice, or grant workstream isolated in four focused Markdown files:
     - `status.md`: Current `GREEN` / `AMBER` / `RED` RAG health, next milestone, and 2-sentence summary.
     - `running_notes.md`: Chronological notes compacted across 4 recency tiers (`0-7d`, `8-30d`, `31-90d`, `90d+`).
     - `context_and_decisions.md`: Architecture, budget caps, policy citations, and dated decisions.
     - `stakeholders.md`: Key sponsors, reviewers, and owners for that workstream.
3. **21-Day Stakeholder Pulse (`contacts.md`):**
   - Track `Last_Touch_Date` (`YYYY-MM-DD`). Flag any key collaborator or sponsor with `>21 days` since last contact as `STALE (>21d)` and offer a `[Draft-Only]` check-in note via **`/digital-twin`**.

## Fast CLI Operations (Or Direct File-Tool Edits When `node` Is Unavailable)

```bash
# Full JSON snapshot of profile, open GTD counts, initiatives, and >21d stale contacts
node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs status --json

# Add a Zero-Decay GTD commitment
node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs gtd-add \
  --priority P0 --initiative "<slug>" --task "<Verb + Deliverable>" --owner "<Name>"

# Toggle a GTD line between [ ] and [x]
node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs gtd-toggle --line <LINE_NUMBER>

# Create a new 4-file isolated initiative
node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs init-initiative \
  --slug "<slug>" --title "<Title>" --rag GREEN --milestone "<Milestone>" --summary "<Summary>"

# Mark a stakeholder as contacted today
node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs touch-contact --name "<Name>"
```
