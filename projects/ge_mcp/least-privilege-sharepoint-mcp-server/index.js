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
const axios = require("axios");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const {
  DEFAULT_MAX_FILE_BYTES,
  keepAliveAgent,
  validateSafeString,
  encodeGraphSegment,
  formatSharePointWebUrl,
  extractDocumentTextAsync,
  createSharePointHttpServer,
  buildStandardSharePointTools,
} = require("./sharepoint_common.js");

const SITE_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Parses ALLOWED_SHAREPOINT_SITES into normalized Graph site specifiers.
 * Supports:
 *   1. Full URL:      https://example.sharepoint.com/sites/Finance -> example.sharepoint.com:/sites/Finance
 *   2. Graph path:    example.sharepoint.com:/sites/Finance
 *   3. Relative path: /sites/Finance or Finance (uses SHAREPOINT_HOSTNAME)
 *   4. Canonical ID:  example.sharepoint.com,guid1,guid2
 */
function getConfiguredSiteSpecs() {
  const rawList =
    process.env.ALLOWED_SHAREPOINT_SITES ||
    process.env.SHAREPOINT_SITE_URLS ||
    process.env.SHAREPOINT_INSTANCE_URL ||
    "";
  const defaultHost = (process.env.SHAREPOINT_HOSTNAME || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  const entries = rawList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const mergedEntries = [];
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = 0; i < entries.length; i++) {
    if (
      i + 2 < entries.length &&
      entries[i].includes(".sharepoint.com") &&
      !entries[i].includes("/") &&
      !entries[i].includes(":") &&
      guidRegex.test(entries[i + 1]) &&
      guidRegex.test(entries[i + 2])
    ) {
      mergedEntries.push(`${entries[i]},${entries[i + 1]},${entries[i + 2]}`);
      i += 2;
    } else {
      mergedEntries.push(entries[i]);
    }
  }

  return mergedEntries.map((entry) => {
    if (/^https?:\/\//i.test(entry)) {
      const parsed = new URL(entry);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (!pathname || pathname === "/") {
        throw new Error(
          `Least-Privilege Policy Error: Root tenant URL '${entry}' is prohibited. Specify an explicit site URL such as 'https://${parsed.hostname}/sites/Finance'.`
        );
      }
      return {
        raw: entry,
        graphPath: `${parsed.hostname}:${pathname}`,
        hostname: parsed.hostname.toLowerCase(),
        siteSlug: pathname.split("/").pop().toLowerCase(),
        webUrlHint: `https://${parsed.hostname}${pathname}`,
      };
    }

    if (entry.includes(",") && entry.split(",").length === 3) {
      const [host] = entry.split(",");
      return {
        raw: entry,
        graphPath: entry,
        hostname: host.toLowerCase(),
        siteSlug: entry.toLowerCase(),
        webUrlHint: "",
      };
    }

    if (entry.includes(":/")) {
      const [hostPart, pathPart] = entry.split(":", 2);
      const cleanPath = pathPart.replace(/\/+$/, "");
      return {
        raw: entry,
        graphPath: `${hostPart}:${cleanPath}`,
        hostname: hostPart.toLowerCase(),
        siteSlug: cleanPath.split("/").pop().toLowerCase(),
        webUrlHint: `https://${hostPart}${cleanPath}`,
      };
    }

    if (!defaultHost) {
      throw new Error(
        `Invalid ALLOWED_SHAREPOINT_SITES entry '${entry}'. Provide a full SharePoint site URL or set SHAREPOINT_HOSTNAME.`
      );
    }
    const normalizedPath =
      entry.startsWith("/sites/") || entry.startsWith("/teams/")
        ? entry.replace(/\/+$/, "")
        : `/sites/${entry.replace(/^\/+|\/+$/g, "")}`;
    return {
      raw: entry,
      graphPath: `${defaultHost}:${normalizedPath}`,
      hostname: defaultHost.toLowerCase(),
      siteSlug: normalizedPath.split("/").pop().toLowerCase(),
      webUrlHint: `https://${defaultHost}${normalizedPath}`,
    };
  });
}

function createReadOnlyGraphClient(token) {
  const client = axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
    httpsAgent: keepAliveAgent,
    timeout: 30_000,
    maxContentLength: DEFAULT_MAX_FILE_BYTES,
    maxBodyLength: DEFAULT_MAX_FILE_BYTES,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  // Fail-safe interceptor: strictly block any non-GET HTTP method against Graph API
  client.interceptors.request.use((config) => {
    const method = (config.method || "get").toUpperCase();
    if (method !== "GET") {
      throw new Error(
        `Least-Privilege Policy Violation: HTTP ${method} is disabled. This MCP server is strictly read-only.`
      );
    }
    return config;
  });

  return client;
}

