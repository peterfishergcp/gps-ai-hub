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
  appUri: "ui://sharepoint-purview-label-mcp/label-inspector.html",
  launcherName: "open_purview_label_inspector",
  launcherTitle: "Purview Label Inspector",
  appTitle: "Microsoft Purview Sensitivity Label Inspector",
  brandBadge: "MCP v2.0 • 3-Tier MSIP Labels",
  subtitle: "Inspect Graph sensitivityLabel facets, SharePoint listItem tags, and OOXML docProps/custom.xml GUIDs.",
  primaryColor: "#4338ca",
  primaryLight: "#e0e7ff",
  darkPrimaryColor: "#818cf8",
  darkPrimaryLight: "#1e1b4b",
  defaultToolName: "query_library_items_lookup",
  defaultToolParam: "driveId",
  searchPlaceholder: "Library name or driveId (e.g., Documents)...",
  secondaryActionLabel: "Inspect File Sensitivity Label",
  secondaryToolName: "query_file_content_lookup",
  secondaryFields: [
    { name: "itemId", label: "File Item ID or Filename", placeholder: "Restricted_Policy.docx" },
    { name: "driveId", label: "Optional Drive ID", placeholder: "Documents" },
  ],
};

const SERVER_INSTRUCTIONS = `
SharePoint & Microsoft Purview Sensitivity Label MCP Connector v2.0:
1. Load 'skill://purview-label-governance/SKILL.md' for 3-tier MSIP_Label handling and native connector SDP rules.
2. Call 'open_purview_label_inspector' to launch the interactive Purview Label Inspector MCP App.
`.trim();

const TOOLS = buildSharePointV2Tools(
  buildStandardSharePointTools({ includeWriteTools: true }),
  {
    appUri: APP_CONFIG.appUri,
    launcherName: APP_CONFIG.launcherName,
    launcherTitle: APP_CONFIG.launcherTitle,
    launcherDescription:
      "Open the interactive Microsoft Purview Sensitivity Label Inspector MCP App (ui://sharepoint-purview-label-mcp/label-inspector.html).",
  }
);

const app = createSharePointHttpServer({
  serviceName: "sharepoint-mcp-server-purview-label",
  version: "2.0.0",
  defaultAllowAppCredentials: false,
  getHealthDetails: () => ({
    extensions: ["io.modelcontextprotocol/skills", "io.modelcontextprotocol/ui"],
  }),
  buildMcpServer(authContext, req) {
    return createSharePointV2McpInstance({
      serviceName: "sharepoint-mcp-server-purview-label",
      version: "2.0.0",
      instructions: SERVER_INSTRUCTIONS,
      skillsDir: path.join(__dirname, "skills"),
      appConfig: APP_CONFIG,
      tools: TOOLS,
      callerAuthHeader: req?.headers?.authorization,
      async executeDomainTool(name, args) {
        try {
          const resultObj = await executeStandardSharePointTool({
            name,
            args,
            authContext,
            enableWriteTools: process.env.ENABLE_WRITE_TOOLS !== "false",
            enablePurviewLabels: true,
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
