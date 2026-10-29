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

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const path = require("path");
const util = require("util");
const zlib = require("zlib");
const axios = require("axios");
const mammoth = require("mammoth");
const ExcelJS = require("exceljs");
const { extractText, getDocumentProxy } = require("unpdf");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");

const inflateRawAsync = util.promisify(zlib.inflateRaw);

// --- Security & Resource Bounds ---
const MAX_JSON_BODY_BYTES = 1024 * 1024; // 1 MB JSON-RPC payload cap
const DEFAULT_MAX_FILE_BYTES = Number(process.env.MAX_FILE_SIZE_BYTES) || 15 * 1024 * 1024; // 15 MB binary cap
const MAX_ZIP_ENTRIES = 250;
const MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB per XML entry (S-06 zip-bomb cap)
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 25 * 1024 * 1024; // 25 MB cumulative inflation cap
const GRAPH_TIMEOUT_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQ = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 120;
const SESSION_TTL_MS = 3600 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

const DEFAULT_REDIRECT_URIS = [
  "https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html",
  "https://vertexaisearch.cloud.google.com/oauth-redirect",
];

const keepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });

const graphHttp = axios.create({
  httpsAgent: keepAliveAgent,
  timeout: GRAPH_TIMEOUT_MS,
  maxContentLength: DEFAULT_MAX_FILE_BYTES,
  maxBodyLength: DEFAULT_MAX_FILE_BYTES,
});

function resolveSigningSecret() {
  if (process.env.MCP_TOKEN_SIGNING_SECRET && process.env.MCP_TOKEN_SIGNING_SECRET.length >= 32) {
    return process.env.MCP_TOKEN_SIGNING_SECRET;
  }
  return crypto.randomBytes(32).toString("hex");
}
const INSTANCE_SIGNING_SECRET = resolveSigningSecret();

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function timingSafeMatch(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string" || !expected || !actual) {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Input Sanitization & Graph Escaping (S-08 + Path Security) ---
function validateSafeString(val, fieldName = "parameter", maxLen = 512) {
  if (val === undefined || val === null) return "";
  const str = String(val).trim();
  if (str.length > maxLen) {
    throw new Error(`Parameter '${fieldName}' exceeds maximum length (${maxLen}).`);
  }
  if (/[\0\r\n]/.test(str)) {
    throw new Error(`Parameter '${fieldName}' contains invalid control characters.`);
  }
  return str;
}

function encodeGraphSegment(segment, fieldName = "id") {
  const clean = validateSafeString(segment, fieldName, 512);
  if (!clean || clean === "." || clean === ".." || clean.includes("../") || clean.includes("..\\")) {
    throw new Error(`Invalid '${fieldName}': path traversal sequences are prohibited.`);
  }
  return encodeURIComponent(clean);
}

function sanitizeFileName(rawName, defaultName = "document.txt") {
  const clean = validateSafeString(rawName || defaultName, "fileName", 255);
  // Normalize Windows backslashes before path.basename per mandatory-secure-web-skills
  const base = path.posix.basename(clean.replace(/\\/g, "/")).trim();
  if (!base || base === "." || base === ".." || /[<>:"/\\|?*\x00-\x1F]/.test(base)) {
    throw new Error("Invalid file or folder name.");
  }
  return base;
}

function escapeODataString(value) {
  // S-08: Double single quotes inside OData string literals before URL encoding
  return validateSafeString(value, "query", 256).replace(/'/g, "''");
}

function formatSharePointWebUrl(webUrl) {
  if (!webUrl || typeof webUrl !== "string") return webUrl;
  const lower = webUrl.toLowerCase();
  if (lower.endsWith(".pdf") || lower.includes(".pdf?")) {
    return webUrl.replace(/\?web=1(&|$)/i, (_, tail) => (tail ? "?" : "")).replace(/\?$/, "");
  }
  if (/\.(docx|pptx|xlsx)(\?|$)/i.test(lower) && !lower.includes("web=1")) {
    return webUrl.includes("?") ? `${webUrl}&web=1` : `${webUrl}?web=1`;
  }
  return webUrl;
}

// --- Bounded Concurrency Helper (S-06) ---
async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency || 5, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  async function worker() {
    while (cursor < list.length) {
      const idx = cursor++;
      results[idx] = await mapper(list[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

// --- Bounded Async OOXML ZIP XML Reader (S-06 Zip-Bomb Mitigation) ---
// Note: XML entities are decoded purely via deterministic string replacement without external DTD/XXE expansion.
function decodeXmlEntities(xmlText) {
  return String(xmlText)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]{1,7});/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&");
}

async function extractZipXmlEntriesAsync(buffer, entryPredicate) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) return [];
  if (buffer.length > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`Archive exceeds maximum size limit (${DEFAULT_MAX_FILE_BYTES} bytes).`);
  }

  // Locate End of Central Directory (EOCD: PK\x05\x06) within last 65 KB
  const minEocdOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minEocdOffset; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return [];

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive entry count (${totalEntries}) exceeds safety limit (${MAX_ZIP_ENTRIES}).`);
  }
  if (cdOffset + cdSize > buffer.length) {
    return [];
  }

  const results = [];
  let totalUncompressed = 0;
  let ptr = cdOffset;
  let inspected = 0;

  while (ptr + 46 <= cdOffset + cdSize && inspected < totalEntries) {
    if (
      buffer[ptr] !== 0x50 ||
      buffer[ptr + 1] !== 0x4b ||
      buffer[ptr + 2] !== 0x01 ||
      buffer[ptr + 3] !== 0x02
    ) {
      break;
    }
    inspected += 1;

    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const uncompressedSize = buffer.readUInt32LE(ptr + 24);
    const fileNameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    if (ptr + 46 + fileNameLen > buffer.length) break;
    const entryName = buffer.toString("utf8", ptr + 46, ptr + 46 + fileNameLen);
    ptr += 46 + fileNameLen + extraLen + commentLen;

    // Validate zip entry path against traversal
    if (
      !entryName ||
      entryName.includes("..") ||
      entryName.startsWith("/") ||
      entryName.includes("\\") ||
      entryName.includes("\0")
    ) {
      continue;
    }

    if (!entryPredicate(entryName)) continue;

    // Enforce declared uncompressed cap AND actual inflate maxOutputLength cap
    if (uncompressedSize > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES && uncompressedSize !== 0xffffffff) {
      throw new Error(`ZIP entry '${entryName}' exceeds uncompressed limit (${MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES} bytes).`);
    }
    if (localHeaderOffset + 30 > buffer.length) continue;
    if (
      buffer[localHeaderOffset] !== 0x50 ||
      buffer[localHeaderOffset + 1] !== 0x4b ||
      buffer[localHeaderOffset + 2] !== 0x03 ||
      buffer[localHeaderOffset + 3] !== 0x04
    ) {
      continue;
    }

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compressedSize > buffer.length) continue;

    const compressedSlice = buffer.subarray(dataStart, dataStart + compressedSize);
    let inflatedBuf;
    if (compressionMethod === 0) {
      if (compressedSlice.length > MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES) {
        throw new Error(`Stored ZIP entry '${entryName}' exceeds size cap.`);
      }
      inflatedBuf = compressedSlice;
    } else if (compressionMethod === 8) {
      inflatedBuf = await inflateRawAsync(compressedSlice, {
        maxOutputLength: MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
      });
    } else {
      continue;
    }

    totalUncompressed += inflatedBuf.length;
    if (totalUncompressed > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES) {
      throw new Error(`Cumulative uncompressed XML size exceeds ${MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES} bytes.`);
    }

    results.push({ name: entryName, xml: inflatedBuf.toString("utf8") });
  }

  return results;
}

async function extractOoxmlCustomPropertiesAsync(buffer) {
  const entries = await extractZipXmlEntriesAsync(buffer, (entryName) => {
    const lower = entryName.toLowerCase();
    return lower === "docprops/custom.xml" || (lower.startsWith("docprops/") && lower.endsWith(".xml") && lower.includes("custom"));
  });
  return entries.map((e) => e.xml).join("\n");
}

async function extractPptxSlidesTextAsync(buffer) {
  const slideEntries = await extractZipXmlEntriesAsync(buffer, (entryName) =>
    /^ppt\/slides\/slide\d+\.xml$/i.test(entryName)
  );
  if (slideEntries.length === 0) return "";

  slideEntries.sort((a, b) => {
    const numA = Number((a.name.match(/slide(\d+)\.xml/i) || [])[1] || 0);
    const numB = Number((b.name.match(/slide(\d+)\.xml/i) || [])[1] || 0);
    return numA - numB;
  });

  const slidesOut = [];
  for (const entry of slideEntries.slice(0, 150)) {
    const slideNum = Number((entry.name.match(/slide(\d+)\.xml/i) || [])[1] || slidesOut.length + 1);
    const paragraphs = [];
    const pMatches = entry.xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || [entry.xml];
    for (const pXml of pMatches) {
      const runs = [];
      const tRegex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(pXml)) !== null) {
        runs.push(decodeXmlEntities(tMatch[1]));
      }
      const line = runs.join("").trim();
      if (line) paragraphs.push(line);
    }
    if (paragraphs.length > 0) {
      slidesOut.push(`[Slide ${slideNum}]\n${paragraphs.join("\n")}`);
    }
  }
  return slidesOut.join("\n\n");
}

async function extractXlsxTextAsync(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheetsText = [];
  let sheetCount = 0;

  workbook.eachSheet((worksheet) => {
    if (sheetCount >= 20) return;
    sheetCount += 1;
    const rows = [];
    let rowCount = 0;
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (rowCount >= 2000) return;
      rowCount += 1;
      const rawValues = Array.isArray(row.values) ? row.values.slice(1, 51) : [];
      const formattedCells = rawValues.map((cell) => {
        if (cell === null || cell === undefined) return "";
        if (typeof cell === "object") {
          if (cell.text !== undefined) return String(cell.text);
          if (cell.result !== undefined) return String(cell.result);
          if (Array.isArray(cell.richText)) return cell.richText.map((rt) => rt.text || "").join("");
          if (cell instanceof Date) return cell.toISOString();
          return "";
        }
        return String(cell);
      });
      const csvLine = formattedCells
        .map((c) => (c.includes(",") || c.includes('"') || c.includes("\n") ? `"${c.replace(/"/g, '""')}"` : c))
        .join(",");
      if (csvLine.replace(/,/g, "").trim()) {
        rows.push(csvLine);
      }
    });
    if (rows.length > 0) {
      sheetsText.push(`[Sheet: ${worksheet.name}]\n${rows.join("\n")}`);
    }
  });

  return sheetsText.join("\n\n");
}

