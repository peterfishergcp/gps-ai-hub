// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { createServer } from "http";
import { GoogleAuth } from "google-auth-library";

const PORT = process.env.PORT || 8080;
const PROJECT_ID = process.env.PROJECT_ID || "ai-hub-459714";
const LOCATION_ID = process.env.LOCATION_ID || "global";
const MODEL_ID = process.env.MODEL_ID || "claude-sonnet-5";

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function callClaudeVertex({
  prompt,
  systemPrompt,
  messages,
  maxTokens = 1024,
  authHeader,
}) {
  let clientToken;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ") && !authHeader.includes("mock")) {
    clientToken = authHeader.substring(7);
  } else {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    clientToken = tokenResponse.token;
  }

  const endpointUrl = `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION_ID}/publishers/anthropic/models/${MODEL_ID}:rawPredict`;

  const requestMessages = messages || [
    {
      role: "user",
      content: [{ type: "text", text: prompt }],
    },
  ];

  const payload = {
    anthropic_version: "vertex-2023-10-16",
    max_tokens: maxTokens,
    messages: requestMessages,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI Claude API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const textContent = data.content
    ?.filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  const rawText = textContent || JSON.stringify(data);

  const verificationBadge = `\n\n---
  [Model Provider Verification]
  • Model ID: ${data.model || MODEL_ID}
  • Publisher: Anthropic (Vertex AI)
  • Stop Reason: ${data.stop_reason || "end_turn"}
  • Input Tokens: ${data.usage?.input_tokens || "N/A"} | Output Tokens: ${data.usage?.output_tokens || "N/A"}`;

  return rawText + verificationBadge;
}

const A2UI_EXAMPLES = {
  card: {
    type: "a2ui.Card",
    id: "sample-card-001",
    title: "Medicaid Provider Audit Summary",
    subtitle: "Automated Compliance Scan Result",
    layout: "vertical",
    content: {
      fields: [
        { label: "Provider Name", value: "Metro Health Services", type: "text" },
        { label: "NPI Identifier", value: "1982736450", type: "code" },
        { label: "Risk Score", value: "88/100 (HIGH)", type: "badge", color: "danger" },
      ],
    },
    actions: [
      { id: "flag_review", label: "Flag for Manual Review", action: "TRIGGER_WORKFLOW" },
      { id: "export_pdf", label: "Export Case PDF", action: "DOWNLOAD" },
    ],
  },
  data_table: {
    type: "a2ui.DataTable",
    properties: {
      title: "Medicaid Audit Anomalies Summary",
      columns: [
        { field: "case_id", header: "Case ID" },
        { field: "risk_level", header: "Risk Severity" },
        { field: "rule_violation", header: "Violation Type" },
      ],
      rows: [
        { case_id: "CASE-10928", risk_level: "CRITICAL", rule_violation: "Credential Recycling" },
        { case_id: "CASE-40291", risk_level: "HIGH", rule_violation: "Address Clustering" },
      ],
    },
  },
};

const TOOLS = [
  {
    name: "ask_claude_sonnet",
    description: "Send a prompt to Anthropic Claude Sonnet 3.5/5 hosted on Vertex AI and retrieve a completion.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "User prompt or instructions for Claude Sonnet.",
        },
        system_prompt: {
          type: "string",
          description: "Optional system prompt to guide Claude's persona or formatting.",
        },
        max_tokens: {
          type: "integer",
          description: "Maximum tokens to generate (default: 1024).",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "generate_a2ui_component",
    description: "Generates an A2UI (Agent-to-User-Interface) compliant JSON component specification for A2A and ADK agents using Claude Sonnet.",
    inputSchema: {
      type: "object",
      properties: {
        component_type: {
          type: "string",
          description: "Type of UI component needed (e.g. 'card', 'data_table', 'form', 'modal', 'alert').",
        },
        content_description: {
          type: "string",
          description: "Description of the data, fields, or elements to display inside the A2UI component.",
        },
      },
      required: ["component_type", "content_description"],
    },
  },
  {
    name: "get_a2ui_integration_guide",
    description: "Returns documentation, schemas, and best practices for integrating A2UI components with ADK agents and A2A protocol.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional query or topic filter for the guide (e.g. 'schemas', 'adk', 'a2a').",
        },
      },
    },
  },
];

// Map of active SSE client connections: sessionId -> res
const sseClients = new Map();

