# Gemini Enterprise Skills Catalog (`/ge_skills`)

Production-ready **Gemini Enterprise Skills (`SKILL.md`)** and companion **BYO MCP Connectors** designed to elevate retrieval precision, citation quality, domain-specific auditing, and deterministic PII governance.

---

## 📁 Featured Skills

### 1. 🏥 **[Medicaid Fraud Auditor Skill & BigQuery BYO MCP (`ge_medicaid_skill`)](ge_medicaid_skill/)**
- **Skill (`SKILL.md`)**: `medicaid-fraud-auditor`
- **Capabilities**:
  - Evaluates Medicaid enrollment records against **5 Core Fraud Rules**: Credential Recycling (`v_credential_recycling`), High-Density Address Clustering (`v_address_clustering`), Identity Mismatches, Sequential Same-Day Logon Batches, and Pregnant Member Anomalies (`v_pregnant_members`).
  - **False-Positive Minimization Protocol**: Automatically filters out single-household family cohabitation (`single_household_false_positive_candidate = TRUE`) where family members share a surname and physical address with unique credentials.
  - **Deterministic PII Sanitization**: Companion Cloud Run BigQuery MCP Server ([`mcp_server/server.py`](ge_medicaid_skill/mcp_server/server.py)) hashes passwords (`hash:<8-char-sha256>`), masks emails/usernames, and truncates dates of birth to 4-digit birth years (`YYYY`).
  - **Full BigQuery DDL & View Documentation**: Complete `CREATE TABLE` and `CREATE OR REPLACE VIEW` SQL definitions included in [`ge_medicaid_skill/README.md`](ge_medicaid_skill/README.md) (with zero beneficiary data rows exposed).

---

### 2. 📄 **[Microsoft 365 SharePoint & Outlook Quality Enhancer Suite (`ge_m365_connector_skill`)](ge_m365_connector_skill/)**
- **Subfolders**:
  - **[`m365_combined_skill/`](ge_m365_connector_skill/m365_combined_skill/)**: Unified SharePoint & Outlook Federated/MCP Quality Skill (`m365-sharepoint-outlook-quality`).
  - **[`sharepoint_federated_skill/`](ge_m365_connector_skill/sharepoint_federated_skill/)**: Zero-infrastructure upgrade for the **Out-of-the-Box (OOTB) Standard SharePoint Federated Connector** (`sharepoint-federated-quality-enhancer`).
  - **[`outlook_connector_skill/`](ge_m365_connector_skill/outlook_connector_skill/)**: Standalone Microsoft Outlook temporal search & conversation thread synthesis skill (`outlook-connector-temporal-enhancer`).
- **Capabilities**:
  - **File-Type-Aware URL Formatting**: Strips `?web=1` on `.pdf` files and applies the `+1` Cover Page / 0-index rule so `#page=N` jumps to the exact physical page in the browser PDF reader, while **enforcing `?web=1` on `.docx`/`.pptx`/`.xlsx` files** so clicking links opens Word/PowerPoint/Excel Online in the browser instead of downloading files to disk.
  - **Temporal Date Reasoning & Thread Synthesis**: Anchors relative Outlook queries (`today`, `latest`, `oldest`, `last week`) to system time and reconstructs chronological email conversation threads with clickable `webLink` citations.
