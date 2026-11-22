# Google Antigravity — Public Sector Skill Suite (`v1.7.2`) Guided Test Prompts

> [!TIP]
> **New in `v1.7.2` — 1-Click `Skills` Hub (`★ My Personal Skills`), `TokenEconomics` & `Overview` Updates Hub:**
> - **Zero Copy-Paste Needed:** Open **`Extensions → Skills`** (Sparkles icon) in the left sidebar to browse all `40` suite skills **plus** your auto-discovered **`★ My Personal Skills`** (`~/.gemini/config/skills/` & workspace `.gemini/skills/`) and click **`Run →`** on any card—or paste the full deep-test scripts below!
> - **`TokenEconomics` & `/compact` Alert:** Open **`Extensions → My Antigravity → TokenEconomics`** to track your monthly pooled quota cap (`Standard $30`, `Plus $45`, `Enterprise $60`, or Custom Cap) and Orchestrator/Workflows playbooks.
> - **Updates & Video Walkthroughs:** Open **`Extensions → My Antigravity → Overview`** to toggle **`⚡ Orchestrator`**, watch 3–4 minute two-host video walkthroughs, and subscribe to official Google Antigravity updates.

## Before You Begin

**Antigravity** is Google's AI assistant app that you install on your computer.

- **What you'll need:** A work computer with permission to install applications (check with your IT team if you're not sure), your official organization Google account, and about **30–45 minutes**.
- **This is a test using sample data:** Everything in these prompts is made up. **Never paste real constituent, employee, or case information into Antigravity during this pilot.**
- **There are no wrong answers:** We want to know what's clear, what's useful for your job, what's confusing, and what breaks.
- **Questions?** Contact your agency pilot coordinator (`[Name / Email / Chat Space]`).

---

## Quick 3-Step Setup

### Step 1 — Download and Install Antigravity

Open the [Google Antigravity Organization Setup Guide](../setup-guide/index.html) and complete the 7 visual sign-in steps *(you can also bookmark the [Public Sector Skill Launchpad](../workshop/index.html) for extra 1-click starter prompts)*.

### Step 2 — Add the Public Sector Skills to Antigravity

1. Open **Antigravity** on your computer.
2. Click **+ New Conversation** (top left).
3. Copy the line in the code box below:
   ```text
   Run the direct HTTPS setup script for my OS in ~/.gemini/config (do not load the plugin skill and do not write to /tmp) — macOS/Linux: curl -fsSL https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/scripts/install-agy-suite.sh | bash  |  Windows PowerShell: irm https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/scripts/install-agy-suite.ps1 | iex
   ```
   *(Or run `curl -fsSL https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/scripts/install-agy-suite.sh | bash` on macOS/Linux or `irm https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/scripts/install-agy-suite.ps1 | iex` in Windows PowerShell.)*
4. Click inside the **chat box at the bottom of the Antigravity window**, paste (`Ctrl+V` on Windows or `⌘+V` on Mac), and press **Enter**.
5. Leave the default permission setting on: **you may be asked to click Accept a few times during install—that's normal.** *(If your IT team specifically instructed you to switch **Request Review** at the bottom-right of the chat box to **Turbo** for setup, click **Turbo ▾** afterward and switch it back to **Default** once installation finishes.)*
6. **You'll know it worked when** you see a chat message confirming installation is complete (or **My Antigravity**, **Skills**, and **Preview** appear under **Extensions** on the left sidebar). This takes about **1–2 minutes**. *(If your agency network blocks GitHub, see the offline `.zip` installer in [`IT_AND_TECHNICAL_APPENDIX.md`](./IT_AND_TECHNICAL_APPENDIX.md).)*

### Step 3 — Pick the Tests That Match Your Job

Pick the tests that match your day-to-day work:

- **Everyone** should try **Prompts 1–4** and **Prompts 8–9** below (plus any matching role prompts in [`PUBLIC_SECTOR_TEST_PROMPTS.md`](./PUBLIC_SECTOR_TEST_PROMPTS.md)).
- **Prompts 5–7** are for **IT, developer, and security staff** and are optional.
- Each test takes about **2–5 minutes** (including reading the output). **You do not need to finish all of them.**