let cachedAllowedSites = null;
let cachedAllowedSitesTimestamp = 0;
const allowedDriveToSiteMap = new Map();

async function resolveAllowedSites(graph) {
  const specs = getConfiguredSiteSpecs();
  if (specs.length === 0) {
    throw new Error(
      "Least-Privilege Policy Error: ALLOWED_SHAREPOINT_SITES is not configured. Specify one or more approved SharePoint site URLs."
    );
  }

  const now = Date.now();
  if (cachedAllowedSites && now - cachedAllowedSitesTimestamp < SITE_CACHE_TTL_MS) {
    return cachedAllowedSites;
  }

  const resolvedSites = [];
  const errors = [];
  for (const spec of specs) {
    try {
      const res = await graph.get(`/sites/${spec.graphPath}`, {
        params: { $select: "id,displayName,name,webUrl,description,createdDateTime,lastModifiedDateTime" },
      });
      const site = res.data;
      resolvedSites.push({
        id: site.id,
        displayName: site.displayName || site.name || spec.siteSlug,
        name: site.name || spec.siteSlug,
        webUrl: site.webUrl || spec.webUrlHint,
        description: site.description || "",
        configuredAs: spec.raw,
        siteSlug: spec.siteSlug,
      });
    } catch (err) {
      const status = err.response?.status;
      if (status === 403) {
        errors.push(
          `Access Denied (403) for '${spec.raw}'. Ensure 'Sites.Selected' Application permission and site-level 'read' role are granted.`
        );
      } else {
        errors.push(`Failed to resolve '${spec.raw}': ${err.response?.data?.error?.message || err.message}`);
      }
    }
  }

  if (resolvedSites.length === 0) {
    throw new Error(`Could not resolve any configured sites in ALLOWED_SHAREPOINT_SITES: ${errors.join("; ")}`);
  }

  cachedAllowedSites = resolvedSites;
  cachedAllowedSitesTimestamp = now;
  return resolvedSites;
}

async function resolveAllowedSite(graph, siteInput) {
  const cleanSiteInput = validateSafeString(siteInput, "siteId", 512);
  const allowedSites = await resolveAllowedSites(graph);
  if (!cleanSiteInput) return allowedSites[0];

  const normalized = cleanSiteInput.toLowerCase().replace(/\/+$/, "");
  const match = allowedSites.find((s) => {
    const idLower = (s.id || "").toLowerCase();
    const nameLower = (s.name || "").toLowerCase();
    const displayLower = (s.displayName || "").toLowerCase();
    const webUrlLower = (s.webUrl || "").toLowerCase().replace(/\/+$/, "");
    const slugLower = (s.siteSlug || "").toLowerCase();
    const rawLower = (s.configuredAs || "").toLowerCase().replace(/\/+$/, "");
    return (
      normalized === idLower ||
      normalized === nameLower ||
      normalized === displayLower ||
      normalized === webUrlLower ||
      normalized === slugLower ||
      normalized === rawLower ||
      normalized === `/sites/${slugLower}` ||
      webUrlLower.endsWith(`/${normalized}`)
    );
  });

  if (!match) {
    throw new Error(
      `Least-Privilege Access Denied: Site '${cleanSiteInput}' is not in ALLOWED_SHAREPOINT_SITES.`
    );
  }
  return match;
}

async function listDrivesForAllowedSite(graph, allowedSite) {
  const res = await graph.get(`/sites/${encodeGraphSegment(allowedSite.id, "siteId")}/drives`, {
    params: { $select: "id,name,driveType,webUrl,description,lastModifiedDateTime" },
  });
  const drives = res.data?.value || [];
  for (const d of drives) {
    if (d.id) allowedDriveToSiteMap.set(d.id, allowedSite);
  }
  return drives;
}

