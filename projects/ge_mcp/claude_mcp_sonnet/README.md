# Claude Sonnet MCP Server for Gemini Enterprise & Google Agent Platform

> **DISCLAIMER:** This project is provided solely as an illustrative sample and proof-of-concept for educational and demonstration purposes. This is **NOT** an official Google product or officially supported Google software. It is provided on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, pursuant to the Apache License 2.0.

---

## 🎯 Primary Purpose

This Model Context Protocol (MCP) server enables **Gemini Enterprise** users and agents running on the **Google Agent Platform (ADK / Agent Engine)** to seamlessly invoke **Anthropic Claude Sonnet 3.5/5** models hosted on **Google Cloud Vertex AI**.

By exposing Claude Sonnet as a standardized, production-ready MCP service over Server-Sent Events (SSE), enterprise users can leverage Claude's advanced reasoning, long-context comprehension, and specialized generation directly within Gemini Enterprise apps, agent pipelines, and custom frontends—without leaving their secure Google Cloud governance perimeter.

---

## 💡 Key Highlights & Architecture

* **Fully Managed & Serverless on Google Cloud**: The Anthropic Claude models on Google Cloud offer fully managed and serverless models as APIs. To use a Claude model on the Agent Platform, requests are sent directly to the Agent Platform API endpoint. Because Anthropic Claude models use a managed API on Vertex AI, **there is no need to provision or manage underlying infrastructure**.
* **Incremental SSE Response Streaming**: You can stream your Claude responses to reduce end-user latency perception. A streamed response uses Server-Sent Events (SSE) to incrementally stream completion chunks back to the client or UI in real time.
* **Pay-As-You-Go & Provisioned Throughput**: You pay for Claude models as you use them (pay-as-you-go), or you pay a fixed fee when using provisioned throughput. For pay-as-you-go pricing, see the Anthropic Claude models on the Google Cloud pricing page.
* **Seamless Gemini Enterprise Connection**: Enables Gemini Enterprise to invoke Anthropic Claude models (`publishers/anthropic/models/claude-sonnet-5:rawPredict`) on Vertex AI using IAM authentication.
* **Read-Only Non-Disruptive Tool Annotations**: Tools are pre-configured with `readOnlyHint: true` and `destructiveHint: false` so Gemini Enterprise executes queries seamlessly without triggering user confirmation prompts.
* **Model Provider Verification Badging**: Every response automatically includes an audit metadata badge verifying the model ID, publisher, token usage, and completion stop reason.
* **Agent-to-User-Interface (A2UI) Generation (Secondary Capability)**: Includes specialized tools to generate structured A2UI JSON components (`a2ui.Card`, `a2ui.DataTable`, `a2ui.Form`, `a2ui.Modal`) for rendering rich interactive widgets in ADK and Agent-to-Agent (A2A) interfaces.

---

## 🛠️ MCP Tools Reference

| Tool Name | Primary Purpose | Description |
| :--- | :--- | :--- |
| **`ask_claude_sonnet`** | **Core LLM Bridge** | Sends prompts and system instructions to Claude Sonnet on Vertex AI and returns text completions with provider verification badges. |
| **`generate_a2ui_component`** | **UI Generation** | Uses Claude Sonnet to generate valid A2UI JSON component specifications for rich UI rendering in frontends. |
| **`get_a2ui_integration_guide`** | **Documentation** | Returns integration guides, component schemas, and best practices for A2UI with ADK and A2A interfaces. |

---

## 🔌 Connecting to Gemini Enterprise

To add this Claude Sonnet MCP server to **Gemini Enterprise**:

1. Navigate to **Gemini Enterprise Admin Console** > **MCP Tools / Extensions**.
2. Select **Add Remote MCP Server (SSE)**.
3. Enter the server details:
   * **Name**: `claude-sonnet-vertex`
   * **SSE Endpoint URL**: `https://claude-mcp-sonnet-726122012742.us-central1.run.app/mcp`
   * **Auth**: Google Cloud IAM / Application Default Credentials.

Once registered, users can ask Gemini Enterprise:
> *"Use Claude Sonnet to analyze this contract and give me a second opinion."*

---

## 🐍 ADK Python Integration Example

To attach this MCP server to an ADK agent (`app/agent.py`) using `google-adk`:

```python
from google.adk.agents import Agent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams

# Connect to deployed Claude Sonnet MCP Server
claude_mcp_tools = McpToolset(
    connection_params=SseConnectionParams(
        url="https://claude-mcp-sonnet-726122012742.us-central1.run.app/mcp"
    )
)

agent = Agent(
    name="multi_model_agent",
    model="gemini-3.7-flash",
    instruction="""
    You are an intelligent multi-model assistant. 
    Use the `ask_claude_sonnet` tool to consult Claude 3.5/5 Sonnet on Vertex AI for complex analytical reasoning.
    """,
    tools=[claude_mcp_tools],
)
```

---

## 🎨 Secondary Feature: A2UI (Agent-to-User-Interface)

In addition to model queries, the server includes tools to generate **A2UI specifications**. A2UI allows agents to return structured UI components instead of plain markdown tables.

### Example A2UI Output (`generate_a2ui_component`):

```json
{
  "type": "a2ui.Card",
  "id": "compliance-card-101",
  "title": "Medicaid Audit Finding",
  "subtitle": "High Risk Credential Anomaly",
  "content": {
    "fields": [
      { "label": "Case ID", "value": "NUM-99201", "type": "code" },
      { "label": "Risk Score", "value": "HIGH", "type": "badge", "color": "danger" }
    ]
  }
}
```

---

## ☁️ Environment & Deployment

### Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PROJECT_ID` | GCP Project ID hosting Vertex AI | `ai-hub-459714` |
| `LOCATION_ID` | Vertex AI Location | `global` |
| `MODEL_ID` | Anthropic model ID on Vertex AI | `claude-sonnet-5` |
| `PORT` | Container HTTP listening port | `8080` |

### Deploy to Cloud Run

```bash
gcloud run deploy claude-mcp-sonnet \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --project ai-hub-459714
```
