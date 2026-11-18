# State of West Virginia — Antigravity Skill & Federated Connector Suite

A fast-installing, Git-updatable customization suite for **State of West Virginia** cohorts onboarding onto **Google Antigravity (`AGY`)** under **Gemini Enterprise (`GE`) Subscription** licenses.

Designed specifically for **strict state corporate laptop policies**:
- **Zero Extra Laptop Software Required:** Every skill, dashboard, slide deck, flyer, and MCP bridge runs with **zero separate `Node.js`, `Python`, `npm`, `pip`, or `Docker` installs** on employee laptops.
  - Our bundled **Gemini Enterprise (`GE`) Bridge MCP** (`wv-ge-bridge`) runs automatically on Antigravity Desktop's **built-in `agy-node` runtime** even when Node.js is not installed on the laptop.
  - Dashboards (`/wv-dashboard`), decks (`/slides`), and flyers (`/doc-design`) run natively in **Chrome or Edge (`file://` Zero-Node Browser Mode)** with visual drag-and-drop saving via `window.showSaveFilePicker()`, and automatically unlock local `127.0.0.1:4173` live query previews whenever `node` is present on developer workstations.
- **Built for WV's Identity & Connector Architecture:**
  - **Azure / Entra ID -> Google Cloud Identity Sync:** Works seamlessly with West Virginia's synced Google Identity accounts and replicated Entra security groups.
  - **Federated Gemini Enterprise (`GE`) Instance as Default:** Instead of configuring 6 separate per-app connectors on every laptop, users provide their **GE Instance** once (`/connect-ge` or `-GeInstance` during install) to unlock **Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, and GitHub** through `AssistantService.StreamAssist` and `SearchService.Search` with per-user ACLs intact.
- **Sub-2-Second Onboarding & Git Updates (`/wv-update`):**
  - Ships as a `< 200 KB` pre-built bundle (`dist/wv-antigravity-suite.zip`) and modular `plugins/` tree so cohorts install or update all 6 plugins in **under 2 seconds**—with or without `git` installed.

---

## 3 Frictionless Ways to Install (Pick One)

### 1. Fastest Corporate Laptop Install (`< 2 Seconds`, Zero `git` Required)

**Windows PowerShell** (standard WV corporate laptop — extract `wv-antigravity-suite.zip` and run in that folder):
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-wv-suite.ps1 `
  -GeInstance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
```
*(For laptops without `gcloud`, WV IT can also pass `-OAuthClientId` and `-OAuthClientSecret` for 1-click Google Identity browser SSO, or deploy `deploy/cloudrun-ge-gateway/`. Omit `-GeInstance` if users will enter their GE Resource Path or Cloud Console URL interactively via `/connect-ge`.)*

**macOS / Linux:**
```bash
bash ./scripts/install-wv-suite.sh \
  --ge-instance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
```

### 2. Native Antigravity CLI 1-Command Bulk Install
If `agy` and `git` are on your `$PATH`, Antigravity's bulk plugin installer installs all 6 plugins in one command (and replaces them cleanly when versions increment):
```bash
agy plugin install https://github.com/cloud-gtm/gps-ai-hub/tree/main/projects/wv-antigravity-suite
```

### 3. Fast Git Sparse-Checkout (Developers & Agency IT Admins — Clones Only This Folder)
```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/cloud-gtm/gps-ai-hub.git wv-agy
cd wv-agy && git sparse-checkout set projects/wv-antigravity-suite
bash projects/wv-antigravity-suite/scripts/install-wv-suite.sh
```

---

## What Gets Installed (6 Modular Plugins · 28 Slash Skills Across 7 `WV Skills` Categories)

All 6 plugins are **enabled immediately upon installation**, and non-technical staff can optionally toggle off individual skills or entire categories (including the **`Government Services (public_sector) Skills`** category) anytime inside **`Extensions -> WV Skills`**:

| Plugin (`WV Skills` Category) | Included `/skills` & Capabilities | Target Personas |
| :--- | :--- | :--- |
| **`wv-onboarding`** | `/wv-onboard` · **`/model-guide` *(Using Claude & Gemini in AGY)*** · `/daily-brief` · `/digital-twin` · `/inbox-triage` · `/wv-update` *(+ In-App `WV Skills` Toggle Panel)* | All State Staff, Admins & Leadership |
| **`wv-connectors`** | `/connect-ge` *(Default)* · `/connect-m365-workspace` · `/connect-github-bigquery` + **`wv-ge-bridge` MCP** *(Federated Outlook, SharePoint, OneDrive, Teams, Gmail, Drive & GitHub via GE)* | All Staff + IT Onboarding |
| **`wv-design-studio`** | `/wv-dashboard` *(West Virginia Command Center UI, 100% serverless Side-Pane preview + 1-click HTML download)* · `/slides` *(16:9 HTML/PDF decks)* · `/doc-design` *(Print-CSS flyers, 1-page memos)* + `wv-design-architect` agent | Analysts, Comms & Program Leads |
| **`wv-state-workflows` *(State Workflows Category)*** | `/foia-expert` *(WV Code § 29B-1-4 + `5 U.S.C. § 552` + Vault/Purview/GE discovery + Vaughn Index)* · `/legal-procurement-review` · `/policy-program-audit` | FOIA Officers, Legal, Procurement & Policy |
| **`wv-state-workflows` *(Government Services `public_sector` Category)*** | `/document-intake-cleanup-and-validation` · `/expense-auditor` *(2 CFR Part 200)* · `/foia-request-processing` · `/plain-language-notice-generator` · `/policy-and-statute-assistant` · `/public-records-redaction` · `/rfp-vendor-evaluation` | Caseworkers, Grant Auditors, FOIA, Comms & Procurement |
| **`wv-engineering-cloud`** | `/modernize-refactor` *(Stage 0/1/2 Crucible adapted from [migrate-to-rust](https://github.com/google/skills/tree/main/skills/developers/migrate-to-rust))* · `/deploy-cloudrun` *(Zero-Docker source deploy)* · `/bigquery-architect` · `/find-cloud-skill` | Application, Data & Cloud Engineers |
| **`wv-security`** | `/security-audit` *(OWASP + Cloud WAF + Assured Workloads CJIS/HIPAA/FedRAMP)* · `/iam-secret-hygiene` + Always-on `rules/AGENTS.md` | Engineers, Security & All Builders |

---

## Updating Skills & Plugins Later via Git (`/wv-update`)

Whenever new skills, FOIA templates, dashboard themes, or connector improvements are pushed to Git and `version-manifest.json` is bumped:
1. Users simply type **`/wv-update`** inside Antigravity (or re-run `install-wv-suite.ps1` / `install-wv-suite.sh`).
2. Only the lightweight `wv-antigravity-suite` bundle (`< 200 KB`) is fetched and updated in place—preserving the user's saved `ge-instance.json` and `wv-twin-profile.md` settings.

---

## Optional Central IT Scale-Out: Shared Cloud Run GE Gateway

See [`deploy/cloudrun-ge-gateway/README.md`](./deploy/cloudrun-ge-gateway/README.md) if agency IT wants to deploy one stateless **Cloud Run Streamable HTTP MCP** endpoint pre-bound to the agency's GE Engine ID so 500+ staff connect with zero project/engine variables.
