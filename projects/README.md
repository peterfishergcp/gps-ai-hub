# Gemini Enterprise MCP Connectors Repository

Welcome to the **Gemini Enterprise Model Context Protocol (MCP) Connectors** repository. This project provides enterprise-grade MCP servers that bridge Microsoft Graph API and corporate enterprise systems directly into **Gemini Enterprise**.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## 🚀 Featured MCP Connectors

### 1. 📁 [Customize SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize-sharepoint-mcp-server)
- **Purpose**: Autonomous SharePoint document management, site navigation, and deep-link citation rendering.
- **Key Features**:
  - **Mandatory Page-Level Citations**: Generates direct links with `#page=N` or `#section=HeadingName` anchors, accounting for Table of Contents viewer page offsets.
  - **Multi-Format Text Extraction**: Full content extraction across Word (`.docx`), PowerPoint (`.pptx`), Excel (`.xlsx`), and text files.
  - **12 Read/Write Actions**: Site discovery, document library listing, file creation, update, rename, move, and deletion (protected by Gemini Enterprise Action Approval dialogs).
  - **Performance**: Integrated HTTP Keep-Alive socket pooling (`keepAlive: true`) for low-latency queries.

### 2. ✉️ [Microsoft Outlook MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize_outlook_mcp)
- **Purpose**: Seamless AI interaction with Outlook Mail, Calendar, and Contacts via Microsoft Graph.
- **Key Features**:
  - **Temporal & Date-Aware Searching**: Built-in system time anchors and OData filtering (`fromDate`/`toDate`) for relative date arithmetic ("emails from last week", "today's schedule").
  - **Latest / Oldest Sorting**: `sortOrder: "desc"` (most recent first) or `"asc"` (oldest first).
  - **Thread & Multi-Email Batching**: Retrieve complete back-and-forth conversation threads (`get_email_thread_lookup`) or batch fetch multiple email bodies in a single call (`get_batch_messages_detail_lookup`).
  - **Calendar & Contacts**: Query upcoming meetings, create new calendar events, and search contacts.

### 3. 📂 [Universal SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/sharepoint-mcp-server)
- **Purpose**: Base reference implementation for SharePoint and OneDrive enterprise document connectivity.

---

## 🔒 Security & Governance

- **Delegated OAuth 2.0 & Application Auth**: Supports both user Bearer token delegation and Client Credentials fallback via Microsoft Entra ID.
- **Action Approval Consent**: All data modification actions (creating, updating, renaming, moving, deleting) automatically trigger Gemini Enterprise's native consent dialogs before executing.
