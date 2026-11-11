// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

"use strict";

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
const path = require("path");
const {
  createSharePointHttpServer,
  buildStandardSharePointTools,
  executeStandardSharePointTool,
} = require("./sharepoint_common.js");
const {
  buildSharePointV2Tools,
  createSharePointV2McpInstance,
} = require("./sharepoint_v2_wrapper.js");

const APP_CONFIG = {
  appUri: "ui://sharepoint-mcp/document-explorer.html",
  launcherName: "open_sharepoint_document_explorer",
  launcherTitle: "SharePoint Explorer",
  appTitle: "SharePoint & OneDrive Citation Explorer",
  brandBadge: "MCP v2.0 • SharePoint + OneDrive",
  subtitle: "Browse SharePoint sites & libraries, preview extracted document pages, and attach citations.",
  primaryColor: "#0369a1",
  primaryLight: "#e0f2fe",
  darkPrimaryColor: "#38bdf8",
  darkPrimaryLight: "#082f49",
  defaultToolName: "query_sharepoint_sites_lookup",
  defaultToolParam: "query",
  searchPlaceholder: "Search SharePoint sites...",
  secondaryActionLabel: "Extract File Content",
  secondaryToolName: "query_file_content_lookup",
  secondaryFields: [
    { name: "itemId", label: "File Item ID or Filename", placeholder: "Annual_Report.pdf" },
    { name: "driveId", label: "Optional Drive ID or Library Name", placeholder: "Documents" },
  ],
};

const SERVER_INSTRUCTIONS = `
SharePoint & OneDrive MCP Connector v2.0 (Skills + MCP Apps Enabled):
1. Load 'skill://sharepoint-citation-navigator/SKILL.md' for complete '?web=1' Office vs. '#page=N' PDF citation rules.
2. Call 'open_sharepoint_document_explorer' to render the interactive SharePoint Explorer MCP App inline.
3. Require explicit user confirmation before invoking any write/modify/delete tool (destructiveHint=true).
`.trim();

const TOOLS = buildSharePointV2Tools(
  buildStandardSharePointTools({ includeWriteTools: true }),
  {
    appUri: APP_CONFIG.appUri,
    launcherName: APP_CONFIG.launcherName,
    launcherTitle: APP_CONFIG.launcherTitle,
    launcherDescription:
      "Open the interactive SharePoint & OneDrive Citation Explorer MCP App (ui://sharepoint-mcp/document-explorer.html).",
  }
);

const stateHolder = { lastPayload: null };

const app = createSharePointHttpServer({
  serviceName: "sharepoint-mcp-server",
  version: "2.0.0",
  defaultAllowAppCredentials: false,
  getHealthDetails: () => ({
    extensions: ["io.modelcontextprotocol/skills", "io.modelcontextprotocol/ui"],
  }),
  buildMcpServer(authContext) {
    return createSharePointV2McpInstance({
      serviceName: "sharepoint-mcp-server",
      version: "2.0.0",
      instructions: SERVER_INSTRUCTIONS,
      skillsDir: path.join(__dirname, "skills"),
      appConfig: APP_CONFIG,
      tools: TOOLS,
      stateHolder,
      async executeDomainTool(name, args) {
        try {
          const resultObj = await executeStandardSharePointTool({
            name,
            args,
            authContext,
            enableWriteTools: process.env.ENABLE_WRITE_TOOLS !== "false",
            enablePurviewLabels: false,
          });
          return { content: [{ type: "text", text: JSON.stringify(resultObj, null, 2) }] };
        } catch (err) {
          const safeMsg = err.response?.status
            ? `Microsoft Graph API error (HTTP ${err.response.status})`
            : err.message;
          return { content: [{ type: "text", text: `Error executing ${name}: ${safeMsg}` }], isError: true };
        }
      },
    });
  },
});

if (require.main === module) {
  app.start(Number(process.env.PORT) || 8080);
}

module.exports = { app };
