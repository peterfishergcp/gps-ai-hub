# Generic AGY Plugin — Public Sector Antigravity Skill & Federated Connector Suite

A fast-installing, Git-updatable customization suite for **Public Sector** (Federal, State, and Local Government) cohorts onboarding onto **Google Antigravity (`AGY`)** under **Gemini Enterprise (`GE`) Subscription** licenses.

Designed specifically for **strict government corporate laptop policies**:
- **Zero Extra Laptop Software Required:** Every skill, dashboard, slide deck, flyer, and MCP bridge runs with **zero separate `Node.js`, `Python`, `npm`, `pip`, or `Docker` installs** on employee laptops.
  - Our bundled **Gemini Enterprise (`GE`) Bridge MCP** (`agy-ge-bridge`) runs automatically on Antigravity Desktop's **built-in `agy-node` runtime** even when Node.js is not installed on the laptop.
  - Dashboards (`/agy-dashboard`), decks (`/slides`), and flyers (`/doc-design`) render natively in Antigravity's **Side Pane** (`Extensions -> Preview`) with automatic conversation artifact discovery and open standalone in **Chrome or Edge (`file://` Zero-Node Browser Mode)** with visual drag-and-drop saving via `window.showSaveFilePicker()`, and automatically unlock local `127.0.0.1:4173` live query previews whenever `node` is present on developer workstations.
- **Built for Public Sector Identity & Connector Architectures:**
  - **Azure / Entra ID -> Google Cloud Identity Sync:** Works seamlessly with synced Google Cloud Identity accounts and replicated Entra security groups.
  - **Federated Gemini Enterprise (`GE`) Instance as Default:** Instead of configuring 6 separate per-app connectors on every laptop, users provide their **GE Instance** once (`/connect-ge` or `-GeInstance` during install) to unlock **Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, and GitHub** through `AssistantService.StreamAssist` and `SearchService.Search` with per-user ACLs intact.
- **Sub-2-Second Onboarding & Incremental `< 1s` Git Updates (`/agy-update`):**
  - Ships as a `< 500 KB` pre-built bundle (`dist/generic-agy-plugin.zip`) and modular `plugins/` tree with SHA-256 incremental diffing so cohorts install or update all 8 plugins and 40 skills in seconds—with or without `git` installed.
- **Unified AI Inbox Look & Feel, `Chatski` Left Panel, Hoverable Token Meter (`in | out | thinking`), `/token-usage`, & `/orchestrator-guide` (`v1.6.2`):**
  - Every UI panel (`Extensions -> My Antigravity`, `Extensions -> Chatski`, `Extensions -> Skills`, and `Extensions -> Preview`) shares the Antigravity rainbow **"A"** icon and includes a live hoverable **`in | out | thinking` Token Consumption Pill**—paired with **`Chatski`** (browsing & staging replies across Google Chat Spaces & DMs right through your existing Gemini Enterprise Chat Connector with zero extra setup, plus optional Direct Chat API), a unified **AI Inbox** design across all **`My Antigravity`** tabs (`Action Items 🍪`, `Overview 😎`, `Initiatives 🚦`, `Stakeholders 🌊`, `Skills ✨`, and `Customize ⚙️`), `/token-usage`, and `/orchestrator-guide`.

---

## Visual Tour — `My Antigravity` (AI Inbox) & `Chatski`

### 1. `Action Items` — AI Inbox Suggested To-Dos & Topics (`🍪`)
Catch up in seconds with 1-click **`Reply`** and **`Open`** action pills, Scallop Wave visual separation, and synthesized **`Topics to catch up on`** cards—plus a live hoverable **`in | out | thinking`** token pill in the top header:

![My Antigravity — AI Inbox Action Items & Topics](./docs/screenshots/my-antigravity-action-items.png)

### 2. `Overview` — Instant Search Bar, Up Next & 1-Click Workflows (`😎`)
Search across Action Items, Initiatives, Stakeholders, and all 40 skills—or press **Enter** to ask Antigravity directly in chat:

![My Antigravity — Overview & Instant Search](./docs/screenshots/my-antigravity-overview.png)

