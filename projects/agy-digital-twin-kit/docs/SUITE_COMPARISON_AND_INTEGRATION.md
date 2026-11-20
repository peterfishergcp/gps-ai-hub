# Integration & Capability Diff With `generic-agy-plugin`

This kit (`projects/agy-digital-twin-kit`) was designed to pair directly alongside `generic-agy-plugin` (`v1.0.1`) with **zero plugin name collisions**, **zero `/skill` command collisions**, and **identical zero-laptop-dependency runtime assumptions**.

## 1. Architectural Alignment

| Design Dimension | `generic-agy-plugin` (`v1.0.1`) | `agy-digital-twin-kit` (`v1.0.1`) | How They Work Together |
| :--- | :--- | :--- | :--- |
| **Laptop Runtime** | Antigravity built-in Node (`sidecar_sdk`), zero Python/npm/Docker required | Antigravity built-in Node (`sidecar_sdk`), zero Python/npm/Docker required | Both install in `< 2s` via `agy plugin install`, PowerShell `.ps1`, or Bash `.sh` on locked-down Windows/macOS/Linux laptops |
| **Connectors & Data Access** | `agy-connectors` (`agy-ge-bridge` MCP for Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, GitHub) | Connector-agnostic: reads `agy-ge-bridge` or direct MCPs when present; works 100% standalone on local files when offline | Users configure `/connect-ge` once in `generic-agy-plugin`, and `/twin-brief`, `/twin-followup-plan`, and `/twin-meeting-notes` automatically use it |
| **Persona Profile File** | Single file `~/.gemini/agy-twin-profile.md` read by `/digital-twin` | Full 4-file `~/antigravity-twin/memory/profile/{identity,portfolio,playbooks,voice}.md` **plus** auto-synced `~/.gemini/agy-twin-profile.md` | Running `/twin-setup` populates both suites automatically |
| **Side-Pane UI Extensions** | `AGY Skills` (skill toggle panel) & `AGY Preview` (HTML dashboard/deck preview) | **`Twin Vault`** (live Markdown file tree & editor, interactive GTD checkboxes, 4-file initiative RAG cards, `>21d` contact pulse) | Gives business users and engineers complete visibility into every `.md` memory file Antigravity creates under the hood |

## 2. Net-New Capabilities Added by `antigravity-digital-twin-kit`

1. **Persistent 2-Tier Second Brain Memory Vault (`agy-twin-memory`):**
   - Solves cross-conversation amnesia for Program Managers, Engineers, Analysts, and Leaders.
   - Adds **Zero-Task-Decay GTD tracking** (`gtd_board.md`), **21-day stakeholder staleness alerts** (`contacts.md`), and **4-file per-initiative isolation** (`status.md`, `running_notes.md`, `context_and_decisions.md`, `stakeholders.md`) with **4-Tier Recency Compaction** (`0-7d`, `8-30d`, `31-90d`, `90d+`).
2. **Pre-Meeting Adversarial Minto SCQA Coaching & Parallel Swarm (`agy-twin-workflows`):**
   - `/twin-jit-prep` pressure-tests pitches before high-stakes calls (*Situation -> Complication -> Hard Question -> Counter-Move*).
   - `/twin-swarm-prep` fans out 4 specialized subagents concurrently (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`).
   - `/twin-followup-plan` audits completed items first before staging prioritized `[Draft-Only]` replies.
   - `/twin-weekly-impact` builds a durable accomplishment ledger (`weekly/YYYY-WXX.md` + `impact/ledger.json`) across 3 organizational altitudes.
3. **Hardlined Anti-AI-Slop Editor & Deterministic Outbound Scanner (`agy-twin-voice`):**
   - Upgrades basic correspondence drafting with `/no-ai-slop` (cutting 17 common LLM clichés and binary-contrast gimmicks) and `/outbound-scrub` (`scrub_and_slop_scanner.mjs` catching leaked API keys, private keys, SSNs, and unresolved `[CONFIRM: ...]` placeholders).
4. **Plugin-Packaged Scheduled Automations (`agy-twin-automations`):**
   - Ships 4 `"builtin": "schedule"` cron sidecars (`Morning Twin Kickoff Brief`, `Twice-Daily Follow-Up Action Plan`, `Evening Notes & Vault Compactor`, `Friday 3-Altitude Weekly Impact`) with 1-command IANA timezone configuration (`/twin-automations`).

## 3. Options for Packaging Together

- **Option A - Co-Install Both Suites Side-by-Side (Zero Changes Required):** Run `agy plugin install` on both folders; all 10 plugins appear cleanly in Antigravity Customizations.
- **Option B - Merge Into One Unified Suite:** Copy the 4 folders under `projects/agy-digital-twin-kit/plugins/*` (`agy-twin-memory`, `agy-twin-workflows`, `agy-twin-voice`, `agy-twin-automations`) directly into `generic-agy-plugin/plugins/`, add their 13 skill entries to `SKILL_CATALOG` inside `agy-skill-manager/main.mjs`, and re-run `build-dist-zip.py`.
