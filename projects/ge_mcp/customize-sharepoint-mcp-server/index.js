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
SharePoint & Microsoft Graph MCP Connector Guidelines & Citation Rules:

1. FILE-TYPE-AWARE URL FORMATTING ('?web=1' FOR OFFICE FILES vs. '#page=N' FOR PDFS):
   - RULE FOR PDF FILES ('.pdf'): Browsers have a native PDF viewer that supports '#page=N', whereas SharePoint's '?web=1' wrapper ignores '#page=N'. Always STRIP '?web=1' from '.pdf' URLs and append '#page=N':
     * CORRECT PDF LINK: [Statement of Work — Section 7.4 Force Majeure (Page 4)](https://<YOUR_TENANT>.sharepoint.com/sites/<YOUR_SITE>/Shared%20Documents/Statement_of_Work.pdf#page=4)
   - RULE FOR OFFICE FILES ('.docx', '.pptx', '.xlsx'): Browsers do NOT have a native viewer for Office files—if '?web=1' is missing, clicking the link forces a file download.
     * Always KEEP or APPEND '?web=1' at the end of '.docx', '.pptx', and '.xlsx' URLs so they open in Word/PowerPoint/Excel Online inside the browser tab. Put the exact Section/Clause/Slide/Sheet name inside the visible link label:
     * CORRECT WORD (.docx) LINK: [Master Services Agreement — Section 8: Intellectual Property Rights](https://<YOUR_TENANT>.sharepoint.com/sites/<YOUR_SITE>/Shared%20Documents/Master_Services_Agreement.docx?web=1)

2. SIMPLE PDF PAGE NUMBER CALCULATION ('#page=N'):
   - Count every physical page in the PDF file starting with the Cover/Title page as Page 1.
   - THE +1 COVER PAGE / 0-INDEX RULE: When search chunk metadata is 0-indexed OR a document has an unnumbered Cover/Title page where printed footer numbering ('Page 1') begins on the 2nd physical page, add +1 so '#page=N' matches the true physical PDF viewer page.

3. EXPECTED OUTPUT TEMPLATE:
   ### Summary & Answer
   <Detailed answer containing inline clickable citations formatted per Rule 1>

   ### Sources & Citations
   - [Document Title — Section / Page](https://<YOUR_TENANT>.sharepoint.com/sites/<YOUR_SITE>/Shared%20Documents/Document.pdf#page=4)

   ---
   *Note: Microsoft SharePoint Graph API search results may be paginated or partial. If you suspect missing results, retry with a more specific query or document title.*
`.trim();

function buildAllowedSiteFilter() {
  const raw = (process.env.ALLOWED_SHAREPOINT_SITES || "").trim();
  if (!raw) return null;
  const allowPatterns = raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowPatterns.length === 0) return null;
  return (site) => {
    const url = String(site.webUrl || "").toLowerCase().replace(/\/+$/, "");
    const name = String(site.name || "").toLowerCase();
    return allowPatterns.some((p) => url === p || url.endsWith(`/${p}`) || name === p);
  };
}

const TOOLS = buildStandardSharePointTools({ includeWriteTools: true });
const allowedSiteFilter = buildAllowedSiteFilter();

const app = createSharePointHttpServer({
  serviceName: "customize-sharepoint-mcp-server",
  version: "2.1.0",
  defaultAllowAppCredentials: false,
  buildMcpServer(authContext) {
    const mcpServer = new Server(
      { name: "customize-sharepoint-mcp-server", version: "2.1.0" },
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
          allowedSiteFilter,
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