### 3. `Chatski` — Google Chat Left-Sidebar Panel via Gemini Enterprise (`💬`)
Works out-of-the-box with your existing **Gemini Enterprise Google Chat Connector** (zero extra OAuth client or laptop setup)—browse Spaces & Direct Messages, hover any message for **`✨ Draft reply`**, stage voice-calibrated drafts, and send only with explicit human confirmation:

![Chatski — Google Chat Left-Sidebar Panel via Gemini Enterprise](./docs/screenshots/chatski-ge-chat.png)

### 4. `Initiatives`, `Stakeholders`, & `Skills` — Unified AI Inbox Tabs

| `Initiatives 🚦` *(RAG Status & Milestones)* | `Stakeholders 🌊` *(>21d Check-In Radar)* | `Skills ✨` *(40 Skills + Save My Copy)* |
| :---: | :---: | :---: |
| ![My Antigravity — Initiatives](./docs/screenshots/my-antigravity-initiatives.png) | ![My Antigravity — Stakeholders](./docs/screenshots/my-antigravity-stakeholders.png) | ![My Antigravity — Skills](./docs/screenshots/my-antigravity-skills.png) |

---

## 3 Frictionless Ways to Install (Pick One)

### 1. Native Antigravity 1-Command Bulk Install (Recommended)
Open a **+ New Conversation** in Antigravity, paste the command below into the chat box at the bottom of the window, and press **Enter** *(leave Default permissions on—you may be asked to click **Accept** a few times during installation)*:
```bash
agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/generic-agy-plugin
```
*(Or point to your agency's internal Git mirror/fork of `projects/generic-agy-plugin`.)*

### 2. Fastest Corporate Laptop Install (`< 2 Seconds`, Zero `git` Required)

**Windows PowerShell** (standard agency corporate laptop — extract `generic-agy-plugin.zip` and run in that folder):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-agy-suite.ps1 `
  -GeInstance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
```
*(For laptops without `gcloud`, Agency IT can also pass `-OAuthClientId` and `-OAuthClientSecret` for 1-click Google Identity browser SSO, or deploy `deploy/cloudrun-ge-gateway/`. Omit `-GeInstance` if users will enter their GE Resource Path or Cloud Console URL interactively via `/connect-ge`.)*

**macOS / Linux:**
```bash
bash ./scripts/install-agy-suite.sh \
  --ge-instance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
```

### 3. Fast Git Sparse-Checkout (Developers & Agency IT Admins — Clones Only This Folder)
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/peterfishergcp/gps-ai-hub.git generic-agy
cd generic-agy && git sparse-checkout set projects/generic-agy-plugin
bash projects/generic-agy-plugin/scripts/install-agy-suite.sh
```

---

## What Gets Installed (8 Modular Plugins · 40 Slash Skills Across 9 `Skills` Categories)

7 core plugins are **enabled immediately upon installation** (while **`Scheduled Automations`** ships **opt-in / disabled by default** so background schedules only run when explicitly toggled on), and staff can toggle individual skills or entire categories anytime inside **`Extensions -> Skills`**:

| Plugin (`Skills` Category) | Included `/skills` & Capabilities | Target Personas |
| :--- | :--- | :--- |
| **`agy-onboarding`** | `/agy-onboard` *(+ 1-step Personal Memory setup)* · **`/model-guide` *(Using Claude & Gemini in AGY)*** · **`/orchestrator-guide`** · **`/token-usage`** · `/daily-brief` *(GE + Action Items/milestones)* · `/my-voice` *(calibrated to `voice.md`)* · `/inbox-triage` · `/agy-update` *(+ In-App `Skills` Panel)* | All Public Sector Staff, Admins & Leadership |
| **`agy-connectors`** | **`/chatski` *(+ `Chatski` Left-Panel Google Chat UI via GE Chat Connector)*** · `/connect-ge` *(Default)* · `/connect-m365-workspace` · `/connect-github-bigquery` + **`agy-ge-bridge` MCP** *(Federated Google Chat, Outlook, SharePoint, OneDrive, Teams, Gmail, Drive & GitHub via GE)* | All Staff + IT Onboarding |
| **`agy-design-studio`** | `/agy-dashboard` *(Civic Command Center UI, 100% serverless Side-Pane preview + 1-click HTML download)* · `/slides` *(16:9 HTML/PDF decks)* · `/doc-design` *(Print-CSS flyers, 1-page memos)* + `agy-design-architect` agent + `Preview` sidecar | Analysts, Comms & Program Leads |
| **`agy-public-workflows` *(Public Workflows Category)*** | `/foia-expert` *(`5 U.S.C. § 552` + State Open Records + Vault/Purview/GE discovery + Vaughn Index)* · `/legal-procurement-review` · `/policy-program-audit` | FOIA Officers, Legal, Procurement & Policy |
| **`agy-public-workflows` *(Government Services `public_sector` Category)*** | `/document-intake-cleanup-and-validation` · `/expense-auditor` *(2 CFR Part 200)* · `/foia-request-processing` · `/plain-language-notice-generator` · `/policy-and-statute-assistant` · `/public-records-redaction` · `/rfp-vendor-evaluation` | Caseworkers, Grant Auditors, FOIA, Comms & Procurement |
| **`agy-engineering-cloud`** | `/modernize-refactor` *(Stage 0/1/2 Crucible adapted from [migrate-to-rust](https://github.com/google/skills/tree/main/skills/developers/migrate-to-rust))* · `/deploy-cloudrun` *(Zero-Docker source deploy)* · `/bigquery-architect` · `/find-cloud-skill` | Application, Data & Cloud Engineers |
| **`agy-security`** | `/security-audit` *(OWASP + Cloud WAF + Assured Workloads CJIS/HIPAA/FedRAMP)* · `/iam-secret-hygiene` + Always-on `rules/AGENTS.md` | Engineers, Security & All Builders |
| **`agy-second-brain`** | `/memory` · `/meeting-notes` *(4-Tier Compaction)* · `/meeting-prep` *(Adversarial Minto SCQA)* · `/followup-plan` · `/swarm-prep` *(4 parallel subagents)* · `/weekly-impact` *(3-Altitude ledger)* · `/no-ai-slop` · `/outbound-scrub` + **`My Antigravity` Sidecar UI** *(AI Inbox `Action Items` + `Customize` icon)* | Program Managers, Analysts, Comms, Engineers & Leaders |
| **`Scheduled Automations` *(Opt-In — Disabled by Default)*** | `/automations` + 4 `"builtin": "schedule"` cron sidecars (*Morning Kickoff Brief*, *Twice-Daily Follow-Up Plan*, *Evening Notes Compactor*, *Friday 3-Altitude Impact*) | Power Users & Team Leads |

---

## Updating Skills & Plugins Later via Git (`/agy-update`)

Whenever new skills, FOIA templates, dashboard themes, or connector improvements are pushed to Git and `version-manifest.json` is bumped:
1. Click **`Sync Git Updates`** (or the **`↻`** icon next to any skill) inside **`Extensions -> Skills`**, OR type **`/agy-update`** (all changed skills) / **`/agy-update agy-dashboard`** (single skill) in chat.
2. Only changed files are downloaded via SHA-256 diffing over HTTPS 443—preserving the user's saved `ge-instance.json`, skill toggles, and `~/my-antigravity/memory/` settings.

---

## Workshop Launchpad, AGY Setup Guide & Guided Test Prompts

- **Workshop Launchpad & 40-Skill Registry Source:** [`workshop/`](./workshop/index.html)
- **Generic 7-Step AGY Download & Setup Guide Source:** [`setup-guide/`](./setup-guide/index.html)
- **Guided Test Prompts (Core 9, Including Action Items, Memory & Swarm):** [`docs/TEST_PROMPTS.md`](./docs/TEST_PROMPTS.md)
- **Government Services (`public_sector`) Test Prompts (7):** [`docs/PUBLIC_SECTOR_TEST_PROMPTS.md`](./docs/PUBLIC_SECTOR_TEST_PROMPTS.md)
- **IT & Technical Appendix (Offline `.zip`, Security Policy & MCP Matrix):** [`docs/IT_AND_TECHNICAL_APPENDIX.md`](./docs/IT_AND_TECHNICAL_APPENDIX.md)

---

## Optional Central IT Scale-Out: Shared Cloud Run GE Gateway

See [`deploy/cloudrun-ge-gateway/README.md`](./deploy/cloudrun-ge-gateway/README.md) if agency IT wants to deploy one stateless **Cloud Run Streamable HTTP MCP** endpoint pre-bound to the agency's GE Engine ID so 500+ staff connect with zero project/engine variables.
