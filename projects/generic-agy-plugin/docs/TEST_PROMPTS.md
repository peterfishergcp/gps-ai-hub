# Generic AGY Plugin — Antigravity Suite (v1.0.0) Guided Test Prompts

## Quick 3-Step Setup

1. **Step 1 — Complete AGY Download & Install:** Follow the [Google Antigravity Organization Setup Guide](../setup-guide/index.html).
2. **Step 2 — Install Plugin (From a New Conversation in AGY + Switch to Turbo Mode):** Click **+ New Conversation** in AGY, switch **Request Review** (bottom-right of prompt box) to **Turbo** (*"Run all commands without restrictions"*) to eliminate repetitive approval prompts during install, and paste:
   ```text
   agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/generic-agy-plugin
   ```
   **Fast `<1s` Incremental Skill Updates (No Full Re-Install Needed!):** Click **Sync Git Updates** (or the `↻` icon next to any skill) in the **AGY Skills** sidebar panel (`Extensions -> AGY Skills`), or type `/agy-update` (all changed skills) or `/agy-update agy-dashboard` (single skill) in chat.
3. **Step 3 — Test the Plugin:** Use the 7 copy-paste test prompts below (plus the 7 Government Services prompts in [`PUBLIC_SECTOR_TEST_PROMPTS.md`](./PUBLIC_SECTOR_TEST_PROMPTS.md)) to test all 6 plugins and 28 skills.

---

## Order of Tests

1. **Prompt 1 (Start Here): Visual Dashboards, 16:9 Slides & Branded Flyers** (`agy-design-studio` — verifies rendered visual previews in the Side Pane + 1-click HTML download, with **zero** raw `</> index.html` code views)
2. **Prompt 2: Using Anthropic Claude & Google Gemini Models in AGY** (`agy-onboarding /model-guide` — switching models, Claude vs. Gemini routing, 2-Pass Dual-Model Review, and Agency IT Vertex AI setup)
3. **Prompt 3: 60-Second Onboarding, Daily Brief, Digital Twin & Inbox Triage** (`agy-onboarding`)
4. **Prompt 4: Public Records / FOIA, Legal Contract Redlining & Policy Audit** (`agy-public-workflows`)
5. **Prompt 5: Legacy App Refactoring, Cloud Run & BigQuery SQL** (`agy-engineering-cloud`)
6. **Prompt 6: Security & Cloud Readiness ("Catch the 4 Real-World Security Mistakes")** (`agy-security`)
7. **Prompt 7 (Last): Federated Gemini Enterprise (GE) Connectors** (`agy-connectors` — placed last for when you are ready to test live or pre-filled GE instance connectivity)

---

## Prompt 1 — Dashboards, 16:9 Slides & Branded Flyers (`agy-design-studio`)

### What This Tests
- **`/agy-dashboard`**, **`/slides`**, **`/doc-design`**, and the **`AGY Preview` (`agy-design-preview`)** sidecar.
- **Visual Output Check:** Verifies that clicking the output in chat opens the **rendered visual Dashboard, Slide Deck, and Flyer** in Antigravity's right-hand Side Pane (and includes an `Open / Download HTML` button in the top bar for Chrome/Edge—with zero Python, zero local web servers, and zero `127.0.0.1` firewall ports) instead of opening raw `</> index.html` source code.

### Copy & Paste Into Antigravity