---

## Order of Tests

1. **Prompt 1 (Start Here): Build a Dashboard, Slides, and a Flyer** *(Everyone)* — Create sample visuals for a made-up public infrastructure program. *You'll see: a sample dashboard, 5-slide presentation deck, and 1-page flyer appear on the right side of the screen.*
2. **Prompt 2: Switch Between AI Models (Claude and Gemini)** *(Everyone; IT section optional)* — Learn how to change which AI model is helping you and when to use each one. *You'll see: a plain step-by-step model switching guide, a task cheat sheet, and a follow-up review prompt you can try.*
3. **Prompt 3: Your Morning Assistant (Inbox Triage, Daily Brief & Draft Reply)** *(Everyone)* — Sort a sample inbox, get a morning brief, and draft a reply in your voice. *You'll see: 3 sample emails sorted by urgency (safely holding a broken attachment for human review), a 1-page brief, and a Draft-Only reply.*
4. **Prompt 4: Records Requests, Contracts, and Policy Checks** *(Legal, records, procurement, and policy staff)* — Redact a sample record, review a risky vendor contract clause, and catch conflicting numbers. *You'll see: search filters, a redacted memo with exemption reasons, contract edits, and a mismatch warning catching `$18M` vs. `$15M`.*
5. **Prompt 5: Update Old Code, Cloud Deployment & Database Queries** *(IT / developers only, optional)* — Fix bugs in an old Python script, generate a cloud deployment command, and modernize a database query. *You'll see: 3 hidden code bugs identified and fixed with passing tests, plus ready-to-use cloud and SQL commands.*
6. **Prompt 6: Catch 4 Common Security Mistakes** *(IT / security only, optional)* — Scan sample code and cloud commands containing 4 intentional security flaws. *You'll see: all 4 security risks explained in plain English for security leadership, followed by corrected code and commands.*
7. **Prompt 7: Connect to Gemini Enterprise** *(Optional — only if IT has set this up)* — Check whether Antigravity is connected to your organization's shared search hub. *You'll see: your current connection status and a walkthrough of how single sign-on search works across email, files, and code.*
8. **Prompt 8: Zero-Footprint Memory, Action Items, `TokenEconomics` & Anti-Slop Scrubbing** *(Everyone)* — Initialize your persistent Personal Memory (`~/.gemini/config/plugin_data/my-antigravity/memory/`), ingest call notes into Action Items, inspect your monthly cap in `TokenEconomics`, build an Adversarial Minto SCQA pre-meeting brief, and scrub an external draft. *You'll see: live AI Inbox Action Items & Topics inside `Extensions -> My Antigravity`, an SCQA pushback brief, and caught `[CONFIRM]` / AI-slop markers.*
9. **Prompt 9 (Run Last): 4-Agent Parallel Swarm Prep & 3-Altitude Weekly Impact** *(Program managers, leads & analysts)* — Fan out 4 specialized subagents in parallel for a milestone review and compile your Friday 3-Altitude impact ledger. *You'll see: a cohesive 360 Prep Pack with a Mermaid diagram and a saved `weekly/YYYY-WXX.md` summary.*

> [!NOTE]
> **How to Run Any Test**
> 1. Start a **+ New Conversation** (top left of Antigravity) for each test.
> 2. Copy **all** of the text inside the prompt code box below (if reading in Google Docs, drag your mouse across the gray box rather than pressing `Ctrl+A` / `⌘+A`, which selects the entire document).
> 3. Click inside the **Antigravity chat box** at the bottom of the window, paste (`Ctrl+V` / `⌘+V`), and press **Enter**.
> 4. **Wait 1–3 minutes** while Antigravity works—please don't type in the chat box while it is running.
> 5. Review the result on screen, then share your feedback using the section at the bottom of this guide.

---

## Prompt 1 — Build a Dashboard, 16:9 Slides & a 1-Page Flyer

