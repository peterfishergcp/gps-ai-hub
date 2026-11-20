---
name: twin-memory
description: Inspect, search, update, and organize the persistent 2-Tier Second Brain Memory Vault (~/antigravity-twin/memory/), including the Zero-Task-Decay GTD board, 21-day stakeholder relationship tracker, 4-file isolated initiatives, and reusable topic notes. Trigger on /twin-memory, "check my memory vault", "add to my GTD board", "create a new initiative", or "who is overdue for a check-in".
---

# Second Brain Memory Vault Manager (`/twin-memory`)

Manage the user's persistent **2-Tier Second Brain Memory Vault** at `~/antigravity-twin/memory/`.

## Core Vault Invariants

1. **Zero Task Decay (`gtd_board.md`):**
   - Every task uses strict GTD format under `## P0`, `## P1`, `## P2`, or `## P3`:
     `- [ ] [<Initiative>] <Verb + Concrete Deliverable> [Owner: <Name>] (Added: YYYY-MM-DD)`
   - Never delete or auto-expire open `[ ]` tasks. Only mark `[x]` when confirmed completed, or `[-]` when the user explicitly drops the task.
2. **4-File Initiative Isolation (`initiatives/<slug>/`):**
   - Keep each project, program, microservice, or grant workstream isolated in four focused Markdown files so context stays sharp:
     - `status.md`: Current `GREEN` / `AMBER` / `RED` RAG health, next milestone, and 2-sentence summary.
     - `running_notes.md`: Chronological notes compacted across 4 recency tiers (`0-7d`, `8-30d`, `31-90d`, `90d+`).
     - `context_and_decisions.md`: Architecture, budget caps, policy citations, and dated decisions.
     - `stakeholders.md`: Key sponsors, reviewers, and owners for that workstream.
3. **21-Day Stakeholder Pulse (`contacts.md`):**
   - Track `Last_Touch_Date` (`YYYY-MM-DD`). Flag any key collaborator or sponsor with `>21 days` since last contact as `STALE (>21d)` and offer a `[Draft-Only]` check-in note.

## Fast Operations

When `node` is available in the shell, use `vault_cli.mjs` for deterministic reads and updates (or read/edit the Markdown files directly if `node` is unavailable):

```bash
# Full JSON snapshot of profile, open GTD counts, initiatives, and >21d stale contacts
node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs status --json

# Add a Zero-Decay GTD commitment
node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs gtd-add \
  --priority P0 --initiative "<slug>" --task "<Verb + Deliverable>" --owner "<Name>"

# Toggle a GTD line between [ ] and [x]
node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs gtd-toggle --line <LINE_NUMBER>

# Create a new 4-file isolated initiative
node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs init-initiative \
  --slug "<slug>" --title "<Title>" --rag GREEN --milestone "<Milestone>" --summary "<Summary>"

# Mark a stakeholder as contacted today
node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs touch-contact --name "<Name>"
```

Always remind the user that they can also view and edit every Markdown file live inside **Extensions -> Twin Vault**.
