# Google Cloud GPS AI Hub

Welcome to the **Google Cloud GPS AI Hub** repository (`gps-ai-hub`). This repository houses enterprise reference architectures, production-grade Model Context Protocol (MCP) connectors, and technical demonstrations for **Gemini Enterprise**.

> **Acknowledgements & Attribution**: MCP connectors are based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## 🔌 Gemini Enterprise MCP Connectors (`/ge_mcp`)

Enterprise-grade Model Context Protocol (MCP) servers running on Google Cloud Run that bridge enterprise systems and specialized models directly into **Gemini Enterprise**.

### 🌟 Featured Connectors:

- 🧠 **[Claude Sonnet 5 Model Garden MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/claude_mcp_sonnet)**:
  - Bring-Your-Own (BYO) MCP Connector wrapping Anthropic Claude Sonnet 5 (`publishers/anthropic/models/claude-sonnet-5`) from the Agent Platform Model Garden into Cloud Run.
  - Enables Gemini Enterprise users to access Claude Sonnet 5 for search, deep coding, 1M token context analysis, and no-code agent workflows with Google IAM token pass-through.

- 📁 **[Customize SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize-sharepoint-mcp-server)**:
  - Autonomous SharePoint document management, site navigation, and deep-link citation rendering via Microsoft Graph.
  - Page-level citations (`#page=N`), multi-format text extraction (`.docx`, `.pptx`, `.xlsx`), and 12 read/write actions protected by Gemini Enterprise Action Approval dialogs.

- ✉️ **[Microsoft Outlook MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize_outlook_mcp)**:
  - Seamless AI interaction with Outlook Mail, Calendar, and Contacts via Microsoft Graph.
  - Date-aware temporal search, conversation thread retrieval, multi-email batching, calendar event creation, and contacts lookup.

- 📂 **[Universal SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/sharepoint-mcp-server)**:
  - Reference implementation for SharePoint and OneDrive enterprise document connectivity.

---

## 🔒 Security & Governance

- **Delegated OAuth 2.0 & Identity Pass-Through**: MCP connectors support user Bearer token delegation directly to target endpoints with granular RBAC.
- **Zero Static Secrets**: Eliminates static API keys in favor of short-lived OAuth 2.0 / IAM tokens.
- **Enterprise Consent Dialogs**: All data modification actions trigger native Gemini Enterprise action approval dialogs.
- **Cloud Audit Logging**: All model and tool invocations are tracked and auditable under enterprise Google Cloud boundaries.
