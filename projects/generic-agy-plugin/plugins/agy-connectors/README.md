# Gemini Enterprise Federated Connectors (`agy-connectors`)

Makes the user's **Gemini Enterprise (`GE`) instance** the default enterprise connector hub inside **Google Antigravity**.

## Why GE Instance First?
- **One Connection Unlocks Federated Sources:** Once a user provides their **GE Instance** (`/connect-ge`), Antigravity connects through `AssistantService.StreamAssist` and `SearchService.Search` with per-user ACLs intact across **Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, and GitHub**.
- **Zero Extra Laptop Software:** `scripts/ge_instance_mcp.mjs` runs natively on Antigravity Desktop's **built-in `agy-node` runtime** with zero `npm` packages.

## Included Skills & MCP Server
- **MCP Server (`agy-ge-bridge`)**: Exposes `ge_configure_instance`, `ge_instance_status`, `ge_sign_in`, `ge_ask_instance`, and `ge_search_records`.
- **`/connect-ge`** — Default setup wizard to configure your GE instance URL/ID and check federated connector readiness.
- **`/connect-m365-workspace`** — Grounded query patterns for federated **Outlook, SharePoint, OneDrive, Teams, Gmail, and Google Drive**.
- **`/connect-github-bigquery`** — Federated GitHub search via GE paired with direct GitHub PR workflows and 1 GB cost-capped BigQuery analytics.
