# Claude Sonnet Vertex AI MCP Server (`claude_mcp_sonnet`)

> **DISCLAIMER:** This project is provided solely as an illustrative sample and proof-of-concept for educational and demonstration purposes. This is **NOT** an official Google product or officially supported Google software. It is provided "as is" without warranty or guarantee of any kind.

Model Context Protocol (MCP) server providing access to **Anthropic Claude Sonnet 3.5/5** hosted on Vertex AI (`aiplatform.googleapis.com`), along with tools to generate **A2UI (Agent-to-User-Interface)** components for integration with ADK agents and the A2A (Agent-to-Agent) protocol.

---

## 🚀 Features

1. **Vertex AI Claude Sonnet Integration**: Connects via `rawPredict` / `streamRawPredict` to Anthropic models hosted on Vertex AI (`ai-hub-459714`).
2. **A2UI Component Generation**: Tools for creating A2UI-compliant JSON schemas (`a2ui.Card`, `a2ui.DataTable`, `a2ui.Form`, `a2ui.Modal`, `a2ui.Alert`).
3. **ADK & A2A Ready**: Exposes documentation and examples for dynamic component rendering across ADK agents and A2A interfaces.
4. **Cloud Run Ready**: Production HTTP/MCP streaming transport with health checks.

---

## 🛠️ MCP Tools Exposed

| Tool Name | Description |
| :--- | :--- |
| `ask_claude_sonnet` | Sends prompts to Claude Sonnet on Vertex AI and returns text completions. |
| `generate_a2ui_component` | Uses Claude Sonnet to generate valid A2UI JSON specifications for frontend rendering. |
| `get_a2ui_integration_guide` | Returns integration instructions, schemas, and best practices for A2UI with ADK and A2A. |

---

## 🎨 A2UI Integration with ADK & A2A

A2UI (Agent-to-User-Interface) allows AI agents to return rich, interactive UI component specifications instead of plain text or markdown tables.

### ADK Python Integration Example

To register this MCP server in an ADK agent (`app/agent.py`):

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

claude_a2ui_agent = Agent(
    name="claude_a2ui_agent",
    model="gemini-3.7-flash",
    instruction="""
    You are an agent capable of generating interactive UI cards and data tables.
    Use the `generate_a2ui_component` tool from the Claude Sonnet MCP server whenever the user asks for a visual widget, card, or form.
    """,
    tools=[claude_mcp_tools],
)
```

---

## ☁️ Deployment

Deploy to Cloud Run in `ai-hub-459714`:

```bash
./deploy.sh
```
