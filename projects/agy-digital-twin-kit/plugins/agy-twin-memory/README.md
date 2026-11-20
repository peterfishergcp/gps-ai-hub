# AGY Twin Memory & Vault UI (`agy-twin-memory`)

Gives Google Antigravity a structured, plain-Markdown **Second Brain Memory Vault** (`~/antigravity-twin/memory/`) plus an interactive **Twin Vault** side-pane UI so any user - whether a Program Manager, Software/Data Engineer, Public Sector Analyst, or Team Lead - keeps persistent context across every conversation.

## Included Capabilities

- **2-Tier Markdown Memory Vault (`~/antigravity-twin/memory/`):**
  - `profile/{identity,portfolio,playbooks,voice}.md` (also syncs `~/.gemini/agy-twin-profile.md` for interoperability with `generic-agy-plugin`)
  - `gtd_board.md` with **Zero Task Decay** (`P0`, `P1`, `P2`, `P3`, `Completed`)
  - `contacts.md` with automatic `>21 days` stale check-in alerts
  - `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md` with **4-Tier Recency Compaction** (`0-7d`, `8-30d`, `31-90d`, `90d+`)
- **`Twin Vault` Extension UI Sidecar (`sidecars/twin-vault-ui/`):**
  - Runs on Antigravity Desktop's built-in Node runtime (`sidecar_sdk`) with zero extra laptop installs.
  - Lets users inspect and edit every Markdown file under the hood, check off GTD tasks live, monitor RAG health across initiatives, and launch workflows in one click.
- **Slash Skills:** `/twin-setup`, `/twin-memory`, `/twin-meeting-notes`.
