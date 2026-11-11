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

"use strict";

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const {
  createSharePointHttpServer,
  buildStandardSharePointTools,
  executeStandardSharePointTool,
} = require("./sharepoint_common.js");

const SERVER_INSTRUCTIONS = `
Universal Microsoft SharePoint & OneDrive MCP Connector Guidelines:
1. Always include clickable citations using each item's 'webUrl' property.
   - For PDF files ('.pdf'), strip '?web=1' and append '#page=N' (e.g., [Annual Report (Page 4)](https://<YOUR_TENANT>.sharepoint.com/sites/Finance/Shared%20Documents/Annual_Report.pdf#page=4)).
   - For Office files ('.docx', '.xlsx', '.pptx'), keep '?web=1' so links open in SharePoint Web Viewer.
2. All write/modify/delete tools carry destructiveHint=true and require explicit user confirmation.
`.trim();

const TOOLS = buildStandardSharePointTools({ includeWriteTools: true });

const app = createSharePointHttpServer({
  serviceName: "sharepoint-mcp-server",
  version: "2.1.0",
  defaultAllowAppCredentials: false,
  buildMcpServer(authContext) {
    const mcpServer = new Server(
      { name: "sharepoint-mcp-server", version: "2.1.0" },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      try {
        const resultObj = await executeStandardSharePointTool({
          name,
          args,
          authContext,
          enableWriteTools: process.env.ENABLE_WRITE_TOOLS !== "false",
          enablePurviewLabels: false,
        });

        const hasNoResults =
          (Array.isArray(resultObj.sites) && resultObj.sites.length === 0) ||
          (Array.isArray(resultObj.libraries) && resultObj.libraries.length === 0) ||
          (Array.isArray(resultObj.items) && resultObj.items.length === 0);

        if (hasNoResults) {
          return {
            content: [
              {
                type: "text",
                text: "We didn't receive any query results for your query. Would you try again and be more specific with your query?",
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(resultObj, null, 2) }],
        };
      } catch (err) {
        const safeMsg = err.response?.status
          ? `Microsoft Graph API error (HTTP ${err.response.status})`
          : err.message;
        return {
          content: [{ type: "text", text: `Error executing ${name}: ${safeMsg}` }],
          isError: true,
        };
      }
    });

    return mcpServer;
  },
});

app.start(Number(process.env.PORT) || 8080);
