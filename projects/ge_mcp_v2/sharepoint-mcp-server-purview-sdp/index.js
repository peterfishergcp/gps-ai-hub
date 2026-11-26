// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

"use strict";

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
const path = require("path");
const axios = require("axios");
const {
  keepAliveAgent,
  createSharePointHttpServer,
  buildStandardSharePointTools,
  executeStandardSharePointTool,
} = require("./sharepoint_common.js");
const {
  buildSharePointV2Tools,
  createSharePointV2McpInstance,
} = require("./sharepoint_v2_wrapper.js");

const MAX_REGEX_WINDOW_CHARS = 250_000;
const REGEX_WINDOW_OVERLAP_CHARS = 512;
const MAX_TOTAL_INSPECTABLE_CHARS = 2_000_000;
const ALLOWED_POLICY_HOSTS = new Set(["dlp.googleapis.com", "storage.googleapis.com"]);

function isSafeRegexPattern(rawPattern) {
  if (typeof rawPattern !== "string" || rawPattern.length === 0 || rawPattern.length > 512) {
    return false;
  }
  if (/\\[1-9]/.test(rawPattern) || /\(\?<[=!]/.test(rawPattern)) {
    return false;
  }
  let groupDepth = 0;
  const groupHasQuantifier = [];
  for (let i = 0; i < rawPattern.length; i++) {
    const ch = rawPattern[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (ch === "[") {
      while (i + 1 < rawPattern.length && rawPattern[i + 1] !== "]") {
        if (rawPattern[i + 1] === "\\") i += 1;
        i += 1;
      }
      continue;
    }
    if (ch === "(") {
      groupDepth += 1;
      groupHasQuantifier.push(false);
    } else if (ch === ")" && groupDepth > 0) {
      const innerHadQuant = groupHasQuantifier.pop();
      groupDepth -= 1;
      const next = rawPattern[i + 1] || "";
      const outerQuant = next === "+" || next === "*" || next === "{";
      if (innerHadQuant && outerQuant) return false;
      if ((innerHadQuant || outerQuant) && groupDepth > 0) {
        groupHasQuantifier[groupDepth - 1] = true;
      }
    } else if ((ch === "+" || ch === "*" || ch === "{") && groupDepth > 0) {
      groupHasQuantifier[groupDepth - 1] = true;
    }
  }
  return true;
}

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

const cachedPolicyState = {
  policyName: process.env.SDP_CONTENT_POLICY || null,
  projectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "",
  location: process.env.GE_LOCATION || "us",
  guidToInfoTypeMap: new Map(),
  regexRules: [],
  lastFetched: 0,
  ttlMs: 5 * 60 * 1000,
};

function resolveAllowedPolicyUrl(policyResourceName) {
  const trimmed = String(policyResourceName || "").trim();
  if (!trimmed) throw new Error("Empty SDP_CONTENT_POLICY value.");
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
      { headers: { "Metadata-Flavor": "Google" }, timeout: 1500 }
    );
    if (metaRes.data?.access_token) return metaRes.data.access_token;
  } catch {
    // Local environment
  }
  return process.env.GCP_ACCESS_TOKEN || null;
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
  if (!gcpToken || !cachedPolicyState.policyName) return cachedPolicyState;

  try {
    const safeUrl = resolveAllowedPolicyUrl(cachedPolicyState.policyName);
    const headers = { Authorization: `Bearer ${gcpToken}` };
    if (cachedPolicyState.projectId) headers["X-Goog-User-Project"] = cachedPolicyState.projectId;

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
        for (const n of cond.infoTypeCondition?.infoTypes?.infoTypeNames || []) {
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
      if (rawPattern) {
        const cleaned = String(rawPattern).replace(/^\(\?i\)/, "");
        if (isSafeRegexPattern(cleaned)) {
          try {
            newRegexRules.push({ name: infoName, regex: new RegExp(cleaned, "gi"), returnVerdict: verdict });
          } catch {}
        }
      }
    }

    cachedPolicyState.guidToInfoTypeMap = newGuidMap;
    cachedPolicyState.regexRules = newRegexRules;
    cachedPolicyState.lastFetched = now;
  } catch {}
  return cachedPolicyState;
}

