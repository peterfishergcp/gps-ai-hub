---
name: twin-setup
description: Interactive Digital Twin & Second Brain onboarding wizard for Google Antigravity. Initializes ~/antigravity-twin/memory/ with a 4-file persona profile, Zero-Task-Decay GTD board, 21-day stakeholder tracker, and 4-file isolated initiatives tailored to Program Managers, Software/Data Engineers, Public Sector Analysts, or Team Leads, and checks connected MCP bridges. Trigger on /twin-setup, "set up my digital twin", "initialize my second brain", or "configure my twin role".
---

# Digital Twin & Second Brain Setup (`/twin-setup`)

Onboard the user into their persistent **2-Tier Second Brain Memory Vault** (`~/antigravity-twin/memory/`) in under 60 seconds.

## Mode A - Quick Preset Setup (When Role Details Are Provided)

If the user specifies a role preset (`pm`, `developer`, `public-sector`, or `leader`) or pastes their role details directly:

1. Check if `node` is available in the shell and run `vault_cli.mjs` from this plugin's `scripts/` folder:
   ```bash
   node ~/.gemini/config/plugins/agy-twin-memory/scripts/vault_cli.mjs init \
     --role <pm|developer|public-sector|leader> \
     --name "<User Name>" \
     --role-title "<Job Title>" \
     --org "<Organization or Team>" \
     --timezone "<IANA Timezone>" \
     --seed-demo \
     --force
   ```
   *(If `node` is not on the system `PATH` on a locked-down corporate laptop, create the exact same Markdown files directly in `~/antigravity-twin/memory/` using file tools: `profile/{identity,portfolio,playbooks,voice}.md`, `gtd_board.md`, `contacts.md`, `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md`, `topics/lessons-learned.md`, `followups/latest_action_plan.md`, and `impact/ledger.json`, plus `~/.gemini/agy-twin-profile.md`.)*

## Mode B - Guided 4-Question Interview (Default When No Role Is Given)

Ask these **4 questions** concisely (using `ask_question` when available, or plain numbered options):

1. **Primary Role Track:**
   - `(Recommended) Program / Project Manager (pm)` - milestones, RAID logs, vendor SLAs, steering readouts
   - `Software / Cloud / Data Engineer (developer)` - services, SQL/pipelines, ADRs, incident & PR workflows
   - `Public Sector / Agency Knowledge Worker (public-sector)` - grants, policy checks, FOIA/records, plain-language notices
   - `Executive / Team Lead (leader)` - portfolio health, 1:1s, budget/ROI briefings, org enablement
2. **Name, Title & Organization/Agency:** How your Twin should identify you and sign drafts.
3. **Primary Time Zone & Top 2 Active Initiatives:** Your IANA timezone (e.g., `America/New_York`, `America/Chicago`, `America/Los_Angeles`) and 1-2 real projects or workstreams to create as isolated 4-file folders under `~/antigravity-twin/memory/initiatives/`.
4. **Communication Voice Preferences:** Direct BLUF bullets, formal agency correspondence, or technical peer notes (stored in `profile/voice.md`).

## Step 3 - Connector & Side-Pane Verification

After initializing the vault:
1. Check active `<mcp_servers>` in context:
   - If `agy-ge-bridge` (Federated Gemini Enterprise MCP) or Workspace/M365/GitHub/BigQuery MCP tools are active, confirm that `/twin-brief`, `/twin-followup-plan`, and `/twin-meeting-notes` will automatically pull live context through them.
   - If no external MCP server is connected yet, reassure the user that 100% of Second Brain memory, GTD tracking, SCQA prep, and anti-slop drafting work standalone on local files and pasted text (and mention `/connect-ge` if `agy-connectors` is installed).
2. Point the user to **Extensions -> Twin Vault** in the Antigravity sidebar (or the `+` AuxPane menu) so they can visually inspect and edit every Markdown file under the hood, and suggest running `/twin-brief` next.
