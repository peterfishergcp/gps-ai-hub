import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import https from "https";
import { createServer } from "http";
import zlib from "zlib";
import dotenv from "dotenv";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

dotenv.config();

// Configure HTTP Keep-Alive agent for fast Graph API connection pooling
const keepAliveAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000
});
axios.defaults.httpsAgent = keepAliveAgent;

// Helper to retrieve Microsoft Graph authorization headers using OAuth 2.0
async function getGraphHeaders(req) {
    const authHeader = req.headers.authorization;
    
    console.error(`[AUTH LOG] Raw authHeader: ${authHeader ? (authHeader.substring(0, 15) + '...') : 'None'}`);
    
    // 1. Check if a real delegated user Bearer token was provided by the client
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ') && !authHeader.includes('mock')) {
        console.error("[AUTH LOG] Detected Real User Token - Connecting with Delegated User Identity.");
        return {
            Authorization: authHeader,
            Accept: 'application/json'
        };
    }

    console.error("[AUTH LOG] Falling back to Application Client Credentials OAuth 2.0 flow.");
    const tenantId = process.env.MS_GRAPH_TENANT_ID;
    const clientId = process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
        console.error("[AUTH LOG] Environment variables missing, returning mock authentication headers for local testing.");
        return {
            Authorization: 'Bearer mock_graph_token',
            Accept: 'application/json'
        };
    }

    try {
        // Obtain Access Token from Microsoft Entra ID (Azure AD)
        const tokenResponse = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        return {
            Authorization: `Bearer ${tokenResponse.data.access_token}`,
            Accept: 'application/json'
        };
    } catch (err) {
        console.error("[AUTH LOG] Failed to obtain OAuth token from Microsoft Entra ID:", err.message);
        throw new Error(`OAuth token retrieval failed: ${err.message}`);
    }
}

/**
 * Decompresses and extracts docProps/custom.xml from an OOXML ZIP archive (.docx, .xlsx, .pptx)
 */
function extractOoxmlCustomProperties(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 22) return "";
    let extractedXml = "";
    try {
        for (let i = 0; i < buffer.length - 46; i++) {
            // Locate Central Directory File Header signature (PK\x01\x02)
            if (buffer[i] === 0x50 && buffer[i + 1] === 0x4b && buffer[i + 2] === 0x01 && buffer[i + 3] === 0x02) {
                const compressionMethod = buffer.readUInt16LE(i + 10);
                const compressedSize = buffer.readUInt32LE(i + 20);
                const fileNameLen = buffer.readUInt16LE(i + 28);
                const extraLen = buffer.readUInt16LE(i + 30);
                const commentLen = buffer.readUInt16LE(i + 32);
                const localHeaderOffset = buffer.readUInt32LE(i + 42);

                if (i + 46 + fileNameLen > buffer.length) break;
                const fileName = buffer.toString('utf-8', i + 46, i + 46 + fileNameLen);

                if (fileName.toLowerCase().includes("custom") && fileName.toLowerCase().endsWith(".xml")) {
                    if (localHeaderOffset + 30 <= buffer.length) {
                        const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
                        const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
                        const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
                        if (dataStart + compressedSize <= buffer.length) {
                            const compressedSlice = buffer.subarray(dataStart, dataStart + compressedSize);
                            if (compressionMethod === 8) {
                                extractedXml += zlib.inflateRawSync(compressedSlice).toString('utf-8') + "\n";
                            } else if (compressionMethod === 0) {
                                extractedXml += compressedSlice.toString('utf-8') + "\n";
                            }
                        }
                    }
                }
                i += 45 + fileNameLen + extraLen + commentLen;
            }
        }
    } catch (err) {
        console.error("[OOXML ZIP PARSER] Warning:", err.message);
    }
    return extractedXml;
}

/**
 * Extracts Microsoft Purview Sensitivity Label metadata from Microsoft Graph item payload
 * and/or Office document binary buffers without calling external SDP APIs.
 */