function evaluateSdpVerdict({ itemData, extractedText, labelInfo }) {
  const activeRules = [
    ...(process.env.ENABLE_BUILTIN_SDP_DETECTORS === "false" ? [] : BUILTIN_SDP_RULES),
    ...cachedPolicyState.regexRules,
  ];
  const matchedBlockReasons = [];
  const matchedMaskRules = [];
  let effectiveLabel = labelInfo || null;

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

  const fullText = String(extractedText || "");
  if (fullText.length > MAX_TOTAL_INSPECTABLE_CHARS) {
    return {
      blocked: true,
      labelInfo: effectiveLabel,
      content: `[ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY: Extracted document length (${fullText.length} chars) exceeds maximum fail-closed DLP inspection limit (${MAX_TOTAL_INSPECTABLE_CHARS} chars). Content withheld.]`,
    };
  }

  const itemName = String(itemData?.name || "").slice(0, 512);
  const windows = [];
  if (fullText.length <= MAX_REGEX_WINDOW_CHARS) {
    windows.push(fullText);
  } else {
    const step = MAX_REGEX_WINDOW_CHARS - REGEX_WINDOW_OVERLAP_CHARS;
    for (let offset = 0; offset < fullText.length; offset += step) {
      windows.push(fullText.slice(offset, offset + MAX_REGEX_WINDOW_CHARS));
    }
  }

  for (const rule of activeRules) {
    const flags = rule.regex.flags.includes("g") ? rule.regex.flags : `${rule.regex.flags}g`;
    let hit = new RegExp(rule.regex.source, flags).test(itemName);
    if (!hit) {
      for (const w of windows) {
        if (new RegExp(rule.regex.source, flags).test(w)) {
          hit = true;
          break;
        }
      }
    }
    if (hit) {
      if (["MASK", "REDACT"].includes(String(rule.returnVerdict).toUpperCase())) {
        matchedMaskRules.push(rule);
      } else {
        matchedBlockReasons.push(rule.name);
      }
    }
  }

  if (matchedBlockReasons.length > 0) {
    const reasons = Array.from(new Set(matchedBlockReasons));
    return {
      blocked: true,
      labelInfo: effectiveLabel,
      content: `[ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY: Restricted classification or sensitive InfoType matched (${reasons.join(
        ", "
      )}). Document content has been withheld.]`,
    };
  }

  if (matchedMaskRules.length > 0) {
    let masked = fullText;
    for (const rule of matchedMaskRules) {
      const flags = rule.regex.flags.includes("g") ? rule.regex.flags : `${rule.regex.flags}g`;
      masked = masked.replace(new RegExp(rule.regex.source, flags), `[REDACTED:${rule.name}]`);
    }
    return { blocked: false, labelInfo: effectiveLabel, content: masked };
  }

  return { blocked: false, labelInfo: effectiveLabel, content: fullText };
}

const APP_CONFIG = {
  appUri: "ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html",
  launcherName: "open_purview_sdp_governance_matrix",
  launcherTitle: "Purview + Cloud SDP Matrix",
  appTitle: "Purview & Cloud SDP Governance Matrix",
  brandBadge: "MCP v2.0 • Fail-Closed DLP",
  subtitle: "Audit server-side ALLOW / MASK / BLOCK verdicts, MSIP labels, and protected SharePoint items.",
  primaryColor: "#b91c1c",
  primaryLight: "#fef2f2",
  darkPrimaryColor: "#f87171",
  darkPrimaryLight: "#450a0a",
  defaultToolName: "query_file_content_lookup",
  defaultToolParam: "itemId",
  searchPlaceholder: "Inspect file itemId or filename (e.g., Restricted_Policy.docx)...",
  secondaryActionLabel: "Browse Library Items",
  secondaryToolName: "query_library_items_lookup",
  secondaryFields: [
    { name: "driveId", label: "Drive ID or Library Name", placeholder: "Documents" },
    { name: "folderId", label: "Optional Folder Name or ID", placeholder: "root" },
  ],
};

const SERVER_INSTRUCTIONS = `
SharePoint & Dynamic Sensitive Data Protection (SDP) MCP Connector v2.0:
1. Load 'skill://purview-sdp-enforcement/SKILL.md' for mandatory ALLOW/MASK/BLOCK and anti-fabrication rules.
2. Call 'open_purview_sdp_governance_matrix' to open the interactive Purview + Cloud SDP Governance Matrix MCP App.
`.trim();

const TOOLS = buildSharePointV2Tools(
  buildStandardSharePointTools({ includeWriteTools: true }),
  {
    appUri: APP_CONFIG.appUri,
    launcherName: APP_CONFIG.launcherName,
    launcherTitle: APP_CONFIG.launcherTitle,
    launcherDescription:
      "Open the interactive Purview & Cloud SDP Governance Matrix MCP App (ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html).",
  }
);

const app = createSharePointHttpServer({
  serviceName: "sharepoint-mcp-server-purview-sdp",
  version: "2.0.0",
  defaultAllowAppCredentials: false,
  buildMcpServer(authContext, req) {
    refreshSdpContentPolicy(false).catch(() => {});
    return createSharePointV2McpInstance({
      serviceName: "sharepoint-mcp-server-purview-sdp",
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
            guidToInfoTypeMap: cachedPolicyState.guidToInfoTypeMap,
            evaluateSdpVerdict,
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
  refreshSdpContentPolicy(true).catch(() => {});
  app.start(Number(process.env.PORT) || 8080);
}

module.exports = { app, isSafeRegexPattern, resolveAllowedPolicyUrl, evaluateSdpVerdict };
