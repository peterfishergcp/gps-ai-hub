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
  keepAliveAgent,
  createSharePointHttpServer,
  buildStandardSharePointTools,
  executeStandardSharePointTool,
} = require("./sharepoint_common.js");

const MAX_REGEX_SCAN_CHARS = 500_000;
const ALLOWED_POLICY_HOSTS = new Set(["dlp.googleapis.com", "storage.googleapis.com"]);

// Built-in fail-closed fallback detectors (active alongside dynamic Cloud SDP rules unless disabled)
const BUILTIN_SDP_RULES = [
  {
    name: "US_SOCIAL_SECURITY_NUMBER",
    regex: /\b(?!000|666|9\d\d)\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g,
    returnVerdict: process.env.DEFAULT_PII_VERDICT || "BLOCK",
  },
  {
    name: "SOURCE_SELECTION_FAR_3_104",
    regex: /SOURCE\s+SELECTION\s+INFORMATION[\s\S]{0,120}FAR\s+2\.101/gi,
    returnVerdict: "BLOCK",
  },
];

// Dynamic SDP Content Policy state (internal only — never exposed on /health per S-07)
const cachedPolicyState = {
  policyName: process.env.SDP_CONTENT_POLICY || null,
  projectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "",
  location: process.env.GE_LOCATION || "us",
  guidToInfoTypeMap: new Map(),
  regexRules: [],
  lastFetched: 0,
  ttlMs: 5 * 60 * 1000,
};

/**
 * Validates and resolves remote SDP policy URLs strictly to trusted Google Cloud APIs
 * before attaching Cloud Run metadata Bearer tokens (S-07 / CWE-918 SSRF & token leak fix).
 */
function resolveAllowedPolicyUrl(policyResourceName) {
  const trimmed = String(policyResourceName || "").trim();
  if (!trimmed) {
    throw new Error("Empty SDP_CONTENT_POLICY value.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || !ALLOWED_POLICY_HOSTS.has(parsed.hostname.toLowerCase())) {
      throw new Error(
        `Blocked untrusted SDP_CONTENT_POLICY URL host '${parsed.hostname}'. Remote policy URLs must use https://dlp.googleapis.com/ or https://storage.googleapis.com/.`
      );
    }
    return parsed.toString();
  }

  if (!/^projects\/[a-z0-9._:-]+\/locations\/[a-z0-9-]+\/contentPolicies\/[a-zA-Z0-9._-]+$/i.test(trimmed)) {
    throw new Error("Invalid SDP_CONTENT_POLICY resource path format.");
  }
  return `https://dlp.googleapis.com/v2/${trimmed}`;
}

async function getGcpAccessToken() {
  try {
    const metaRes = await axios.get(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: { "Metadata-Flavor": "Google" },
        timeout: 1500,
      }
    );
    if (metaRes.data?.access_token) {
      return metaRes.data.access_token;
    }
  } catch {
    // Non-GCP local environment
  }
  return process.env.GCP_ACCESS_TOKEN || null;
}

async function resolveConnectorSdpPolicy(gcpToken) {
  if (process.env.SDP_CONTENT_POLICY) {
    return process.env.SDP_CONTENT_POLICY;
  }
  if (!gcpToken || !cachedPolicyState.projectId) {
    return null;
  }

  const location = cachedPolicyState.location;
  if (!/^[a-z0-9-]+$/i.test(location)) {
    return null;
  }

  try {
    const endpoint = `https://${location}-discoveryengine.googleapis.com/v1alpha/projects/${encodeURIComponent(
      cachedPolicyState.projectId
    )}/locations/${encodeURIComponent(location)}/collections/default_collection/dataStores`;
    const res = await axios.get(endpoint, {
      httpsAgent: keepAliveAgent,
      headers: {
        Authorization: `Bearer ${gcpToken}`,
        "X-Goog-User-Project": cachedPolicyState.projectId,
      },
      timeout: 5000,
    });
    const mcpStore = (res.data?.dataStores || []).find(
      (ds) =>
        ds.dataProtectionPolicy?.sensitiveDataProtectionPolicy?.policy &&
        (String(ds.name || "").includes("mcp") || String(ds.name || "").includes("sharepoint"))
    );
    return mcpStore?.dataProtectionPolicy?.sensitiveDataProtectionPolicy?.policy || null;
  } catch (err) {
    console.error(JSON.stringify({ event: "sdp_datastore_discovery_warning", message: err.message }));
    return null;
  }
}

