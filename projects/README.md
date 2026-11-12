# Google Cloud Public Sector AI Hub (`projects/`)

Welcome to the **Google Cloud Public Sector AI Hub** reference architecture catalog. This directory contains enterprise reference architectures, Model Context Protocol (MCP) connectors, compliance pipelines, and technical demonstrations for **Gemini Enterprise** and **Vertex AI Agent Platform**.

> **Acknowledgements & Attribution**: Several Microsoft Graph BYO-MCP connector patterns build upon foundational reference architectures created by **Upasana Pati**.

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads without organization-specific security review.

> [!IMPORTANT]
> **Clean Repository Export (`prepare_clean_gtm_repo.sh`):** Before publishing or mirroring this catalog to an approved organizational GitHub repository, run [`../prepare_clean_gtm_repo.sh`](../prepare_clean_gtm_repo.sh) from the repository root to generate a fresh, single-commit, zero-history working-tree export free of legacy Git packfile history and local `.env` / token cache artifacts.

---

## 🍂 Gemini Weekly Updates (`./Gemini_Weekly_Updates`)

- 📬 **[Gemini Enterprise Weekly & Monthly Customer Executive Briefing Architecture](./Gemini_Weekly_Updates)**:
  - Reference architecture and seasonal HTML/Markdown template suite enabling Customer Engineers, Solutions Architects, and AI Specialists to generate executive updates for strategic accounts.
  - Pairs **Customer-Aware Relevance Filtering** (intersecting public Gemini Enterprise release notes with an organization's deployed connectors and compliance posture) with a **Mandatory Human-in-the-Loop (HITL) Review Gate** via Google Workspace Gmail Drafts (`users.drafts.create`), ensuring connector permission updates (such as SharePoint `Sites.Selected` vs. `AllSites.Read`) are accurately reviewed before delivery.

---

## 🔍 Output AI Verification Loop (`./Output AI Verification Loop`)

- 🛡️ **[Output Engineering & Dual-Model Adversarial Verification Skill (`output-engineer`)](./Output%20AI%20Verification%20Loop)**:
  - Portable **Agent Skill (`SKILL.md`)** and **5-Tab Interactive HTML Review Canvas** engineered for Customer Engineers, Solutions Architects, and Field Specialists to audit AI-generated security questionnaire responses, RFPs, and architecture proposals in under 3 minutes.
  - Deconstructs technical drafts into **4 Verifiable Output Modalities**: (1) **ASD-STE100 Controlled Technical English** ($\le 20$w procedural / $\le 25$w descriptive sentence caps with a deterministic `check_ste100.py` validator), (2) **Declarative Mermaid.js Topology & Sequence Diagrams**, (3) **Interactive HTML Review Canvas (`review_canvas_template.html`)**, and (4) **Timestamped Explainer Storyboards with Browser Voice Narration**.
  - Includes a **Dual-Model Challenger-Defender Benchmark** comparing **Gemini (`gemini-3.8-flash`)** and **Claude Opus** side-by-side on an enterprise security architecture audit.

---

## 🛠️ Google Antigravity Hands-On Workshop Starter (`./AGY Website Workshop`)

- 🚀 **[Enterprise & Public Sector Hands-On Workshop Starter (`AGENTS.md` + `agy` CLI + Vertex AI ADC)](./AGY%20Website%20Workshop)**:
  - Turnkey 90-minute customer cohort starter replacing brittle manual setup scripts and static API keys with a repository-root **[`AGENTS.md`](./AGY%20Website%20Workshop/AGENTS.md)** (and [`GEMINI.md`](./AGY%20Website%20Workshop/GEMINI.md)) deployment playbook designed for **Google Cloud Workstations**, **Cloud Shell**, and managed workstations.
  - Executes a read-only preflight (`scripts/preflight.sh`) on Turn 1 to auto-discover `GOOGLE_CLOUD_PROJECT`, active `gcloud` identity, `aiplatform.googleapis.com` status, `testIamPermissions`, and keyless **Vertex AI Application Default Credentials (ADC)**, then installs workspace-scoped ADK skills (`--workspace`) without global `~/.gemini` symlink races.
  - Guides participants through **Lab 1** (3-file Mission Web Portal served via a realpath-jailed `127.0.0.1` server with strict CSP headers and zero `innerHTML` sinks), **Lab 2** (keyless `gemini-3.8-flash` ADK agent built with `agents-cli` and tested in `adk web`), and **Lab 3** (multi-agent coordinator + specialist `transfer_to_agent` handoffs).

---

## 📊 Gemini Enterprise Token Consumption & WIF Usage Telemetry (`./ge-token-tracking`)

- 📈 **[Gemini Enterprise Token Consumption, Model Breakdown & Workforce Identity (WIF) Usage Dashboard](./ge-token-tracking)**:
  - Lightweight, zero-KMS, zero-Cloud-Storage token tracking and FinOps chargeback solution derived from `ge-ediscovery-logging`, purpose-built for higher-education institutions, public-sector agencies, and enterprises that need per-user and per-model token observability without full eDiscovery file archival.
  - Automates OpenTelemetry trace enablement (`enable_ge_observability.py`, supporting `--no-sensitive-logging` for FERPA/privacy-sensitive environments) and joins Cloud Trace (`trace_link._AllSpans`) with Gemini Enterprise activity logs in BigQuery (`v_gemini_token_usage_by_user` and `v_token_usage_summary_by_principal`).
  - Includes a focused **Cloud Run Token Consumption & WIF Usage Dashboard (`dashboard/`)** with multi-instance filtering (`ALL` or per `engine_id`), 4 executive KPI cards, Chart.js visualizations (**Token Usage by Model**, **Token Usage by WIF Principal**, **Daily Token Consumption Trend**), a searchable WIF Identity Attribution table, and 1-click **CSV & HTML Chargeback Reports**.

---

## 🔎 Gemini Enterprise eDiscovery, Compliance Review Portal & Microsoft Purview Integration (`./ge-ediscovery-logging`)

- 🗄️ **[Gemini Enterprise Server-Side eDiscovery Capture, Cloud Storage Archival, BigQuery Forensic Reporting, Compliance Review Portal & Microsoft Purview eDiscovery Connector](./ge-ediscovery-logging)**:
  - Zero-browser-plugin, 100% server-side eDiscovery and compliance pipeline for **Gemini Enterprise** and **NotebookLM Enterprise** deployments backed by **Workforce Identity Federation (WIF)**, **Cloud KMS (`asymmetricSign` — zero private keys on disk)**, and IAM Credential Access Boundaries.
  - Captures full untruncated user prompts, model responses, internal model reasoning (`thought_text`), user-uploaded attachments (`USER_PROVIDED`), AI-generated PDFs/images/Canvas HTML slide decks (`AI_GENERATED`), and all 12 **NotebookLM Enterprise Studio** modalities with `SHA-256` & `CRC32C` chain-of-custody verification into **WORM-ready Cloud Storage** and **BigQuery**, paired with a drift-safe **`geUserNoDelete`** custom IAM role to prevent session deletion before harvest.
  - Includes an **IAP-authenticated React 18 Compliance & Legal Brief Narrative Review Portal (`portal/`)** on Cloud Run, pre-built BigQuery forensic views (`v_ediscovery_file_audit`, `v_ediscovery_custodian_export`, `v_notebooklm_forensic_audit`, `v_jailbreak_and_security_detections`, `fn_user_forensic_report`), and a fail-closed **Microsoft Purview eDiscovery & DSPM for AI Connector (`purview_connector.py`)** supporting dedicated non-custodian compliance journal mailboxes (`PURVIEW_COMPLIANCE_JOURNAL_UPN`) and Graph resumable `createUploadSession` uploads up to `150 MB`.

---

## 🌐 Gemini Enterprise Smart Router (`./ge-smart-router`)

- 🔀 **[Gemini Enterprise Smart Group Router](./ge-smart-router)**:
  - Identity-aware routing dispatcher for multi-instance Gemini Enterprise deployments under a single unified DNS domain.
  - Couples Google Cloud External Application Load Balancer and Identity-Aware Proxy (IAP) to dynamically route users to their assigned Gemini Enterprise application based on Cloud Identity / Workspace group membership.

---

## 🎯 Gemini Enterprise Skills (`./ge_skills`)

Domain-specific **Gemini Enterprise Skills (`SKILL.md`)** and companion connectors that enforce deterministic workflows, citation fidelity, and URL formatting.

- 📄 **[Microsoft 365 SharePoint & Outlook Federated Quality Skills (`ge_m365_connector_skill`)](./ge_skills/ge_m365_connector_skill)**:
  - Zero-infrastructure quality enhancer skills for the **Standard SharePoint Federated Connector**, **Outlook Connector**, and custom Graph MCP servers (`m365_combined_skill`, `sharepoint_federated_skill`, `outlook_connector_skill`).
  - Enforces file-type-aware URL formatting (`.pdf#page=N` physical page calculation vs. `.docx?web=1` Word Online browser viewing without file downloads) and strict Outlook temporal search & thread aggregation.

---

## 🚀 Gemini Enterprise MCP Connectors `v2.0` — Skills + MCP Apps (`./ge_mcp_v2`)

Next-generation `v2.0.0` suite of all 7 Cloud Run Streamable HTTP MCP connectors plus the Microsoft WorkIQ + Purview RMS harness, implementing both **MCP Skills (`io.modelcontextprotocol/skills`, SEP-2640)** with SHA-256 verified `SKILL.md` manifests and **MCP Apps (`io.modelcontextprotocol/ui`, SEP-1865)** Dual-Delivery `ui://` (`text/html;profile=mcp-app`) interactive workbenches (`0` `innerHTML` DOM sinks):

- 🧠 **[Vertex AI Claude Reasoning & Critique Studio (`v2.0`)](./ge_mcp_v2/claude_mcp_sonnet)** — `skill://vertex-claude-reasoning/SKILL.md` + `ui://vertex-claude-mcp/reasoning-workbench.html` (`open_claude_reasoning_workbench`).
- ✉️ **[Microsoft Outlook Executive Triage & Comms Hub (`v2.0`)](./ge_mcp_v2/customize_outlook_mcp)** — `skill://outlook-executive-triage/SKILL.md` + `ui://microsoft-outlook-mcp/comms-hub.html` (`open_outlook_comms_hub`).
- 🔒 **[Least-Privilege SharePoint `Sites.Selected` Scope Auditor (`v2.0`)](./ge_mcp_v2/least-privilege-sharepoint-mcp-server)** — `skill://sharepoint-sites-selected-governance/SKILL.md` + `ui://least-privilege-sharepoint-mcp/scope-auditor.html` (`open_sites_selected_scope_auditor`).
- 🏷️ **[SharePoint Purview Label Inspector (`v2.0`)](./ge_mcp_v2/sharepoint-mcp-server-purview-label)** & **[Purview + Cloud SDP Governance Matrix (`v2.0`)](./ge_mcp_v2/sharepoint-mcp-server-purview-sdp)** — `open_purview_label_inspector` & `open_purview_sdp_governance_matrix`.
- 📁 **[SharePoint Document Explorer (`v2.0`)](./ge_mcp_v2/sharepoint-mcp-server)**, **[Calibrated Citation Workbench (`v2.0`)](./ge_mcp_v2/customize-sharepoint-mcp-server)** & **[WorkIQ Purview RMS Audit App (`v2.0`)](./ge_mcp_v2/workiq-mcp-purview)**.

---

## 🔌 Gemini Enterprise MCP Connectors (`./ge_mcp`)

Enterprise-grade Model Context Protocol (MCP) servers and integrations that bridge enterprise systems and specialized models directly into **Gemini Enterprise**.

### 🌟 Featured Connectors

- 🛡️ **[Microsoft Work IQ MCP + Purview Sensitivity Label & AES-256 Encryption Enforcement](./ge_mcp/workiq-mcp-purview)**:
  - Zero-infrastructure BYO MCP integration connecting Gemini Enterprise (with Workforce Identity Federation) directly to Microsoft's managed **Work IQ MCP endpoint (`workiq.svc.cloud.microsoft/mcp`)**.
  - Demonstrates real-time **Microsoft Purview Sensitivity Label & AES-256 Rights Management (RMS) Encryption** enforcement—decrypting and summarizing authorized confidential documents while natively blocking restricted documents based on the signed-in user's identity.

- 🧠 **[Claude Sonnet 4.6 Model Garden MCP Server](./ge_mcp/claude_mcp_sonnet)**:
  - Bring-Your-Own (BYO) MCP Connector wrapping Anthropic Claude Sonnet 4.6 (`claude-sonnet-4-6`) on Vertex AI Model Garden into Cloud Run.
  - Enables Gemini Enterprise users to invoke Claude models on Vertex AI with caller Google Cloud OAuth Bearer token pass-through, server-side `max_tokens` clamping, and least-privilege non-root container isolation.

- 🔒 **[Least-Privilege SharePoint MCP Server (`Sites.Selected`)](./ge_mcp/least-privilege-sharepoint-mcp-server)**, **[Purview Sensitivity Label MCP Server](./ge_mcp/sharepoint-mcp-server-purview-label)** & **[Purview + Cloud SDP Fail-Closed DLP MCP Server](./ge_mcp/sharepoint-mcp-server-purview-sdp)**:
  - Hardened SharePoint Online MCP connectors enforcing site-scoped access, OOXML Purview Sensitivity Label extraction with zip-bomb bounds, and fail-closed Sensitive Data Protection (`BLOCK` / `REDACT`) inspection.

- 📁 **[Customize SharePoint MCP Server](./ge_mcp/customize-sharepoint-mcp-server)** & **[Universal SharePoint MCP Server](./ge_mcp/sharepoint-mcp-server)**:
  - Reference SharePoint and OneDrive document search, multi-format text extraction (`.docx`, `.pptx`, `.xlsx` via `exceljs`), and page-level citation rendering via Microsoft Graph.

- ✉️ **[Microsoft Outlook MCP Server](./ge_mcp/customize_outlook_mcp)**:
  - Date-aware temporal email search, conversation thread retrieval, calendar event creation, and contacts lookup via Microsoft Graph with Secret Manager secret binding.

---

## 🔒 Security & Governance

- **Delegated OAuth 2.0 & Identity Pass-Through**: Connectors enforce caller OAuth 2.0 / IAM / IAP authentication with explicit redirect URI allowlists (`ALLOWED_OAUTH_REDIRECT_URIS`).
- **Secret Manager & Build Isolation**: Deployment scripts bind credentials from Google Cloud Secret Manager (`--set-secrets`) and exclude local `.env` / token caches via `.gcloudignore` and `.dockerignore`.
- **Least-Privilege Runtime Identity**: Cloud Run services run under dedicated non-default service accounts and non-root container users (`USER node` / `USER appuser`).
- **Cloud Audit Logging & Chain of Custody**: Model, tool, and compliance review operations emit structured audit logs under enterprise Google Cloud boundaries.