```text
Using `/agy-dashboard`, `/slides`, and `/doc-design`, create a Public Sector "Civic Ready 2026" executive package in `./civic-readiness-demo` using these exact program figures ($40.0M total portfolio closing December 31, 2026: $25.0M EDFA Shell Building Loans + $15.0M ISRG Tier 1–3 Site Readiness Grants across Riverbend, Oakridge, Cedarbrook, Pinecrest, and Summit counties):
1. `/agy-dashboard`: Scaffold an interactive Civic Command Center dashboard in `./civic-readiness-demo/dashboard` (`civic-readiness-command-center` template) featuring the Civic Command Navy header (`#0F1A2A`), `Ask Gemini Enterprise` search bar, `2026 SITE READINESS CLOCK` ribbon, numbered tabs (`1. TODAY & TRIAGE`, `2. PRIORITY AGENDA`, `3. PORTFOLIO ANALYTICS` for charts, `4. COUNTY SITE REGISTER` for the register table), green-bordered System Health banner, 4 KPI cards ($40.0M Authorized Public Funding, Active Pipeline, Qualifying Acreage, Projected Jobs), and dark-navy-header `NEEDS ACTION NOW` + `MY WORK LIST` operational split panels.
2. `/slides`: Create a 5-slide 16:9 executive briefing deck (`./civic-readiness-demo/slides/deck.html`) with keyboard navigation and speaker notes (`N` key).
3. `/doc-design`: Create a 1-page print-ready stakeholder fact sheet (`./civic-readiness-demo/flyer/flyer.html`) comparing EDFA Loan terms vs. ISRG Grant tiers.
IMPORTANT — Follow the AGY Design Studio visual preview rules:
- Write the self-contained single-file HTML copies (`dashboard-standalone.html`, `deck.html`, `flyer.html`) to the Conversation Artifact Directory with `UserFacing: true` and embed `<agent-embed>` previews so I see rendered visuals—never link raw workspace `index.html` code files in chat.
- Do NOT create any 127.0.0.1 or localhost .url.json artifacts, do NOT start python3 -m http.server, and do NOT link workspace index.html code files in chat (all 3 HTML artifacts render serverless in the Side Pane and include an 'Open / Download HTML' button for Chrome/Edge).
```

---

## Prompt 2 — Using Anthropic Claude & Google Gemini in AGY (`/model-guide`)

### What This Tests
- **`/model-guide`** (inside `agy-onboarding`).
- Shows public sector staff and developers **how to switch to Anthropic Claude (`Claude Sonnet` / `Claude Opus`)** in the Antigravity Desktop picker or CLI (`/model`), **which tasks to run on Claude vs. Gemini**, **how Agency IT enables Claude in Google Cloud Vertex AI Model Garden (`us-east5`)**, and gives you a live **Pass-2 Claude Adversarial Review prompt** to try right after.

### Copy & Paste Into Antigravity

```text
/model-guide Our agency developers and policy analysts want to use Anthropic Claude (Claude Sonnet and Claude Opus) alongside Google Gemini inside Antigravity.
Please give me:
1. A step-by-step guide on how a user switches between Google Gemini and Anthropic Claude (and adjusts Thinking/Reasoning effort) in both the Antigravity Desktop prompt bar and the `agy` CLI.
2. A Public Sector Task-to-Model Routing Cheat Sheet showing when to use 1P Gemini 3.8 Flash (included in our pooled subscription quota + 1M context + multimodal) vs. Anthropic Claude Sonnet (multi-file code refactoring & SQL) vs. Anthropic Claude Opus (deep debugging & contract/security redlines).
3. The 4-step checklist for our Agency GCP Administrator to enable Anthropic Claude in Vertex AI Model Garden (`us-east5` region), set Pay-As-You-Go budget alerts, and enforce CJIS/HIPAA/FedRAMP data governance.
4. A ready-to-paste "Pass-2 Claude Cross-Review" prompt I can run right now after switching my model picker to Claude Sonnet or Claude Opus to audit the dashboard and flyer we just built in Prompt 1.
```

**Hands-On Claude Follow-Up (10 Seconds):** After the agent replies, click the **Model Selector dropdown** at the bottom of your Antigravity prompt box, switch to **Claude Sonnet** (or **Claude Opus**), and paste the Pass-2 review prompt it generated to watch Claude audit your Prompt 1 deliverables in the same thread.

---

## Prompt 3 — Onboarding, Daily Brief, Digital Twin & Inbox Triage (`agy-onboarding`)

### What This Tests
- **`/agy-onboard`**, **`/daily-brief`**, **`/digital-twin`**, **`/inbox-triage`**, and **`/agy-update`**.
- Specifically tests whether **`/inbox-triage`** catches urgent leadership escalations **and** enforces the **unreadable-attachment fail-safe hold** (never auto-clearing an email when an attachment fails to parse), while **`/digital-twin`** drafts a reply in your voice with `[Draft-Only — Do Not Auto-Send]` tags.

### Copy & Paste Into Antigravity

```text
Run a combined test of our `agy-onboarding` skills (`/agy-onboard`, `/daily-brief`, `/inbox-triage`, and `/digital-twin`) for my role as Deputy Director of Operations at the Department of Economic Development:
1. `/agy-onboard`: Create `./agy-twin-profile.md` tuned to a concise, executive BLUF (Bottom-Line-Up-Front) voice for agency leadership and county commissioners.
2. `/inbox-triage`: Triage these 3 incoming emails against our escalation rules (Escalate immediately if: budget impact > $250K, statutory/FOIA deadline <= 5 business days, or County Commission / Legislative inquiry):
   - Email A (From: Riverbend County Commission): "Urgent: $1.4M water main match modification needed before Friday's ISRG board vote."
   - Email B (From: Vendor Portal Notification): "Monthly newsletter: Q4 training webinar schedule."
   - Email C (From: Regional Grant Contractor): "Updated Drawdown Request #14 attached — [ERROR: Attachment 'Drawdown_14_Signed.pdf' is corrupted/unreadable, 0 bytes extracted]."
   Verify that Email C triggers the Unreadable-Attachment Fail-Safe Hold!