async function extractPdfTextAsync(buffer) {
  const pdfProxy = await getDocumentProxy(new Uint8Array(buffer));
  const result = await extractText(pdfProxy, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [String(result.text || "")];
  const formattedPages = [];
  for (let i = 0; i < Math.min(pages.length, 300); i++) {
    const pageText = String(pages[i] || "").trim();
    if (pageText) {
      formattedPages.push(`[Page ${i + 1}]\n${pageText}`);
    }
  }
  return formattedPages.join("\n\n");
}

// --- Universal Multi-Format Document Extractor (Fixes C-02 & S-05 & S-06) ---
// TODO(security): Integrate antivirus/CDR scanning prior to ingesting untrusted external binaries if write-uploads accept binary streams.
async function extractDocumentTextAsync(buffer, fileName = "", contentType = "") {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("Expected binary Buffer for document extraction.");
  }
  if (buffer.length > DEFAULT_MAX_FILE_BYTES) {
    throw new Error(`Document size (${buffer.length} bytes) exceeds maximum allowed limit (${DEFAULT_MAX_FILE_BYTES} bytes).`);
  }

  // Detect MS-OFFCRYPTO / OLE2 Purview RMS encrypted container (d0cf11e0a1b11ae1)
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1") {
    return "[Encrypted Microsoft Purview / Azure RMS Office Container (MS-OFFCRYPTO). Delegated RMS decryption rights are required to extract text.]";
  }

  const lowerName = String(fileName || "").toLowerCase();
  const lowerMime = String(contentType || "").toLowerCase();
  const isPdfMagic = buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";

  if (isPdfMagic || lowerName.endsWith(".pdf") || lowerMime.includes("application/pdf")) {
    const pdfText = await extractPdfTextAsync(buffer);
    return pdfText || "[PDF document contains no extractable text layer (scanned image PDF).]";
  }

  if (lowerName.endsWith(".docx") || lowerMime.includes("wordprocessingml")) {
    const res = await mammoth.extractRawText({ buffer });
    return (res.value || "").trim();
  }

  if (lowerName.endsWith(".xlsx") || lowerMime.includes("spreadsheetml") || lowerMime.includes("ms-excel")) {
    const xlsxText = await extractXlsxTextAsync(buffer);
    return xlsxText || "[Spreadsheet contains no non-empty cells.]";
  }

  if (lowerName.endsWith(".pptx") || lowerMime.includes("presentationml") || lowerMime.includes("ms-powerpoint")) {
    const pptxText = await extractPptxSlidesTextAsync(buffer);
    return pptxText || "[Presentation contains no extractable slide text.]";
  }

  if (
    /\.(txt|md|markdown|csv|tsv|json|xml|yaml|yml|log|html|htm)$/i.test(lowerName) ||
    lowerMime.startsWith("text/") ||
    lowerMime.includes("json") ||
    lowerMime.includes("xml")
  ) {
    const raw = buffer.toString("utf8");
    if (lowerName.endsWith(".html") || lowerName.endsWith(".htm") || lowerMime.includes("text/html")) {
      return raw
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return raw;
  }

  const ext = path.extname(lowerName) || lowerMime || "binary";
  return `[Unsupported binary format (${ext}). Supported formats: .docx, .xlsx, .pptx, .pdf, .csv, .txt, .md, .json, .xml, .html]`;
}

