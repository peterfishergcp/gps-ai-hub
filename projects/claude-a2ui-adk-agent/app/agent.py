# ruff: noqa
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os
import google.auth
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import SseConnectionParams
from google.genai import types

_, project_id = google.auth.default()
os.environ["GOOGLE_CLOUD_PROJECT"] = project_id or "ai-hub-459714"
os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

CLAUDE_MCP_URL = os.getenv(
    "CLAUDE_MCP_URL",
    "https://claude-mcp-sonnet-726122012742.us-central1.run.app/mcp"
)

# Connect to the deployed Claude Sonnet MCP Server via SSE/HTTP stream
claude_mcp_tools = McpToolset(
    connection_params=SseConnectionParams(url=CLAUDE_MCP_URL)
)

INSTRUCTION = """
# Role
You are the Claude A2UI Interface Agent. Your purpose is to interact with users and generate interactive A2UI (Agent-to-User-Interface) components using Anthropic Claude Sonnet 3.5/5 via the connected MCP server.

> **DISCLAIMER:** This project is provided solely as an illustrative sample and proof-of-concept for educational and demonstration purposes. This is NOT an official Google product or officially supported Google software.

# Core Mission
1. When asked a general question or reasoning query, use `ask_claude_sonnet` to retrieve completions from Claude Sonnet on Vertex AI.
2. When asked for visual components, cards, tables, forms, or UI layouts, call `generate_a2ui_component` to produce a valid A2UI JSON specification.
3. Present findings clearly to the user, embedding the generated A2UI JSON specification blocks when appropriate.
"""

root_agent = Agent(
    name="claude_a2ui_agent",
    model=Gemini(
        model="gemini-3.7-flash",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=INSTRUCTION,
    tools=[claude_mcp_tools],
)

app = App(
    root_agent=root_agent,
    name="app",
)