async function resolveAllowedDrive(graph, driveInput, siteInput) {
  const cleanDriveInput = validateSafeString(driveInput, "driveId", 512);
  const allowedSites = await resolveAllowedSites(graph);

  if (cleanDriveInput && allowedDriveToSiteMap.has(cleanDriveInput)) {
    const ownerSite = allowedDriveToSiteMap.get(cleanDriveInput);
    if (siteInput) {
      const requestedSite = await resolveAllowedSite(graph, siteInput);
      if (requestedSite.id !== ownerSite.id) {
        throw new Error(`Least-Privilege Access Denied: Drive '${cleanDriveInput}' is outside '${requestedSite.displayName}'.`);
      }
    }
    return { driveId: cleanDriveInput, site: ownerSite };
  }

  const candidateSites = siteInput ? [await resolveAllowedSite(graph, siteInput)] : allowedSites;
  for (const site of candidateSites) {
    const drives = await listDrivesForAllowedSite(graph, site);
    if (drives.length === 0) continue;

    if (!cleanDriveInput) {
      const def = drives.find((d) => d.name === "Documents" || d.name === "Shared Documents") || drives[0];
      return { driveId: def.id, site, drive: def };
    }

    const lower = cleanDriveInput.toLowerCase();
    const matched =
      drives.find((d) => d.id === cleanDriveInput) ||
      drives.find((d) => (d.name || "").toLowerCase() === lower) ||
      drives.find(
        (d) =>
          (lower === "shared documents" && (d.name || "").toLowerCase() === "documents") ||
          (lower === "documents" && (d.name || "").toLowerCase() === "shared documents")
      );
    if (matched) return { driveId: matched.id, site, drive: matched };
  }

  throw new Error(`Least-Privilege Access Denied or Library Not Found: '${cleanDriveInput}'.`);
}

async function crawlDriveItems(graph, driveId, maxDepth = 3, maxItems = 300) {
  const safeDriveId = encodeGraphSegment(driveId, "driveId");
  const collected = [];
  const queue = [{ folderId: "root", depth: 0, pathPrefix: "" }];

  while (queue.length > 0 && collected.length < maxItems) {
    const { folderId, depth, pathPrefix } = queue.shift();
    const endpoint =
      folderId === "root"
        ? `/drives/${safeDriveId}/root/children`
        : `/drives/${safeDriveId}/items/${encodeGraphSegment(folderId, "folderId")}/children`;
    const res = await graph.get(endpoint, {
      params: {
        $select: "id,name,size,webUrl,lastModifiedDateTime,createdDateTime,file,folder",
        $top: 200,
      },
    });
    for (const item of res.data?.value || []) {
      const relativePath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      collected.push({ ...item, relativePath });
      if (item.folder && depth + 1 < maxDepth && collected.length < maxItems) {
        queue.push({ folderId: item.id, depth: depth + 1, pathPrefix: relativePath });
      }
    }
  }
  return collected;
}

async function resolveFolderItemId(graph, driveId, folderInput) {
  const cleanFolder = validateSafeString(folderInput, "folderId", 512);
  if (!cleanFolder || cleanFolder.toLowerCase() === "root" || cleanFolder === "/") return "root";
  if (!cleanFolder.includes(" ") && !cleanFolder.includes("/") && cleanFolder.length > 18) {
    return encodeGraphSegment(cleanFolder, "folderId");
  }

  const segments = cleanFolder
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  let currentParentId = "root";
  const safeDriveId = encodeGraphSegment(driveId, "driveId");

  for (const seg of segments) {
    const endpoint =
      currentParentId === "root"
        ? `/drives/${safeDriveId}/root/children`
        : `/drives/${safeDriveId}/items/${encodeGraphSegment(currentParentId, "folderId")}/children`;
    const res = await graph.get(endpoint, { params: { $select: "id,name,folder" } });
    const segLower = seg.toLowerCase();
    const match = (res.data?.value || []).find(
      (i) => i.folder && i.name && i.name.toLowerCase() === segLower
    );
    if (!match) throw new Error(`Folder '${seg}' not found in allowed document library.`);
    currentParentId = match.id;
  }
  return currentParentId;
}

async function resolveFileItemId(graph, driveId, itemInput) {
  const cleanItem = validateSafeString(itemInput, "itemId", 512);
  if (!cleanItem) throw new Error("Missing required parameter 'itemId'.");
  if (!cleanItem.includes(" ") && !cleanItem.includes(".") && !cleanItem.includes("/") && cleanItem.length > 18) {
    return encodeGraphSegment(cleanItem, "itemId");
  }

  const safeDriveId = encodeGraphSegment(driveId, "driveId");
  const normalizedPath = cleanItem
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      if (seg === "." || seg === "..") {
        throw new Error("Path traversal sequences are prohibited.");
      }
      return encodeURIComponent(seg);
    })
    .join("/");

  if (normalizedPath) {
    try {
      const directRes = await graph.get(`/drives/${safeDriveId}/root:/${normalizedPath}`, {
        params: { $select: "id,name" },
      });
      if (directRes.data?.id) return directRes.data.id;
    } catch {
      // Fallback to bounded children crawl under Sites.Selected
    }
  }

  const allItems = await crawlDriveItems(graph, driveId, 3, 300);
  const lower = cleanItem.toLowerCase();
  const matched =
    allItems.find((i) => i.file && (i.name || "").toLowerCase() === lower) ||
    allItems.find((i) => i.file && (i.name || "").toLowerCase().includes(lower));
  if (!matched) {
    throw new Error(`File '${cleanItem}' was not found in the allowed SharePoint document library.`);
  }
  return matched.id;
}