- **What you'll try:** Ask Antigravity to create an executive dashboard, a 5-slide briefing deck, and a 1-page fact sheet for a sample `$40.0M` public infrastructure program.
- **What success looks like:** Rendered visual previews of the dashboard, slide deck, and flyer open directly in the panel on the right side of Antigravity (not raw website code), each with a button to open or download it in Chrome or Edge.
- **About how long:** 2–3 minutes.

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

## Prompt 2 — Switch Between AI Models (Anthropic Claude & Google Gemini)

- **What you'll try:** Ask Antigravity how to switch between Google Gemini and Anthropic Claude models, and which model fits different government tasks.
- **What success looks like:** A clear step-by-step switching guide, a plain task-to-model cheat sheet, an optional IT setup checklist, and a ready-to-paste follow-up review prompt at the end. *(Optional 10-second bonus: switch the model menu at the bottom of the Antigravity chat box to **Claude Sonnet** or **Claude Opus** and paste that follow-up prompt to watch Claude review your Prompt 1 visuals.)*
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

```text
/model-guide Our agency developers and policy analysts want to use Anthropic Claude (Claude Sonnet and Claude Opus) alongside Google Gemini inside Antigravity.
Please give me:
1. A step-by-step guide on how a user switches between Google Gemini and Anthropic Claude (and adjusts Thinking/Reasoning effort) in both the Antigravity Desktop prompt bar and the `agy` CLI.
2. A Public Sector Task-to-Model Routing Cheat Sheet showing when to use 1P Gemini 3.8 Flash (included in our pooled subscription quota + 1M context + multimodal) vs. Anthropic Claude Sonnet (multi-file code refactoring & SQL) vs. Anthropic Claude Opus (deep debugging & contract/security redlines).
3. The 4-step checklist for our Agency GCP Administrator to enable Anthropic Claude in Vertex AI Model Garden (`us-east5` region), set Pay-As-You-Go budget alerts, and enforce CJIS/HIPAA/FedRAMP data governance.
4. A ready-to-paste "Pass-2 Claude Cross-Review" prompt I can run right now after switching my model picker to Claude Sonnet or Claude Opus to audit the dashboard and flyer we just built in Prompt 1.
```

---

## Prompt 3 — Your Morning Assistant (Inbox Triage, Daily Brief & Draft Reply)

- **What you'll try:** Set up a brief executive writing profile, triage 3 sample emails (including one broken PDF attachment), build a morning brief, and draft a reply.
- **What success looks like:** Email A (`$1.4M` county request) is flagged urgent, Email B (newsletter) is set aside, Email C (corrupted 0-byte PDF) is **held for human review** instead of cleared by mistake, and the reply to Email A is clearly labeled **Draft-Only** (nothing is ever sent automatically).
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

```text
Run a combined test of our `agy-onboarding` skills (`/agy-onboard`, `/daily-brief`, `/inbox-triage`, and `/my-voice`) for my role as Deputy Director of Operations at the Department of Economic Development:
1. `/agy-onboard`: Create `./agy-profile.md` tuned to a concise, executive BLUF (Bottom-Line-Up-Front) voice for agency leadership and county commissioners.
2. `/inbox-triage`: Triage these 3 incoming emails against our escalation rules (Escalate immediately if: budget impact > $250K, statutory/FOIA deadline <= 5 business days, or County Commission / Legislative inquiry):
   - Email A (From: Riverbend County Commission): "Urgent: $1.4M water main match modification needed before Friday's ISRG board vote."
   - Email B (From: Vendor Portal Notification): "Monthly newsletter: Q4 training webinar schedule."
   - Email C (From: Regional Grant Contractor): "Updated Drawdown Request #14 attached — [ERROR: Attachment 'Drawdown_14_Signed.pdf' is corrupted/unreadable, 0 bytes extracted]."
   Verify that Email C triggers the Unreadable-Attachment Fail-Safe Hold!
3. `/daily-brief`: Turn the triaged items plus a 2:00 PM ET Infrastructure Board Prep call into a 1-page Morning Executive Brief.
4. `/my-voice`: Draft a concise reply to the Riverbend County Commission (`Email A`) in my BLUF voice (strictly Draft-Only).
```

