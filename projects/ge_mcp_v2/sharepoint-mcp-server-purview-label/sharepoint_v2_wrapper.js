// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

"use strict";

const path = require("path");
const z = require("zod");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const types = require("@modelcontextprotocol/sdk/types.js");
const {
  MCP_APP_MIME_TYPE,
  loadSkillsCatalog,
  buildMcpAppMeta,
  renderSecureMcpWorkbenchHtml,
  attachSkillsAndAppsToSdkServer,
  buildV2Capabilities,
  createScopedPayloadCache,
} = require("./mcp_v2_extensions.js");

const sharepointCallerPayloadCache = createScopedPayloadCache({
  maxEntries: 128,
  ttlMs: 5 * 60 * 1000,
});

const READ_UI_LINKED_TOOLS = new Set([
  "query_sharepoint_sites_lookup",
  "query_document_libraries_lookup",
  "query_library_items_lookup",
  "query_search_files_lookup",
  "query_file_metadata_lookup",
  "query_file_content_lookup",
]);

/**
 * Decorates SharePoint tool definitions with SEP-1865 `_meta.ui` links and appends
 * a dedicated Dual-Delivery MCP App launcher tool (`EmbeddedResource` + `structuredContent`).
 */
function buildSharePointV2Tools(baseTools, { appUri, launcherName, launcherTitle, launcherDescription }) {
  const { toolMeta: inlineMeta } = buildMcpAppMeta(appUri);
  const { toolMeta: launcherMeta } = buildMcpAppMeta(appUri, { entrypointTitle: launcherTitle });

  const decorated = baseTools.map((t) =>
    READ_UI_LINKED_TOOLS.has(t.name) ? { ...t, _meta: inlineMeta } : t
  );

  decorated.push({
    name: launcherName,
    description: launcherDescription,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    _meta: launcherMeta,
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Optional initial search or classification filter for the interactive SharePoint workbench.",
        },
      },
    },
  });

  return decorated;
}

/**
 * Creates a SharePoint MCP v2.0 `Server` instance wired with:
 * - SEP-2640 Skills (`io.modelcontextprotocol/skills`: `skills/list`, `skills/get`, `resources/directory/read`)
 * - SEP-1865 MCP Apps (`ui://` `text/html;profile=mcp-app`, Dual-Delivery `EmbeddedResource` + `structuredContent`)
 */
function createSharePointV2McpInstance({
  serviceName,
  version = "2.0.0",
  instructions,
  skillsDir,
  appConfig,
  tools,
  executeDomainTool,
  callerAuthHeader,
}) {
  const skillsCatalog = loadSkillsCatalog(skillsDir || path.join(process.cwd(), "skills"));
  const { resourceMeta } = buildMcpAppMeta(appConfig.appUri, { prefersBorder: true });
  // Strictly isolated per-caller key (service + caller bearer token hash);
  // when absent, stays purely request-local with zero cross-request sharing.
  const scopedKey = callerAuthHeader ? `${serviceName}:${String(callerAuthHeader).trim()}` : null;
  let requestLocalPayload = null;
  const readCallerPayload = () =>
    (scopedKey ? sharepointCallerPayloadCache.get(scopedKey) : null) || requestLocalPayload;
  const writeCallerPayload = (payload) => {
    requestLocalPayload = payload;
    if (scopedKey) sharepointCallerPayloadCache.set(scopedKey, payload);
  };

  const renderHtml = () =>
    renderSecureMcpWorkbenchHtml({
      ...appConfig,
      initialPayload: readCallerPayload(),
    });

  const mcpServer = new Server(
    { name: serviceName, version },
    {
      capabilities: buildV2Capabilities(),
      instructions,
    }
  );

  attachSkillsAndAppsToSdkServer(mcpServer, {
    z,
    types,
    skillsCatalog,
    appSpecs: [
      {
        uri: appConfig.appUri,
        name: appConfig.appTitle,
        description: appConfig.subtitle,
        renderHtml,
      },
    ],
  });

  mcpServer.setRequestHandler(types.ListToolsRequestSchema, async () => ({ tools }));

  mcpServer.setRequestHandler(types.CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    if (name === appConfig.launcherName) {
      const filterNote = typeof args.filter === "string" ? args.filter.slice(0, 200) : "";
      const launchPayload = readCallerPayload() || {
        service: serviceName,
        filter: filterNote || null,
        normalizedItems: [
          {
            id: "workbench-ready",
            title: appConfig.appTitle,
            category: appConfig.brandBadge,
            severity: "ok",
            meta: filterNote ? `Initial filter: ${filterNote}` : appConfig.appUri,
            snippet: appConfig.subtitle,
          },
        ],
      };
      writeCallerPayload(launchPayload);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ status: "opened", appUri: appConfig.appUri, service: serviceName }, null, 2),
          },
          {
            type: "resource",
            resource: {
              uri: appConfig.appUri,
              mimeType: MCP_APP_MIME_TYPE,
              text: renderHtml(),
              _meta: resourceMeta,
            },
          },
        ],
        structuredContent: launchPayload,
      };
    }

    const domainResponse = await executeDomainTool(name, args);
    if (!domainResponse.isError && Array.isArray(domainResponse.content) && domainResponse.content[0]?.text) {
      try {
        const parsed = JSON.parse(domainResponse.content[0].text);
        if (parsed && typeof parsed === "object") {
          writeCallerPayload(parsed);
          return {
            ...domainResponse,
            structuredContent: parsed,
          };
        }
      } catch {
        // Non-JSON informational message (e.g., empty query prompt)
      }
    }
    return domainResponse;
  });

  return mcpServer;
}

module.exports = {
  buildSharePointV2Tools,
  createSharePointV2McpInstance,
};