const SERVER_INSTRUCTIONS = `
CRITICAL SYSTEM INSTRUCTIONS FOR SHAREPOINT RETRIEVAL & CITATIONS (LEAST-PRIVILEGE SITES.SELECTED MODE):
1. LEAST-PRIVILEGE SITE SCOPE:
   - This MCP server is strictly read-only ('Sites.Selected' with 'read' role) and scoped exclusively to ALLOWED_SHAREPOINT_SITES.
   - Use 'query_search_files_lookup' to search files across approved SharePoint sites or 'query_sharepoint_sites_lookup' to view approved sites.
2. MANDATORY CLICKABLE CITATIONS:
   - For PDF files ('.pdf'), strip '?web=1' and append '#page=N' (apply +1 Cover Page offset when unnumbered cover pages exist).
   - For Office files ('.docx', '.xlsx', '.pptx'), keep '?web=1' so links open in SharePoint Web Viewer.
`.trim();

const TOOLS = buildStandardSharePointTools({
  includeWriteTools: false,
  includeSearchFilesTool: true,
});

const app = createSharePointHttpServer({
  serviceName: "least-privilege-sharepoint-mcp-server",
  version: "2.1.0",
  defaultAllowAppCredentials: true,
  buildMcpServer(authContext) {
    const mcpServer = new Server(
      { name: "least-privilege-sharepoint-mcp-server", version: "2.1.0" },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;
      try {
        // Loopback deterministic mock mode for offline CI & test_local.sh verification
        if (authContext.isLocalMock) {
          const specs = getConfiguredSiteSpecs();
          if (specs.length === 0) {
            throw new Error("Least-Privilege Policy Error: ALLOWED_SHAREPOINT_SITES is not configured.");
          }
          if (args.siteId) {
            const reqSlug = String(args.siteId).toLowerCase();
            const ok = specs.some(
              (s) => s.siteSlug === reqSlug || s.webUrlHint.toLowerCase() === reqSlug
            );
            if (!ok) {
              throw new Error(`Least-Privilege Access Denied: Site '${args.siteId}' is not in ALLOWED_SHAREPOINT_SITES.`);
            }
          }
          if (name === "query_sharepoint_sites_lookup") {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      permissionModel: "Entra ID Least-Privilege (Sites.Selected - Read-Only)",
                      sites: specs.map((s, idx) => ({
                        id: `${s.hostname},00000000-0000-0000-0000-00000000000${idx + 1},00000000-0000-0000-0000-000000000009`,
                        displayName: s.siteSlug,
                        webUrl: s.webUrlHint,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, tool: name }, null, 2) }],
          };
        }

        const graph = createReadOnlyGraphClient(authContext.token);
        const siteArg = args.siteId || "";
        const driveArg = args.driveId || "";
        const folderArg = args.folderId || "";
        const itemArg = args.itemId || "";
        const queryArg = args.query || "";

        if (name === "query_sharepoint_sites_lookup") {
          const rawQuery = validateSafeString(queryArg, "query", 200);
          const allowedSites = await resolveAllowedSites(graph);
          const filtered =
            rawQuery && rawQuery !== "*"
              ? allowedSites.filter((s) =>
                  `${s.displayName} ${s.name} ${s.webUrl} ${s.description}`
                    .toLowerCase()
                    .includes(rawQuery.toLowerCase())
                )
              : allowedSites;
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    permissionModel: "Entra ID Least-Privilege (Sites.Selected - Read-Only)",
                    totalAllowedSites: filtered.length,
                    sites: filtered,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "query_document_libraries_lookup") {
          const site = await resolveAllowedSite(graph, siteArg);
          const libraries = await listDrivesForAllowedSite(graph, site);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    libraries,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "query_library_items_lookup") {
          const { driveId, site } = await resolveAllowedDrive(graph, driveArg, siteArg);
          const folderId = await resolveFolderItemId(graph, driveId, folderArg);
          const safeDrive = encodeGraphSegment(driveId, "driveId");
          const endpoint =
            folderId === "root"
              ? `/drives/${safeDrive}/root/children`
              : `/drives/${safeDrive}/items/${encodeGraphSegment(folderId, "folderId")}/children`;
          const res = await graph.get(endpoint, {
            params: {
              $select: "id,name,size,webUrl,lastModifiedDateTime,createdDateTime,file,folder",
              $top: 200,
            },
          });
          const items = (res.data?.value || []).map((item) => ({
            ...item,
            webUrl: formatSharePointWebUrl(item.webUrl),
          }));
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ site, driveId, folderId, totalItems: items.length, items }, null, 2),
              },
            ],
          };
        }

        if (name === "query_search_files_lookup") {
          const safeQuery = validateSafeString(queryArg, "query", 200);
          if (!safeQuery) throw new Error("Parameter 'query' is required.");

          const targets = [];
          if (driveArg || siteArg) {
            const { driveId, site, drive } = await resolveAllowedDrive(graph, driveArg, siteArg);
            targets.push({ driveId, site, driveName: drive?.name || "Documents" });
          } else {
            const allowedSites = await resolveAllowedSites(graph);
            for (const site of allowedSites) {
              const drives = await listDrivesForAllowedSite(graph, site);
              for (const d of drives) {
                if (d.driveType === "documentLibrary" || d.name === "Documents" || d.name === "Shared Documents") {
                  targets.push({ driveId: d.id, site, driveName: d.name });
                }
              }
            }
          }

          const tokens = safeQuery.toLowerCase().split(/\s+/).filter(Boolean);
          const results = [];
          for (const target of targets) {
            const allItems = await crawlDriveItems(graph, target.driveId, 3, 300);
            for (const item of allItems) {
              const hay = `${item.name || ""} ${item.relativePath || ""}`.toLowerCase();
              if (safeQuery === "*" || hay.includes(safeQuery.toLowerCase()) || tokens.every((t) => hay.includes(t))) {
                results.push({
                  ...item,
                  webUrl: formatSharePointWebUrl(item.webUrl),
                  siteId: target.site.id,
                  siteDisplayName: target.site.displayName,
                  driveId: target.driveId,
                  driveName: target.driveName,
                });
              }
            }
          }

          return {
            content: [{ type: "text", text: JSON.stringify({ query: safeQuery, totalResults: results.length, results }, null, 2) }],
          };
        }

        if (name === "query_file_metadata_lookup") {
          const { driveId, site } = await resolveAllowedDrive(graph, driveArg, siteArg);
          const itemId = await resolveFileItemId(graph, driveId, itemArg);
          const res = await graph.get(
            `/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(itemId, "itemId")}`
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    driveId,
                    file: { ...res.data, webUrl: formatSharePointWebUrl(res.data.webUrl) },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "query_file_content_lookup") {
          const { driveId, site } = await resolveAllowedDrive(graph, driveArg, siteArg);
          const itemId = await resolveFileItemId(graph, driveId, itemArg);
          const safeDrive = encodeGraphSegment(driveId, "driveId");
          const safeItem = encodeGraphSegment(itemId, "itemId");

          const metaRes = await graph.get(`/drives/${safeDrive}/items/${safeItem}`, {
            params: { $select: "id,name,size,webUrl,file,lastModifiedDateTime" },
          });
          const fileMeta = metaRes.data;
          if (Number(fileMeta.size || 0) > DEFAULT_MAX_FILE_BYTES) {
            throw new Error(`File '${fileMeta.name}' exceeds ${DEFAULT_MAX_FILE_BYTES}-byte limit.`);
          }

          const binRes = await graph.get(`/drives/${safeDrive}/items/${safeItem}/content`, {
            responseType: "arraybuffer",
          });
          const extracted = await extractDocumentTextAsync(
            Buffer.from(binRes.data),
            fileMeta.name,
            binRes.headers["content-type"] || fileMeta.file?.mimeType || ""
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    name: fileMeta.name,
                    webUrl: formatSharePointWebUrl(fileMeta.webUrl),
                    content: extracted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        if (name === "query_file_download_url_lookup") {
          const { driveId, site } = await resolveAllowedDrive(graph, driveArg, siteArg);
          const itemId = await resolveFileItemId(graph, driveId, itemArg);
          const res = await graph.get(
            `/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(itemId, "itemId")}`
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    id: res.data.id,
                    name: res.data.name,
                    webUrl: formatSharePointWebUrl(res.data.webUrl),
                    downloadUrl: res.data["@microsoft.graph.downloadUrl"],
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        throw new Error(`Disallowed or unknown tool '${name}'. Only read-only site-scoped tools are permitted.`);
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        return {
          isError: true,
          content: [{ type: "text", text: `SharePoint Least-Privilege MCP Error: ${msg}` }],
        };
      }
    });

    return mcpServer;
  },
});

app.start(Number(process.env.PORT) || 8080);
