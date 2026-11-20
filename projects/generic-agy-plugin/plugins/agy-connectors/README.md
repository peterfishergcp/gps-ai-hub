# Chatski & Gemini Enterprise Federated Connectors (`agy-connectors`)

Makes the user's **Gemini Enterprise (`GE`) instance** the default enterprise connector hub inside **Google Antigravity**—and provides the **`Chatski`** left-sidebar Google Chat panel (`Extensions -> Chatski`) powered directly by your Gemini Enterprise **Google Chat / Microsoft Teams Connector** with zero extra setup.

## Why GE Instance First?
- **One Connection Unlocks Everything (Including `Chatski`):** Once a user provides their **GE Instance** (`/connect-ge`), `Chatski` automatically reuses `~/.gemini/config/plugin_data/agy-connectors/ge-instance.json` and `AssistantService.StreamAssist` to browse Direct Messages and Spaces, summarize threads, stage voice-calibrated drafts (`/my-voice`), and send human-confirmed replies via the GE Google Chat `send_message` action (plus optional sub-200ms Direct `chat.googleapis.com/v1` OAuth in `Chatski -> ⚙ Settings`).
- **Zero Extra Laptop Software:** Both `scripts/ge_instance_mcp.mjs` and `sidecars/chatski-ui/main.mjs` run natively on Antigravity Desktop's **built-in `agy-node` runtime** with zero `npm` packages.

## Included Sidecar, Skills & MCP Server
- **Left-Sidebar UI (`Chatski`)**: Dark/Light Google Chat workspace with `Search chats (Ctrl+K)`, `All / Unread / Mentions / Drafts` filters, `Direct messages` & `Spaces` lists, hover reactions + `✨ Draft reply`, staged `Drafts`, explicit human send confirmation, and live hoverable `in | out | thinking` token pill.
- **MCP Server (`agy-ge-bridge`)**: Exposes `ge_configure_instance`, `ge_instance_status`, `ge_sign_in`, `ge_ask_instance`, and `ge_search_records`.
- **`/chatski`** — Summarizes unread Google Chat / Teams spaces via GE and stages `[Draft-Only]` replies into `Chatski`.
- **`/connect-ge`** — Default setup wizard to configure your GE instance URL/ID and check federated connector readiness.
- **`/connect-m365-workspace`** — Grounded query patterns for federated **Outlook, SharePoint, OneDrive, Teams, Gmail, and Google Drive**.
- **`/connect-github-bigquery`** — Federated GitHub search via GE paired with direct GitHub PR workflows and 1 GB cost-capped BigQuery analytics.
