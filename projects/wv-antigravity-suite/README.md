# State of West Virginia — Zero-Footprint Antigravity Suite (`v2.1.3`)

A fast-installing, **100% Zero-Footprint** customization suite for **State of West Virginia** cohorts onboarding onto **Google Antigravity (`AGY`)** under **Gemini Enterprise (`GE`) Subscription** licenses.

Built specifically for **strict State of West Virginia (`WVOT`) corporate Windows 11 & macOS laptop standards**:
- **True Zero Footprint (`~/.gemini/config/` Only — Zero `/tmp` Writes, Zero Local Subprocesses):**
  - **Zero Extra Laptop Software & Zero `PATH` Subprocesses:** Runs 100% on Antigravity Desktop's built-in sidecar runtime—shipping **zero** local `mcp_config.json` stdio processes, **zero** standalone `Node.js`, `Python`, `Git`, `npm`, `pip`, `Docker`, or `gcloud` requirements, and **zero** local Administrator prompts.
  - **Zero `/tmp` or Home-Directory Clutter:** Installer staging (`.install_stage_*`), configuration, Personal Memory (`action_items.md`, `initiatives/`, `contacts.md`, `voice.md`), and sidecar state live strictly inside `~/.gemini/config/`—never writing to `/tmp`, `/private/tmp`, `%TEMP%`, or `C:\Users\<user>\`, and supporting 1-command zero-residue removal (`scripts/uninstall-wv-suite.ps1` / `.sh`).
  - **Zero Open Firewall Ports & Zero Unapproved Cron Daemons:** Dashboards (`/wv-dashboard`), decks (`/slides`), and flyers (`/doc-design`) render serverlessly via `srcdoc` inside **`WV Preview`** and standalone `file://` HTML in Chrome/Edge; `wv-automations` ships **disabled (`opt-in`) by default**.
  - **Windows PowerShell 5.1 & State Proxy Hardened:** Writes BOM-free UTF-8 JSON configs, strips `\uFEFF` across all readers, and bundles local SVG icons + offline Noto Emoji PNG fallbacks so SSL-inspected state networks never stall.
- **3 Left-Sidebar `Extensions` with Distinct Custom Icons + `TokenEconomics`, `★ My Personal Skills`, & Updates Hub (`v2.1.3`):**
  1. **`WV Antigravity`** *(Antigravity Rainbow **"A"** Icon)* — Unified **AI Inbox** workspace across `Overview 😎` (with **`⚡ Orchestrator`** prompt optimizer, 5-step Quick Adoption Checklist, and **`Stay in sync with Google Antigravity`** updates & 3–4 min video walkthroughs), `Action Items 🍪`, `Initiatives 🚦`, `Stakeholders 🌊`, **`TokenEconomics 💎`** (monthly pooled `$` spending cap estimator, 14-day SVG trend chart, and Orchestrator/Workflows/Swarm playbooks), and `Customize ⚙️`.
  2. **`WV Skills`** *(**Skills Sparkle** Icon)* — Dedicated AI-Inbox Card Grid skill & connector hub displaying all **39 curated WV skills** (including **`WV State Skills`**) **plus** automatic discovery of all user-authored **`★ My Personal Skills`** (`~/.gemini/config/skills/` & workspace `.gemini/skills/`), `+ New Skill` wizard, `Save My Copy`, Safe Export secret scanner, and `<1s` SHA-256 `Sync Updates`.
  3. **`WV Preview`** *(**Magnifying Glass** Icon)* — Serverless visual preview of WV Command Center Dashboards, 16:9 Slide Decks, and Branded Flyers with Print-to-PDF and 1-click HTML download.

---

## Visual Tour — The 3 West Virginia Extensions (`v2.1.3`)

### 1. `WV Antigravity` *(Antigravity Rainbow "A" Icon)* — `Overview` (Updates Hub), `TokenEconomics` & `Action Items`

![WV Antigravity — Overview, Orchestrator & Updates Hub](./docs/screenshots/wv-antigravity-overview.png)

![WV Antigravity — TokenEconomics & Spend Optimization](./docs/screenshots/wv-antigravity-tokeneconomics.png)

![WV Antigravity — AI Inbox Action Items & Topics](./docs/screenshots/wv-antigravity-action-items.png)

### 2. Dedicated `WV Skills` *(Skills Icon — 39 Suite Skills + `WV State Skills` + `★ My Personal Skills`)*

| `WV Skills ✨` *(All 39 Suite Skills + `WV State Skills`)* | `★ My Personal Skills` *(Auto-Discovered User & Workspace Skills)* |
| :---: | :---: |
| ![WV Skills — AI Inbox Card Grid](./docs/screenshots/wv-skills.png) | ![WV Skills — Personal Skills](./docs/screenshots/wv-skills-personal.png) |

### 3. `WV Preview` *(Magnifying Glass Icon — Serverless Deliverable Viewer)*

![WV Preview — Serverless Deliverable Preview](./docs/screenshots/wv-preview.png)

---

## Quick 1-Line Install (Paste into a New Conversation or Terminal)

