# West Virginia IT Admin & Power-User Playbook: Anthropic Claude + Google Gemini in Antigravity

Reference guide for `/model-guide` covering enterprise enablement on **Google Cloud Vertex AI**, custom endpoint routing, cost governance, and prompt patterns tailored for **Anthropic Claude** vs. **Google Gemini**.

---

## 1. WV Agency IT Admin Checklist: Enabling Anthropic Claude

If West Virginia developers or analysts open the Antigravity model picker and do not yet see **Claude Sonnet** or **Claude Opus**, walk the Agency GCP / Enterprise Administrator through these 4 steps:

### Step 1 — Enable Vertex AI & Anthropic in Model Garden (One-Time per Host Project)
1. Sign in to the Google Cloud Console for the agency's designated AI host project (`YOUR_PROJECT_ID`).
2. Ensure the **Vertex AI API** (`aiplatform.googleapis.com`) is enabled:
   ```bash
   gcloud services enable aiplatform.googleapis.com --project="YOUR_PROJECT_ID"
   ```
3. Navigate to **Vertex AI -> Model Garden** in Cloud Console.
4. Search for **Anthropic** and select **Claude Sonnet** (`claude-sonnet-5-5` / latest available) and **Claude Opus** (`claude-opus-5-5` / latest available).
5. Click **Enable** and complete the one-time **Anthropic Partner Model Terms** acceptance form for your organization.

### Step 2 — Allow Partner Models in Enterprise Admin Settings
- In your enterprise Antigravity / Gemini Enterprise admin policy, verify that **Third-Party / Partner Models** are toggled **On** for the target Entra-synced Google Identity group (for example, `wv-engineering-ai@yourdomain.gov` or `wv-policy-legal@yourdomain.gov`).

### Step 3 — IAM & Regional Endpoint Governance (`us-east5`)
- Grant your authorized Entra-synced Google Identity group **Vertex AI User** (`roles/aiplatform.user`) on `YOUR_PROJECT_ID` (never grant primitive `Owner`/`Editor` roles).
- Prefer **US regional endpoints** (such as **`us-east5`** in Columbus, Ohio—right next door to West Virginia!) rather than non-US regions when configuring Organization Policies (`constraints/gcp.resourceLocations`).
- If developers route Antigravity CLI through an agency GCP project, they can set their project and US region cleanly in `~/.gemini/settings.json`:
  ```json
  {
    "gcp": {
      "project": "YOUR_PROJECT_ID",
      "location": "us-east5"
    }
  }
  ```

### Step 4 — Budget Alerts for Pay-As-You-Go Partner Model Usage
- Because **1P Google Gemini** usage draws first from included enterprise subscription pooled quota while **3P Anthropic Claude** usage bills on **Pay-As-You-Go consumption at list price** (with `0%` Flexible Savings Plan discount on 3P partner models), configure a **Google Cloud Billing Budget Alert** (at `50%`, `80%`, and `100%` of monthly agency allocation) filtered to Vertex AI partner model SKUs so there are never end-of-month surprises.

---

## 2. Prompting Best Practices: Getting Peak Results from Claude vs. Gemini

### Prompting Anthropic Claude (`Claude Sonnet` & `Claude Opus`) in AGY
- **Be Explicit About Scope & File Boundaries:** Claude excels when you specify exact target files, invariants not to break, and desired test verification (pairs naturally with `/modernize-refactor` and `/security-audit`).
- **Use Structured Criteria for Redlines:** When running `/legal-procurement-review` or `/policy-program-audit` on Claude, ask for clause-by-clause citations and exact replacement language rather than open-ended summaries.
- **Right-Size Thinking Effort:**
  - Use **`Medium`** effort on **Claude Sonnet** for 80% of daily coding, SQL authoring, and component builds—it is noticeably faster and uses fewer output/thinking tokens than `High`.
  - Escalate to **`High`** effort on **Claude Sonnet** or **Claude Opus** specifically for Stage 1 architecture blueprints, concurrency/race-condition bugs, or complex statutory/contract redlines.

### Prompting Google Gemini (`Gemini 3.8 Flash` & `Gemini 3.5 Flash-Lite`) in AGY
- **Leverage Full-Context & Multimodal Inputs:** Attach dashboard screenshots (`/wv-dashboard`), multi-hundred-page PDF rulebooks, or large repository slices directly instead of manually chunking them.
- **Pair with Federated GE Grounding:** Keep **Gemini 3.8 Flash** active when running `/connect-m365-workspace`, `/daily-brief`, `/inbox-triage`, or `/foia-expert` discovery across Outlook, SharePoint, OneDrive, Teams, and Google Drive so routine daily turns stay inside your included 1P pooled subscription quota.

---

## 3. Quick Troubleshooting FAQ

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| **Claude models are greyed out or missing in the picker** | Partner models are disabled by org policy, or Anthropic terms are not yet accepted in Vertex AI Model Garden. | Have your WV GCP Admin enable Claude in **Vertex AI -> Model Garden** and enable partner models for your Entra-synced Google group. |
| **`429 Resource Exhausted` when using Claude Opus/Sonnet** | Regional Vertex AI partner quota (QPM/TPM) in `us-east5` is at its initial default cap, or user model credits are exhausted. | Switch to **Claude Sonnet (`Medium` effort)** or **Gemini 3.8 Flash** immediately to stay unblocked, check `/usage`, and request a Vertex AI quota bump in Cloud Console if needed. |
| **Need to review CJIS / HIPAA PHI / IRS FTI files** | Third-party partner model coverage varies by agency BAA and Assured Workloads tier. | Switch the picker to **1P Google Gemini** in an approved Assured Workloads US boundary unless your Agency CISO has explicitly cleared the specific Claude endpoint in writing. |