3. `/daily-brief`: Turn the triaged items plus a 2:00 PM ET Infrastructure Board Prep call into a 1-page Morning Executive Brief.
4. `/digital-twin`: Draft a concise reply to the Riverbend County Commission (`Email A`) in my BLUF voice (strictly Draft-Only).
```

---

## Prompt 4 — Public Records / FOIA, Legal Review & Policy Consistency (`agy-public-workflows`)

### What This Tests
- **`/foia-expert`** (Google Vault + Microsoft Purview KQL search strings, **Federal FOIA `5 U.S.C. § 552`** & applicable State Public Records line-by-line segregability redaction, and a formal **Vaughn Index**),
- **`/legal-procurement-review`** (catches vendor clauses that violate government sovereign immunity, multi-year fiscal non-appropriation rules, and AI model training on government data using `1:3:9` risk scoring),
- **`/policy-program-audit`** (catches conflicting dollar caps or dates across documents).

### Copy & Paste Into Antigravity

```text
Test all 3 `agy-public-workflows` core skills (`/foia-expert`, `/legal-procurement-review`, and `/policy-program-audit`) on this public-sector scenario:
1. `/foia-expert`: We received a public records request for "all emails and SharePoint memos between Jan 1, 2026 and March 31, 2026 mentioning Project Horizon or parcel bids in Valleyview County."
   - Generate the exact Google Vault and Microsoft Purview KQL discovery queries.
   - Review this responsive record excerpt for line-by-line segregability under Federal FOIA (5 U.S.C. § 552) and State Public Records privacy/deliberative exemptions and produce a Vaughn Index table:
     "Paragraph 1: On Feb 12, 2026, Agency Engineers completed the public Phase 1 traffic count on Route 12 (14,200 vehicles/day). Paragraph 2 [DRAFT INTERNAL DELIBERATION]: Chief Counsel advises that our pre-decisional negotiation ceiling for Parcel 4B is $820,000, and applicant John Doe's home cell (555-0199) and SSN (999-00-1234) are listed on the tax worksheet."
2. `/legal-procurement-review`: Score this vendor SaaS contract clause using 1:3:9 risk scoring and write the public-sector replacement redline:
   "Section 14: Public Agency agrees to indemnify and hold harmless Vendor against all third-party claims, locks into a non-cancellable 5-year term regardless of legislative appropriations, submits to binding arbitration in an out-of-state forum, and grants Vendor a perpetual license to train commercial AI models on Public Agency uploads."
3. `/policy-program-audit`: Check whether a draft press release saying "$18M in ISRG site grants closing Jan 15, 2027" conflicts with our official $15M / Dec 31, 2026 program rules.
```

---

## Prompt 5 — Legacy App Refactoring, Cloud Run & BigQuery (`agy-engineering-cloud`)

### What This Tests
- **`/modernize-refactor`** (3-stage modernization workflow adapted from Google's `migrate-to-rust` skill: Stage 1 6-Section Blueprint & Legacy Bug Audit → Stage 2 Crucible & Parity Verification),
- **`/deploy-cloudrun`** (zero-Docker source deployment with non-root user, dedicated service account, and Secret Manager),
- **`/bigquery-architect`** (migrating legacy T-SQL to partitioned BigQuery Standard SQL with `@param` bindings and a `1 GB maximumBytesBilled` cost cap).

### Copy & Paste Into Antigravity

```text
Test `agy-engineering-cloud` (`/modernize-refactor`, `/deploy-cloudrun`, and `/bigquery-architect`) on this legacy public-sector grant eligibility script:
1. `/modernize-refactor`: Create a Stage 1 6-Section Modernization Blueprint (including a Legacy Bug Audit) and refactor this legacy Python 2 / procedural snippet into a clean, tested modern Python module in `./agency-grant-service`:
   def calc_grant(amount, county, flags=[]):
       if county == "Riverbend" or "Oakridge":  # BUG: always truthy!
           flags.append("priority")
       if amount > 500000:
           match = amount * 0.25
       elif amount < 500000:  # BUG: exact 500000 falls through!
           match = amount * 0.50
       return {"match": match, "flags": flags}