// --- 3-Tier Async Purview Sensitivity Label Extractor (Fixes S-06 & S-07) ---
async function extractPurviewLabelAsync(itemData, bufferData = null, guidToInfoTypeMap = null) {
  let labelId = null;
  let labelName = null;
  let protectionEnabled = false;
  let assignmentMethod = null;
  let setDate = null;
  let siteId = null;

  // Tier 1: Microsoft Graph sensitivityLabel facet
  if (itemData && itemData.sensitivityLabel) {
    labelId = itemData.sensitivityLabel.id || itemData.sensitivityLabel.sensitivityLabelId || null;
    labelName = itemData.sensitivityLabel.displayName || itemData.sensitivityLabel.name || null;
    protectionEnabled = Boolean(itemData.sensitivityLabel.protectionEnabled);
    assignmentMethod = itemData.sensitivityLabel.assignmentMethod || null;
  }

  // Tier 2: SharePoint listItem extended fields
  if (!labelId && itemData && itemData.listItem && itemData.listItem.fields) {
    const fields = itemData.listItem.fields;
    labelId = fields._SensitivityLabelId || fields.SensitivityLabelId || fields._SensitivityLabelGUID || null;
    labelName =
      fields._SensitivityLabel || fields.SensitivityLabel || fields._ComplianceTag || fields.ComplianceTag || null;
  }

  // Tier 3: Bounded async decompression of OOXML docProps/custom.xml
  const isZipBuffer =
    Buffer.isBuffer(bufferData) &&
    bufferData.length >= 4 &&
    bufferData[0] === 0x50 &&
    bufferData[1] === 0x4b &&
    bufferData[2] === 0x03 &&
    bufferData[3] === 0x04;

  if (isZipBuffer) {
    try {
      const customXml = await extractOoxmlCustomPropertiesAsync(bufferData);
      if (customXml) {
        if (!labelId && guidToInfoTypeMap instanceof Map && guidToInfoTypeMap.size > 0) {
          const lowerXml = customXml.toLowerCase();
          for (const [knownGuid, meta] of guidToInfoTypeMap.entries()) {
            if (lowerXml.includes(knownGuid)) {
              labelId = knownGuid;
              labelName = labelName || meta.infoTypeName;
              break;
            }
          }
        }

        const msipMatch = customXml.match(
          /MSIP_Label_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
        );
        if (!labelId && msipMatch && msipMatch[1]) {
          labelId = msipMatch[1].toLowerCase();
        }

        const nameMatch = customXml.match(/MSIP_Label_[0-9a-f-]+_Name[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
        if (nameMatch && nameMatch[1]) {
          labelName = decodeXmlEntities(nameMatch[1].trim());
        }

        const enabledMatch = customXml.match(/MSIP_Label_[0-9a-f-]+_Enabled[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
        if (enabledMatch && enabledMatch[1]) {
          protectionEnabled = enabledMatch[1].trim().toLowerCase() === "true";
        }

        const methodMatch = customXml.match(/MSIP_Label_[0-9a-f-]+_Method[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
        if (methodMatch && methodMatch[1]) {
          assignmentMethod = methodMatch[1].trim();
        }

        const dateMatch = customXml.match(/MSIP_Label_[0-9a-f-]+_SetDate[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
        if (dateMatch && dateMatch[1]) {
          setDate = dateMatch[1].trim();
        }

        const siteMatch = customXml.match(/MSIP_Label_[0-9a-f-]+_SiteId[^>]*>\s*<vt:lpwstr>([^<]+)<\/vt:lpwstr>/i);
        if (siteMatch && siteMatch[1]) {
          siteId = siteMatch[1].trim();
        }
      }
    } catch (zipErr) {
      console.error(JSON.stringify({ event: "ooxml_custom_xml_warning", message: zipErr.message }));
    }
  }

  if (!labelId && !labelName) {
    return null;
  }

  const normalizedGuid = labelId ? String(labelId).toLowerCase().trim() : null;
  const sdpMeta =
    normalizedGuid && guidToInfoTypeMap instanceof Map ? guidToInfoTypeMap.get(normalizedGuid) : null;

  const resolvedDisplayName =
    labelName ||
    (sdpMeta ? sdpMeta.displayName : null) ||
    (normalizedGuid ? `Purview Sensitivity Label (${normalizedGuid})` : "Sensitivity Label");

  return {
    id: normalizedGuid,
    guid: normalizedGuid,
    displayName: resolvedDisplayName,
    protectionEnabled: Boolean(protectionEnabled),
    assignmentMethod: assignmentMethod || undefined,
    setDate: setDate || undefined,
    tenantSiteId: siteId || undefined,
    infoTypeName: sdpMeta ? sdpMeta.infoTypeName : labelName || "SENSITIVITY_LABEL",
    returnVerdict: sdpMeta ? sdpMeta.returnVerdict : null,
  };
}

function formatPurviewLabelFields(labelInfo, includeNativeDlpTriggers = true) {
  if (!labelInfo) {
    return {
      fileLabel: null,
      sensitivityLabel: null,
      purviewSensitivityGuid: null,
    };
  }

  const guid = labelInfo.guid || null;
  const displayName = labelInfo.displayName || null;
  const enabledStr = labelInfo.protectionEnabled !== false ? "True" : "False";

  const base = {
    fileLabel: displayName,
    sensitivityLabel: {
      id: guid,
      labelId: guid,
      displayName,
      protectionEnabled: Boolean(labelInfo.protectionEnabled),
      assignmentMethod: labelInfo.assignmentMethod,
      setDate: labelInfo.setDate,
      infoTypeName: labelInfo.infoTypeName,
    },
    purviewSensitivityGuid: guid,
  };

  if (!includeNativeDlpTriggers || !guid) {
    return base;
  }

  const msipParts = [`MSIP_Label_${guid}_Enabled=${enabledStr}`];
  if (displayName) {
    msipParts.push(`MSIP_Label_${guid}_Name=${displayName}`);
  }

  return {
    msip_labels: msipParts.join(";"),
    assigned_labels: [{ labelId: guid, displayName: displayName || "" }],
    assigned_sensitivity_labels: [{ labelId: guid, displayName: displayName || "" }],
    ...base,
  };
}

// --- Hardened OAuth & Streamable HTTP Server Wrapper ---
function createSharePointHttpServer({
  serviceName,
  version = "2.1.0",
  defaultAllowAppCredentials = false,
  buildMcpServer,
  getHealthDetails,
}) {
  const bindHost = process.env.HOST || (process.env.K_SERVICE ? "0.0.0.0" : "127.0.0.1");
  const allowAppCredentials =
    process.env.ALLOW_APP_CREDENTIALS !== undefined
      ? process.env.ALLOW_APP_CREDENTIALS === "true"
      : defaultAllowAppCredentials;
  const allowLocalMockAuth = process.env.ALLOW_LOCAL_MOCK_AUTH === "true";

  const allowedRedirectUris = new Set([
    ...DEFAULT_REDIRECT_URIS,
    ...(process.env.ALLOWED_OAUTH_REDIRECT_URIS || "")
      .split(",")
      .map((u) => u.trim())
      .filter(Boolean),
  ]);

  const allowedCorsOrigins = new Set(
    (process.env.ALLOWED_CORS_ORIGINS || "https://vertexaisearch.cloud.google.com,https://console.cloud.google.com")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  );

  const rateLimitMap = new Map();
  const pendingAuthCodes = new Map();
  let cachedAppToken = null;
  let cachedAppTokenExp = 0;

  const sweepTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
    for (const [code, meta] of pendingAuthCodes.entries()) {
      if (now > meta.expiresAt) pendingAuthCodes.delete(code);
    }
  }, RATE_LIMIT_WINDOW_MS);
  sweepTimer.unref();

  function checkRateLimit(bucketKey) {
    const now = Date.now();
    const existing = rateLimitMap.get(bucketKey);
    if (!existing || now > existing.resetAt) {
      rateLimitMap.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }
    existing.count += 1;
    return existing.count <= RATE_LIMIT_MAX_REQ;
  }

  function issueSessionToken(subject) {
    const payload = Buffer.from(
      JSON.stringify({
        sub: subject,
        svc: serviceName,
        exp: Date.now() + SESSION_TTL_MS,
        nonce: crypto.randomBytes(12).toString("base64url"),
      })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", INSTANCE_SIGNING_SECRET).update(payload).digest("base64url");
    return `mcp_st_${payload}.${sig}`;
  }

  function verifySessionToken(token) {
    if (typeof token !== "string" || !token.startsWith("mcp_st_")) return null;
    const raw = token.slice("mcp_st_".length);
    const dot = raw.indexOf(".");
    if (dot <= 0) return null;
    const payload = raw.slice(0, dot);
    const sig = raw.slice(dot + 1);
    const expectedSig = crypto.createHmac("sha256", INSTANCE_SIGNING_SECRET).update(payload).digest("base64url");
    if (!timingSafeMatch(expectedSig, sig)) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (!parsed.exp || Date.now() > parsed.exp || parsed.svc !== serviceName) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function acquireEntraAppToken() {
    const now = Date.now();
    if (cachedAppToken && now < cachedAppTokenExp - 300_000) {
      return cachedAppToken;
    }
    const tenantId = process.env.MS_GRAPH_TENANT_ID;
    const clientId = process.env.MS_GRAPH_CLIENT_ID;
    const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      throw new Error("Missing MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, or MS_GRAPH_CLIENT_SECRET.");
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });

    const resp = await graphHttp.post(tokenUrl, params.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    cachedAppToken = resp.data.access_token;
    cachedAppTokenExp = now + Number(resp.data.expires_in || 3600) * 1000;
    return cachedAppToken;
  }

  async function resolveGraphAuth(authHeader) {
    const raw = String(authHeader || "").trim();
    const match = /^Bearer\s+(\S+)$/i.exec(raw);
    if (!match) {
      const err = new Error("Unauthorized: Missing Authorization Bearer token.");
      err.statusCode = 401;
      throw err;
    }

    const presented = match[1];

    // Loopback-only deterministic test mode
    if (allowLocalMockAuth && isLoopbackHost(bindHost) && presented === "local-test-token-0000") {
      return {
        isLocalMock: true,
        token: presented,
        headers: { Authorization: `Bearer ${presented}`, Accept: "application/json" },
      };
    }

    // Signed MCP session token (minted by /token after verifying MCP_OAUTH_CLIENT_ID + SECRET)
    if (presented.startsWith("mcp_st_")) {
      if (!allowAppCredentials) {
        const err = new Error("Unauthorized: App-only session tokens are disabled on this server.");
        err.statusCode = 401;
        throw err;
      }
      const verified = verifySessionToken(presented);
      if (!verified) {
        const err = new Error("Unauthorized: Invalid or expired session token.");
        err.statusCode = 401;
        throw err;
      }
      if (allowLocalMockAuth && isLoopbackHost(bindHost)) {
        return {
          isLocalMock: true,
          token: "local-mock-app-token",
          headers: { Authorization: "Bearer local-mock-app-token", Accept: "application/json" },
        };
      }
      const appToken = await acquireEntraAppToken();
      return {
        isLocalMock: false,
        token: appToken,
        headers: { Authorization: `Bearer ${appToken}`, Accept: "application/json" },
      };
    }

    // Real Microsoft Entra ID / OAuth 2.0 JWT (3 dot-separated base64url segments)
    if (
      presented.split(".").length === 3 &&
      presented.length >= 64 &&
      !presented.toLowerCase().includes("mock")
    ) {
      return {
        isLocalMock: false,
        token: presented,
        headers: { Authorization: `Bearer ${presented}`, Accept: "application/json" },
      };
    }

    const err = new Error("Unauthorized: Invalid Bearer token.");
    err.statusCode = 401;
    throw err;
  }

  function applySecurityHeaders(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cache-Control", "no-store");

    const origin = req.headers.origin;
    if (origin && allowedCorsOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Authorization, Accept"
      );
    }
  }

  function readBoundedBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let total = 0;
      let aborted = false;
      req.on("data", (chunk) => {
        if (aborted) return;
        total += chunk.length;
        if (total > maxBytes) {
          aborted = true;
          const err = new Error("Payload Too Large");
          err.statusCode = 413;
          req.destroy();
          reject(err);
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        if (!aborted) resolve(Buffer.concat(chunks).toString("utf8"));
      });
      req.on("error", (err) => {
        if (!aborted) reject(err);
      });
    });
  }

  const httpServer = http.createServer(async (req, res) => {
    applySecurityHeaders(req, res);

    // Rate limit per caller token hash or forwarded client IP (fixes S-10 shared GFE proxy bucket)
    const authDigest = req.headers.authorization
      ? crypto.createHash("sha256").update(String(req.headers.authorization)).digest("hex").slice(0, 16)
      : "";
    const forwardedIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
      .split(",")[0]
      .trim();
    const bucketKey = authDigest ? `tok:${authDigest}` : `ip:${forwardedIp}`;

    if (!checkRateLimit(bucketKey)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Too many requests" }));
    }

    if (!["GET", "POST", "DELETE", "OPTIONS"].includes(req.method || "")) {
      res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST, DELETE, OPTIONS" });
      return res.end(JSON.stringify({ error: "Method Not Allowed" }));
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    let reqUrl;
    let pathname;
    try {
      reqUrl = new URL(req.url || "/", "http://localhost");
      pathname = decodeURIComponent(reqUrl.pathname).trim().replace(/\/+$/, "") || "/";
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Malformed request URI" }));
    }

    // 1. Scrubbed Health Endpoint
    if (req.method === "GET" && (pathname === "/" || pathname === "/health" || pathname === "/healthz")) {
      const extra = typeof getHealthDetails === "function" ? getHealthDetails() : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "ok", service: serviceName, version, ...extra }));
    }

    // 2. Hardened OAuth /auth Endpoint (S-04: exact-match redirect_uri allowlist)
    if (req.method === "GET" && pathname === "/auth") {
      const redirectUri = (reqUrl.searchParams.get("redirect_uri") || "").trim();
      const state = reqUrl.searchParams.get("state") || "";
      const clientId = (reqUrl.searchParams.get("client_id") || "").trim();

      if (!redirectUri || !allowedRedirectUris.has(redirectUri)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid or unauthorized redirect_uri." }));
      }

      if (!allowAppCredentials) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            error:
              "Built-in OAuth helper is disabled. Configure Gemini Enterprise directly with Microsoft Entra ID OAuth 2.0 endpoints.",
          })
        );
      }

      const expectedClientId = process.env.MCP_OAUTH_CLIENT_ID || process.env.MS_GRAPH_CLIENT_ID || "";
      if (!expectedClientId || !timingSafeMatch(expectedClientId, clientId)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Invalid client_id." }));
      }

      const code = crypto.randomBytes(24).toString("base64url");
      if (pendingAuthCodes.size >= 500) {
        const oldest = pendingAuthCodes.keys().next().value;
        if (oldest) pendingAuthCodes.delete(oldest);
      }
      pendingAuthCodes.set(code, { redirectUri, expiresAt: Date.now() + AUTH_CODE_TTL_MS });

      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      if (state) target.searchParams.set("state", state);

      res.writeHead(302, { Location: target.toString() });
      return res.end();
    }

    // 3. Hardened OAuth /token Endpoint (S-01: requires verified client credentials, issues HMAC session token)
    if (req.method === "POST" && pathname === "/token") {
      if (!allowAppCredentials) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Built-in token endpoint is disabled. Use Microsoft Entra ID OAuth 2.0." }));
      }

      let rawBody;
      try {
        rawBody = await readBoundedBody(req, 64 * 1024);
      } catch (err) {
        res.writeHead(err.statusCode || 400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: err.message }));
      }

      let params = new URLSearchParams(rawBody);
      if ((req.headers["content-type"] || "").includes("application/json")) {
        try {
          params = new URLSearchParams(JSON.parse(rawBody));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Invalid JSON payload" }));
        }
      }

      let clientId = params.get("client_id") || "";
      let clientSecret = params.get("client_secret") || "";
      const basicMatch = /^Basic\s+(\S+)$/i.exec(req.headers.authorization || "");
      if (basicMatch) {
        const decoded = Buffer.from(basicMatch[1], "base64").toString("utf8");
        const sep = decoded.indexOf(":");
        if (sep >= 0) {
          clientId = decodeURIComponent(decoded.slice(0, sep));
          clientSecret = decodeURIComponent(decoded.slice(sep + 1));
        }
      }

      const expectedId = process.env.MCP_OAUTH_CLIENT_ID || process.env.MS_GRAPH_CLIENT_ID || "";
      const expectedSecret = process.env.MCP_OAUTH_CLIENT_SECRET || process.env.MS_GRAPH_CLIENT_SECRET || "";
      if (!timingSafeMatch(expectedId, clientId) || !timingSafeMatch(expectedSecret, clientSecret)) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid_client" }));
      }

      const grantType = params.get("grant_type") || "authorization_code";
      if (grantType === "authorization_code") {
        const code = params.get("code") || "";
        const meta = pendingAuthCodes.get(code);
        pendingAuthCodes.delete(code);
        if (!meta || Date.now() > meta.expiresAt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "invalid_grant" }));
        }
      } else if (grantType !== "refresh_token" && grantType !== "client_credentials") {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "unsupported_grant_type" }));
      }

      const sessionToken = issueSessionToken(clientId);
      const refreshToken = issueSessionToken(`${clientId}:refresh`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          access_token: sessionToken,
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: refreshToken,
        })
      );
    }

    // 4. Primary MCP Endpoint (/mcp or /sse)
    if (pathname === "/mcp" || pathname === "/sse") {
      if (Number(req.headers["content-length"] || 0) > MAX_JSON_BODY_BYTES) {
        res.writeHead(413, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Payload Too Large" }));
      }

      let authContext;
      try {
        authContext = await resolveGraphAuth(req.headers.authorization);
      } catch (authErr) {
        res.writeHead(authErr.statusCode || 401, {
          "Content-Type": "application/json",
          "WWW-Authenticate": `Bearer realm="${serviceName}"`,
        });
        return res.end(JSON.stringify({ error: authErr.message }));
      }

      try {
        let parsedBody;
        if (req.method === "POST") {
          const rawBody = await readBoundedBody(req, MAX_JSON_BODY_BYTES);
          parsedBody = JSON.parse(rawBody);
        }

        // Ensure Accept header satisfies @modelcontextprotocol/sdk StreamableHTTPServerTransport behind proxies
        if (!req.headers.accept || !req.headers.accept.includes("text/event-stream")) {
          req.headers.accept = "application/json, text/event-stream";
        }

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        const mcpServer = buildMcpServer(authContext, req);
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
      } catch (err) {
        const statusCode = err.statusCode || (err instanceof SyntaxError ? 400 : 500);
        if (!res.headersSent) {
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: statusCode === 400 ? -32700 : -32603,
                message: statusCode === 413 ? "Payload Too Large" : "MCP request processing error",
              },
              id: null,
            })
          );
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  return {
    httpServer,
    bindHost,
    start(port = Number(process.env.PORT) || 8080) {
      httpServer.listen(port, bindHost, () => {
        console.log(`${serviceName} v${version} listening on http://${bindHost}:${port}/mcp`);
      });
      return httpServer;
    },
  };
}

