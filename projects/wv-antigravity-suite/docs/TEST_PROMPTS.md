# West Virginia Antigravity Launchpad & Guided Test Prompts (`v1.3.1`)

## Quick 3-Step Setup
1. **Step 1 — Complete AGY Download & Install:** Follow the [Antigravity Download & Install Guide](https://serve-dot-zipline.appspot.com/asset/18726ad2-eb6d-5295-baf2-86442bb8f3df/zpc/gktu4puu98z/).
2. **Step 2 — Install or Incrementally Update Plugin (From a New Conversation in AGY + Switch to Turbo Mode):**
   - Click **`+ New Conversation`** inside Antigravity.
   - In the bottom-right corner of the prompt box, click **`Request Review ▾`** and switch to **`Turbo`** (*"Run all commands without restrictions"*) to eliminate repetitive approval prompts during installation.
   - **First-Time Install (or Upgrade to `v1.3.1`):** Paste this prompt and click Send (`→`):
     ```text
     agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/wv-antigravity-suite
     ```
   - **Fast `< 1s` Incremental Skill Updates (`v1.3.0+` — No Full Re-Install Needed!):**
     - Click **`Sync Git Updates`** in the top-right of the **`WV Skills`** sidebar panel (**Extensions → WV Skills**), or click the **`↻`** icon next to any individual skill toggle; **OR**
     - Type `/wv-update` (syncs all changed skills via SHA-256 hash comparison over HTTPS `443`) or `/wv-update wv-dashboard` (updates a single skill in `< 1 second`).
3. **Step 3 — Test the Plugin:** Copy and paste the **7 Guided Test Prompts** below to test all **6 plugins** and **21 skills**.

> [!NOTE]
> **Tip for Google Docs Links Inside Antigravity:** If clicking a `docs.google.com` link inside Antigravity's built-in browser shows a Context-Aware Access prompt, click **`Open the page in system browser`** in the top banner to open in Google Chrome. All 21 West Virginia skills write local `.md` and `.html` Artifacts that render natively inside Antigravity with zero browser blocks.

### Order of Tests
1. **Prompt 1 (Start Here): West Virginia Command Center Dashboards, 16:9 Slides & Branded Flyers** (`wv-design-studio v1.3.1` — verifies the new Capitol Navy Command Center UI, `Ask Gemini Enterprise` search bar, `2026 SITE READINESS CLOCK`, numbered tabs `1. TODAY & TRIAGE`, `2. PRIORITY AGENDA`, `3. PORTFOLIO ANALYTICS`, `4. COUNTY SITE REGISTER`, rendered Side-Pane HTML Artifacts + `Extensions → WV Preview`, with **zero** local port errors)
2. **Prompt 2: Using Anthropic Claude & Google Gemini Models in AGY** (`wv-onboarding` `/model-guide` — switching models, Claude vs. Gemini routing, 2-Pass Dual-Model Review, and WV IT Vertex AI setup)
3. **Prompt 3: 60-Second Onboarding, Daily Brief, Digital Twin & Inbox Triage** (`wv-onboarding`)
4. **Prompt 4: West Virginia FOIA, Legal Contract Redlining & Policy Audit** (`wv-state-workflows`)
5. **Prompt 5: Legacy App Refactoring, Cloud Run & BigQuery SQL** (`wv-engineering-cloud`)
6. **Prompt 6: Security & Cloud Readiness ("Catch the 4 Real-World Security Mistakes")** (`wv-security` — rewritten with a concrete code/cloud snippet so it is 100% clear what it is testing)
7. **Prompt 7 (Last): Federated Gemini Enterprise (`GE`) Connectors** (`wv-connectors` — placed last for when you are ready to test live or pre-filled GE instance connectivity)

---

## Prompt 1 — West Virginia Command Center Dashboards, 16:9 Slides & Branded Flyers (`wv-design-studio v1.3.1`)

### What This Tests
- **`/wv-dashboard`**, **`/slides`**, and **`/doc-design`** (plus **`Extensions → WV Preview`**).
- **West Virginia Command Center UI (`v1.3.1`):** Verifies the Capitol Command Navy header (`#0F1A2A`), `Ask Gemini Enterprise` search bar, `2026 SITE READINESS CLOCK` / `2027 SESSION CLOCK` ribbon, numbered tabs (`1. TODAY & TRIAGE`, `2. PRIORITY AGENDA`, `3. PORTFOLIO ANALYTICS` showing charts only, and `4. COUNTY SITE REGISTER` showing the register table only), green-bordered System Health banner, and dark-navy-header `NEEDS ACTION NOW` + `MY WORK LIST` operational split panels.
- **100% Serverless Visual Output Check (Zero Python, Zero Node Server, Zero `127.0.0.1` Firewall Ports):** Verifies that all 3 deliverables (`Dashboard`, `Slide Deck`, and `Flyer`) are written as self-contained `.html` Artifacts in the Conversation Artifact Directory (`UserFacing: true`) with a built-in **`Open / Download HTML ↗`** button in the top bar for Chrome/Edge.

### Copy & Paste Into Antigravity
```text
Using `/wv-dashboard`, `/slides`, and `/doc-design`, create a West Virginia "Mountain State Ready" Command Center executive package in `./wv-mountain-state-demo` using these exact program figures ($40.0M total portfolio closing December 31, 2026: $25.0M WVEDA Shell Building Loans + $15.0M IJDC Tier 1–3 Site Readiness Grants across Kanawha, Monongalia, Cabell, Berkeley, and Raleigh counties):

1. `/wv-dashboard`: Scaffold an interactive West Virginia Command Center dashboard in `./wv-mountain-state-demo/dashboard` (`wv-mountain-state-ready` template) featuring the Capitol Command Navy header (`#0F1A2A`), `Ask Gemini Enterprise` search bar, `2026 SITE READINESS CLOCK` ribbon, numbered tabs (`1. TODAY & TRIAGE`, `2. PRIORITY AGENDA`, `3. PORTFOLIO ANALYTICS`, `4. COUNTY SITE REGISTER`), green-bordered System Health banner, 4 KPI cards ($40.0M Authorized Funding, Active Pipeline, Qualifying Acreage, Projected Jobs), and dark-navy-header `NEEDS ACTION NOW` + `MY WORK LIST` operational split panels.
2. `/slides`: Create a 5-slide 16:9 executive briefing deck (`./wv-mountain-state-demo/slides/deck.html`) with keyboard navigation, speaker notes (`N` key), and a top `Download HTML` / `Print / Save as PDF` button.
3. `/doc-design`: Create a 1-page print-ready stakeholder fact sheet (`./wv-mountain-state-demo/flyer/flyer.html`) comparing WVEDA Loan terms vs. IJDC Grant tiers.

IMPORTANT — Serverless Visual Artifact Rules (No Local Ports / No Python Server):
- Write all 3 self-contained single-file HTML copies (`wv_mountain_state_dashboard_preview.html` from `dashboard-standalone.html`, `wv_mountain_state_slides_preview.html` from `deck.html`, and `wv_mountain_state_flyer_preview.html` from `flyer.html`) directly to the Conversation Artifact Directory using `write_file` with `ArtifactMetadata: { UserFacing: true, RequestFeedback: false }`.
- Do NOT create any `127.0.0.1` or `localhost` `.url.json` artifacts, do NOT start `python3 -m http.server`, and do NOT link workspace `index.html` code files in chat.
```

---

## Prompt 2 — Using Anthropic Claude & Google Gemini in AGY (`/model-guide`)

### What This Tests
- **`/model-guide`** (newly added in `wv-onboarding v1.2.0`).
- Shows West Virginia staff and developers **how to switch to Anthropic Claude (`Claude Sonnet` / `Claude Opus`)** in the Antigravity Desktop picker or CLI (`/model`), **which tasks to run on Claude vs. Gemini**, **how WV IT enables Claude in Google Cloud Vertex AI Model Garden (`us-east5`)**, and gives you a live **Pass-2 Claude Adversarial Review prompt** to try right after!

### Copy & Paste Into Antigravity
```text
/model-guide Our West Virginia agency developers and policy analysts want to use Anthropic Claude (Claude Sonnet and Claude Opus) alongside Google Gemini inside Antigravity.

Please give me:
1. A step-by-step guide on how a user switches between Google Gemini and Anthropic Claude (and adjusts Thinking/Reasoning effort) in both the Antigravity Desktop prompt bar and the `agy` CLI.
2. A West Virginia Task-to-Model Routing Cheat Sheet showing when to use 1P Gemini 3.8 Flash (included in our pooled subscription quota + 1M context + multimodal) vs. Anthropic Claude Sonnet (multi-file code refactoring & SQL) vs. Anthropic Claude Opus (deep debugging & contract/security redlines).
3. The 4-step checklist for our West Virginia GCP Administrator to enable Anthropic Claude in Vertex AI Model Garden (`us-east5` region), set Pay-As-You-Go budget alerts, and enforce CJIS/HIPAA/FedRAMP data governance.
4. A ready-to-paste "Pass-2 Claude Cross-Review" prompt I can run right now after switching my model picker to Claude Sonnet or Claude Opus to audit the dashboard and flyer we just built in Prompt 1.
```

> [!TIP]
> **Hands-On Claude Follow-Up (10 Seconds):** After the agent replies, click the **Model Selector dropdown** at the bottom of your Antigravity prompt box, switch to **Claude Sonnet** (or **Claude Opus**), and paste the Pass-2 review prompt it generated to watch Claude audit your Prompt 1 deliverables in the same thread!

---

## Prompt 3 — Onboarding, Daily Brief, Digital Twin & Inbox Triage (`wv-onboarding`)

### What This Tests
- **`/wv-onboard`**, **`/daily-brief`**, **`/digital-twin`**, **`/inbox-triage`**, and **`/wv-update`**.
- Specifically tests whether **`/inbox-triage`** catches urgent leadership escalations **and** enforces the **unreadable-attachment fail-safe hold** (never auto-clearing an email when an attachment fails to parse), while **`/digital-twin`** drafts a reply in your voice with `[Draft-Only — Do Not Auto-Send]` tags.

### Copy & Paste Into Antigravity
```text
Run a combined test of our `wv-onboarding` skills (`/wv-onboard`, `/daily-brief`, `/inbox-triage`, and `/digital-twin`) for my role as Deputy Director of Operations at the West Virginia Department of Economic Development:

1. `/wv-onboard`: Create `./wv-twin-profile.md` tuned to a concise, executive BLUF (Bottom-Line-Up-Front) voice for agency leadership and county commissioners.
2. `/inbox-triage`: Triage these 3 incoming emails against our escalation rules (Escalate immediately if: budget impact > $250K, statutory/FOIA deadline <= 5 business days, or County Commissioner / Legislature inquiry):
   - Email A (From: Kanawha County Commission): "Urgent: $1.4M water main match modification needed before Friday's IJDC board vote."
   - Email B (From: Vendor Portal Notification): "Monthly newsletter: Q4 training webinar schedule."
   - Email C (From: Regional Grant Contractor): "Updated Drawdown Request #14 attached — [ERROR: Attachment 'Drawdown_14_Signed.pdf' is corrupted/unreadable, 0 bytes extracted]."
   Verify that Email C triggers the Unreadable-Attachment Fail-Safe Hold!
3. `/daily-brief`: Turn the triaged items plus a 2:00 PM ET IJDC Board Prep call into a 1-page Morning Executive Brief.
4. `/digital-twin`: Draft a concise reply to the Kanawha County Commission (`Email A`) in my BLUF voice (strictly Draft-Only).
```

---

## Prompt 4 — West Virginia FOIA, Legal Review & Policy Consistency (`wv-state-workflows`)

### What This Tests
- **`/foia-expert`** (adapted from the WV FOIA Custom Skill spec: Google Vault + Microsoft Purview KQL search strings, **W. Va. Code § 29B-1-4** & **5 U.S.C. § 552** line-by-line segregability redaction, and a formal **Vaughn Index**),
- **`/legal-procurement-review`** (catches vendor clauses that violate West Virginia constitutional sovereign immunity, multi-year fiscal non-appropriation rules, and AI model training on state data using `1:3:9` risk scoring),
- **`/policy-program-audit`** (catches conflicting dollar caps or dates across documents).

### Copy & Paste Into Antigravity
```text
Test all 3 `wv-state-workflows` skills (`/foia-expert`, `/legal-procurement-review`, and `/policy-program-audit`) on this West Virginia scenario:

1. `/foia-expert`: We received a public records request for "all emails and SharePoint memos between Jan 1, 2026 and March 31, 2026 mentioning Project Allegheny or parcel bids in Mason County."
   - Generate the exact **Google Vault** and **Microsoft Purview KQL** discovery queries.
   - Review this responsive record excerpt for **line-by-line segregability** under **W. Va. Code § 29B-1-4** and **5 U.S.C. § 552** and produce a **Vaughn Index table**:
     > "Paragraph 1: On Feb 12, 2026, Agency Engineers completed the public Phase 1 traffic count on Route 35 (14,200 vehicles/day). Paragraph 2 [DRAFT INTERNAL DELIBERATION]: Chief Counsel advises that our pre-decisional negotiation ceiling for Parcel 4B is $820,000, and applicant John Doe's home cell (304-555-0199) and SSN (999-00-1234) are listed on the tax worksheet."
2. `/legal-procurement-review`: Score this vendor SaaS contract clause using `1:3:9` risk scoring and write the West Virginia replacement redline:
   > "Section 14: State Agency agrees to indemnify and hold harmless Vendor against all third-party claims, locks into a non-cancellable 5-year term regardless of legislative appropriations, submits to binding arbitration in Delaware, and grants Vendor a perpetual license to train commercial AI models on State Agency uploads."
3. `/policy-program-audit`: Check whether a draft press release saying "$18M in IJDC grants closing Jan 15, 2027" conflicts with our official $15M / Dec 31, 2026 program rules.
```

---

## Prompt 5 — Legacy App Refactoring, Cloud Run & BigQuery (`wv-engineering-cloud`)

### What This Tests
- **`/modernize-refactor`** (3-stage modernization workflow adapted from Google's `migrate-to-rust` skill: Stage 1 6-Section Blueprint & Legacy Bug Audit -> Stage 2 Crucible & Parity Verification),
- **`/deploy-cloudrun`** (zero-Docker source deployment with non-root user, dedicated service account, and Secret Manager),
- **`/bigquery-architect`** (migrating legacy T-SQL to partitioned BigQuery Standard SQL with `@param` bindings and a `1 GB` `maximumBytesBilled` cost cap).

### Copy & Paste Into Antigravity
```text
Test `wv-engineering-cloud` (`/modernize-refactor`, `/deploy-cloudrun`, and `/bigquery-architect`) on this legacy West Virginia grant eligibility script:

1. `/modernize-refactor`: Create a Stage 1 6-Section Modernization Blueprint (including a Legacy Bug Audit) and refactor this legacy Python 2 / procedural snippet into a clean, tested modern Python module in `./wv-grant-service`:
   ```python
   # Legacy grant score calculator (contains subtle bugs: mutable default arg, float rounding, and tier boundary bug at 500000)
   def calc_grant(amount, county, flags=[]):
       if county == "Kanawha" or "Monongalia":  # BUG: always truthy!
           flags.append("priority")
       if amount > 500000:
           match = amount * 0.25
       elif amount < 500000:  # BUG: exact 500000 falls through!
           match = amount * 0.50
       return {"match": match, "flags": flags}
   ```
2. `/deploy-cloudrun`: Generate the hardened zero-Docker `gcloud run deploy` command and `.gcloudignore` for `./wv-grant-service` in `us-east4` using a dedicated service account and Secret Manager.
3. `/bigquery-architect`: Rewrite this legacy SQL Server query into partitioned BigQuery Standard SQL with parameterized `@county_name` and a 1 GB `maximumBytesBilled` cap:
   `SELECT TOP 50 ISNULL(applicant_name, 'Unknown'), DATEDIFF(day, submitted_dt, GETDATE()) FROM dbo.wv_grant_apps WHERE county = 'Kanawha'`
```

---

## Prompt 6 — Security & Cloud Readiness: "Catch the 4 Real-World Mistakes" (`wv-security`)

### What This Is Actually Testing (In Plain English)
Previously, the security test prompt looked abstract because it didn't give you a **concrete piece of broken code/config** to watch the skill fix.
Here is what `wv-security` (`/security-audit`, `/iam-secret-hygiene`, and its always-on `rules/AGENTS.md`) actually does for West Virginia:
- When an agency developer or contractor writes code or Cloud Run deployment scripts, `wv-security` scans for **4 high-risk mistakes that cause real government data breaches**:
  1. **SQL Injection (`CWE-89`):** Pasting user input directly into a SQL string (`WHERE county = '${county}'`) instead of using safe `@county` parameters.
  2. **Cross-Site Scripting / XSS (`CWE-79`):** Rendering untrusted user text with `.innerHTML = ...` instead of `.textContent = ...`.
  3. **Exposed Passwords & API Keys (`CWE-798`):** Hardcoding secrets in code or passing `--set-env-vars API_KEY=...` in plain text instead of Google Cloud Secret Manager (`--set-secrets`).
  4. **Over-Privileged Cloud IAM:** Deploying a service publicly (`--allow-unauthenticated`) with the default compute service account (`*-compute@developer.gserviceaccount.com`) and primitive `roles/editor` instead of an Entra-synced Google Identity group with least-privilege roles.

### Copy & Paste Into Antigravity (Includes the 4 Intentional Mistakes to Catch!)
```text
Run `/security-audit` and `/iam-secret-hygiene` on this draft West Virginia citizen grant status endpoint and deployment command.

Find all 4 security and IAM mistakes, explain each risk in plain English for our Agency CISO, and give me the corrected, copy-paste-ready code and `gcloud` commands:

```javascript
// DRAFT CODE (Contains 3 intentional vulnerabilities to catch)
const MASTER_API_KEY = "AIzaSyD-HARDCODED-WV-TEST-KEY-999";

async function lookupApplication(req, res, bqClient, statusBannerEl) {
  const county = req.query.county;
  const note = req.query.applicantNote;

  // Mistake 1: Unsafe DOM rendering
  statusBannerEl.innerHTML = "Checking note: " + note;

  // Mistake 2: SQL string concatenation
  const sql = `SELECT * FROM \`wv_grants.applications\` WHERE county = '${county}'`;
  return await bqClient.query({ query: sql });
}
```

```bash
# DRAFT DEPLOYMENT & IAM COMMANDS (Contains 2 intentional cloud security mistakes to catch)
gcloud projects add-iam-policy-binding wv-agency-prod \
  --member="user:contractor@gmail.com" \
  --role="roles/editor"

