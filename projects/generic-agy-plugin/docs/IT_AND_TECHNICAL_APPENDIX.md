# IT & Technical Appendix (`v1.0.1`)

This appendix consolidates technical architecture, network allowlisting, offline installation options, security review settings, and skill/connector verification details for Agency IT administrators, security reviewers, and pilot facilitators.

---

## 1. Corporate Network Allowlist & Offline `.zip` Installation

For agencies whose corporate firewalls restrict `github.com` or `raw.githubusercontent.com`:

- **Option A — Offline Pre-Built `.zip` Installer (`< 2 Seconds`, Zero Git or Internet Required):**
  IT can distribute [`dist/generic-agy-plugin.zip`](../dist/generic-agy-plugin.zip) (`275 KB`) via an internal software share, SharePoint folder, or intranet portal. After extracting `generic-agy-plugin.zip`, employees or IT endpoint scripts run:
  - **Windows PowerShell:**
    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\install-agy-suite.ps1 `
      -GeInstance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
    ```
  - **macOS / Linux:**
    ```bash
    bash ./scripts/install-agy-suite.sh \
      --ge-instance "projects/YOUR_PROJECT_ID/locations/global/collections/default_collection/engines/YOUR_GE_ENGINE_ID"
    ```
- **Option B — Agency-Hosted Internal Git Mirror:**
  Clone `projects/generic-agy-plugin` into your agency's internal GitHub Enterprise, GitLab, or Cloud Source repository and substitute that internal HTTPS URL in `agy plugin install <INTERNAL_REPO_URL>`.
- **Zero Extra Laptop Dependencies:** All 6 plugins, 28 skills, 2 UI sidecars (`AGY Skills` and `AGY Preview`), and the `agy-ge-bridge` MCP server run natively on Antigravity's built-in `agy-node` runtime—requiring zero separate `Node.js`, `Python`, `npm`, `pip`, or `Docker` installations on staff laptops.

---

## 2. Antigravity Request Review Security Policy (`Default` vs. `Turbo`)

- **Recommended Pilot Setting (`Default`):** Keep Antigravity's **Request Review** mode (bottom-right of the chat input bar) set to **Default** (*"Ask before sensitive operations"*). During initial plugin installation, employees will click **Accept** a few times; this preserves standard human-in-the-loop command confirmation without weakening workstation guardrails.
- **Agency IT-Managed `Turbo` Policy & Switching Back:** Organization administrators can centrally disable **Turbo** mode (*"Run all commands without restrictions"*) in Google Cloud Console under Gemini Enterprise / Antigravity Admin Settings. If IT temporarily permits **Turbo** mode during a supervised onboarding workshop, instruct participants to click **Turbo ▾** in the bottom-right corner of the chat box immediately after Step 2 and select **Default**.

---

## 3. Core Suite Technical Verification Matrix (`Prompts 1–7`)