// --- Shared Standard 12-Tool Schema & Resolver Builders for SharePoint Servers ---
function buildStandardSharePointTools({ includeWriteTools = true, includeSearchFilesTool = false } = {}) {
  const tools = [
    {
      name: "query_sharepoint_sites_lookup",
      description: "Read-only lookup to search or list SharePoint sites accessible to the caller.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Optional search keyword to filter SharePoint sites." },
        },
      },
    },
    {
      name: "query_document_libraries_lookup",
      description: "Read-only lookup to list document library drives within a SharePoint site.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          siteId: { type: "string", description: "Optional SharePoint site ID, URL, or site name." },
        },
      },
    },
    {
      name: "query_library_items_lookup",
      description: "Read-only lookup to list files and folders inside a SharePoint document library or folder.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          driveId: { type: "string", description: "Document library drive ID or library name." },
          folderId: { type: "string", description: "Optional subfolder item ID or folder name (defaults to root)." },
          siteId: { type: "string", description: "Optional SharePoint site ID or name." },
        },
      },
    },
  ];

  if (includeSearchFilesTool) {
    tools.push({
      name: "query_search_files_lookup",
      description: "Read-only search for files and folders by keyword or filename across allowed SharePoint drives.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keyword or filename to search for." },
          siteId: { type: "string", description: "Optional SharePoint site ID or name to scope the search." },
          driveId: { type: "string", description: "Optional document library drive ID." },
        },
        required: ["query"],
      },
    });
  }

  tools.push(
    {
      name: "query_file_metadata_lookup",
      description: "Read-only lookup to retrieve detailed metadata (and sensitivity label metadata if present) for a specific file.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          driveId: { type: "string", description: "Optional document library drive ID." },
          itemId: { type: "string", description: "File item ID or exact filename (e.g., 'Annual_Report.pdf')." },
          siteId: { type: "string", description: "Optional SharePoint site ID." },
        },
        required: ["itemId"],
      },
    },
    {
      name: "query_file_content_lookup",
      description:
        "Read-only lookup to extract text content from Word (.docx), Excel (.xlsx), PowerPoint (.pptx), PDF (.pdf), and text files.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          driveId: { type: "string", description: "Optional document library drive ID." },
          itemId: { type: "string", description: "File item ID or exact filename (e.g., 'Master_Agreement.docx')." },
          siteId: { type: "string", description: "Optional SharePoint site ID." },
        },
        required: ["itemId"],
      },
    },
    {
      name: "query_file_download_url_lookup",
      description: "Read-only lookup to retrieve a short-lived authenticated download URL for a specific SharePoint file.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
      inputSchema: {
        type: "object",
        properties: {
          driveId: { type: "string", description: "Optional document library drive ID." },
          itemId: { type: "string", description: "File item ID or exact filename." },
          siteId: { type: "string", description: "Optional SharePoint site ID." },
        },
        required: ["itemId"],
      },
    }
  );

  if (includeWriteTools) {
    tools.push(
      {
        name: "query_create_file_action_lookup",
        description:
          "Write action to create a new text document in SharePoint. Requires explicit user confirmation in Gemini Enterprise.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            parentId: { type: "string", description: "Optional parent folder ID or 'root'." },
            fileName: { type: "string", description: "Name of the new file (e.g., 'summary.txt')." },
            content: { type: "string", description: "Text content to write into the file." },
          },
          required: ["fileName", "content"],
        },
      },
      {
        name: "query_update_file_action_lookup",
        description:
          "Destructive write action to overwrite an existing SharePoint file's content. Requires explicit user confirmation.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            itemId: { type: "string", description: "Target file item ID or filename to overwrite." },
            content: { type: "string", description: "Updated text content." },
          },
          required: ["itemId", "content"],
        },
      },
      {
        name: "query_create_folder_action_lookup",
        description: "Write action to create a new folder inside a SharePoint document library.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            parentId: { type: "string", description: "Optional parent folder ID or 'root'." },
            folderName: { type: "string", description: "Name of the new folder." },
          },
          required: ["folderName"],
        },
      },
      {
        name: "query_rename_item_action_lookup",
        description: "Destructive write action to rename an existing SharePoint file or folder.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            itemId: { type: "string", description: "Target item ID or filename to rename." },
            newName: { type: "string", description: "New file or folder name." },
          },
          required: ["itemId", "newName"],
        },
      },
      {
        name: "query_delete_item_action_lookup",
        description: "Destructive write action to delete a SharePoint file or folder.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            itemId: { type: "string", description: "Target item ID or filename to delete." },
          },
          required: ["itemId"],
        },
      },
      {
        name: "query_move_item_action_lookup",
        description: "Destructive write action to move a SharePoint file or folder into a destination folder.",
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
        inputSchema: {
          type: "object",
          properties: {
            driveId: { type: "string", description: "Target document library drive ID." },
            itemId: { type: "string", description: "Target item ID or filename to move." },
            destinationFolderId: { type: "string", description: "Destination folder item ID or name." },
          },
          required: ["itemId", "destinationFolderId"],
        },
      }
    );
  }

  return tools;
}