gcloud run deploy wv-grant-portal \
  --source . \
  --region us-east4 \
  --allow-unauthenticated \
  --service-account 123456789-compute@developer.gserviceaccount.com \
  --set-env-vars "DB_PASSWORD=SuperSecretStatePassword123,MASTER_API_KEY=AIzaSyD-HARDCODED"
```
```

---

## Prompt 7 (Run Last) — Federated Gemini Enterprise (`GE`) Connectors (`wv-connectors`)

### What This Tests
- **`/connect-ge`**, **`/connect-m365-workspace`**, **`/connect-github-bigquery`**, and the **`wv-ge-bridge` MCP server** (`ge_instance_status`, `ge_configure_instance`, `ge_ask_instance`, `ge_search_connectors`).
- Works whether you **have** a live Gemini Enterprise Resource Path ready to paste OR want to verify the connector bridge status and walkthrough first.

### Copy & Paste Into Antigravity
```text
/connect-ge Check my current West Virginia Gemini Enterprise (`wv-ge-bridge`) MCP connection status using `ge_instance_status`.
1. Show me whether a default Gemini Enterprise (`GE`) instance is configured yet in `~/.gemini/config/plugin_data/wv-connectors/ge-instance.json`, and which authentication tier (`gcloud` ADC, Google Identity Browser PKCE OAuth, or Central Cloud Run Gateway) is active.
2. Walk me through how our Azure/Entra-synced Google Identity connects to our federated Outlook, SharePoint, OneDrive, Microsoft Teams, Google Drive, and GitHub data stores through a single GE instance—and if my GE instance is already configured, run a quick test query via `/connect-m365-workspace`.
```