const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, Accept");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "healthy", model: MODEL_ID, project: PROJECT_ID }));
    return;
  }

  if (url.pathname === "/mcp" || url.pathname === "/") {
    // 1. GET Request: SSE Connection
    if (req.method === "GET") {
      const sessionId = Math.random().toString(36).substring(2, 15);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      sseClients.set(sessionId, res);

      const proto = req.headers["x-forwarded-proto"] || "https";
      const fullOrigin = `${proto}://${host}`;
      res.write(`event: endpoint\ndata: ${fullOrigin}/mcp?sessionId=${sessionId}\n\n`);

      // Keep SSE connection alive with periodic heartbeat
      const keepAliveInterval = setInterval(() => {
        if (!res.writableEnded) {
          res.write(": keepalive\n\n");
        }
      }, 15000);

      req.on("close", () => {
        clearInterval(keepAliveInterval);
        sseClients.delete(sessionId);
      });
      return;
    }

    // 2. POST Request: JSON-RPC over HTTP
    let bodyChunks = [];
    req.on("data", (chunk) => bodyChunks.push(chunk));
    req.on("end", async () => {
      const fullBody = Buffer.concat(bodyChunks).toString();
      try {
        const parsedBody = JSON.parse(fullBody || "{}");
        const authHeader = req.headers.authorization;

        // 2a. Handshake: initialize
        if (parsedBody.method === "initialize") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: parsedBody.id,
              result: {
                protocolVersion: "2024-11-05",
                capabilities: { tools: {} },
                serverInfo: { name: "claude-mcp-sonnet", version: "1.0.0" },
              },
            })
          );
          return;
        }

        // 2b. List Tools
        if (parsedBody.method === "tools/list") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: parsedBody.id,
              result: { tools: TOOLS },
            })
          );
          return;
        }

        // 2c. Method Repair for Direct LLM Tool Calls
        let method = parsedBody.method;
        if (
          method &&
          (method.includes("ask_claude_sonnet") ||
            method.includes("generate_a2ui_component") ||
            method.includes("get_a2ui_integration_guide"))
        ) {
          console.error(`[LLM REPAIR] Auto-correcting direct method '${method}' to 'tools/call'`);
          const toolName = method.includes("ask_claude_sonnet")
            ? "ask_claude_sonnet"
            : method.includes("generate_a2ui_component")
            ? "generate_a2ui_component"
            : "get_a2ui_integration_guide";

          const toolArgs = parsedBody.params?.arguments || parsedBody.params || {};
          parsedBody.method = "tools/call";
          parsedBody.params = { name: toolName, arguments: toolArgs };
          method = "tools/call";
        }

        // 2d. Call Tool
        if (method === "tools/call") {
          const { name, arguments: args = {} } = parsedBody.params || {};
          console.error(`[MCP CALL] Executing tool '${name}' with args: ${JSON.stringify(args)}`);

          let resultText = "";

          if (name === "ask_claude_sonnet") {
            resultText = await callClaudeVertex({
              prompt: args.prompt,
              systemPrompt: args.system_prompt,
              maxTokens: args.max_tokens || 1024,
              authHeader,
            });
          } else if (name === "generate_a2ui_component") {
            const systemPrompt = `You are an expert A2UI (Agent-to-User-Interface) generator for A2A protocol and ADK agents.
Always output valid A2UI JSON schema specifications wrapped in a single JSON block.
Supported root types: a2ui.Card, a2ui.DataTable, a2ui.Form, a2ui.Modal, a2ui.Alert.`;

            const prompt = `Generate an A2UI component of type '${args.component_type}' displaying the following information: ${args.content_description}.`;

            resultText = await callClaudeVertex({
              prompt,
              systemPrompt,
              maxTokens: 1500,
              authHeader,
            });
          } else if (name === "get_a2ui_integration_guide") {
            resultText = JSON.stringify(
              {
                title: "A2UI & ADK Integration Best Practices",
                protocol: "A2A (Agent-to-Agent)",
                sdk: "Google ADK (Agent Development Kit)",
                rendering_flow: [
                  "1. ADK Agent calls `generate_a2ui_component` via Claude Sonnet MCP server.",
                  "2. MCP server returns structured A2UI JSON specification.",
                  "3. Agent outputs A2UI JSON block inside its response stream.",
                  "4. Web Client / A2A Front-end parses `a2ui.*` schemas and dynamically renders UI widgets.",
                ],
                sample_templates: A2UI_EXAMPLES,
              },
              null,
              2
            );
          } else {
            throw new Error(`Unknown tool name: ${name}`);
          }

          const responsePayload = JSON.stringify({
            jsonrpc: "2.0",
            id: parsedBody.id,
            result: {
              content: [{ type: "text", text: resultText }],
            },
          });

          // Send direct HTTP JSON response
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(responsePayload);

          // If session query param is present, also write to the active SSE client stream
          const sessionId = url.searchParams.get("sessionId");
          if (sessionId && sseClients.has(sessionId)) {
            const sseRes = sseClients.get(sessionId);
            if (!sseRes.writableEnded) {
              sseRes.write(`event: message\ndata: ${responsePayload}\n\n`);
            }
          }
          return;
        }

        // Catch-all response for other JSON-RPC methods
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: parsedBody.id || 1,
            result: {},
          })
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32603, message: err.message },
          })
        );
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`Claude Sonnet MCP Server running on port ${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/mcp`);
});