// Smart Graph Drive & Item Resolver with OData single-quote escaping (S-08)
async function resolveTenantDriveAndItem(rawDriveId, rawItemId, headers) {
  const cleanDrive = validateSafeString(rawDriveId, "driveId", 512);
  const cleanItem = validateSafeString(rawItemId, "itemId", 512);

  let resolvedDriveId = cleanDrive;
  if (!resolvedDriveId || (!resolvedDriveId.includes("b!") && resolvedDriveId.length <= 24)) {
    try {
      const meDrive = await graphHttp.get("https://graph.microsoft.com/v1.0/me/drive", { headers });
      if (
        !resolvedDriveId ||
        (meDrive.data?.name && meDrive.data.name.toLowerCase() === resolvedDriveId.toLowerCase())
      ) {
        resolvedDriveId = meDrive.data.id;
      }
    } catch {
      // Fallback to root SharePoint site drives
    }

    if (!resolvedDriveId || (!resolvedDriveId.includes("b!") && resolvedDriveId.length <= 24)) {
      try {
        const rootDrives = await graphHttp.get("https://graph.microsoft.com/v1.0/sites/root/drives", { headers });
        const drives = rootDrives.data?.value || [];
        const matched = resolvedDriveId
          ? drives.find((d) => (d.name || "").toLowerCase() === resolvedDriveId.toLowerCase()) || drives[0]
          : drives[0];
        if (matched?.id) resolvedDriveId = matched.id;
      } catch {
        // Search across accessible SharePoint sites
      }
    }
  }

  if (!cleanItem || cleanItem === "root") {
    return { driveId: resolvedDriveId, itemId: "root" };
  }

  const looksLikeGraphId =
    cleanItem.length > 26 && !cleanItem.includes(" ") && !/\.[a-z0-9]{2,5}$/i.test(cleanItem);
  if (looksLikeGraphId && resolvedDriveId) {
    return { driveId: resolvedDriveId, itemId: cleanItem };
  }

  const safeODataQuery = escapeODataString(cleanItem);
  if (resolvedDriveId) {
    try {
      const searchUrl = `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(
        resolvedDriveId,
        "driveId"
      )}/root/search(q='${encodeURIComponent(safeODataQuery)}')`;
      const res = await graphHttp.get(searchUrl, { headers });
      const candidates = res.data?.value || [];
      const exact = candidates.find((c) => (c.name || "").toLowerCase() === cleanItem.toLowerCase()) || candidates[0];
      if (exact?.id) {
        return {
          driveId: exact.parentReference?.driveId || resolvedDriveId,
          itemId: exact.id,
        };
      }
    } catch {
      // Continue to cross-site search fallback if needed
    }
  }

  try {
    const sitesRes = await graphHttp.get("https://graph.microsoft.com/v1.0/sites?search=*", { headers });
    for (const site of (sitesRes.data?.value || []).slice(0, 10)) {
      const drivesRes = await graphHttp.get(
        `https://graph.microsoft.com/v1.0/sites/${encodeGraphSegment(site.id, "siteId")}/drives`,
        { headers }
      );
      for (const drv of (drivesRes.data?.value || []).slice(0, 5)) {
        const sRes = await graphHttp.get(
          `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(
            drv.id,
            "driveId"
          )}/root/search(q='${encodeURIComponent(safeODataQuery)}')`,
          { headers }
        );
        const items = sRes.data?.value || [];
        const exact = items.find((i) => (i.name || "").toLowerCase() === cleanItem.toLowerCase());
        if (exact?.id) {
          return { driveId: drv.id, itemId: exact.id };
        }
      }
    }
  } catch {
    // Fallback to raw IDs
  }

  return { driveId: resolvedDriveId, itemId: cleanItem };
}