2. `/deploy-cloudrun`: Generate the hardened zero-Docker `gcloud run deploy` command and `.gcloudignore` for `./agency-grant-service` in `us-east4` using a dedicated service account and Secret Manager.
3. `/bigquery-architect`: Rewrite this legacy SQL Server query into partitioned BigQuery Standard SQL with parameterized `@county_name` and a 1 GB `maximumBytesBilled` cap:
   SELECT TOP 50 ISNULL(applicant_name, 'Unknown'), DATEDIFF(day, submitted_dt, GETDATE()) FROM dbo.agency_grant_apps WHERE county = 'Riverbend'
```

---

## Prompt 6 — Security & Cloud Readiness: "Catch the 4 Real-World Mistakes" (`agy-security`)

### What This Is Actually Testing (In Plain English)
When an agency developer or contractor writes code or Cloud Run deployment scripts, `agy-security` (`/security-audit`, `/iam-secret-hygiene`, and its always-on `rules/AGENTS.md`) scans for **4 high-risk mistakes that cause real government data breaches**:

1. **SQL Injection (`CWE-89`):** Pasting user input directly into a SQL string (`WHERE county = '${county}'`) instead of using safe `@county` parameters.
2. **Cross-Site Scripting / XSS (`CWE-79`):** Rendering untrusted user text with `.innerHTML = ...` instead of `.textContent = ...`.
3. **Exposed Passwords & API Keys (`CWE-798`):** Hardcoding secrets in code or passing `--set-env-vars API_KEY=...` in plain text instead of Google Cloud Secret Manager (`--set-secrets`).
4. **Over-Privileged Cloud IAM:** Deploying a service publicly (`--allow-unauthenticated`) with the default compute service account (`*-compute@developer.gserviceaccount.com`) and primitive `roles/editor` instead of an Entra-synced Google Identity group with least-privilege roles.

### Copy & Paste Into Antigravity (Includes the 4 Intentional Mistakes to Catch!)

```text
Run `/security-audit` and `/iam-secret-hygiene` on this draft citizen grant status endpoint and deployment command.
Find all 4 security and IAM mistakes, explain each risk in plain English for our Agency CISO, and give me the corrected, copy-paste-ready code and `gcloud` commands:
// DRAFT CODE (Contains intentional vulnerabilities to catch)
const MASTER_API_KEY = "AIzaSyD-HARDCODED-DEMO-TEST-KEY-999";
async function lookupApplication(req, res, bqClient, statusBannerEl) {
  const county = req.query.county;
  const note = req.query.applicantNote;
  // Mistake 1: Unsafe DOM rendering
  statusBannerEl.innerHTML = "Checking note: " + note;
  // Mistake 2: SQL string concatenation
  const sql = `SELECT * FROM \`agency_grants.applications\` WHERE county = '${county}'`;
  return await bqClient.query({ query: sql });
}
# DRAFT DEPLOYMENT & IAM COMMANDS (Contains intentional cloud security mistakes to catch)
gcloud projects add-iam-policy-binding agency-grants-prod \
  --member="user:contractor@gmail.com" \
  --role="roles/editor"
gcloud run deploy agency-grant-portal \
  --source . \
  --region us-east4 \
  --allow-unauthenticated \
  --service-account 123456789-compute@developer.gserviceaccount.com \
  --set-env-vars "DB_PASSWORD=SuperSecretAgencyPassword123,MASTER_API_KEY=AIzaSyD-HARDCODED"
```

---

## Prompt 7 (Run Last) — Federated Gemini Enterprise (GE) Connectors (`agy-connectors`)

### What This Tests
- **`/connect-ge`**, **`/connect-m365-workspace`**, **`/connect-github-bigquery`**, and the **`agy-ge-bridge` MCP server** (`ge_instance_status`, `ge_configure_instance`, `ge_ask_instance`, `ge_search_records`).
- Works whether you **have** a live Gemini Enterprise Resource Path ready to paste OR want to verify the connector bridge status and walkthrough first.

### Copy & Paste Into Antigravity

```text
/connect-ge Check my current Gemini Enterprise (`agy-ge-bridge`) MCP connection status using `ge_instance_status`.
1. Show me whether a default Gemini Enterprise (`GE`) instance is configured yet in `~/.gemini/config/plugin_data/agy-connectors/ge-instance.json`, and which authentication tier (`gcloud` ADC, Google Identity Browser PKCE OAuth, or Central Cloud Run Gateway) is active.
2. Walk me through how our Azure/Entra-synced Google Identity connects to our federated Outlook, SharePoint, OneDrive, Microsoft Teams, Google Drive, and GitHub data stores through a single GE instance—and if my GE instance is already configured, run a quick test query via `/connect-m365-workspace`.
```