function extractSensitivityLabelInfo(itemData, bufferData = null) {
    let labelId = null;
    let labelName = null;
    let protectionEnabled = false;
    let assignmentMethod = null;
    let setDate = null;
    let siteId = null;

    // 1. Check Microsoft Graph beta sensitivityLabel facet
    if (itemData && itemData.sensitivityLabel) {
        labelId = itemData.sensitivityLabel.id || itemData.sensitivityLabel.sensitivityLabelId || null;
        labelName = itemData.sensitivityLabel.displayName || itemData.sensitivityLabel.name || null;
        protectionEnabled = Boolean(itemData.sensitivityLabel.protectionEnabled);
        assignmentMethod = itemData.sensitivityLabel.assignmentMethod || null;
    }

    // 2. Check SharePoint list item extended fields (_SensitivityLabelId, _SensitivityLabel, _ComplianceTag)
    if (!labelId && itemData && itemData.listItem && itemData.listItem.fields) {
        const fields = itemData.listItem.fields;
        labelId = fields._SensitivityLabelId || fields.SensitivityLabelId || fields._SensitivityLabelGUID || null;
        labelName = fields._SensitivityLabel || fields.SensitivityLabel || fields._ComplianceTag || fields.ComplianceTag || null;
    }

    // 3. Check for embedded Microsoft Information Protection (MIP) GUID in Office binary buffer (DOCX, PPTX, XLSX docProps/custom.xml)
    if (bufferData && Buffer.isBuffer(bufferData)) {
        try {
            // Decompress docProps/custom.xml from OOXML zip container, plus raw fallback
            const customXml = extractOoxmlCustomProperties(bufferData);
            const searchStr = customXml || bufferData.toString('utf-8', 0, Math.min(bufferData.length, 500000));

            // Match standard MSIP_Label_<GUID>_Enabled or MSIP_Label_<GUID>
            const msipMatch = searchStr.match(/MSIP_Label_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            if (msipMatch && msipMatch[1]) {
                labelId = msipMatch[1].toLowerCase();
                console.error(`[PURVIEW EXTRACTION LOG] Extracted MIP Label GUID from OOXML docProps/custom.xml: ${labelId}`);
            }

            // Extract MSIP_Label_<GUID>_Name
            const nameMatch = searchStr.match(/MSIP_Label_[0-9a-f\-]+_Name[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
            if (nameMatch && nameMatch[1]) {
                labelName = nameMatch[1].trim();
                console.error(`[PURVIEW EXTRACTION LOG] Extracted MIP Label Name from OOXML docProps/custom.xml: ${labelName}`);
            }

            // Extract MSIP_Label_<GUID>_Enabled
            const enabledMatch = searchStr.match(/MSIP_Label_[0-9a-f\-]+_Enabled[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
            if (enabledMatch && enabledMatch[1]) {
                protectionEnabled = enabledMatch[1].trim().toLowerCase() === "true";
            }

            // Extract MSIP_Label_<GUID>_Method
            const methodMatch = searchStr.match(/MSIP_Label_[0-9a-f\-]+_Method[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
            if (methodMatch && methodMatch[1]) {
                assignmentMethod = methodMatch[1].trim();
            }

            // Extract MSIP_Label_<GUID>_SetDate
            const dateMatch = searchStr.match(/MSIP_Label_[0-9a-f\-]+_SetDate[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
            if (dateMatch && dateMatch[1]) {
                setDate = dateMatch[1].trim();
            }

            // Extract MSIP_Label_<GUID>_SiteId
            const siteMatch = searchStr.match(/MSIP_Label_[0-9a-f\-]+_SiteId[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
            if (siteMatch && siteMatch[1]) {
                siteId = siteMatch[1].trim();
            }
        } catch (e) {
            console.error("[PURVIEW EXTRACTION LOG] Buffer inspection error:", e.message);
        }
    }

    if (labelId || labelName) {
        const normalizedId = labelId ? labelId.toLowerCase().trim() : null;
        const displayName = labelName || (normalizedId ? `Purview Sensitivity Label (${normalizedId})` : "Restricted");
        return {
            id: normalizedId,
            guid: normalizedId,
            displayName: displayName,
            protectionEnabled: protectionEnabled || true,
            assignmentMethod: assignmentMethod || undefined,
            setDate: setDate || undefined,
            tenantSiteId: siteId || undefined
        };
    }

    return null;
}

/**
 * Formats extracted Purview label metadata into both Gemini Enterprise native SDP
 * inspection fields (msip_labels, assigned_labels, assigned_sensitivity_labels)
 * and descriptive SharePoint metadata fields.
 */
function formatPurviewLabelFields(labelInfo, includeNativeDlpTriggers = true) {
    if (!labelInfo) {
        return {
            fileLabel: null,
            sensitivityLabel: null,
            purviewSensitivityGuid: null
        };
    }
    const guid = labelInfo.guid;
    const displayName = labelInfo.displayName;
    const enabledStr = labelInfo.protectionEnabled !== false ? "True" : "False";
    const msipParts = [];
    if (guid) {
        msipParts.push(`MSIP_Label_${guid}_Enabled=${enabledStr}`);
        if (displayName) {
            msipParts.push(`MSIP_Label_${guid}_Name=${displayName}`);
        }
    }

    const baseFields = {
        fileLabel: displayName || null,
        sensitivityLabel: {
            id: guid,
            labelId: guid,
            displayName: displayName,
            protectionEnabled: labelInfo.protectionEnabled,
            assignmentMethod: labelInfo.assignmentMethod,
            setDate: labelInfo.setDate
        },
        purviewSensitivityGuid: guid || null
    };

    if (!includeNativeDlpTriggers || !guid) {
        return baseFields;
    }

    return {
        // Native Gemini Enterprise / Discovery Engine (DolphinService) MSIP extraction keys
        msip_labels: msipParts.join(";"),
        assigned_labels: [{
            labelId: guid,
            displayName: displayName || ""
        }],
        assigned_sensitivity_labels: [{
            labelId: guid,
            displayName: displayName || ""
        }],
        ...baseFields
    };
}

const server = createServer(async (req, res) => {
    // Normalize headers to bypass Cloud Run's proxy stripping/modification
    const reqProxy = new Proxy(req, {
        get(target, prop, receiver) {
            if (prop === 'headers') {
                return {
                    ...target.headers,
                    'accept': 'application/json, text/event-stream'
                };
            }
            return Reflect.get(target, prop, receiver);
        }
    });

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, Accept");

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const host = req.headers.host || 'localhost';
    const url = new URL(req.url, `http://${host}`);

    // --- primary MCP Endpoint ---
    if (url.pathname === "/mcp") {
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
                enableJsonResponse: true
            });

            const mcpServer = new Server({
                name: "sharepoint-mcp-server-purview-label",
                version: "1.0.0",
            }, {
                capabilities: { tools: {} },
                instructions: `
SharePoint & Microsoft Graph MCP Connector Guidelines & Citation Rules:

1. MANDATORY PAGE-LEVEL CITATION REQUIREMENT:
   - EVERY SINGLE RESPONSE MUST INCLUDE AT LEAST ONE CLICKABLE CITATION WITH A PAGE OR SECTION LINK.
   - For every document, paragraph, fact, or summary derived from SharePoint, extract the file's 'webUrl' property and append the page anchor '#page=X'.
   - Mandatory Citation Syntax: [Document Name (Page X)](webUrl#page=X)

2. HANDLING SENSITIVITY LABELS & DATA PROTECTION POLICIES:
   - Documents in SharePoint may contain Microsoft Purview Sensitivity Labels (e.g. 'Highly Confidential', 'Confidential', 'Restricted').
   - When a document includes 'fileLabel', 'msip_labels', or 'sensitivityLabel' metadata, note the label status in the document summary.

3. EXPECTED OUTPUT TEMPLATE:
   Your response MUST follow this structure:

   ### 📄 Summary & Answer
   <Your detailed answer containing inline page-level citation links, e.g., "As stated in [Q3 Financial Report (Printed Page 3 / Physical Page 7)](https://your-tenant.sharepoint.com/sites/Finance/Shared%20Documents/Q3_Report.pdf#page=7), total revenue increased by 18%.">

   ### 📚 Sources & Citations
   - 🔗 [Document Name 1 (Printed Page X / Physical Page Y)](webUrl#page=Y)
   - 🔗 [Document Name 2 - Section Name](webUrl#section=HeadingName)

   ---
   *Note: Microsoft SharePoint Graph API search results may be paginated or partial. If you suspect missing results, please try again with a more specific query or document title.*`
            });

            // --- MCP Tool Handlers ---
            mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
                return {
                    tools: [
                        {
                            name: "query_sharepoint_sites_lookup",
                            description: "Read-only background database lookup to query SharePoint site metadata",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    query: { type: "string", description: "Optional search filter" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_document_libraries_lookup",
                            description: "Read-only background database lookup to list document library drives",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    siteId: { type: "string", description: "SharePoint site ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_library_items_lookup",
                            description: "Read-only background database lookup to list items in a document library with Microsoft Purview sensitivity labels",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Drive ID or name" },
                                    folderId: { type: "string", description: "Optional folder ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_file_metadata_lookup",
                            description: "Read-only background database lookup to retrieve detailed file metadata and Microsoft Purview sensitivity labels",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Item ID or file name" }
                                },
                                required: ["itemId"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_file_content_lookup",
                            description: "Read-only background database lookup to retrieve document content text and Microsoft Purview sensitivity labels",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Item ID or file name" }
                                },
                                required: ["itemId"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_file_download_url_lookup",
                            description: "Read-only background database lookup to retrieve pre-authenticated download URL for a file",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Item ID or file name" }
                                },
                                required: ["itemId"]
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_create_file_action_lookup",
                            description: "Uploads or creates a new file within SharePoint",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    parentId: { type: "string", description: "Folder ID or 'root'" },
                                    fileName: { type: "string", description: "Target file name" },
                                    content: { type: "string", description: "UTF-8 content text" }
                                },
                                required: ["fileName", "content"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_update_file_action_lookup",
                            description: "Updates an existing file's content in SharePoint",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    itemId: { type: "string", description: "Item ID to overwrite" },
                                    content: { type: "string", description: "New UTF-8 content text" }
                                },
                                required: ["itemId", "content"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_create_folder_action_lookup",
                            description: "Creates a new folder in a SharePoint library",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    parentId: { type: "string", description: "Parent folder ID or 'root'" },
                                    folderName: { type: "string", description: "Folder name" }
                                },
                                required: ["folderName"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_rename_item_action_lookup",
                            description: "Renames an existing file or folder in SharePoint",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    itemId: { type: "string", description: "Item ID to rename" },
                                    newName: { type: "string", description: "New item name" }
                                },
                                required: ["itemId", "newName"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_delete_item_action_lookup",
                            description: "Deletes a file or folder from SharePoint",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    itemId: { type: "string", description: "Item ID to delete" }
                                },
                                required: ["itemId"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_move_item_action_lookup",
                            description: "Moves an item to a different folder in SharePoint",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional target drive ID" },
                                    itemId: { type: "string", description: "Item ID to move" },
                                    targetFolderId: { type: "string", description: "Target folder ID or 'root'" }
                                },
                                required: ["itemId", "targetFolderId"]
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        }
                    ]
                };
            });

            mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
                const { name, arguments: args = {} } = request.params;
                console.error(`Executing MCP Tool: ${name} with args: ${JSON.stringify(args)}`);

                try {
                    const headers = await getGraphHeaders(req);
                    let resultObj = null;

                    const formatSpUrl = (u) => {
                        if (typeof u !== 'string') return u;
                        if (/\.pdf(\?.*)?$/i.test(u)) return u.replace(/\?web=1$/i, '');
                        if (/\.(docx|doc|pptx|ppt|xlsx|xls)$/i.test(u)) return `${u}?web=1`;
                        return u;
                    };

                    const isGraphDriveId = (id) => {
                        return typeof id === 'string' && id.length > 25 && !id.includes(' ');
                    };

                    const isGraphItemId = (id) => {
                        if (!id || typeof id !== 'string') return false;
                        if (id.toLowerCase() === 'root') return true;
                        // Graph DriveItem IDs have no spaces or file extension dots and are >= 20 chars
                        if (id.includes('.') || id.includes(' ') || id.includes('/')) return false;
                        return /^[A-Z0-9!_-]{20,}$/i.test(id);
                    };

                    const getCandidateDrives = async (inputDriveId, headers) => {
                        if (isGraphDriveId(inputDriveId)) return [inputDriveId];
                        console.error(`[RESOLVER] Discovering tenant drives (filter: "${inputDriveId || '*'}")...`);
                        const discoveredDrives = [];
                        try {
                            const sitesRes = await axios.get(`https://graph.microsoft.com/v1.0/sites?search=*`, { headers });
                            const sites = (sitesRes.data.value || []).sort((a, b) => {
                                const aCymbal = ((a.displayName || a.name || "").toLowerCase().includes("cymbal")) ? -1 : 0;
                                const bCymbal = ((b.displayName || b.name || "").toLowerCase().includes("cymbal")) ? -1 : 0;
                                return aCymbal - bCymbal;
                            });
                            for (const site of sites) {
                                try {
                                    const drivesRes = await axios.get(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(site.id)}/drives`, { headers });
                                    const drives = drivesRes.data.value || [];
                                    for (const d of drives) {
                                        if (!inputDriveId || d.name.toLowerCase() === inputDriveId.toLowerCase() || d.id === inputDriveId) {
                                            discoveredDrives.push(d.id);
                                        }
                                    }
                                } catch (ed) {}
                            }
                            if (discoveredDrives.length === 0) {
                                const rootDrives = await axios.get(`https://graph.microsoft.com/v1.0/sites/root/drives`, { headers });
                                for (const d of (rootDrives.data.value || [])) {
                                    discoveredDrives.push(d.id);
                                }
                            }
                        } catch (err) {
                            console.error(`[RESOLVER LOG] Drive discovery fallback error:`, err.message);
                        }
                        return discoveredDrives.length > 0 ? discoveredDrives : (inputDriveId ? [inputDriveId] : []);
                    };

                    const resolveDriveId = async (inputDriveId, headers) => {
                        const candidates = await getCandidateDrives(inputDriveId, headers);
                        return candidates[0] || inputDriveId;
                    };

                    const resolveItemInDrive = async (driveId, inputItemId, headers) => {
                        if (!inputItemId || inputItemId.toLowerCase() === "root") return "root";
                        if (isGraphItemId(inputItemId)) return inputItemId;
                        const cleanTarget = inputItemId.trim().toLowerCase();
                        try {
                            // 1. Check root children first for immediate exact or base-name match
                            const childrenRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`, { headers });
                            const children = childrenRes.data.value || [];
                            const exactChild = children.find(i => (i.name || "").toLowerCase() === cleanTarget)
                                || children.find(i => (i.name || "").toLowerCase().startsWith(cleanTarget) || cleanTarget.includes((i.name || "").toLowerCase()));
                            if (exactChild) {
                                console.error(`[RESOLVER] Resolved "${inputItemId}" in drive "${driveId}" root children -> ${exactChild.id} (${exactChild.name})`);
                                return exactChild.id;
                            }
                        } catch (e) {}

                        try {
                            // 2. Fallback to recursive drive search
                            const searchRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/search(q='${encodeURIComponent(inputItemId)}')`, { headers });
                            const items = searchRes.data.value || [];
                            const matched = items.find(i => (i.name || "").toLowerCase() === cleanTarget)
                                || items.find(i => (i.name || "").toLowerCase().includes(cleanTarget));
                            if (matched) {
                                console.error(`[RESOLVER] Resolved "${inputItemId}" in drive "${driveId}" via search -> ${matched.id} (${matched.name})`);
                                return matched.id;
                            }
                        } catch (e) {
                            console.error(`[RESOLVER LOG] Search fallback error in drive ${driveId}:`, e.message);
                        }
                        return null;
                    };

                    const resolveDriveAndItem = async (rawDriveId, rawItemId, headers) => {
                        const candidateDrives = await getCandidateDrives(rawDriveId, headers);
                        if (!rawItemId || rawItemId.toLowerCase() === "root") {
                            return { driveId: candidateDrives[0] || rawDriveId, itemId: "root" };
                        }
                        if (isGraphItemId(rawItemId)) {
                            if (candidateDrives.length <= 1) {
                                return { driveId: candidateDrives[0] || rawDriveId, itemId: rawItemId };
                            }
                            for (const dId of candidateDrives) {
                                try {
                                    await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(dId)}/items/${encodeURIComponent(rawItemId)}?$select=id`, { headers });
                                    return { driveId: dId, itemId: rawItemId };
                                } catch (e) {}
                            }
                            return { driveId: candidateDrives[0] || rawDriveId, itemId: rawItemId };
                        }

                        // Human filename or folder name provided (e.g. "Cymbal_QuantumLedger.docx")
                        for (const dId of candidateDrives) {
                            const resolvedId = await resolveItemInDrive(dId, rawItemId, headers);
                            if (resolvedId) {
                                return { driveId: dId, itemId: resolvedId };
                            }
                        }
                        return { driveId: candidateDrives[0] || rawDriveId, itemId: rawItemId };
                    };

                    const resolveItemId = async (driveId, inputItemId, headers) => {
                        if (!inputItemId || inputItemId.toLowerCase() === "root") return "root";
                        if (isGraphItemId(inputItemId)) return inputItemId;
                        const resolved = await resolveItemInDrive(driveId, inputItemId, headers);
                        return resolved || inputItemId;
                    };

                    if (name === "query_sharepoint_sites_lookup" || name === "search_sharepoint_sites") {
                        const query = args.query || args.Query || args.search || Object.values(args)[0] || "";
                        console.error(`Executing query_sharepoint_sites_lookup with resolved query: "${query}"`);
                        const response = await axios.get(`https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(query)}`, { headers });
                        const simplified = (response.data.value || []).map(site => ({
                            id: site.id,
                            name: site.displayName || site.name,
                            webUrl: site.webUrl,
                            description: site.description
                        }));
                        resultObj = { sites: simplified };
                    } else if (name === "query_document_libraries_lookup" || name === "list_document_libraries") {
                        const rawSiteId = args.siteId || args.SiteId || Object.values(args)[0];
                        let endpoint = "https://graph.microsoft.com/v1.0/sites/root/drives";
                        if (rawSiteId && typeof rawSiteId === 'string' && rawSiteId.trim()) {
                            endpoint = `https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(rawSiteId.trim())}/drives`;
                        }
                        const response = await axios.get(endpoint, { headers });
                        const simplified = (response.data.value || []).map(drive => ({
                            id: drive.id,
                            name: drive.name,
                            driveType: drive.driveType
                        }));
                        resultObj = { libraries: simplified };
                    } else if (name === "query_library_items_lookup" || name === "list_library_items") {
                        const rawDriveId = args.driveId || args.DriveId || Object.values(args)[0];
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawFolderId = args.folderId || args.FolderId;
                        const folderId = rawFolderId ? await resolveItemId(driveId, rawFolderId, headers) : undefined;
                        
                        // Try beta endpoint first to capture sensitivity labels, falling back to v1.0
                        let response;
                        try {
                            const betaEndpoint = folderId && folderId !== "root"
                                ? `https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$expand=listItem($expand=fields)`
                                : `https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/root/children?$expand=listItem($expand=fields)`;
                            response = await axios.get(betaEndpoint, { headers });
                        } catch (e) {
                            const v1Endpoint = folderId && folderId !== "root"
                                ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children`
                                : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;
                            response = await axios.get(v1Endpoint, { headers });
                        }

                        const rawItems = response.data.value || [];
                        const simplified = await Promise.all(rawItems.map(async (item) => {
                            let labelInfo = extractSensitivityLabelInfo(item);
                            if (!labelInfo && !item.folder && /\.(docx|xlsx|pptx)$/i.test(item.name || "") && (item.size || 0) < 2000000) {
                                try {
                                    const bufRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(item.id)}/content`, {
                                        headers,
                                        responseType: 'arraybuffer'
                                    });
                                    labelInfo = extractSensitivityLabelInfo(item, Buffer.from(bufRes.data));
                                } catch (e) {}
                            }
                            return {
                                id: item.id,
                                name: item.name,
                                type: item.folder ? "folder" : "file",
                                mimeType: item.file ? item.file.mimeType : undefined,
                                size: item.size,
                                webUrl: formatSpUrl(item.webUrl),
                                // Return descriptive Purview metadata on folder listing without blocking the directory listing itself
                                ...formatPurviewLabelFields(labelInfo, false)
                            };
                        }));
                        resultObj = { items: simplified };
                    } else if (name === "query_file_metadata_lookup" || name === "get_file_metadata") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const rawItemId = args.itemId || args.ItemId || Object.values(args)[0];
                        const { driveId, itemId } = await resolveDriveAndItem(rawDriveId, rawItemId, headers);
                        
                        let response;
                        try {
                            response = await axios.get(`https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$expand=listItem($expand=fields)`, { headers });
                        } catch (e) {
                            response = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        }

                        let labelInfo = extractSensitivityLabelInfo(response.data);
                        if (!labelInfo && /\.(docx|xlsx|pptx)$/i.test(response.data.name || "") && (response.data.size || 0) < 2000000) {
                            try {
                                const bufRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, {
                                    headers,
                                    responseType: 'arraybuffer'
                                });
                                labelInfo = extractSensitivityLabelInfo(response.data, Buffer.from(bufRes.data));
                            } catch (e) {}
                        }
                        resultObj = {
                            id: response.data.id,
                            name: response.data.name,
                            size: response.data.size,
                            webUrl: formatSpUrl(response.data.webUrl),
                            createdDateTime: response.data.createdDateTime,
                            lastModifiedDateTime: response.data.lastModifiedDateTime,
                            // Include native Gemini Enterprise MSIP label fields for SDP policy enforcement
                            ...formatPurviewLabelFields(labelInfo, true)
                        };
                    } else if (name === "query_file_content_lookup" || name === "download_file_content") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const rawItemId = args.itemId || args.ItemId || Object.values(args)[0];
                        const { driveId, itemId } = await resolveDriveAndItem(rawDriveId, rawItemId, headers);

                        // Retrieve metadata via beta endpoint to capture Microsoft Purview sensitivity labels
                        let itemMetadata = null;
                        try {
                            const metaRes = await axios.get(`https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$expand=listItem($expand=fields)`, { headers });
                            itemMetadata = metaRes.data;
                        } catch (e) {
                            try {
                                const v1MetaRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                                itemMetadata = v1MetaRes.data;
                            } catch (err2) {}
                        }
                        
                        // Download the file buffer as an arraybuffer to support universal MS Office extraction
                        const response = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, { 
                            headers, 
                            responseType: 'arraybuffer' 
                        });
                        
                        let extractedText = "";
                        const contentType = response.headers['content-type'] || '';
                        const bufferData = Buffer.from(response.data);
                        const labelInfo = extractSensitivityLabelInfo(itemMetadata, bufferData);
                        
                        try {
                            // 1. Check for Word documents first via high-speed Mammoth extractor
                            if (contentType.includes('wordprocessingml')) {
                                console.error("[EXTRACTION LOG] Detected Word document, executing Mammoth extraction...");
                                const mammothResult = await mammoth.extractRawText({ buffer: bufferData });
                                extractedText = mammothResult.value;
                            } 
                            // 2. Check for Excel spreadsheets via XLSX parser
                            else if (contentType.includes('spreadsheetml') || contentType.includes('excel')) {
                                console.error("[EXTRACTION LOG] Detected Excel document, parsing workbook sheets...");
                                const workbook = XLSX.read(bufferData, { type: 'buffer' });
                                const sheetsText = [];
                                for (const sheetName of workbook.SheetNames) {
                                    const sheet = workbook.Sheets[sheetName];
                                    const csv = XLSX.utils.sheet_to_csv(sheet);
                                    if (csv.trim()) {
                                        sheetsText.push(`[Sheet: ${sheetName}]\n${csv}`);
                                    }
                                }
                                extractedText = sheetsText.join("\n\n");
                            } 
                            // 3. Plain text / JSON / XML streams
                            else if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
                                extractedText = bufferData.toString('utf-8');
                            }
                            else {
                                // For unsupported binary streams (PPTX, PDFs), attempt UTF-8 string conversion with fallback notice
                                const rawStr = bufferData.toString('utf-8');
                                const cleaned = rawStr.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
                                extractedText = cleaned.length > 50 
                                    ? cleaned 
                                    : `[Binary content extracted from item ${itemId} (${contentType || 'application/octet-stream'})]`;
                            }
                        } catch (extractionErr) {
                            console.error("[EXTRACTION LOG] Buffer extraction fallback warning:", extractionErr.message);
                            extractedText = `[Error extracting document text: ${extractionErr.message}]`;
                        }
                        
                        const finalContent = extractedText || "No readable text content could be extracted from this document.";

                        resultObj = { 
                            content: finalContent,
                            name: itemMetadata ? itemMetadata.name : undefined,
                            webUrl: itemMetadata ? formatSpUrl(itemMetadata.webUrl) : undefined,
                            // Include native Gemini Enterprise MSIP label fields for SDP policy enforcement
                            ...formatPurviewLabelFields(labelInfo, true)
                        };
                    } else if (name === "query_file_download_url_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const rawItemId = args.itemId || args.ItemId || Object.values(args)[0];
                        const { driveId, itemId } = await resolveDriveAndItem(rawDriveId, rawItemId, headers);
                        const response = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        let labelInfo = extractSensitivityLabelInfo(response.data);
                        if (!labelInfo && /\.(docx|xlsx|pptx)$/i.test(response.data.name || "") && (response.data.size || 0) < 2000000) {
                            try {
                                const bufRes = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, {
                                    headers,
                                    responseType: 'arraybuffer'
                                });
                                labelInfo = extractSensitivityLabelInfo(response.data, Buffer.from(bufRes.data));
                            } catch (e) {}
                        }
                        resultObj = {
                            downloadUrl: response.data['@microsoft.graph.downloadUrl'] || response.data.webUrl,
                            webUrl: formatSpUrl(response.data.webUrl),
                            name: response.data.name,
                            // Include native Gemini Enterprise MSIP label fields for SDP policy enforcement
                            ...formatPurviewLabelFields(labelInfo, true)
                        };
                    } else if (name === "query_create_file_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawParentId = args.parentId || args.ParentId || "root";
                        const parentId = await resolveItemId(driveId, rawParentId, headers);
                        const fileName = args.fileName || args.FileName || "new_document.txt";
                        const contentText = args.content || args.Content || "Initial document content.";
                        
                        console.error(`[WRITE LOG] Creating file "${fileName}" in parent "${parentId}"...`);
                        const response = await axios.put(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(fileName)}:/content`, 
                            Buffer.from(contentText, 'utf-8'), 
                            { 
                                headers: { 
                                    ...headers, 
                                    'Content-Type': 'text/plain' 
                                } 
                            }
                        );
                        resultObj = { success: true, createdItem: { id: response.data.id, name: response.data.name, webUrl: formatSpUrl(response.data.webUrl) } };
                    } else if (name === "query_update_file_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const contentText = args.content || args.Content || "";
                        
                        console.error(`[WRITE LOG] Updating file "${itemId}" in drive "${driveId}"...`);
                        const response = await axios.put(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, 
                            Buffer.from(contentText, 'utf-8'), 
                            { 
                                headers: { 
                                    ...headers, 
                                    'Content-Type': 'text/plain' 
                                } 
                            }
                        );
                        resultObj = { success: true, updatedItem: { id: response.data.id, name: response.data.name, webUrl: formatSpUrl(response.data.webUrl) } };
                    } else if (name === "query_create_folder_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawParentId = args.parentId || args.ParentId || "root";
                        const parentId = await resolveItemId(driveId, rawParentId, headers);
                        const folderName = args.folderName || args.FolderName || "New Folder";
                        
                        console.error(`[WRITE LOG] Creating folder "${folderName}" in parent "${parentId}"...`);
                        const endpoint = parentId === "root"
                            ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`
                            : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`;
                        
                        const response = await axios.post(endpoint, {
                            name: folderName,
                            folder: {},
                            "@microsoft.graph.conflictBehavior": "rename"
                        }, { headers });
                        resultObj = { success: true, createdFolder: { id: response.data.id, name: response.data.name, webUrl: formatSpUrl(response.data.webUrl) } };
                    } else if (name === "query_rename_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const newName = args.newName || args.NewName;
                        
                        console.error(`[WRITE LOG] Renaming item "${itemId}" to "${newName}"...`);
                        const response = await axios.patch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
                            name: newName
                        }, { headers });
                        resultObj = { success: true, renamedItem: { id: response.data.id, name: response.data.name, webUrl: formatSpUrl(response.data.webUrl) } };
                    } else if (name === "query_delete_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        
                        console.error(`[WRITE LOG] Deleting item "${itemId}"...`);
                        await axios.delete(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        resultObj = { success: true, deletedItemId: itemId };
                    } else if (name === "query_move_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const rawTargetFolderId = args.targetFolderId || args.TargetFolderId || "root";
                        const targetFolderId = await resolveItemId(driveId, rawTargetFolderId, headers);
                        
                        console.error(`[WRITE LOG] Moving item "${itemId}" to folder "${targetFolderId}"...`);
                        const response = await axios.patch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
                            parentReference: {
                                id: targetFolderId
                            }
                        }, { headers });
                        resultObj = { success: true, movedItem: { id: response.data.id, name: response.data.name, webUrl: formatSpUrl(response.data.webUrl) } };
                    } else {
                        throw new Error(`Unrecognized MCP tool: ${name}`);
                    }

                    return {
                        content: [{ type: "text", text: JSON.stringify(resultObj, null, 2) }]
                    };
                } catch (error) {
                    console.error(`Tool execution error [${name}]:`, error.response?.data || error.message);
                    return {
                        isError: true,
                        content: [{ 
                            type: "text", 
                            text: `Error executing SharePoint tool ${name}: ${error.response?.data?.error?.message || error.message}` 
                        }]
                    };
                }
            });

            await mcpServer.connect(transport);
            await transport.handleRequest(reqProxy, res);
            return;
        } catch (mcpError) {
            console.error("MCP stream initialization failure:", mcpError);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: mcpError.message }));
            }
            return;
        }
    }

    // --- Mock / Delegated OAuth 2.0 Endpoints for Gemini Enterprise Registration ---
    if (url.pathname === "/auth") {
        const redirect_uri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        res.statusCode = 302;
        res.setHeader("Location", `${redirect_uri}?code=mock&state=${state}`);
        res.end();
        return;
    }

    if (url.pathname === "/token" || url.pathname === "/oauth/token") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
            access_token: "mock",
            token_type: "Bearer",
            expires_in: 3600,
            refresh_token: "mock_refresh"
        }));
        return;
    }

    if (url.pathname === "/health" || url.pathname === "/") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ 
            status: "healthy",
            service: "sharepoint-mcp-server-purview-label",
            version: "1.0.0",
            purviewExtractionEnabled: true,
            features: [
                "Graph Beta sensitivityLabel facet extraction",
                "SharePoint listItem extended fields extraction",
                "OOXML binary buffer MIP label extraction",
                "Universal page-level citation formatting"
            ],
            timestamp: new Date().toISOString()
        }));
        return;
    }

    res.statusCode = 404;
    res.end("Not Found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SharePoint MCP Purview-Label Server listening on port ${PORT}`);
    console.log(`MCP Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health Endpoint: http://localhost:${PORT}/health`);
});