async function refreshSdpContentPolicy(force = false) {
  const now = Date.now();
  if (
    !force &&
    now - cachedPolicyState.lastFetched < cachedPolicyState.ttlMs &&
    (cachedPolicyState.guidToInfoTypeMap.size > 0 || cachedPolicyState.regexRules.length > 0)
  ) {
    return cachedPolicyState;
  }

  const gcpToken = await getGcpAccessToken();
  if (!gcpToken) {
    return cachedPolicyState;
  }

  let policyResourceName = cachedPolicyState.policyName;
  if (!policyResourceName) {
    policyResourceName = await resolveConnectorSdpPolicy(gcpToken);
    if (policyResourceName) cachedPolicyState.policyName = policyResourceName;
  }
  if (!policyResourceName) {
    return cachedPolicyState;
  }

  try {
    const safeUrl = resolveAllowedPolicyUrl(policyResourceName);
    const headers = { Authorization: `Bearer ${gcpToken}` };
    if (cachedPolicyState.projectId) {
      headers["X-Goog-User-Project"] = cachedPolicyState.projectId;
    }

    const res = await axios.get(safeUrl, {
      httpsAgent: keepAliveAgent,
      headers,
      timeout: 5000,
      maxContentLength: 2 * 1024 * 1024,
    });

    const policyData = res.data || {};
    const newGuidMap = new Map();
    const newRegexRules = [];
    const infoTypeVerdicts = new Map();

    for (const rule of policyData.rules || []) {
      const verdict = rule.action?.returnVerdict || "BLOCK";
      for (const cond of rule.conditions || []) {
        const names = cond.infoTypeCondition?.infoTypes?.infoTypeNames || [];
        for (const n of names) {
          infoTypeVerdicts.set(n, verdict);
        }
      }
    }

    for (const customInfo of policyData.inspectConfig?.customInfoTypes || []) {
      const infoName = customInfo.infoType?.name || "CUSTOM_SENSITIVITY_LABEL";
      const verdict = infoTypeVerdicts.get(infoName) || "BLOCK";

      const rawGuid = customInfo.fileLabelInfoType?.sensitivityLabel?.guid;
      if (rawGuid) {
        const guid = String(rawGuid).toLowerCase().trim();
        newGuidMap.set(guid, {
          guid,
          infoTypeName: infoName,
          displayName: infoName.replace(/_/g, " "),
          returnVerdict: verdict,
        });
      }

      const rawPattern = customInfo.regex?.pattern;
      if (rawPattern && String(rawPattern).length <= 512) {
        try {
          newRegexRules.push({
            name: infoName,
            regex: new RegExp(String(rawPattern).replace(/^\(\?i\)/, ""), "gi"),
            returnVerdict: verdict,
          });
        } catch (reErr) {
          console.error(JSON.stringify({ event: "sdp_regex_compile_warning", rule: infoName, message: reErr.message }));
        }
      }
    }

    cachedPolicyState.guidToInfoTypeMap = newGuidMap;
    cachedPolicyState.regexRules = newRegexRules;
    cachedPolicyState.lastFetched = now;
  } catch (err) {
    console.error(JSON.stringify({ event: "sdp_policy_refresh_warning", message: err.message }));
  }

  return cachedPolicyState;
}

/**
 * Evaluates extracted document text + inflated Purview sensitivity label metadata
 * against dynamic SDP rules and built-in detectors, enforcing fail-closed BLOCK withholding
 * or MASK redaction while preserving MSIP label fields (fixes S-07).
 */