---

## Prompt 4 — Records Requests, Vendor Contracts & Policy Consistency Checks

- **What you'll try:** Generate search filters and redactions for a sample records request, review a risky vendor contract clause, and check a draft press release for conflicting numbers.
- **What success looks like:** Ready-to-use email/file search strings, a redacted version of Paragraph 2 hiding the `$820,000` negotiation ceiling and personal phone/SSN while keeping Paragraph 1 open, redlined contract language fixing all 4 risky vendor terms, and a clear alert catching **`$18M` vs. `$15M`** and **Jan 15, 2027 vs. Dec 31, 2026**.
- **About how long:** 2–3 minutes.

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

## Prompt 5 — Update Old Code, Cloud Run & BigQuery SQL *(IT / Developers — Optional)*

- **What you'll try:** Ask Antigravity to audit and rewrite a buggy legacy grant-calculation script, generate a secure cloud deployment command, and translate a legacy SQL Server query to BigQuery.
- **What success looks like:** A 6-part modernization plan that catches the subtle logic bugs (including `or "Oakridge"` always evaluating true and exact `500000` crashing), clean tested Python code, a hardened Cloud Run deploy command, and a parameterized BigQuery query with a 1 GB scan cap.
- **About how long:** 2–3 minutes.

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

## Prompt 6 — Catch 4 Real-World Security Mistakes *(IT / Security — Optional)*

- **What you'll try:** Give Antigravity a sample web endpoint and cloud deployment script containing 4 common security mistakes (unsafe webpage text rendering, unsafe database query building, exposed passwords/keys, and overly broad cloud permissions).
- **What success looks like:** Antigravity flags all 4 mistakes, explains each risk in plain English suitable for an agency security briefing, and provides corrected copy-paste-ready code and `gcloud` commands.
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

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

## Prompt 7 — Federated Gemini Enterprise (GE) Connectors *(Optional — IT Setup Required)*

