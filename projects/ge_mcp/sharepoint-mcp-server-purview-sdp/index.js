/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import https from "https";
import { createServer } from "http";
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

axios.defaults.httpsAgent = keepAliveAgent;

// --- Dynamic SDP Content Policy & Purview Label Synchronizer ---
// Cache for resolved policy metadata and sensitivity label GUIDs
let cachedPolicyState = {
    policyName: process.env.SDP_CONTENT_POLICY || null,
    connectorId: process.env.MCP_CONNECTOR_ID || null,
    engineId: process.env.GE_ENGINE_ID || null,
    projectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "ai-hub-459714",
    location: process.env.GE_LOCATION || "us",
    guidToInfoTypeMap: new Map(), // Lowercase GUID -> { infoTypeName, displayName, returnVerdict, regexPatterns }
    regexRules: [],               // [{ name, regex, returnVerdict }]
    lastFetched: 0,
    ttlMs: 5 * 60 * 1000 // Refresh every 5 minutes
};

/**
 * Gets a Google Cloud OAuth2 Access Token using Compute Engine metadata or ADC
 */
async function getGcpAccessToken() {
    // 1. Try Cloud Run / Compute Engine metadata server
    try {
        const metaRes = await axios.get(
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            {
                headers: { "Metadata-Flavor": "Google" },
                timeout: 1500
            }
        );
        if (metaRes.data && metaRes.data.access_token) {
            return metaRes.data.access_token;
        }
    } catch (e) {
        // Not running on GCP or local environment
    }

    // 2. Check environment variable override
    if (process.env.GCP_ACCESS_TOKEN) {
        return process.env.GCP_ACCESS_TOKEN;
    }

    return null;
}

/**
 * Dynamically resolves the SDP Content Policy associated with the Discovery Engine connector
 */
async function resolveConnectorSdpPolicy(gcpToken) {
    if (!gcpToken) return null;

    const projectId = cachedPolicyState.projectId;
    const location = cachedPolicyState.location;
    const authHeaders = {
        Authorization: `Bearer ${gcpToken}`,
        "X-Goog-User-Project": projectId
    };

    // If specific policy is already explicitly set, prioritize it
    if (process.env.SDP_CONTENT_POLICY) {
        return process.env.SDP_CONTENT_POLICY;
    }

    try {
        // 1. Query Discovery Engine dataStores in collection to find custom MCP dataStore
        const endpoint = `https://${location}-discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/default_collection/dataStores`;
        const res = await axios.get(endpoint, { headers: authHeaders, timeout: 5000 });
        const dataStores = res.data.dataStores || [];

        // Find dataStore matching sharepoint / mcp with sensitiveDataProtectionPolicy
        const mcpStore = dataStores.find(ds => 
            ds.dataProtectionPolicy && 
            ds.dataProtectionPolicy.sensitiveDataProtectionPolicy && 
            ds.dataProtectionPolicy.sensitiveDataProtectionPolicy.policy &&
            (ds.name.includes("mcp") || ds.name.includes("sharepoint"))
        );

        if (mcpStore) {
            const policyName = mcpStore.dataProtectionPolicy.sensitiveDataProtectionPolicy.policy;
            console.error(`[SDP RESOLVER] Dynamically discovered SDP Content Policy from dataStore "${mcpStore.name}": ${policyName}`);
            return policyName;
        }
    } catch (err) {
        console.error("[SDP RESOLVER] Failed to resolve connector dataStore from Discovery Engine API:", err.message);
    }

    return null;
}

/**
 * Fetches the SDP Content Policy definition and extracts all Purview GUIDs and regex patterns
 */
