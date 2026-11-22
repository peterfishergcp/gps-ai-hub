# WV Gemini Enterprise & Cloud Connectors (`wv-connectors`)

Configures and guides **Gemini Enterprise (`GE`)** and **Google BigQuery** workflows inside **Google Antigravity**—purpose-built for State of West Virginia cohorts signing in with **Google Cloud Identity synced from Microsoft Azure / Entra ID**, with **zero local MCP subprocesses, zero system-`PATH` dependencies, and zero open laptop ports**.

## Why Zero-Process Connectors on State Laptops?
- **100% AppLocker / Endpoint-Control Safe:** Ships **zero** local `mcp_config.json` stdio processes and **zero** localhost listeners, so Windows 11 AppLocker, Defender SmartScreen, and corporate endpoint security never block background processes.
- **One GE Instance Unlocks Federated Enterprise Sources:** West Virginia's Gemini Enterprise instance hosts the agency's **federated connectors** (*Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, GitHub*) and replicates Azure/Entra security groups to Google Identity. Users save their **GE Instance** coordinates once (`~/.gemini/config/plugin_data/wv-connectors/ge-instance.json` via `WV Skills -> GE Connector Hub` or `/connect-ge`) and connect either via:
  1. **Agency-Hosted Remote Cloud Run Streamable HTTP GE Gateway** (`deploy/cloudrun-ge-gateway/` over HTTPS `443` — zero laptop processes),
  2. **Keyless `@wv.gov` Google Identity REST/ADC calls** (`AssistantService.StreamAssist` & `SearchService.Search`), or
  3. **Grounded Gemini Enterprise Web App Companion Exports** (`.eml`, `.docx`, `.xlsx`, `.pdf`, `.csv`).

## Included Skills
- **`/connect-ge`** — Default setup wizard to save your GE instance URL/ID in `~/.gemini/config/plugin_data/wv-connectors/ge-instance.json`, verify Entra-synced `@wv.gov` authentication, and check remote HTTPS gateway or Web App readiness.
- **`/connect-m365-workspace`** — High-precision query patterns and chronological citation rules for federated **Outlook, SharePoint, OneDrive, Teams, Gmail, and Google Drive** through GE (plus immediate offline file synthesis).
- **`/connect-github-bigquery`** — Federated GitHub search patterns paired with feature-branch PR hygiene and `1 GB` cost-capped read-only BigQuery analytics.