- **What you'll try:** Check whether Antigravity is connected to your organization's shared Gemini Enterprise search hub and review how single sign-on search works.
- **What success looks like:** Antigravity reports whether a Gemini Enterprise instance is configured on your computer (even if IT hasn't connected yours yet) and explains in clear steps how single sign-on connects Outlook, SharePoint, OneDrive, Teams, Google Drive, and GitHub while respecting each employee's file permissions.
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

```text
/connect-ge Check my current Gemini Enterprise (`agy-ge-bridge`) MCP connection status using `ge_instance_status`.
1. Show me whether a default Gemini Enterprise (`GE`) instance is configured yet in `~/.gemini/config/plugin_data/agy-connectors/ge-instance.json`, and which authentication tier (`gcloud` ADC, Google Identity Browser PKCE OAuth, or Central Cloud Run Gateway) is active.
2. Walk me through how our Azure/Entra-synced Google Identity connects to our federated Outlook, SharePoint, OneDrive, Microsoft Teams, Google Drive, and GitHub data stores through a single GE instance—and if my GE instance is already configured, run a quick test query via `/connect-m365-workspace`.
```

---

## Prompt 8 — Personal Memory, Action Items, SCQA Meeting Prep & Outbound Scrubbing

- **What you'll try:** Initialize your persistent Personal Memory (`~/my-antigravity/memory/`), ingest sample call notes into `action_items.md`, generate a 1-card Adversarial Minto SCQA pre-meeting brief, and run anti-slop + outbound safety scrubbing on a draft email.
- **What success looks like:** `profile/{identity,portfolio,playbooks,voice}.md`, `action_items.md`, `contacts.md`, and 4-file `initiatives/` folders power the AI Inbox **`Action Items`** (`Suggested to-dos` + `Topics to catch up on`) inside **`Extensions -> My Antigravity`**; Robert Vance's `STALE (>21d)` status clears after ingesting the call notes; `/meeting-prep` builds a realistic SCQA red-team section; and `/outbound-scrub` + `/no-ai-slop` catch `[CONFIRM: ...]`, `[TODO: ...]`, and LLM filler phrases.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
Test our `agy-second-brain` skills (`/memory`, `/meeting-notes`, `/meeting-prep`, `/no-ai-slop`, and `/outbound-scrub`):
1. `/memory`: Initialize my Personal Memory using the `public-sector` preset for Jordan Taylor (Senior Program Analyst, State Office of Broadband & Digital Equity, timezone `America/New_York`) with demo initiatives enabled.
2. `/meeting-notes`: Ingest these call notes into `broadband-grant-round-3`, extract open `- [ ]` commitments to `action_items.md` without deleting existing tasks, and update `contacts.md`:
   "Call: Round 3 County Grant Intake Review (Attendees: Carla Jennings, Robert Vance).
   - Confirmed the $15M total award cap and Dec 31, 2026 submission deadline across all county PDFs.
   - [ ] Draft 1-page sample match-waiver calculation worksheet for county applicants
   - [ ] Confirm FAQ Spanish translation timeline with Communications lead"
3. `/meeting-prep`: Build a 1-card pre-meeting brief and Adversarial Minto SCQA Critic ("Angle & Pushback to Watch For") for my upcoming legal review with Senior Assistant General Counsel Hannah Kim on `records-modernization-pilot`.
4. `/outbound-scrub` + `/no-ai-slop`: Audit and rewrite this external draft so it is free of unresolved placeholders and AI-slop filler:
   "First and foremost, in today's fast-paced and ever-evolving landscape, I wanted to delve into our paradigm-shifting grant portal rollout — it's not just an upgrade, it's a game changer! Please verify the final award ceiling [CONFIRM: $15M or $18M?] and cutoff [TODO: insert date]. At the end of the day, this ensures holistic synergy."
```

---

## Prompt 9 (Run Last) — 4-Agent Parallel Swarm Prep & 3-Altitude Weekly Impact

- **What you'll try:** Run 4 specialized subagents concurrently (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`) to prepare a 360-degree milestone review pack, then generate your Friday 3-Altitude accomplishment summary.
- **What success looks like:** All 4 subagents run in parallel and synthesize one structured 360 Prep Pack (with an `L100–L300` talk track, Mermaid diagram, SCQA counter-moves, and pre-scrubbed `[Draft-Only]` recap), followed by a saved `weekly/YYYY-WXX.md` and `impact/ledger.json` entry.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
1. `/swarm-prep`: Run a 4-agent parallel 360 prep pack for our Thursday milestone review on `broadband-grant-round-3` (covering memory status, an L100–L300 talk track with a Mermaid workflow diagram, SCQA pushback & counter-moves, and a pre-scrubbed `[Draft-Only]` stakeholder recap).
2. `/weekly-impact`: Summarize our current progress across Altitude 1 (Executive Outcomes), Altitude 2 (Cross-Team Reusable Assets), and Altitude 3 (Workstream Velocity) into `~/my-antigravity/memory/weekly/` and `impact/ledger.json`.
```

---

## Send Your Feedback

After trying your chosen prompts, please take **2 minutes** to share what you saw in your agency's pilot feedback form (`[Feedback Form Link]`):
- **Did it work as expected?**
- **Would this be useful in your day-to-day work?**
- **What felt confusing or should be improved?**

**Target completion date:** `[Testing Target Date]`

---

## Troubleshooting & Updates

- **Nothing happens after I press Enter:** Wait 2 minutes; if Antigravity is still idle, click **+ New Conversation** and paste the prompt again.
- **Antigravity asks for permission:** Click **Accept**. Being asked to click Accept a few times is normal when Default review mode is on.
- **I see an error message:** Take a screenshot and attach it to your feedback submission.
- **How to get skill updates:** If your coordinator announces an update to the skills, type `/agy-update` in the Antigravity chat box and press **Enter** (updates take about 1 second—no full re-install needed).
- **IT & Security Architecture Details:** See [`IT_AND_TECHNICAL_APPENDIX.md`](./IT_AND_TECHNICAL_APPENDIX.md).
- **Still stuck?** Contact `[Name / Email / Chat Space]`.
