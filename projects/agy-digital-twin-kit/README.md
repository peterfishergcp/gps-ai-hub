# Antigravity Digital Twin & Second Brain Kit (`v1.0.1`)

A modular, zero-dependency **Second Brain Memory Vault, Daily Execution & Authentic Voice Suite** for **Google Antigravity (`AGY`)**.

Built for any customer persona - **Program Managers**, **Software & Data Engineers**, **Public Sector / State Agency Knowledge Workers**, and **Team Leads** - so Antigravity remembers ongoing projects, commitments, stakeholders, and communication style across every conversation without extra software installs on employee laptops.

## Why Use This Kit

- **Persistent Plain-Markdown Second Brain (`~/antigravity-twin/memory/`):** Replaces one-off stateless chats with a structured 2-Tier Memory Vault:
  - **4-File Role Profile (`profile/{identity,portfolio,playbooks,voice}.md`):** Stores role context, active priorities, operational playbooks, and writing style (and syncs `~/.gemini/agy-twin-profile.md` for seamless interoperability).
  - **Zero-Task-Decay GTD Board (`gtd_board.md`):** Strict priority buckets (`P0`, `P1`, `P2`, `P3`, `Completed`) where open commitments never auto-expire until explicitly checked off `[x]` or dropped `[-]`.
  - **Stakeholder Relationship Pulse (`contacts.md`):** Tracks `Last_Touch_Date` and flags key sponsors or collaborators overdue by `>21 days` (`STALE (>21d)`).
  - **4-File Initiative Isolation (`initiatives/<slug>/`):** Separates each project, microservice, or grant program into `status.md`, `running_notes.md` (**4-Tier Recency Compaction**: `0-7d`, `8-30d`, `31-90d`, `90d+`), `context_and_decisions.md`, and `stakeholders.md`.
- **Interactive `Twin Vault` Side-Pane UI (`sidecars/twin-vault-ui/`):**
  - Runs on Antigravity Desktop's built-in Node runtime (`sidecar_sdk`) with zero separate `Node.js`, `Python`, `npm`, `pip`, or `Docker` installs required on locked-down corporate or government laptops.
  - Lets users inspect and edit every Markdown file Antigravity creates under the hood, toggle GTD checkboxes live, switch persona presets, and trigger workflows in one click.
- **Works Standalone or With Federated Connectors:**
  - Operates 100% standalone on local files and pasted notes from Turn 1, and automatically uses connected MCP servers (including `agy-ge-bridge` for federated Gemini Enterprise access to Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, and GitHub) whenever attached.

## 3 Ways to Install

### 1. Native Antigravity 1-Command Install
Open a **+ New Conversation** in Google Antigravity, paste the command below into the chat box, and press **Enter**:

```bash
agy plugin install https://github.com/cloud-gtm/gps-ai-hub/tree/main/projects/agy-digital-twin-kit
```

### 2. Offline `.zip` or Local Checkout Install (`< 2 Seconds`, Zero `git` Required)

**Windows PowerShell** (extract `dist/antigravity-digital-twin-kit.zip` and run):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-twin-kit.ps1 -Role pm
```

**macOS / Linux:**
```bash
bash ./scripts/install-twin-kit.sh --role pm
```
*(Available `-Role` / `--role` presets: `pm`, `developer`, `public-sector`, `leader`. Omit the flag to choose interactively inside **Extensions -> Twin Vault** or via `/twin-setup`.)*

### 3. Git Sparse-Checkout (Clones Only This Folder)
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/cloud-gtm/gps-ai-hub.git agy-twin
cd agy-twin && git sparse-checkout set projects/agy-digital-twin-kit
bash projects/agy-digital-twin-kit/scripts/install-twin-kit.sh
```

## What Gets Installed (4 Modular Plugins, 13 Slash Skills, 4 Subagents, 1 UI Panel & 4 Scheduled Automations)

| Plugin | Included `/skills`, Subagents & Sidecars | Best For |
| :--- | :--- | :--- |
| **`agy-twin-memory`** | `/twin-setup` · `/twin-memory` · `/twin-meeting-notes` + **`Twin Vault` Sidecar UI** + `vault_cli.mjs` + Vault Routing Rules | Persistent Second Brain memory, GTD board, `>21d` contact pulse & live Markdown viewer |
| **`agy-twin-workflows`** | `/twin-brief` · `/twin-jit-prep` *(Adversarial SCQA Critic)* · `/twin-followup-plan` · `/twin-swarm-prep` *(4 parallel subagents)* · `/twin-weekly-impact` *(3-Altitude Narrator)* · `/twin-progress-tracker` | Morning prioritization, 15-minute call prep, follow-up sweeps & Friday 1:1 / QBR rollups |
| **`agy-twin-voice`** | `/twin-voice-draft` · `/no-ai-slop` *(17-pattern editor)* · `/outbound-scrub` + `scrub_and_slop_scanner.mjs` + optional `PreToolUse` guardrails | Human-sounding correspondence, `[Draft-Only]` safety & PII/secret/placeholder checks |
| **`agy-twin-automations`** *(opt-in)* | `/twin-automations` + **4 `"builtin": "schedule"` Sidecars** *(Morning Brief, Twice-Daily Follow-Up Plan, Evening Notes Compactor, Friday Weekly Impact)* | Ships disabled by default; configure timezone via `/twin-automations` and enable in Customizations / `sidecar://dashboard` |

## Documentation

- **Guided Role-Based Test Prompts (Prompts 1-7):** [`docs/GUIDED_TEST_PROMPTS.md`](./docs/GUIDED_TEST_PROMPTS.md)
- **Side-by-Side Comparison & Integration With `generic-agy-plugin`:** [`docs/SUITE_COMPARISON_AND_INTEGRATION.md`](./docs/SUITE_COMPARISON_AND_INTEGRATION.md)