// --- Shared Tool Execution Engine (with Site-Scoping, Purview Label & Fail-Closed SDP Hooks) ---
async function executeStandardSharePointTool({
  name,
  args = {},
  authContext,
  enableWriteTools = true,
  enablePurviewLabels = false,
  guidToInfoTypeMap = null,
  evaluateSdpVerdict = null,
  allowedSiteFilter = null,
}) {
  const { headers, isLocalMock } = authContext;

  // Deterministic loopback mock fixtures for offline CI & test_local.sh verification
  if (isLocalMock) {
    if (name === "query_sharepoint_sites_lookup") {
      const q = escapeODataString(args.query || "");
      return {
        sites: [
          {
            id: "example.sharepoint.com,00000000-0000-0000-0000-000000000001,00000000-0000-0000-0000-000000000002",
            name: "Finance",
            webUrl: "https://example.sharepoint.com/sites/Finance",
            mockQuery: q,
          },
        ],
      };
    }
    if (name === "query_document_libraries_lookup") {
      return {
        libraries: [{ id: "b!mockDriveId00000000000000001", name: "Documents", driveType: "documentLibrary" }],
      };
    }
    if (name === "query_file_content_lookup") {
      const reqItem = validateSafeString(args.itemId, "itemId", 512);
      if (!reqItem) throw new Error("Parameter 'itemId' is required.");
      // Construct a real deflated OOXML ZIP buffer when testing Purview / SDP locally
      const isRestrictedTest = reqItem.toLowerCase().includes("restricted");
      const mockText = isRestrictedTest
        ? "TOP SECRET RECORD - US SSN 123-45-6789 - SOURCE SELECTION INFORMATION SEE FAR 2.101"
        : "Public Quarterly Summary: Cloud modernization milestones are on schedule.";
      const mockLabel = isRestrictedTest
        ? {
            id: "11111111-2222-3333-4444-555555555555",
            guid: "11111111-2222-3333-4444-555555555555",
            displayName: "Restricted-Confidential",
            protectionEnabled: true,
            infoTypeName: "CUSTOM_PURVIEW_LABEL",
            returnVerdict: "BLOCK",
          }
        : null;

      let finalContent = mockText;
      let effectiveLabel = mockLabel;
      let sdpBlocked = false;

      if (typeof evaluateSdpVerdict === "function") {
        const verdictResult = evaluateSdpVerdict({
          itemData: { id: reqItem, name: reqItem },
          extractedText: mockText,
          labelInfo: mockLabel,
        });
        finalContent = verdictResult.content;
        effectiveLabel = verdictResult.labelInfo || mockLabel;
        sdpBlocked = Boolean(verdictResult.blocked);
      }

      return {
        content: finalContent,
        blocked: sdpBlocked || undefined,
        name: reqItem,
        webUrl: formatSharePointWebUrl(`https://example.sharepoint.com/sites/Finance/Shared%20Documents/${encodeURIComponent(reqItem)}`),
        ...(enablePurviewLabels ? formatPurviewLabelFields(effectiveLabel, true) : {}),
      };
    }
    return { mock: true, tool: name, args };
  }

  // 1. Search SharePoint Sites
  if (name === "query_sharepoint_sites_lookup") {
    const query = validateSafeString(args.query || "*", "query", 256) || "*";
    const resp = await graphHttp.get(
      `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(query)}`,
      { headers }
    );
    let sites = (resp.data?.value || []).map((site) => ({
      id: site.id,
      name: site.displayName || site.name,
      webUrl: site.webUrl,
      description: site.description || "",
    }));
    if (typeof allowedSiteFilter === "function") {
      sites = sites.filter(allowedSiteFilter);
    }
    return { sites };
  }

  // 2. List Document Libraries
  if (name === "query_document_libraries_lookup") {
    const rawSiteId = validateSafeString(args.siteId, "siteId", 512);
    const endpoint = rawSiteId
      ? `https://graph.microsoft.com/v1.0/sites/${encodeGraphSegment(rawSiteId, "siteId")}/drives`
      : "https://graph.microsoft.com/v1.0/sites/root/drives";
    const resp = await graphHttp.get(endpoint, { headers });
    const libraries = (resp.data?.value || []).map((drv) => ({
      id: drv.id,
      name: drv.name,
      driveType: drv.driveType,
      webUrl: drv.webUrl,
    }));
    return { libraries };
  }

  // 3. List Library Items (Bounded 5-way concurrency when enriching Purview labels — S-06)
  if (name === "query_library_items_lookup") {
    const { driveId } = await resolveTenantDriveAndItem(args.driveId, "root", headers);
    if (!driveId) throw new Error("Unable to resolve SharePoint driveId.");
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const rawFolder = validateSafeString(args.folderId, "folderId", 512);
    const resolvedFolder =
      rawFolder && rawFolder !== "root"
        ? (await resolveTenantDriveAndItem(driveId, rawFolder, headers)).itemId
        : "root";
    const safeFolder = resolvedFolder === "root" ? "root" : encodeGraphSegment(resolvedFolder, "folderId");

    let resp;
    if (enablePurviewLabels) {
      try {
        const betaUrl =
          safeFolder === "root"
            ? `https://graph.microsoft.com/beta/drives/${safeDrive}/root/children?$expand=listItem($expand=fields)`
            : `https://graph.microsoft.com/beta/drives/${safeDrive}/items/${safeFolder}/children?$expand=listItem($expand=fields)`;
        resp = await graphHttp.get(betaUrl, { headers });
      } catch {
        // Fallback to v1.0
      }
    }
    if (!resp) {
      const v1Url =
        safeFolder === "root"
          ? `https://graph.microsoft.com/v1.0/drives/${safeDrive}/root/children`
          : `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeFolder}/children`;
      resp = await graphHttp.get(v1Url, { headers });
    }

    const rawItems = (resp.data?.value || []).slice(0, 200);
    const items = await mapWithConcurrency(rawItems, 5, async (item) => {
      let labelInfo = null;
      if (enablePurviewLabels) {
        labelInfo = await extractPurviewLabelAsync(item, null, guidToInfoTypeMap);
        if (
          !labelInfo &&
          !item.folder &&
          /\.(docx|xlsx|pptx)$/i.test(item.name || "") &&
          Number(item.size || 0) > 0 &&
          Number(item.size || 0) <= 2 * 1024 * 1024
        ) {
          try {
            const bufRes = await graphHttp.get(
              `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${encodeGraphSegment(item.id, "itemId")}/content`,
              { headers, responseType: "arraybuffer" }
            );
            labelInfo = await extractPurviewLabelAsync(item, Buffer.from(bufRes.data), guidToInfoTypeMap);
          } catch {
            // Non-fatal metadata enrichment skip
          }
        }
      }

      return {
        id: item.id,
        name: item.name,
        type: item.folder ? "folder" : "file",
        mimeType: item.file?.mimeType,
        size: item.size,
        webUrl: formatSharePointWebUrl(item.webUrl),
        lastModifiedDateTime: item.lastModifiedDateTime,
        ...(enablePurviewLabels ? formatPurviewLabelFields(labelInfo, false) : {}),
      };
    });

    return { items };
  }

  // 4. File Metadata Lookup
  if (name === "query_file_metadata_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const safeItem = encodeGraphSegment(itemId, "itemId");

    let resp;
    if (enablePurviewLabels) {
      try {
        resp = await graphHttp.get(
          `https://graph.microsoft.com/beta/drives/${safeDrive}/items/${safeItem}?$expand=listItem($expand=fields)`,
          { headers }
        );
      } catch {
        // Fallback to v1.0
      }
    }
    if (!resp) {
      resp = await graphHttp.get(`https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}`, { headers });
    }

    let labelInfo = null;
    if (enablePurviewLabels) {
      labelInfo = await extractPurviewLabelAsync(resp.data, null, guidToInfoTypeMap);
      if (
        !labelInfo &&
        /\.(docx|xlsx|pptx)$/i.test(resp.data?.name || "") &&
        Number(resp.data?.size || 0) > 0 &&
        Number(resp.data?.size || 0) <= 2 * 1024 * 1024
      ) {
        try {
          const bufRes = await graphHttp.get(
            `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}/content`,
            { headers, responseType: "arraybuffer" }
          );
          labelInfo = await extractPurviewLabelAsync(resp.data, Buffer.from(bufRes.data), guidToInfoTypeMap);
        } catch {
          // Non-fatal
        }
      }
    }

    return {
      id: resp.data.id,
      name: resp.data.name,
      size: resp.data.size,
      mimeType: resp.data.file?.mimeType,
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
      createdDateTime: resp.data.createdDateTime,
      lastModifiedDateTime: resp.data.lastModifiedDateTime,
      ...(enablePurviewLabels ? formatPurviewLabelFields(labelInfo, true) : {}),
    };
  }

  // 5. File Content Extraction (DOCX, XLSX, PPTX, PDF, Text + Fail-Closed SDP Hook)
  if (name === "query_file_content_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const safeItem = encodeGraphSegment(itemId, "itemId");

    let itemMeta = null;
    try {
      const metaUrl = enablePurviewLabels
        ? `https://graph.microsoft.com/beta/drives/${safeDrive}/items/${safeItem}?$expand=listItem($expand=fields)`
        : `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}`;
      const metaRes = await graphHttp.get(metaUrl, { headers });
      itemMeta = metaRes.data;
    } catch {
      const v1Meta = await graphHttp.get(`https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}`, {
        headers,
      });
      itemMeta = v1Meta.data;
    }

    if (Number(itemMeta?.size || 0) > DEFAULT_MAX_FILE_BYTES) {
      throw new Error(`File '${itemMeta.name}' (${itemMeta.size} bytes) exceeds ${DEFAULT_MAX_FILE_BYTES}-byte limit.`);
    }

    const binRes = await graphHttp.get(
      `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}/content`,
      { headers, responseType: "arraybuffer" }
    );
    const bufferData = Buffer.from(binRes.data);
    const contentType = binRes.headers["content-type"] || itemMeta?.file?.mimeType || "";

    let labelInfo = enablePurviewLabels
      ? await extractPurviewLabelAsync(itemMeta, bufferData, guidToInfoTypeMap)
      : null;

    const extractedText = await extractDocumentTextAsync(bufferData, itemMeta?.name || rawItem, contentType);
    let finalContent = extractedText || "No readable text content could be extracted from this document.";
    let blocked = false;

    if (typeof evaluateSdpVerdict === "function") {
      const verdictResult = evaluateSdpVerdict({
        itemData: itemMeta,
        extractedText: finalContent,
        labelInfo,
      });
      finalContent = verdictResult.content;
      labelInfo = verdictResult.labelInfo || labelInfo;
      blocked = Boolean(verdictResult.blocked);
    }

    return {
      content: finalContent,
      blocked: blocked || undefined,
      name: itemMeta?.name,
      webUrl: formatSharePointWebUrl(itemMeta?.webUrl),
      ...(enablePurviewLabels ? formatPurviewLabelFields(labelInfo, true) : {}),
    };
  }

  // 6. File Download URL Lookup
  if (name === "query_file_download_url_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const safeItem = encodeGraphSegment(itemId, "itemId");

    const resp = await graphHttp.get(`https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${safeItem}`, {
      headers,
    });
    const labelInfo = enablePurviewLabels
      ? await extractPurviewLabelAsync(resp.data, null, guidToInfoTypeMap)
      : null;

    if (typeof evaluateSdpVerdict === "function" && labelInfo && labelInfo.returnVerdict === "BLOCK") {
      return {
        blocked: true,
        error: `Download URL withheld by Sensitive Data Protection policy (${labelInfo.displayName}).`,
        name: resp.data.name,
        webUrl: formatSharePointWebUrl(resp.data.webUrl),
        ...formatPurviewLabelFields(labelInfo, true),
      };
    }

    return {
      downloadUrl: resp.data["@microsoft.graph.downloadUrl"] || formatSharePointWebUrl(resp.data.webUrl),
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
      name: resp.data.name,
      ...(enablePurviewLabels ? formatPurviewLabelFields(labelInfo, true) : {}),
    };
  }

  // Guard write operations if disabled
  if (!enableWriteTools) {
    throw new Error(`Write tool '${name}' is disabled on this server.`);
  }

  // 7. Create File
  if (name === "query_create_file_action_lookup") {
    const fileName = sanitizeFileName(args.fileName, "new_document.txt");
    const contentText = String(args.content ?? "");
    if (Buffer.byteLength(contentText, "utf8") > 5 * 1024 * 1024) {
      throw new Error("File content exceeds 5 MB write limit.");
    }
    const { driveId, itemId: parentId } = await resolveTenantDriveAndItem(
      args.driveId,
      args.parentId || "root",
      headers
    );
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const uploadUrl =
      parentId === "root"
        ? `https://graph.microsoft.com/v1.0/drives/${safeDrive}/root:/${encodeURIComponent(fileName)}:/content`
        : `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${encodeGraphSegment(
            parentId,
            "parentId"
          )}:/${encodeURIComponent(fileName)}:/content`;

    const resp = await graphHttp.put(uploadUrl, Buffer.from(contentText, "utf8"), {
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
    return {
      status: "Success",
      message: `Successfully created file "${fileName}".`,
      id: resp.data.id,
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
    };
  }

  // 8. Update File
  if (name === "query_update_file_action_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const contentText = String(args.content ?? "");
    if (Buffer.byteLength(contentText, "utf8") > 5 * 1024 * 1024) {
      throw new Error("File content exceeds 5 MB write limit.");
    }
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const resp = await graphHttp.put(
      `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(
        itemId,
        "itemId"
      )}/content`,
      Buffer.from(contentText, "utf8"),
      { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } }
    );
    return {
      status: "Success",
      message: `Successfully updated item "${itemId}".`,
      id: resp.data.id,
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
    };
  }

  // 9. Create Folder
  if (name === "query_create_folder_action_lookup") {
    const folderName = sanitizeFileName(args.folderName, "New Folder");
    const { driveId, itemId: parentId } = await resolveTenantDriveAndItem(
      args.driveId,
      args.parentId || "root",
      headers
    );
    const safeDrive = encodeGraphSegment(driveId, "driveId");
    const endpoint =
      parentId === "root"
        ? `https://graph.microsoft.com/v1.0/drives/${safeDrive}/root/children`
        : `https://graph.microsoft.com/v1.0/drives/${safeDrive}/items/${encodeGraphSegment(
            parentId,
            "parentId"
          )}/children`;
    const resp = await graphHttp.post(
      endpoint,
      { name: folderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" },
      { headers }
    );
    return {
      status: "Success",
      message: `Successfully created folder "${folderName}".`,
      id: resp.data.id,
      webUrl: resp.data.webUrl,
    };
  }

  // 10. Rename Item
  if (name === "query_rename_item_action_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const newName = sanitizeFileName(args.newName);
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const resp = await graphHttp.patch(
      `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(
        itemId,
        "itemId"
      )}`,
      { name: newName },
      { headers }
    );
    return {
      status: "Success",
      message: `Successfully renamed item to "${newName}".`,
      id: resp.data.id,
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
    };
  }

  // 11. Move Item
  if (name === "query_move_item_action_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    const rawDest = validateSafeString(args.destinationFolderId, "destinationFolderId", 512);
    if (!rawItem || !rawDest) throw new Error("Parameters 'itemId' and 'destinationFolderId' are required.");
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    const { itemId: destId } = await resolveTenantDriveAndItem(driveId, rawDest, headers);
    const resp = await graphHttp.patch(
      `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(
        itemId,
        "itemId"
      )}`,
      { parentReference: { id: destId } },
      { headers }
    );
    return {
      status: "Success",
      message: `Successfully moved item to folder "${destId}".`,
      id: resp.data.id,
      webUrl: formatSharePointWebUrl(resp.data.webUrl),
    };
  }

  // 12. Delete Item
  if (name === "query_delete_item_action_lookup") {
    const rawItem = validateSafeString(args.itemId, "itemId", 512);
    if (!rawItem) throw new Error("Parameter 'itemId' is required.");
    const { driveId, itemId } = await resolveTenantDriveAndItem(args.driveId, rawItem, headers);
    await graphHttp.delete(
      `https://graph.microsoft.com/v1.0/drives/${encodeGraphSegment(driveId, "driveId")}/items/${encodeGraphSegment(
        itemId,
        "itemId"
      )}`,
      { headers }
    );
    return {
      status: "Success",
      message: `Successfully deleted item "${itemId}".`,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

module.exports = {
  DEFAULT_MAX_FILE_BYTES,
  MAX_ZIP_ENTRY_UNCOMPRESSED_BYTES,
  graphHttp,
  keepAliveAgent,
  validateSafeString,
  encodeGraphSegment,
  sanitizeFileName,
  escapeODataString,
  formatSharePointWebUrl,
  mapWithConcurrency,
  extractZipXmlEntriesAsync,
  extractOoxmlCustomPropertiesAsync,
  extractPptxSlidesTextAsync,
  extractXlsxTextAsync,
  extractPdfTextAsync,
  extractDocumentTextAsync,
  extractPurviewLabelAsync,
  formatPurviewLabelFields,
  createSharePointHttpServer,
  buildStandardSharePointTools,
  resolveTenantDriveAndItem,
  executeStandardSharePointTool,
};