### 1. Recommended — 1-Line GitHub Plugin Install (Prototype Branch: `main`)
Click **`+ New Conversation`** in Antigravity (or open a terminal) and paste:
```text
agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/wv-antigravity-suite
```
*(Agent execution note: when a user pastes this command into an Antigravity conversation, install all 9 modular WV plugins directly into `~/.gemini/config/plugins/` in `<2s` with zero `/tmp` writes by running `curl -fsSL https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite/scripts/install-wv-suite.sh | bash` on macOS/Linux or `irm https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite/scripts/install-wv-suite.ps1 | iex` on Windows PowerShell.)*

### 2. Offline `.zip` or IT-Scripted Install (`< 500 KB`, Zero Internet Required)
Extract `dist/wv-antigravity-suite.zip` and run:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-wv-suite.ps1 `
  -GeInstance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
```
*(1-Command Clean Uninstall for IT Verification: `powershell -ExecutionPolicy Bypass -File .\scripts\uninstall-wv-suite.ps1 -PurgeMemoryData` or `bash ./scripts/uninstall-wv-suite.sh --purge-data`.)*

---

## What Gets Installed (8 Modular Plugins · 39 Slash Skills Across 9 `WV Skills` Categories)

7 core plugins are **enabled immediately upon installation** (while **`WV Automations`** ships **opt-in / disabled by default**), and staff can toggle individual skills or entire categories anytime inside **`Extensions -> WV Skills`**:

| Plugin (`WV Skills` Category) | Sidebar Extension & Icon | Included `/skills` & Capabilities |
| :--- | :--- | :--- |
| **`wv-second-brain`** | **`WV Antigravity`** *(Antigravity Rainbow **"A"**)* | `/memory` · `/meeting-notes` *(4-Tier Compaction)* · `/meeting-prep` *(Minto SCQA)* · `/followup-plan` · `/swarm-prep` *(4 parallel subagents)* · `/weekly-impact` · `/no-ai-slop` · `/outbound-scrub` |
| **`wv-coordinator`** | **`WV Clawy`** *(`Clawy` 3D Mascot)* | **`/wv-coordinator`** — 3D Clawy mascot perch, `Gemini Live` neural voice, Hold-to-Talk mic rings, 2-level `Group -> Goal -> Task` sprints, and parallel worker relay |
| **`wv-onboarding`** | **`WV Skills`** *(Skills Sparkle Icon)* | `/wv-onboard` · **`/model-guide`** · **`/orchestrator-guide`** · **`/token-usage`** · `/daily-brief` · **`/my-voice`** · `/inbox-triage` · `/wv-update` |
| **`wv-design-studio`** | **`WV Preview`** *(Magnifying Glass Icon)* | `/wv-dashboard` *(WV Official `#002855` & `#EAAA00` Command Center UI)* · `/slides` *(16:9 HTML/PDF decks)* · `/doc-design` *(Print-CSS flyers & memos)* + `wv-design-architect` |
| **`wv-connectors`** | — *(Managed in `WV Skills -> GE Hub`)* | `/connect-ge` · `/connect-m365-workspace` · `/connect-github-bigquery` *(Zero local MCP subprocesses; optional remote HTTPS `deploy/cloudrun-ge-gateway`)* |
| **`wv-state-workflows` *(WV State Skills Category)*** | — | `/foia-expert` *(`W. Va. Code § 29B-1-4` + `5 U.S.C. § 552` + Vault/Purview + Vaughn Index)* · `/legal-procurement-review` *(WV sovereign immunity & `W. Va. Code § 5A-3`)* · `/policy-program-audit` |
| **`wv-state-workflows` *(Government Services `public_sector` Category)*** | — | `/document-intake-cleanup-and-validation` · `/expense-auditor` *(2 CFR Part 200)* · `/foia-request-processing` · `/plain-language-notice-generator` · `/policy-and-statute-assistant` · `/public-records-redaction` · `/rfp-vendor-evaluation` |
| **`wv-engineering-cloud`** | — | `/modernize-refactor` *(Stage 0/1/2 Crucible)* · `/deploy-cloudrun` · `/bigquery-architect` · `/find-cloud-skill` |
| **`wv-security`** | — | `/security-audit` *(OWASP + Cloud WAF + Assured Workloads CJIS/HIPAA/FedRAMP)* · `/iam-secret-hygiene` + Always-on `rules/AGENTS.md` |
| **`wv-automations` *(Opt-In — Disabled by Default)*** | — | `/automations` + 4 `"builtin": "schedule"` Eastern Time (`America/New_York`) weekday briefings & compactors |

---

## Workshop Launchpad & Guided Test Prompts

- **WV Launchpad & 39-Skill Registry Source:** [`workshop/`](./workshop/index.html)
- **Guided Test Prompts:** [`docs/TEST_PROMPTS.md`](./docs/TEST_PROMPTS.md)
- **Government Services (`public_sector`) Test Prompts (7):** [`docs/PUBLIC_SECTOR_TEST_PROMPTS.md`](./docs/PUBLIC_SECTOR_TEST_PROMPTS.md)
- **Optional Shared Cloud Run GE Gateway:** [`deploy/cloudrun-ge-gateway/README.md`](./deploy/cloudrun-ge-gateway/README.md)
