# AGY Gemini Enterprise Federated Connectors (`agy-connectors`)

Makes the user's **Gemini Enterprise (`GE`) instance** the default enterprise connector hub inside **Google Antigravity**—purpose-built for Public Sector cohorts signing in with **Google Cloud Identity synced from Microsoft Azure / Entra ID**.

## Why GE Instance First?
- **One Connection Unlocks Everything:** Because your organization's Gemini Enterprise instance already hosts the agency's **federated connectors** (*Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, GitHub*) and replicates Azure/Entra security groups to Google Identity, users only provide their **GE Instance** once (`/connect-ge`) instead of installing and authenticating 6 separate local MCP servers on locked-down state laptops.
- **Zero Extra Laptop Software:** `scripts/ge_instance_mcp.mjs` uses zero `npm` packages and runs automatically on Antigravity Desktop's **built-in `agy-node` runtime** even when Node.js is not installed on the machine.
- **Full Federated Connector Support (`StreamAssist`):** Calls `AssistantService.StreamAssist` alongside `SearchService.Search` so live federated M365 and GitHub connectors execute with the user's own Google Identity credentials and ACLs.

## Included Skills & MCP Server
- **MCP Server (`agy-ge-bridge`)**: Exposes `ge_configure_instance`, `ge_instance_status`, `ge_sign_in`, `ge_ask_instance`, and `ge_search_records`.
- **`/connect-ge`** — Default setup wizard to configure your GE instance URL/ID, verify your Entra-synced Google Identity token, and check federated connector readiness.
- **`/connect-m365-workspace`** — High-precision query patterns and citation rules for federated **Outlook, SharePoint, OneDrive, Teams, Gmail, and Google Drive** through GE (plus offline file fallbacks).
- **`/connect-github-bigquery`** — Federated GitHub search via GE paired with direct GitHub PR workflows and cost-capped BigQuery analytics.
