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

function buildAllowedSiteFilter(rawEnv = process.env.ALLOWED_SHAREPOINT_SITES || "") {
  const raw = String(rawEnv).trim();
  if (!raw) return null;
  const allowPatterns = raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean);
  if (allowPatterns.length === 0) return null;
  return (site) => {
    const url = String(site.webUrl || "").toLowerCase().replace(/\/+$/, "");
    const name = String(site.name || "").toLowerCase();
    return allowPatterns.some(
      (p) =>
        url === p ||
        (url && p.startsWith("http") && url.startsWith(`${p}/`)) ||
        url.endsWith(`/sites/${p}`) ||
        url.endsWith(`/teams/${p}`) ||
        name === p
    );
  };
}

const APP_CONFIG = {
  appUri: "ui://customize-sharepoint-mcp/citation-workbench.html",
  launcherName: "open_sharepoint_citation_workbench",
  launcherTitle: "Citation Workbench",
  appTitle: "SharePoint Calibrated Citation Workbench",
  brandBadge: "MCP v2.0 • +1 Cover Page Citations",
  subtitle: "Enforced ALLOWED_SHAREPOINT_SITES scope + calibrated #page=N PDF & ?web=1 Office citations.",
  primaryColor: "#0f766e",
  primaryLight: "#ccfbf1",
  darkPrimaryColor: "#2dd4bf",
  darkPrimaryLight: "#042f2e",
  defaultToolName: "query_sharepoint_sites_lookup",
  defaultToolParam: "query",
  searchPlaceholder: "Filter approved SharePoint sites...",
  secondaryActionLabel: "Inspect Document Pages",
  secondaryToolName: "query_file_content_lookup",
  secondaryFields: [
    { name: "itemId", label: "File Item ID or Filename", placeholder: "Statement_of_Work.pdf" },
    { name: "driveId", label: "Optional Drive ID", placeholder: "Documents" },
  ],
};

const SERVER_INSTRUCTIONS = `
Customized SharePoint MCP Connector v2.0 (Calibrated Citations + Site Boundary):
1. Load 'skill://sharepoint-calibrated-citations/SKILL.md' for +1 Cover Page PDF '#page=N' and '?web=1' Office rules.
2. Call 'open_sharepoint_citation_workbench' to launch the interactive Citation Workbench MCP App.
`.trim();

const TOOLS = buildSharePointV2Tools(
  buildStandardSharePointTools({ includeWriteTools: true }),
  {
    appUri: APP_CONFIG.appUri,
    launcherName: APP_CONFIG.launcherName,
    launcherTitle: APP_CONFIG.launcherTitle,
    launcherDescription:
      "Open the interactive SharePoint Calibrated Citation Workbench MCP App (ui://customize-sharepoint-mcp/citation-workbench.html).",
  }
);

const app = createSharePointHttpServer({
  serviceName: "customize-sharepoint-mcp-server",
  version: "2.0.0",
  defaultAllowAppCredentials: false,
  getHealthDetails: () => ({
    extensions: ["io.modelcontextprotocol/skills", "io.modelcontextprotocol/ui"],
  }),
  buildMcpServer(authContext, req) {
    return createSharePointV2McpInstance({
      serviceName: "customize-sharepoint-mcp-server",
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
            enablePurviewLabels: false,
            allowedSiteFilter: buildAllowedSiteFilter(),
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

module.exports = { app, buildAllowedSiteFilter };