async function refreshSdpContentPolicy(force = false) {
    const now = Date.now();
    if (!force && (now - cachedPolicyState.lastFetched < cachedPolicyState.ttlMs) && cachedPolicyState.guidToInfoTypeMap.size > 0) {
        return cachedPolicyState;
    }

    const gcpToken = await getGcpAccessToken();
    if (!gcpToken) {
        console.error("[SDP RESOLVER] No GCP access token available. Operating in standalone fallback mode.");
        return cachedPolicyState;
    }

    // Resolve policy resource path if not already determined
    let policyResourceName = cachedPolicyState.policyName;
    if (!policyResourceName) {
        policyResourceName = await resolveConnectorSdpPolicy(gcpToken);
        if (policyResourceName) cachedPolicyState.policyName = policyResourceName;
    }

    if (!policyResourceName) {
        console.error("[SDP RESOLVER] No SDP Content Policy configured or discovered.");
        return cachedPolicyState;
    }

    // Normalize policy URL path (using official Cloud DLP / SDP API hostname)
    const url = policyResourceName.startsWith("http") 
        ? policyResourceName 
        : `https://dlp.googleapis.com/v2/${policyResourceName}`;

    try {
        console.error(`[SDP RESOLVER] Fetching active SDP Content Policy definition from: ${url}`);
        const res = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${gcpToken}`,
                "X-Goog-User-Project": cachedPolicyState.projectId
            },
            timeout: 5000
        });

        const policyData = res.data;
        const newGuidMap = new Map();
        const newRegexRules = [];

        // Build verdict map from rules
        const infoTypeVerdicts = new Map();
        if (Array.isArray(policyData.rules)) {
            for (const rule of policyData.rules) {
                const verdict = rule.action && rule.action.returnVerdict ? rule.action.returnVerdict : "BLOCK";
                if (Array.isArray(rule.conditions)) {
                    for (const cond of rule.conditions) {
                        const names = (cond.infoTypeCondition && cond.infoTypeCondition.infoTypes && cond.infoTypeCondition.infoTypes.infoTypeNames) || [];
                        for (const name of names) {
                            infoTypeVerdicts.set(name, verdict);
                        }
                    }
                }
            }
        }

        // Parse customInfoTypes in inspectConfig
        if (policyData.inspectConfig && Array.isArray(policyData.inspectConfig.customInfoTypes)) {
            for (const customInfo of policyData.inspectConfig.customInfoTypes) {
                const infoName = customInfo.infoType ? customInfo.infoType.name : "CUSTOM_SENSITIVITY_LABEL";
                const verdict = infoTypeVerdicts.get(infoName) || "BLOCK";

                // Case 1: Sensitivity Label GUID (Purview file label)
                if (customInfo.fileLabelInfoType && customInfo.fileLabelInfoType.sensitivityLabel && customInfo.fileLabelInfoType.sensitivityLabel.guid) {
                    const rawGuid = customInfo.fileLabelInfoType.sensitivityLabel.guid.toLowerCase().trim();
                    newGuidMap.set(rawGuid, {
                        guid: rawGuid,
                        infoTypeName: infoName,
                        displayName: infoName.replace(/_/g, ' '),
                        returnVerdict: verdict
                    });
                    console.error(`[SDP RESOLVER] Loaded Purview Sensitivity Label: GUID "${rawGuid}" -> InfoType "${infoName}" (Verdict: ${verdict})`);
                }

                // Case 2: Regex patterns (e.g. Source Selection FAR clauses)
                if (customInfo.regex && customInfo.regex.pattern) {
                    try {
                        const compiled = new RegExp(customInfo.regex.pattern.replace(/^\(\?i\)/, ''), 'i');
                        newRegexRules.push({
                            name: infoName,
                            regex: compiled,
                            returnVerdict: verdict,
                            pattern: customInfo.regex.pattern
                        });
                        console.error(`[SDP RESOLVER] Loaded Regex Content Rule: InfoType "${infoName}" -> Pattern "${customInfo.regex.pattern}"`);
                    } catch (regexErr) {
                        console.error(`[SDP RESOLVER] Warning: Could not compile regex pattern "${customInfo.regex.pattern}":`, regexErr.message);
                    }
                }
            }
        }

        cachedPolicyState.guidToInfoTypeMap = newGuidMap;
        cachedPolicyState.regexRules = newRegexRules;
        cachedPolicyState.lastFetched = now;
        console.error(`[SDP RESOLVER] Policy refresh complete. Active Purview GUIDs: ${newGuidMap.size}, Regex rules: ${newRegexRules.length}`);
    } catch (err) {
        console.error("[SDP RESOLVER] Error fetching SDP Content Policy details:", err.message);
    }

    return cachedPolicyState;
}

// Initial asynchronous fetch of policy on server startup
refreshSdpContentPolicy(true).catch(e => console.error("[SDP RESOLVER] Initial policy load warning:", e.message));

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
 * Extracts Purview Sensitivity Label metadata from Microsoft Graph item payload
 * Dynamically resolves against all GUIDs registered in the active Google Cloud SDP Content Policy.
 */
function extractSensitivityLabelInfo(itemData, bufferData = null) {
    let labelId = null;
    let labelName = null;
    let protectionEnabled = false;

    // 1. Check Microsoft Graph beta sensitivityLabel facet
    if (itemData && itemData.sensitivityLabel) {
        labelId = itemData.sensitivityLabel.id || null;
        labelName = itemData.sensitivityLabel.displayName || itemData.sensitivityLabel.name || null;
        protectionEnabled = Boolean(itemData.sensitivityLabel.protectionEnabled);
    }

    // 2. Check SharePoint list item extended fields (_SensitivityLabelId, _SensitivityLabel, _ComplianceTag)
    if (!labelId && itemData && itemData.listItem && itemData.listItem.fields) {
        const fields = itemData.listItem.fields;
        labelId = fields._SensitivityLabelId || fields.SensitivityLabelId || fields._SensitivityLabelGUID || null;
        labelName = fields._SensitivityLabel || fields.SensitivityLabel || fields._ComplianceTag || fields.ComplianceTag || null;
    }

    // 3. Check for embedded Microsoft Information Protection (MIP) GUID in Office binary buffer (DOCX, PPTX, XLSX custom.xml)
    if (bufferData && Buffer.isBuffer(bufferData)) {
        try {
            const bufStr = bufferData.toString('utf-8', 0, Math.min(bufferData.length, 500000));
            
            // First check if buffer matches any of our dynamically registered SDP policy GUIDs
            for (const [knownGuid, meta] of cachedPolicyState.guidToInfoTypeMap.entries()) {
                if (bufStr.toLowerCase().includes(knownGuid)) {
                    labelId = knownGuid;
                    labelName = meta.infoTypeName;
                    break;
                }
            }

            // Fallback match standard MSIP_Label_<GUID> pattern
            if (!labelId) {
                const msipMatch = bufStr.match(/MSIP_Label_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                if (msipMatch && msipMatch[1]) {
                    labelId = msipMatch[1].toLowerCase();
                }
            }
        } catch (e) {
            console.error("[PURVIEW EXTRACTION LOG] Buffer inspection error:", e.message);
        }
    }

    // 4. Check dynamic regex rules against item name
    const itemName = itemData && itemData.name ? itemData.name : "";
    if (!labelId) {
        for (const rule of cachedPolicyState.regexRules) {
            if (rule.regex && rule.regex.test(itemName)) {
                console.error(`[SDP REGEX MATCH] Item name "${itemName}" matched SDP regex rule: "${rule.name}"`);
                labelName = rule.name;
                break;
            }
        }
    }

    if (labelId) {
        const normalizedId = labelId.toLowerCase().trim();
        const sdpMatch = cachedPolicyState.guidToInfoTypeMap.get(normalizedId);

        const finalInfoType = sdpMatch ? sdpMatch.infoTypeName : (labelName || "SENSITIVITY_LABEL");
        const finalDisplayName = labelName || (sdpMatch ? sdpMatch.displayName : "Purview Sensitivity Label");

        return {
            guid: normalizedId,
            displayName: finalDisplayName,
            protectionEnabled: protectionEnabled || true,
            infoTypeName: finalInfoType,
            returnVerdict: sdpMatch ? sdpMatch.returnVerdict : "BLOCK"
        };
    }

    if (labelName) {
        return {
            guid: null,
            displayName: labelName,
            protectionEnabled: true,
            infoTypeName: labelName,
            returnVerdict: "BLOCK"
        };
    }

    return null;
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, Accept, X-Goog-Sdp-Policy, X-Goog-Sdp-Label, X-Sdp-Label, X-Sdp-Policy");

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
                name: "sharepoint-mcp-server-purview-sdp",
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
   - When a document contains a Microsoft Purview Sensitivity Label or triggers a Google Cloud Sensitive Data Protection (SDP) Content Policy (e.g. 'purview_cepf' / 'CUSTOM_CEPF_LABEL'), the document summary must indicate the security label status.

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
                                    siteId: { type: "string", description: "Optional site ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_library_items_lookup",
                            description: "Read-only background database lookup to list files, folders, and sensitivity labels inside a library",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
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
                            description: "Read-only background database lookup to query metadata and Purview file labels for a specific item",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_file_content_lookup",
                            description: "Read-only background database lookup to extract text content, metadata, and Microsoft Purview sensitivity labels for a specific item",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_file_download_url_lookup",
                            description: "Read-only background database lookup to generate a secure download URL for a file",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: true
                            }
                        },
                        {
                            name: "query_create_file_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to create a new file with text content.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    parentId: { type: "string", description: "Optional parent folder ID" },
                                    fileName: { type: "string", description: "Optional file name" },
                                    content: { type: "string", description: "Optional file text content" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_create_folder_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to create a new folder.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    parentId: { type: "string", description: "Optional parent folder ID" },
                                    folderName: { type: "string", description: "Optional folder name" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_update_file_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to update or overwrite an existing file with new content.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID to update" },
                                    content: { type: "string", description: "Optional new file text content" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_rename_item_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to rename an item.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID to rename" },
                                    newName: { type: "string", description: "Optional new name for the item" }
                                }
                            },
                            annotations: {
                                destructiveHint: false,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_delete_item_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to delete an item.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID to delete" }
                                }
                            },
                            annotations: {
                                destructiveHint: true,
                                readOnlyHint: false
                            }
                        },
                        {
                            name: "query_move_item_action_lookup",
                            description: "CRITICAL PROMPT RULE: driveId MUST be the alphanumeric GUID retrieved by first calling query_document_libraries_lookup. NEVER pass human-readable words like 'Documents'. Safe action to move an item.",
                            inputSchema: {
                                type: "object",
                                properties: {
                                    driveId: { type: "string", description: "Optional drive ID" },
                                    itemId: { type: "string", description: "Optional item ID to move" },
                                    destinationFolderId: { type: "string", description: "Optional destination folder ID" }
                                }
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
                let { name, arguments: args = {} } = request.params;
                console.error(`Received CallToolRequest for tool: ${name}`);
                
                try {
                    const headers = await getGraphHeaders(req);
                    let resultObj = {};

                    const resolveDriveId = async (inputDriveId, headers) => {
                        if (!inputDriveId) {
                            try {
                                const res = await axios.get(`https://graph.microsoft.com/v1.0/me/drive`, { headers });
                                return res.data.id;
                            } catch(e) {
                                try {
                                    const res = await axios.get(`https://graph.microsoft.com/v1.0/sites/root/drives`, { headers });
                                    return res.data.value[0]?.id || "";
                                } catch (err2) {
                                    return "";
                                }
                            }
                        }
                        if (inputDriveId.length > 20 || inputDriveId.includes('b!')) {
                            return inputDriveId;
                        }
                        console.error(`[RESOLVER] Auto-resolving universal human drive name "${inputDriveId}" across tenant sites...`);
                        try {
                            const meRes = await axios.get(`https://graph.microsoft.com/v1.0/me/drive`, { headers });
                            if (meRes.data && (meRes.data.name.toLowerCase() === inputDriveId.toLowerCase() || inputDriveId.toLowerCase().includes('doc') || inputDriveId.toLowerCase().includes('one'))) {
                                return meRes.data.id;
                            }
                        } catch(e) {}

                        try {
                            const sitesRes = await axios.get(`https://graph.microsoft.com/v1.0/sites?search=`, { headers });
                            const sites = sitesRes.data.value || [];
                            for (const site of sites) {
                                try {
                                    const drivesRes = await axios.get(`https://graph.microsoft.com/v1.0/sites/${site.id}/drives`, { headers });
                                    const matchedDrive = (drivesRes.data.value || []).find(d => d.name.toLowerCase() === inputDriveId.toLowerCase() || d.name.toLowerCase().includes('doc'));
                                    if (matchedDrive) {
                                        console.error(`[RESOLVER] Found matching drive GUID in site "${site.displayName}": ${matchedDrive.id}`);
                                        return matchedDrive.id;
                                    }
                                } catch(ed) {}
                            }
                            const rootDrives = await axios.get(`https://graph.microsoft.com/v1.0/sites/root/drives`, { headers });
                            return rootDrives.data.value[0]?.id || inputDriveId;
                        } catch(e) {
                            return inputDriveId;
                        }
                    };

                    const resolveItemId = async (driveId, inputItemId, headers) => {
                        if (!inputItemId || inputItemId === 'root') return 'root';
                        if (inputItemId.length > 25 || inputItemId.includes('!')) {
                            return inputItemId;
                        }
                        console.error(`[RESOLVER] Auto-resolving human folder/item name "${inputItemId}" in drive "${driveId}" via recursive search...`);
                        try {
                            const res = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/search(q='${encodeURIComponent(inputItemId)}')`, { headers });
                            const items = res.data.value || [];
                            const matched = items.find(i => i.name.toLowerCase() === inputItemId.toLowerCase());
                            if (matched) {
                                console.error(`[RESOLVER] Found exact matching item GUID for "${inputItemId}": ${matched.id}`);
                                return matched.id;
                            }
                            console.error(`[RESOLVER] No exact name match found for "${inputItemId}". Returning input ID.`);
                            return inputItemId;
                        } catch(e) {
                            console.error(`[RESOLVER LOG] Search fallback error:`, e.message);
                            return inputItemId;
                        }
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
                        const siteId = args.siteId || args.SiteId || Object.values(args)[0];
                        const response = await axios.get(`https://graph.microsoft.com/v1.0/sites/${encodeURIComponent(siteId)}/drives`, { headers });
                        const simplified = (response.data.value || []).map(drive => ({
                            id: drive.id,
                            name: drive.name,
                            driveType: drive.driveType
                        }));
                        resultObj = { libraries: simplified };
                    } else if (name === "query_library_items_lookup" || name === "list_library_items") {
                        const rawDriveId = args.driveId || args.DriveId || Object.values(args)[0];
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const folderId = args.folderId || args.FolderId;
                        
                        // Try beta endpoint first to capture sensitivity labels, falling back to v1.0
                        let response;
                        try {
                            const betaEndpoint = folderId
                                ? `https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children?$expand=listItem($expand=fields)`
                                : `https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/root/children?$expand=listItem($expand=fields)`;
                            response = await axios.get(betaEndpoint, { headers });
                        } catch (e) {
                            const v1Endpoint = folderId 
                                ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}/children`
                                : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`;
                            response = await axios.get(v1Endpoint, { headers });
                        }

                        const simplified = (response.data.value || []).map(item => {
                            const labelInfo = extractSensitivityLabelInfo(item);
                            return {
                                id: item.id,
                                name: item.name,
                                type: item.folder ? "folder" : "file",
                                mimeType: item.file ? item.file.mimeType : undefined,
                                size: item.size,
                                webUrl: item.webUrl,
                                // Microsoft Purview Sensitivity Label & File Label Metadata
                                fileLabel: labelInfo ? labelInfo.displayName : null,
                                sensitivityLabel: labelInfo ? {
                                    id: labelInfo.guid,
                                    displayName: labelInfo.displayName,
                                    protectionEnabled: labelInfo.protectionEnabled,
                                    infoTypeName: labelInfo.infoTypeName
                                } : null
                            };
                        });
                        resultObj = { items: simplified };
                    } else if (name === "query_file_metadata_lookup" || name === "get_file_metadata") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const itemId = args.itemId || args.ItemId;
                        
                        let response;
                        try {
                            response = await axios.get(`https://graph.microsoft.com/beta/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$expand=listItem($expand=fields)`, { headers });
                        } catch (e) {
                            response = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        }

                        const labelInfo = extractSensitivityLabelInfo(response.data);
                        resultObj = {
                            id: response.data.id,
                            name: response.data.name,
                            size: response.data.size,
                            webUrl: response.data.webUrl,
                            createdDateTime: response.data.createdDateTime,
                            lastModifiedDateTime: response.data.lastModifiedDateTime,
                            // Purview File Label metadata
                            fileLabel: labelInfo ? labelInfo.displayName : null,
                            sensitivityLabel: labelInfo ? {
                                id: labelInfo.guid,
                                displayName: labelInfo.displayName,
                                protectionEnabled: labelInfo.protectionEnabled,
                                infoTypeName: labelInfo.infoTypeName
                            } : null,
                            purviewSensitivityGuid: labelInfo ? labelInfo.guid : null
                        };
                    } else if (name === "query_file_content_lookup" || name === "download_file_content") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const itemId = args.itemId || args.ItemId;

                        // Retrieve metadata in parallel or sequentially to obtain sensitivity label
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
                        
                        // If document has Purview sensitivity label or matches dynamic SDP policy,
                        // prepend the sensitivity classification banner into the content so SDP text scanning triggers as well
                        let finalContent = extractedText || "No readable text content could be extracted from this document.";
                        if (labelInfo && (labelInfo.guid || labelInfo.infoTypeName)) {
                            const guidStr = labelInfo.guid ? ` (GUID: ${labelInfo.guid})` : '';
                            finalContent = `[CLASSIFICATION: RESTRICTED / PURVIEW SENSITIVITY LABEL: ${labelInfo.displayName}${guidStr} - ACTION VERDICT: ${labelInfo.returnVerdict || 'BLOCK'} - SOURCE SELECTION INFORMATION - SEE FAR 2.101 AND 3.104]

` + finalContent;
                        }

                        resultObj = { 
                            content: finalContent,
                            name: itemMetadata ? itemMetadata.name : undefined,
                            webUrl: itemMetadata ? itemMetadata.webUrl : undefined,
                            fileLabel: labelInfo ? labelInfo.displayName : null,
                            sensitivityLabel: labelInfo ? {
                                id: labelInfo.guid,
                                displayName: labelInfo.displayName,
                                protectionEnabled: labelInfo.protectionEnabled,
                                infoTypeName: labelInfo.infoTypeName
                            } : null,
                            purviewSensitivityGuid: labelInfo ? labelInfo.guid : null
                        };
                    } else if (name === "query_file_download_url_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const itemId = args.itemId || args.ItemId;
                        const response = await axios.get(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        const labelInfo = extractSensitivityLabelInfo(response.data);
                        resultObj = {
                            downloadUrl: response.data['@microsoft.graph.downloadUrl'] || response.data.webUrl,
                            webUrl: response.data.webUrl,
                            name: response.data.name,
                            fileLabel: labelInfo ? labelInfo.displayName : null,
                            sensitivityLabel: labelInfo ? {
                                id: labelInfo.guid,
                                displayName: labelInfo.displayName
                            } : null
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
                        resultObj = {
                            status: "Success",
                            message: `Successfully created file "${fileName}".`,
                            id: response.data.id,
                            webUrl: response.data.webUrl
                        };
                    } else if (name === "query_update_file_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const contentText = args.content || args.Content || "Updated document content.";
                        
                        console.error(`[UPDATE LOG] Updating/overwriting file item "${itemId}"...`);
                        const response = await axios.put(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`, 
                            Buffer.from(contentText, 'utf-8'), 
                            { 
                                headers: {
                                    ...headers,
                                    'Content-Type': 'text/plain'
                                }
                            }
                        );
                        resultObj = {
                            status: "Success",
                            message: `Successfully updated item "${itemId}".`,
                            id: response.data.id,
                            webUrl: response.data.webUrl
                        };
                    } else if (name === "query_create_folder_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawParentId = args.parentId || args.ParentId || "root";
                        const parentId = await resolveItemId(driveId, rawParentId, headers);
                        const folderName = args.folderName || args.FolderName || "New Folder";
                        
                        console.error(`[WRITE LOG] Creating folder "${folderName}" in parent "${parentId}"...`);
                        const endpoint = (parentId === 'root')
                            ? `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/root/children`
                            : `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`;
                        const response = await axios.post(endpoint, {
                            name: folderName,
                            folder: {},
                            "@microsoft.graph.conflictBehavior": "rename"
                        }, { headers });
                        resultObj = {
                            status: "Success",
                            message: `Successfully created folder "${folderName}".`,
                            id: response.data.id,
                            webUrl: response.data.webUrl
                        };
                    } else if (name === "query_rename_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const newName = args.newName || args.NewName || "renamed_item";
                        
                        console.error(`[UPDATE LOG] Renaming item "${itemId}" to "${newName}"...`);
                        const response = await axios.patch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
                            name: newName
                        }, { headers });
                        resultObj = {
                            status: "Success",
                            message: `Successfully renamed item to "${newName}".`,
                            id: response.data.id,
                            webUrl: response.data.webUrl
                        };
                    } else if (name === "query_move_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        const rawDestinationFolderId = args.destinationFolderId || args.DestinationFolderId;
                        const destinationFolderId = await resolveItemId(driveId, rawDestinationFolderId, headers);
                        
                        console.error(`[UPDATE LOG] Moving item "${itemId}" to folder "${destinationFolderId}"...`);
                        const response = await axios.patch(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
                            parentReference: {
                                id: destinationFolderId
                            }
                        }, { headers });
                        resultObj = {
                            status: "Success",
                            message: `Successfully moved item to folder "${destinationFolderId}".`,
                            id: response.data.id,
                            webUrl: response.data.webUrl
                        };
                    } else if (name === "query_delete_item_action_lookup") {
                        const rawDriveId = args.driveId || args.DriveId;
                        const driveId = await resolveDriveId(rawDriveId, headers);
                        const rawItemId = args.itemId || args.ItemId;
                        const itemId = await resolveItemId(driveId, rawItemId, headers);
                        
                        console.error(`[DELETE LOG] Deleting item "${itemId}"...`);
                        await axios.delete(`https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, { headers });
                        resultObj = {
                            status: "Success",
                            message: `Successfully deleted item "${itemId}".`
                        };
                    } else {
                        throw new Error(`Tool not found: ${name}`);
                    }

                    // Simple empty result check
                    const hasNoResults = (
                        (Array.isArray(resultObj.sites) && resultObj.sites.length === 0) ||
                        (Array.isArray(resultObj.libraries) && resultObj.libraries.length === 0) ||
                        (Array.isArray(resultObj.items) && resultObj.items.length === 0)
                    );

                    if (hasNoResults) {
                        return {
                            content: [{
                                type: "text",
                                text: "We didn't receive any query results for your query. Would you try again and be more specific with your query?"
                            }]
                        };
                    }

                    return {
                        content: [{
                            type: "text",
                            text: JSON.stringify(resultObj, null, 2)
                        }]
                    };
                } catch (toolError) {
                    console.error(`Error handling tool ${name}:`, toolError.message);
                    return {
                        content: [{
                            type: "text",
                            text: `Error executing ${name}: ${toolError.message}`
                        }],
                        isError: true
                    };
                }
            });

            await mcpServer.connect(transport);
            await transport.handleRequest(reqProxy, res);
        } catch (error) {
            console.error("Error processing MCP request:", error);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end("Internal Server Error");
            }
        }
        return;
    }

    // Health check endpoint
    // --- Mock / Delegated OAuth 2.0 Endpoints for Gemini Enterprise Registration ---
    if (url.pathname === "/auth") {
        const redirect_uri = url.searchParams.get("redirect_uri");
        const state = url.searchParams.get("state");
        res.statusCode = 302;
        res.setHeader("Location", `${redirect_uri}?code=mock&state=${state}`);
        res.end();
        return;
    }

    if (url.pathname === "/token") {
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
        // Trigger a background refresh if needed
        refreshSdpContentPolicy().catch(() => {});

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ 
            status: "healthy",
            service: "sharepoint-mcp-server-purview-sdp",
            version: "1.1.0",
            sdpContentPolicy: cachedPolicyState.policyName || "auto-discovering",
            dynamicSdpSync: {
                activePurviewGuids: Array.from(cachedPolicyState.guidToInfoTypeMap.keys()),
                activeRegexRules: cachedPolicyState.regexRules.map(r => r.name),
                totalLabelsTracked: cachedPolicyState.guidToInfoTypeMap.size,
                lastPolicySync: cachedPolicyState.lastFetched ? new Date(cachedPolicyState.lastFetched).toISOString() : null
            },
            timestamp: new Date().toISOString()
        }));
        return;
    }

    res.statusCode = 404;
    res.end("Not Found");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`SharePoint MCP Purview-SDP Server listening on port ${PORT}`);
    console.log(`MCP Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`Health Endpoint: http://localhost:${PORT}/health`);
});