function evaluateSdpVerdict({ itemData, extractedText, labelInfo }) {
  const activeRules = [
    ...(process.env.ENABLE_BUILTIN_SDP_DETECTORS === "false" ? [] : BUILTIN_SDP_RULES),
    ...cachedPolicyState.regexRules,
  ];

  const matchedBlockReasons = [];
  const matchedMaskRules = [];
  let effectiveLabel = labelInfo || null;

  // 1. Evaluate Purview Sensitivity Label GUID verdict
  if (effectiveLabel?.guid) {
    const mapped = cachedPolicyState.guidToInfoTypeMap.get(effectiveLabel.guid);
    const labelVerdict = mapped?.returnVerdict || effectiveLabel.returnVerdict;
    if (mapped) {
      effectiveLabel = {
        ...effectiveLabel,
        infoTypeName: mapped.infoTypeName,
        displayName: effectiveLabel.displayName || mapped.displayName,
        returnVerdict: labelVerdict,
      };
    }
    if (labelVerdict === "BLOCK") {
      matchedBlockReasons.push(effectiveLabel.infoTypeName || effectiveLabel.displayName || effectiveLabel.guid);
    }
  } else if (effectiveLabel?.returnVerdict === "BLOCK") {
    matchedBlockReasons.push(effectiveLabel.infoTypeName || effectiveLabel.displayName || "SENSITIVITY_LABEL");
  }

  // 2. Evaluate Content & Filename Regex Rules on bounded text slice
  const boundedText = String(extractedText || "").slice(0, MAX_REGEX_SCAN_CHARS);
  const itemName = String(itemData?.name || "").slice(0, 512);

  for (const rule of activeRules) {
    const flags = rule.regex.flags.includes("g") ? rule.regex.flags : `${rule.regex.flags}g`;
    const tester = new RegExp(rule.regex.source, flags);
    if (tester.test(itemName) || new RegExp(rule.regex.source, flags).test(boundedText)) {
      if (String(rule.returnVerdict).toUpperCase() === "MASK" || String(rule.returnVerdict).toUpperCase() === "REDACT") {
        matchedMaskRules.push(rule);
      } else {
        matchedBlockReasons.push(rule.name);
      }
    }
  }

  // 3. Fail-Closed BLOCK Verdict: Withhold 100% of sensitive document text (S-07 Bug #1 fix)
  if (matchedBlockReasons.length > 0) {
    const uniqueReasons = Array.from(new Set(matchedBlockReasons));
    return {
      blocked: true,
      labelInfo: effectiveLabel,
      content: `[ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY: Restricted classification or sensitive InfoType matched (${uniqueReasons.join(
        ", "
      )}). Document content has been withheld.]`,
    };
  }

  // 4. MASK / REDACT Verdict: Scrub matched tokens in-place before returning
  if (matchedMaskRules.length > 0) {
    let masked = String(extractedText || "");
    for (const rule of matchedMaskRules) {
      const flags = rule.regex.flags.includes("g") ? rule.regex.flags : `${rule.regex.flags}g`;
      masked = masked.replace(new RegExp(rule.regex.source, flags), `[REDACTED:${rule.name}]`);
    }
    return {
      blocked: false,
      labelInfo: effectiveLabel,
      content: masked,
    };
  }

  return {
    blocked: false,
    labelInfo: effectiveLabel,
    content: extractedText,
  };
}

const SERVER_INSTRUCTIONS = `
SharePoint & Dynamic Sensitive Data Protection (SDP) MCP Connector Guidelines:

1. MANDATORY PAGE-LEVEL CITATION REQUIREMENT:
   - Every response derived from SharePoint documents MUST include clickable citations using the item's 'webUrl'.
   - For PDF files ('.pdf'), strip '?web=1' and append '#page=N': [Q3 Financial Report (Page 7)](https://<YOUR_TENANT>.sharepoint.com/sites/Finance/Shared%20Documents/Q3_Report.pdf#page=7).
   - For Office files ('.docx', '.xlsx', '.pptx'), keep '?web=1' so links open in SharePoint Web Viewer.

2. SENSITIVITY LABELS & DATA PROTECTION ENFORCEMENT:
   - Documents matching a restricted Microsoft Purview Sensitivity Label GUID or Sensitive Data Protection (SDP) Content Policy InfoType (e.g., '<YOUR_CONTENT_POLICY_ID>' / 'CUSTOM_PURVIEW_LABEL') are withheld server-side ('blocked: true') and emit native 'msip_labels' and 'assigned_labels' metadata for audit logging.
   - Never fabricate or guess withheld content when a document returns an SDP BLOCK notice.
`.trim();

const TOOLS = buildStandardSharePointTools({ includeWriteTools: true });

const app = createSharePointHttpServer({
  serviceName: "sharepoint-mcp-server-purview-sdp",
  version: "2.1.0",
  defaultAllowAppCredentials: false,
  buildMcpServer(authContext) {
    // Refresh SDP policy asynchronously in background without exposing policy internals on /health
    refreshSdpContentPolicy(false).catch(() => {});

    const mcpServer = new Server(
      { name: "sharepoint-mcp-server-purview-sdp", version: "2.1.0" },
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
          enablePurviewLabels: true,
          guidToInfoTypeMap: cachedPolicyState.guidToInfoTypeMap,
          evaluateSdpVerdict,
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

if (require.main === module) {
  refreshSdpContentPolicy(true).catch(() => {});
  app.start(Number(process.env.PORT) || 8080);
}

module.exports = {
  app,
  resolveAllowedPolicyUrl,
  evaluateSdpVerdict,
};