| Prompt | Plugin & Slash Skills Exercised | Technical & Security Capabilities Verified |
| :--- | :--- | :--- |
| **Prompt 1** | `agy-design-studio` (`/agy-dashboard`, `/slides`, `/doc-design`, `agy-design-preview` sidecar) | Serverless `<agent-embed>` Side-Pane rendering (`dashboard-standalone.html`, `deck.html`, `flyer.html`) + 1-click Chrome/Edge Blob HTML export with zero `127.0.0.1` ports, zero `python3 -m http.server`, and zero raw `index.html` code views. |
| **Prompt 2** | `agy-onboarding` (`/model-guide`) | Visual model selector + CLI (`/model`) switching, pooled subscription quota (`Gemini 3.8 Flash`) vs. PayGo `Claude Sonnet`/`Claude Opus` routing, Vertex AI Model Garden `us-east5` enablement, and 2-Pass Dual-Model review. |
| **Prompt 3** | `agy-onboarding` (`/agy-onboard`, `/inbox-triage`, `/daily-brief`, `/digital-twin`, `/agy-update`) | Local `agy-twin-profile.md` persistence, deterministic escalation bucketing, **Unreadable-Attachment Fail-Safe Hold** on 0-byte/corrupt attachments, and `[Draft-Only — Do Not Auto-Send]` enforcement. |
| **Prompt 4** | `agy-public-workflows` (`/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`) | Google Vault + Microsoft Purview KQL syntax, `5 U.S.C. § 552(b)(5)` & `(b)(6)` line-by-line segregability + Vaughn Index, `1:3:9` sovereign-immunity/non-appropriation/AI-training redlines, and cross-document variance detection. |
| **Prompt 5** | `agy-engineering-cloud` (`/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/find-cloud-skill`) | Stage 1 6-Section Modernization Blueprint + Legacy Bug Audit (`flags=[]`, truthy `or`, boundary `500000`), non-root source Cloud Run deploy with dedicated SA & Secret Manager, and parameterized BigQuery Standard SQL (`1 GB` `maximumBytesBilled`). |
| **Prompt 6** | `agy-security` (`/security-audit`, `/iam-secret-hygiene`, always-on `rules/AGENTS.md`) | Catches and remediates `CWE-79` DOM XSS (`.innerHTML` -> `.textContent`), `CWE-89` SQL injection (`@county` parameter), `CWE-798` hardcoded/plaintext env secrets (`--set-secrets`), and `CWE-250`/`CWE-284` primitive `roles/editor` + default compute SA (`--no-allow-unauthenticated` + Entra-synced Google group IAM). |
| **Prompt 7** | `agy-connectors` (`/connect-ge`, `/connect-m365-workspace`, `/connect-github-bigquery`, `agy-ge-bridge` MCP) | Verifies `ge_instance_status` across `gcloud` ADC, Google Identity Browser PKCE OAuth, or Cloud Run Gateway tiers and federated `AssistantService.StreamAssist` / `SearchService.Search` ACL enforcement. |

---

## 4. Government Services (`public_sector`) MCP & Fallback Matrix (`PS-1–PS-7`)

| Prompt & Slash Skill | Works Without an MCP Server? | Expected Technical Behavior When No External MCP Server Is Attached |
| :--- | :--- | :--- |
| **PS-1:** `/document-intake-cleanup-and-validation` | **Yes — 100% Standalone** | Evaluates pasted/uploaded paystubs, leases, and residency proofs directly; runs deterministic gross-income math and mixed-packet Tier 2 shelter holds with zero MCP calls needed. |
| **PS-2:** `/plain-language-notice-generator` | **Yes — 100% Standalone** | Rewrites pasted municipal/state advisories into plain language while preserving 100% of dates, streets, phone numbers, and verbatim `40 CFR § 141.205` blocks. |
| **PS-3:** `/public-records-redaction` | **Yes — 100% Standalone** | Redacts pasted records line-by-line using bundled `citation_guide.md` (`5 U.S.C. § 552(b)(4), (b)(5), (b)(6), (b)(7)(E)/(F)` + state counterparts) with officer review flags. |
| **PS-4:** `/foia-request-processing` | **Yes (Pasted Hits or `agy-ge-bridge`)** | Evaluates pasted repository hits (or Federated GE results) to build the 3-table Officer Report, and **logs unconnected systems (`ServiceNow`, `SMS`) in the `Gaps` table**. |
| **PS-5:** `/rfp-vendor-evaluation` | **Yes — Partial External Flag by Design** | Compiles page-cited Mandatory Pass/Fail and Scored Evidence tables without ranking vendors, while **marking external database checks (`SAM.gov` debarment) as `Cannot Verify`**. |
| **PS-6:** `/expense-auditor` | **Tier-2 `.gov` Web Fallback (or Award Terms)** | Checks for a Federal Regulatory MCP (`2 CFR Part 200`) first; falls back to official `.gov` lookup (`ecfr.gov` / `gsa.gov`) when online, or flags external rate lookups while auditing all ledger math deterministically. |
| **PS-7:** `/policy-and-statute-assistant` | **Strict Anti-Hallucination Gate** | Checks Federal Regulatory MCP first, then official `.gov` (`ecfr.gov` / `govinfo.gov`). **If offline, intentionally withholds unverified statutory quotes** and outputs `[⚠️ RETRIEVAL TIMEOUT: Official endpoint unreachable...]` + a drafted Policy Clarification Request (`PCR`). |
