# Google Cloud GPS AI Hub

Welcome to the **Google Cloud GPS AI Hub** repository (`gps-ai-hub`). This repository houses enterprise reference architectures, production-grade Model Context Protocol (MCP) connectors, and technical demonstrations for **Gemini Enterprise** and **Google GenAI / Vertex AI SDKs**.

> **Acknowledgements & Attribution**: MCP connectors are based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## 💡 Repository Projects Overview

This repository is organized into two main demonstration suites:

1. **[Gemini Enterprise MCP Connectors (`/ge_mcp`)](#1-gemini-enterprise-mcp-connectors-ge_mcp)**
2. **[Gemini Thinking Mode & Zero Memory Retention Demos (`/gemini_thinking_mode_demo`)](#2-gemini-thinking-mode--zero-memory-retention-demos-gemini_thinking_mode_demo)**

---

## 1. 🔌 Gemini Enterprise MCP Connectors (`/ge_mcp`)

Enterprise-grade Model Context Protocol (MCP) servers that bridge Microsoft Graph API and corporate enterprise systems directly into **Gemini Enterprise**.

### Featured Connectors:

- 📁 **[Customize SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize-sharepoint-mcp-server)**:
  - Autonomous SharePoint document management, site navigation, and deep-link citation rendering.
  - Page-level citations (`#page=N`), multi-format text extraction (`.docx`, `.pptx`, `.xlsx`), and 12 read/write actions protected by Gemini Enterprise Action Approval dialogs.

- ✉️ **[Microsoft Outlook MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/customize_outlook_mcp)**:
  - Seamless AI interaction with Outlook Mail, Calendar, and Contacts via Microsoft Graph.
  - Date-aware temporal search, conversation thread retrieval, multi-email batching, calendar event creation, and contacts lookup.

- 📂 **[Universal SharePoint MCP Server](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/ge_mcp/sharepoint-mcp-server)**:
  - Reference implementation for SharePoint and OneDrive enterprise document connectivity.

---

## 2. 🧠 Gemini Thinking Mode & Zero Memory Retention Demos (`/gemini_thinking_mode_demo`)

Technical demonstrations and empirical payload dissections showcasing **Gemini Thinking Mode** control and **Zero Data Retention / Zero Memory** behavior using the Google GenAI SDK (`google-genai`).

### Featured Demos:

- 💬 **[Interactions API Zero Memory (`demo_interactions_api_zero_memory.py`)](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/gemini_thinking_mode_demo/demo_interactions_api_zero_memory.py)**:
  - Demonstrates that omitting `previous_interaction_id` on the recommended `client.interactions.create()` API ensures follow-up turns execute completely unlinked with **ZERO memory** of previous turns.

- 🔍 **[Payload Dissection & Empirical Proof (`demo_prove_no_thoughts.py`)](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/gemini_thinking_mode_demo/demo_prove_no_thoughts.py)**:
  - Empirically dissects API response candidate parts to prove that `include_thoughts=False` completely omits human-readable thought process text (`part.thought == None`) from payloads.

- 🔄 **[Thought Signature Preservation (`demo_thought_signature_comparison.py`)](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/gemini_thinking_mode_demo/demo_thought_signature_comparison.py)**:
  - Demonstrates passing thought signatures across sessions to preserve reasoning state vs inaccessible state when signatures are omitted.

- ⚡ **[Gemini 3 Thinking Levels (`demo_thinking_levels.py`)](https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/gemini_thinking_mode_demo/demo_thinking_levels.py)**:
  - Demonstrates configuring `MINIMAL`, `LOW`, `MEDIUM`, and `HIGH` thinking levels on Gemini 3 models (`gemini-3.5-flash`, `gemini-3-flash-preview`).

---

## 🔒 Security & Governance

- **Delegated OAuth 2.0 & Application Auth**: MCP connectors support user Bearer token delegation and Client Credentials fallback via Microsoft Entra ID.
- **Enterprise Consent Dialogs**: All data modification actions trigger native Gemini Enterprise action approval dialogs.
- **Zero Data Retention Controls**: Demonstrates stateless execution options ensuring no customer data or thoughts persist on Google Cloud servers.
