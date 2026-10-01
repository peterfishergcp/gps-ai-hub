#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import dotenv from 'dotenv';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

// Load environment variables from .env file
dotenv.config();

// ============================================================================
// PERFORMANCE OPTIMIZATION: HTTP Keep-Alive Connection Pooling
// Reuses TLS connections to graph.microsoft.com to eliminate SSL handshake overhead
// ============================================================================
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  keepAliveMsecs: 30000,
});

// ============================================================================
// LEAST-PRIVILEGE CONFIGURATION & SECURITY CONSTANTS
// ============================================================================
const MAX_FILE_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES || '10485760', 10); // 10 MB default
const SITE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '120', 10);

// Allowed CORS origins (strict allow-list, no wildcard '*')
const ALLOWED_CORS_ORIGINS = new Set(
  (process.env.ALLOWED_CORS_ORIGINS || 'https://console.cloud.google.com,https://vertexaisearch.cloud.google.com')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
);

// Simple in-memory per-IP rate limiter
const rateLimitMap = new Map();
function checkRateLimit(clientIp) {
  const now = Date.now();
  const key = clientIp || 'unknown';
  const record = rateLimitMap.get(key);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, { windowStart: now, count: 1 });
    return true;
  }
  record.count += 1;
  return record.count <= RATE_LIMIT_MAX_REQUESTS;
}

// ============================================================================
// INPUT VALIDATION & SANITIZATION HELPERS
// ============================================================================

/**
 * Validates that an input is a safe string within length limits and free of control chars.
 */
function validateSafeString(value, fieldName, maxLength = 512) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new Error(`Invalid parameter '${fieldName}': expected a string.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`Invalid parameter '${fieldName}': exceeds maximum length of ${maxLength} characters.`);
  }
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new Error(`Invalid parameter '${fieldName}': contains disallowed control characters.`);
  }
  return trimmed;
}

/**
 * Sanitizes a search keyword for safe inclusion inside Microsoft Graph OData search(q='...')
 * Prevents OData query injection or path traversal.
 */
function sanitizeSearchQuery(query) {
  const clean = validateSafeString(query, 'query', 200);
  // Allow alphanumeric, spaces, hyphens, underscores, periods; strip single/double quotes and slashes
  return clean.replace(/['"\\/;()`$<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Encodes a single Graph URL path segment safely while rejecting traversal sequences.
 */
function encodeSafeGraphSegment(segment, fieldName = 'id') {
  const clean = validateSafeString(segment, fieldName, 512);
  if (!clean || clean === '.' || clean === '..' || clean.includes('../') || clean.includes('..\\')) {
    throw new Error(`Invalid parameter '${fieldName}': path traversal sequences are not permitted.`);
  }
  return encodeURIComponent(clean);
}

/**
 * Parses ALLOWED_SHAREPOINT_SITES from environment variables into normalized Graph site specifiers.
 * Supports:
 *   1. Full URL:        https://syc52.sharepoint.com/sites/Finance -> syc52.sharepoint.com:/sites/Finance
 *   2. Graph path:      syc52.sharepoint.com:/sites/Finance
 *   3. Relative path:   /sites/Finance or Finance (uses SHAREPOINT_HOSTNAME)
 *   4. Canonical ID:    syc52.sharepoint.com,guid1,guid2
 */
function getConfiguredSiteSpecs() {
  const rawList =
    process.env.ALLOWED_SHAREPOINT_SITES ||
    process.env.SHAREPOINT_SITE_URLS ||
    process.env.SHAREPOINT_INSTANCE_URL ||
    '';
  const defaultHost = (process.env.SHAREPOINT_HOSTNAME || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');

  const entries = rawList
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Re-join canonical 3-part Graph site IDs (hostname,spsite-guid,spweb-guid) if split by comma
  const mergedEntries = [];
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (let i = 0; i < entries.length; i++) {
    if (
      i + 2 < entries.length &&
      entries[i].includes('.sharepoint.com') &&
      !entries[i].includes('/') &&
      !entries[i].includes(':') &&
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
    // Format 1: Full URL https://tenant.sharepoint.com/sites/SiteName
    if (/^https?:\/\//i.test(entry)) {
      const parsed = new URL(entry);
      const pathname = parsed.pathname.replace(/\/+$/, '');
      if (!pathname || pathname === '/') {
        throw new Error(
          `Least-Privilege Policy Error: Root tenant URL '${entry}' is not allowed in ALLOWED_SHAREPOINT_SITES. Specify a specific site URL such as 'https://${parsed.hostname}/sites/YourSiteName'.`
        );
      }
      return {
        raw: entry,
        graphPath: `${parsed.hostname}:${pathname}`,
        hostname: parsed.hostname.toLowerCase(),
        siteSlug: pathname.split('/').pop().toLowerCase(),
        webUrlHint: `https://${parsed.hostname}${pathname}`.toLowerCase(),
      };
    }

    // Format 2: Canonical 3-part Graph ID (hostname,guid,guid)
    if (entry.includes(',') && entry.split(',').length === 3) {
      const [host] = entry.split(',');
      return {
        raw: entry,
        graphPath: entry,
        hostname: host.toLowerCase(),
        siteSlug: entry.toLowerCase(),
        webUrlHint: '',
      };
    }

    // Format 3: Graph colon path (hostname:/sites/SiteName)
    if (entry.includes(':/')) {
      const [hostPart, pathPart] = entry.split(':', 2);
      const cleanPath = pathPart.replace(/\/+$/, '');
      return {
        raw: entry,
        graphPath: `${hostPart}:${cleanPath}`,
        hostname: hostPart.toLowerCase(),
        siteSlug: cleanPath.split('/').pop().toLowerCase(),
        webUrlHint: `https://${hostPart}${cleanPath}`.toLowerCase(),
      };
    }

    // Format 4: Relative path (/sites/SiteName or SiteName) with SHAREPOINT_HOSTNAME
    if (!defaultHost) {
      throw new Error(
        `Invalid ALLOWED_SHAREPOINT_SITES entry '${entry}'. Provide a full SharePoint site URL (e.g., 'https://tenant.sharepoint.com/sites/SiteName') or set SHAREPOINT_HOSTNAME.`
      );
    }
    const normalizedPath = entry.startsWith('/sites/') || entry.startsWith('/teams/')
      ? entry.replace(/\/+$/, '')
      : `/sites/${entry.replace(/^\/+|\/+$/g, '')}`;
    return {
      raw: entry,
      graphPath: `${defaultHost}:${normalizedPath}`,
      hostname: defaultHost.toLowerCase(),
      siteSlug: normalizedPath.split('/').pop().toLowerCase(),
      webUrlHint: `https://${defaultHost}${normalizedPath}`.toLowerCase(),
    };
  });
}

// ============================================================================
// AUTHENTICATION: Microsoft Entra ID (Sites.Selected App-Only or Read-Only Delegated)
// ============================================================================
let cachedAppToken = null;
let tokenExpirationTime = 0;

async function getAccessToken(authHeader) {
  // 1. If a valid Bearer token is passed in the HTTP Authorization header, use it
  //    (still restricted by the server-side ALLOWED_SHAREPOINT_SITES allowlist!)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token && token !== 'null' && token !== 'undefined') {
      return token;
    }
  }

  // 2. Fallback to static environment variable token if explicitly provided
  if (process.env.MS_GRAPH_ACCESS_TOKEN) {
    return process.env.MS_GRAPH_ACCESS_TOKEN;
  }

  // 3. Acquire App-Only Client Credentials token (for Microsoft Graph Sites.Selected)
  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (tenantId && clientId && clientSecret) {
    const now = Date.now();
    if (cachedAppToken && now < tokenExpirationTime - 300000) {
      return cachedAppToken;
    }

    try {
      const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
      const params = new URLSearchParams();
      params.append('client_id', clientId);
      params.append('scope', 'https://graph.microsoft.com/.default');
      params.append('client_secret', clientSecret);
      params.append('grant_type', 'client_credentials');

      const response = await axios.post(tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        httpsAgent,
        timeout: 15000,
      });

      cachedAppToken = response.data.access_token;
      tokenExpirationTime = now + response.data.expires_in * 1000;
      return cachedAppToken;
    } catch (err) {
      const errCode = err.response?.data?.error || err.message;
      console.error('Failed to acquire Microsoft Entra ID access token:', errCode);
      throw new Error('Failed to authenticate with Microsoft Entra ID using client credentials.');
    }
  }

  throw new Error(
    'No valid authentication credentials found. Configure MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, and MS_GRAPH_CLIENT_SECRET with Sites.Selected permission in Entra ID.'
  );
}

/**
 * Creates a strictly read-only Axios client for Microsoft Graph v1.0.
 * Blocks all non-GET HTTP methods to guarantee read-only operation.
 */
async function getGraphClient(authHeader) {
  const token = await getAccessToken(authHeader);
  const client = axios.create({
    baseURL: 'https://graph.microsoft.com/v1.0',
    httpsAgent,
    timeout: 30000,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  // Fail-safe interceptor: strictly block any state-modifying HTTP methods against Graph API
  client.interceptors.request.use((config) => {
    const method = (config.method || 'get').toUpperCase();
    if (method !== 'GET') {
      throw new Error(
        `Least-Privilege Policy Violation: HTTP ${method} is disabled. This MCP server is strictly read-only.`
      );
    }
    return config;
  });

  return client;
}

// ============================================================================
// LEAST-PRIVILEGE SITE & DRIVE ALLOWLIST RESOLVER (Sites.Selected Compatible)
// ============================================================================
let cachedAllowedSites = null;
let cachedAllowedSitesTimestamp = 0;
// Maps canonical driveId -> canonical siteId for fast allowlist verification
const allowedDriveToSiteMap = new Map();

/**
 * Resolves all SharePoint sites configured in ALLOWED_SHAREPOINT_SITES directly via
 * GET /sites/{sitePathOrId}. Does NOT call tenant-wide /sites?search=* or /me/drive,
 * making it 100% compatible with Entra ID Sites.Selected (Application permission).
 */
async function resolveAllowedSites(graph) {
  const specs = getConfiguredSiteSpecs();
  if (specs.length === 0) {
    throw new Error(
      'Least-Privilege Policy Error: ALLOWED_SHAREPOINT_SITES is not configured. Set ALLOWED_SHAREPOINT_SITES to a comma-separated list of specific SharePoint site URLs (e.g., https://tenant.sharepoint.com/sites/Finance).'
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
        params: { $select: 'id,displayName,name,webUrl,description,createdDateTime,lastModifiedDateTime' },
      });
      const site = res.data;
      resolvedSites.push({
        id: site.id,
        displayName: site.displayName || site.name || spec.siteSlug,
        name: site.name || spec.siteSlug,
        webUrl: site.webUrl || spec.webUrlHint,
        description: site.description || '',
        configuredAs: spec.raw,
        siteSlug: spec.siteSlug,
      });
    } catch (err) {
      const status = err.response?.status;
      const graphMsg = err.response?.data?.error?.message || err.message;
      if (status === 403) {
        errors.push(
          `Access Denied (403 Forbidden) for site '${spec.raw}'. Verify that your Entra ID App Registration has 'Sites.Selected' Application permission AND has been granted the 'read' role on this specific SharePoint site via POST /v1.0/sites/{siteId}/permissions.`
        );
      } else {
        errors.push(`Failed to resolve site '${spec.raw}': ${graphMsg}`);
      }
    }
  }

  if (resolvedSites.length === 0) {
    throw new Error(
      `Could not resolve any configured SharePoint sites in ALLOWED_SHAREPOINT_SITES.\nDetails:\n- ${errors.join('\n- ')}`
    );
  }

  cachedAllowedSites = resolvedSites;
  cachedAllowedSitesTimestamp = now;
  return resolvedSites;
}

/**
 * Resolves and validates a requested site against the ALLOWED_SHAREPOINT_SITES allowlist.
 * Fails closed if the requested site is not in the allowlist.
 */
async function resolveAllowedSite(graph, siteInput) {
  const cleanSiteInput = validateSafeString(siteInput, 'siteId', 512);
  const allowedSites = await resolveAllowedSites(graph);

  // If no siteId was specified, default to the first allowed SharePoint site
  if (!cleanSiteInput) {
    return allowedSites[0];
  }

  const normalized = cleanSiteInput.toLowerCase().replace(/\/+$/, '');
  const match = allowedSites.find((s) => {
    const idLower = (s.id || '').toLowerCase();
    const nameLower = (s.name || '').toLowerCase();
    const displayLower = (s.displayName || '').toLowerCase();
    const webUrlLower = (s.webUrl || '').toLowerCase().replace(/\/+$/, '');
    const slugLower = (s.siteSlug || '').toLowerCase();
    const rawLower = (s.configuredAs || '').toLowerCase().replace(/\/+$/, '');

    return (
      normalized === idLower ||
      normalized === nameLower ||
      normalized === displayLower ||
      normalized === webUrlLower ||
      normalized === slugLower ||
      normalized === rawLower ||
      normalized === `/sites/${slugLower}` ||
      webUrlLower.endsWith(`/${normalized}`) ||
      displayLower.includes(normalized) ||
      nameLower.includes(normalized)
    );
  });

  if (!match) {
    const permittedList = allowedSites.map((s) => `${s.displayName} (${s.webUrl})`).join(', ');
    throw new Error(
      `Least-Privilege Access Denied: Site '${cleanSiteInput}' is not in ALLOWED_SHAREPOINT_SITES. This server is restricted to: ${permittedList}`
    );
  }

  return match;
}

/**
 * Lists all document libraries (drives) for a verified allowed SharePoint site and
 * registers their canonical driveIds in the allowlist map.
 */
async function listDrivesForAllowedSite(graph, allowedSite) {
  const res = await graph.get(`/sites/${allowedSite.id}/drives`, {
    params: { $select: 'id,name,driveType,webUrl,description,lastModifiedDateTime,quota' },
  });
  const drives = res.data?.value || [];
  for (const d of drives) {
    if (d.id) {
      allowedDriveToSiteMap.set(d.id, allowedSite);
    }
  }
  return drives;
}

/**
 * Resolves a driveId or natural library name (e.g. "Documents", "Shared Documents")
 * strictly within the allowed SharePoint sites. Rejects any unknown/unpermitted driveId.
 */
async function resolveAllowedDrive(graph, driveInput, siteInput) {
  const cleanDriveInput = validateSafeString(driveInput, 'driveId', 512);
  const allowedSites = await resolveAllowedSites(graph);

  // Fast path: if driveInput is already a verified canonical driveId in our allowlist cache
  if (cleanDriveInput && allowedDriveToSiteMap.has(cleanDriveInput)) {
    const ownerSite = allowedDriveToSiteMap.get(cleanDriveInput);
    if (siteInput) {
      const requestedSite = await resolveAllowedSite(graph, siteInput);
      if (requestedSite.id !== ownerSite.id) {
        throw new Error(
          `Least-Privilege Access Denied: Drive '${cleanDriveInput}' does not belong to site '${requestedSite.displayName}'.`
        );
      }
    }
    return { driveId: cleanDriveInput, site: ownerSite };
  }

  // Determine which allowed site(s) to inspect
  let candidateSites = allowedSites;
  if (siteInput) {
    const targetSite = await resolveAllowedSite(graph, siteInput);
    candidateSites = [targetSite];
  } else if (cleanDriveInput) {
    // Check if the caller passed a site name/URL in the driveId parameter (common LLM behavior)
    const matchingSite = allowedSites.find((s) => {
      const norm = cleanDriveInput.toLowerCase();
      return (
        norm === s.id.toLowerCase() ||
        norm === s.name.toLowerCase() ||
        norm === s.displayName.toLowerCase() ||
        norm === s.siteSlug.toLowerCase() ||
        (s.webUrl && s.webUrl.toLowerCase().includes(norm))
      );
    });
    if (matchingSite) {
      candidateSites = [matchingSite];
    }
  }

  // Search drives across the candidate allowed site(s)
  for (const site of candidateSites) {
    const drives = await listDrivesForAllowedSite(graph, site);
    if (drives.length === 0) continue;

    // 1. Exact canonical drive ID match
    if (cleanDriveInput) {
      const exactIdMatch = drives.find((d) => d.id === cleanDriveInput);
      if (exactIdMatch) {
        return { driveId: exactIdMatch.id, site, drive: exactIdMatch };
      }

      // 2. Exact library name match (e.g., "Documents" or "Shared Documents")
      const lowerInput = cleanDriveInput.toLowerCase();
      const nameMatch = drives.find(
        (d) =>
          (d.name && d.name.toLowerCase() === lowerInput) ||
          (d.name && d.name.toLowerCase().includes(lowerInput)) ||
          (lowerInput === 'shared documents' && d.name && d.name.toLowerCase() === 'documents') ||
          (lowerInput === 'documents' && d.name && d.name.toLowerCase() === 'shared documents')
      );
      if (nameMatch) {
        return { driveId: nameMatch.id, site, drive: nameMatch };
      }

      // 3. If the caller passed the site's name as driveInput, return the site's default Documents library
      if (
        lowerInput === site.name.toLowerCase() ||
        lowerInput === site.displayName.toLowerCase() ||
        lowerInput === site.siteSlug.toLowerCase()
      ) {
        const defaultDocDrive =
          drives.find((d) => d.name === 'Documents' || d.name === 'Shared Documents') || drives[0];
        return { driveId: defaultDocDrive.id, site, drive: defaultDocDrive };
      }
    } else {
      // No driveInput provided -> default to the site's primary Documents library
      const defaultDocDrive =
        drives.find((d) => d.name === 'Documents' || d.name === 'Shared Documents') || drives[0];
      return { driveId: defaultDocDrive.id, site, drive: defaultDocDrive };
    }
  }

  const permittedSitesText = allowedSites.map((s) => `${s.displayName} (${s.webUrl})`).join(', ');
  throw new Error(
    `Least-Privilege Access Denied or Library Not Found: Could not find document library '${cleanDriveInput}' inside the allowed SharePoint sites (${permittedSitesText}).`
  );
}

/**
 * Resolves a folderId (either a Graph item ID, "root", or a natural folder name/path like "Reports/2026")
 * within a verified allowed driveId.
 */
async function resolveFolderItemId(graph, driveId, folderInput) {
  const cleanFolder = validateSafeString(folderInput, 'folderId', 512);
  if (!cleanFolder || cleanFolder.toLowerCase() === 'root' || cleanFolder === '/') {
    return 'root';
  }

  // If it looks like a Graph item ID (alphanumeric/base64 without spaces or slashes, length > 18)
  if (!cleanFolder.includes(' ') && !cleanFolder.includes('/') && cleanFolder.length > 18) {
    return encodeSafeGraphSegment(cleanFolder, 'folderId');
  }

  // Otherwise resolve by natural folder name or slash-separated path from root
  const segments = cleanFolder
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);

  let currentParentId = 'root';
  for (const seg of segments) {
    const listEndpoint =
      currentParentId === 'root'
        ? `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/root/children`
        : `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(currentParentId, 'folderId')}/children`;
    const childrenRes = await graph.get(listEndpoint, {
      params: { $select: 'id,name,folder,file,webUrl' },
    });
    const children = childrenRes.data?.value || [];
    const segLower = seg.toLowerCase();
    const folderMatch =
      children.find((item) => item.folder && item.name && item.name.toLowerCase() === segLower) ||
      children.find((item) => item.folder && item.name && item.name.toLowerCase().includes(segLower));

    if (!folderMatch) {
      throw new Error(`Folder '${seg}' not found in the specified SharePoint document library.`);
    }
    currentParentId = folderMatch.id;
  }

  return currentParentId;
}

/**
 * Recursively lists files and folders in a verified allowed drive using /children endpoints,
 * which work 100% natively under Entra ID Sites.Selected (whereas /root/search requires
 * tenant-wide SharePoint Search permissions on app-only tokens).
 */
async function crawlDriveItems(graph, driveId, maxDepth = 3, maxItems = 300) {
  const safeDriveId = encodeSafeGraphSegment(driveId, 'driveId');
  const collected = [];
  const queue = [{ folderId: 'root', depth: 0, pathPrefix: '' }];

  while (queue.length > 0 && collected.length < maxItems) {
    const { folderId, depth, pathPrefix } = queue.shift();
    const endpoint =
      folderId === 'root'
        ? `/drives/${safeDriveId}/root/children`
        : `/drives/${safeDriveId}/items/${encodeSafeGraphSegment(folderId, 'folderId')}/children`;

    const res = await graph.get(endpoint, {
      params: {
        $select: 'id,name,size,webUrl,lastModifiedDateTime,createdDateTime,file,folder,parentReference',
        $top: 200,
      },
    });
    const children = res.data?.value || [];
    for (const item of children) {
      const relativePath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      collected.push({ ...item, relativePath });
      if (item.folder && depth + 1 < maxDepth && collected.length < maxItems) {
        queue.push({
          folderId: item.id,
          depth: depth + 1,
          pathPrefix: relativePath,
        });
      }
    }
  }

  return collected;
}

/**
 * Resolves a file itemId (either a Graph item ID or a natural filename like "peterwashere.docx")
 * within a verified allowed driveId using Sites.Selected-compatible endpoints.
 */
async function resolveFileItemId(graph, driveId, itemInput) {
  const cleanItem = validateSafeString(itemInput, 'itemId', 512);
  if (!cleanItem) {
    throw new Error("Missing required parameter 'itemId' (file ID or filename).");
  }

  // 1. Check if it's already a Graph item ID (no spaces, no file extension dot, >18 chars)
  if (!cleanItem.includes(' ') && !cleanItem.includes('.') && !cleanItem.includes('/') && cleanItem.length > 18) {
    return encodeSafeGraphSegment(cleanItem, 'itemId');
  }

  const safeDriveId = encodeSafeGraphSegment(driveId, 'driveId');

  // 2. Try direct Graph path lookup (/drives/{driveId}/root:/{path}) - works under Sites.Selected in 1 RTT
  const normalizedPath = cleanItem
    .split('/')
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      if (seg === '.' || seg === '..') {
        throw new Error("Invalid parameter 'itemId': path traversal sequences are not permitted.");
      }
      return encodeURIComponent(seg);
    })
    .join('/');

  if (normalizedPath) {
    try {
      const directRes = await graph.get(`/drives/${safeDriveId}/root:/${normalizedPath}`, {
        params: { $select: 'id,name,file,folder' },
      });
      if (directRes.data?.id) {
        return directRes.data.id;
      }
    } catch {
      // Fall through to recursive children crawl if the file is inside a nested subfolder or partial name was given
    }
  }

  // 3. Crawl the allowed drive's folders (/children) to match exact or partial filename
  const allItems = await crawlDriveItems(graph, driveId, 3, 300);
  const lowerTarget = cleanItem.toLowerCase();
  const exactFile =
    allItems.find((i) => i.file && i.name && i.name.toLowerCase() === lowerTarget) ||
    allItems.find((i) => i.name && i.name.toLowerCase() === lowerTarget) ||
    allItems.find((i) => i.file && i.name && i.name.toLowerCase().includes(lowerTarget)) ||
    allItems.find((i) => i.name && i.name.toLowerCase().includes(lowerTarget));

  if (!exactFile) {
    throw new Error(`File '${cleanItem}' was not found in the allowed SharePoint document library.`);
  }

  return exactFile.id;
}

/**
 * Decorates SharePoint item webUrl with ?web=1 for Office documents so SharePoint opens
 * them directly in the browser viewer rather than forcing a raw download.
 */
function formatCitationUrl(item) {
  if (!item || !item.webUrl) return item;
  const nameLower = (item.name || '').toLowerCase();
  let citationUrl = item.webUrl;
  if (
    (nameLower.endsWith('.docx') ||
      nameLower.endsWith('.xlsx') ||
      nameLower.endsWith('.pptx') ||
      nameLower.endsWith('.doc') ||
      nameLower.endsWith('.xls') ||
      nameLower.endsWith('.ppt')) &&
    !citationUrl.includes('?')
  ) {
    citationUrl = `${citationUrl}?web=1`;
  }
  return {
    ...item,
    webUrl: citationUrl,
    citationUrl,
  };
}

// ============================================================================
// MCP SERVER DEFINITION (Read-Only, Least-Privilege, Site-Scoped)
// ============================================================================
function createMcpServer(authHeader) {
  const server = new Server(
    {
      name: 'least-privilege-sharepoint-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: `CRITICAL SYSTEM INSTRUCTIONS FOR SHAREPOINT DOCUMENT RETRIEVAL & CITATIONS (LEAST-PRIVILEGE MODE):
1. LEAST-PRIVILEGE SITE SCOPE (Entra ID Sites.Selected):
   - This MCP server operates with strict Least-Privilege read-only access ('Sites.Selected' with 'read' permission) scoped ONLY to the pre-configured SharePoint sites in ALLOWED_SHAREPOINT_SITES.
   - Do NOT attempt to create, modify, rename, move, or delete files. This server is strictly read-only.
   - You can call 'query_search_files_lookup' to directly search for files by keyword across one or all allowed SharePoint sites, or 'query_sharepoint_sites_lookup' to view the allowed sites.
2. MANDATORY DIRECT CLICKABLE LINKS & PAGE NUMBERS:
   - Whenever you answer a question or summarize information from a SharePoint document, you MUST include a direct clickable Markdown link to the source document using its 'webUrl' (or 'citationUrl') field.
   - NEVER output a bare URL without Markdown link syntax, and NEVER cite a document name without making it a clickable link!
   - Format your citations based on the file type:
     * For PDF files (.pdf): Append '#page=N' to the 'webUrl' (e.g., '[Annual_Report.pdf (Page 5)](https://.../Annual_Report.pdf#page=5)').
     * For Word (.docx), Excel (.xlsx), or PowerPoint (.pptx) files: Ensure '?web=1' is appended to the 'webUrl' so it opens in SharePoint's web viewer, and write the page or section number in the link text: '[Document_Name.docx (Page N - Section Title)](https://.../Document_Name.docx?web=1)'.
   - THE +1 COVER PAGE RULE: Corporate documents and reports almost always have an unnumbered Cover Page (Page 1). If a document's Table of Contents or header says a topic is on "Page N", its actual physical viewer page is almost always Page N+1. Always add +1 when citing pages from a document with a cover page!
3. EMPTY SEARCH RESULTS & RETRY PROMPTING:
   - If a tool call returns zero matching items or documents, politely inform the user:
     "We didn't receive any query results for your query in the configured SharePoint sites. Would you try again and be more specific with your query?"`,
    }
  );

  // Define strictly read-only tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const readOnlyAnnotations = {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    };

    return {
      tools: [
        {
          name: 'query_sharepoint_sites_lookup',
          description:
            'List or filter the specific SharePoint sites that this MCP server is authorized to access under Microsoft Entra ID Least-Privilege (Sites.Selected). Call this first to discover available allowed sites and their siteIds.',
          annotations: {
            title: 'List Allowed SharePoint Sites',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'Optional keyword to filter the allowed SharePoint sites by name, URL, or description. Leave empty or pass "*" to list all allowed sites.',
              },
            },
          },
        },
        {
          name: 'query_document_libraries_lookup',
          description:
            'List all document libraries (drives) inside a specific allowed SharePoint site. Accepts a siteId, site URL, or natural site name from the allowed sites list.',
          annotations: {
            title: 'List Site Document Libraries',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              siteId: {
                type: 'string',
                description:
                  'The allowed SharePoint site ID, site URL (e.g., "https://your-tenant.sharepoint.com/sites/Finance"), or natural site name (e.g., "Finance"). Defaults to the primary allowed site if omitted.',
              },
            },
          },
        },
        {
          name: 'query_library_items_lookup',
          description:
            'List all files and folders within a specific document library (drive) or subfolder of an allowed SharePoint site.',
          annotations: {
            title: 'List Document Library Items',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              siteId: {
                type: 'string',
                description:
                  'Optional allowed SharePoint site ID, URL, or site name (e.g., "Finance"). Helps disambiguate when multiple sites are configured.',
              },
              driveId: {
                type: 'string',
                description:
                  'The document library ID (driveId) or natural library name (e.g., "Documents" or "Shared Documents"). Defaults to the site\'s primary Documents library if omitted.',
              },
              folderId: {
                type: 'string',
                description:
                  'Optional folder item ID or natural folder path (e.g., "Quarterly Reports" or "Reports/2026") to list items from. Defaults to the root of the library.',
              },
            },
          },
        },
        {
          name: 'query_search_files_lookup',
          description:
            'Search for files and folders by keyword across a specific allowed SharePoint site (or across all allowed SharePoint sites if siteId is omitted) using Sites.Selected-compatible drive traversal.',
          annotations: {
            title: 'Search Files in Allowed SharePoint Sites',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search keyword, filename, or phrase to search for (e.g., "Q1 Budget", "Master Services Agreement", "Architecture").',
              },
              siteId: {
                type: 'string',
                description:
                  'Optional allowed SharePoint site ID, URL, or natural site name to restrict the search to a single site. If omitted, searches across all allowed SharePoint sites.',
              },
              driveId: {
                type: 'string',
                description:
                  'Optional specific document library ID or name (e.g., "Documents") to search within.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'query_file_metadata_lookup',
          description:
            'Retrieve detailed metadata (size, author, last modified date, webUrl, MIME type) for a specific file in an allowed SharePoint site.',
          annotations: {
            title: 'Get SharePoint File Metadata',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              siteId: {
                type: 'string',
                description: 'Optional allowed SharePoint site ID, URL, or site name.',
              },
              driveId: {
                type: 'string',
                description: 'The document library ID or natural name (e.g., "Documents").',
              },
              itemId: {
                type: 'string',
                description: 'The file item ID or exact filename (e.g., "Annual_Report.docx").',
              },
            },
            required: ['itemId'],
          },
        },
        {
          name: 'query_file_content_lookup',
          description:
            'Read and extract text content from a file in an allowed SharePoint site. Supports Word (.docx), Excel (.xlsx), plain text (.txt, .md, .csv, .json), and PDF (.pdf) files.',
          annotations: {
            title: 'Read SharePoint File Content',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              siteId: {
                type: 'string',
                description: 'Optional allowed SharePoint site ID, URL, or site name.',
              },
              driveId: {
                type: 'string',
                description: 'The document library ID or natural name (e.g., "Documents").',
              },
              itemId: {
                type: 'string',
                description: 'The file item ID or exact filename (e.g., "Employee_Handbook.docx").',
              },
            },
            required: ['itemId'],
          },
        },
        {
          name: 'query_file_download_url_lookup',
          description:
            'Get a temporary pre-authenticated download URL (@microsoft.graph.downloadUrl) and web viewer URL for a file in an allowed SharePoint site.',
          annotations: {
            title: 'Get File Download URL',
            ...readOnlyAnnotations,
          },
          inputSchema: {
            type: 'object',
            properties: {
              siteId: {
                type: 'string',
                description: 'Optional allowed SharePoint site ID, URL, or site name.',
              },
              driveId: {
                type: 'string',
                description: 'The document library ID or natural name (e.g., "Documents").',
              },
              itemId: {
                type: 'string',
                description: 'The file item ID or exact filename.',
              },
            },
            required: ['itemId'],
          },
        },
      ],
    };
  });

  // Handle Tool Execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
      const graph = await getGraphClient(authHeader);

      switch (name) {
        // --------------------------------------------------------------------
        // 1. LIST / FILTER ALLOWED SHAREPOINT SITES (Sites.Selected Compatible)
        // --------------------------------------------------------------------
        case 'query_sharepoint_sites_lookup': {
          const rawQuery = validateSafeString(args.query || '', 'query', 200);
          const allowedSites = await resolveAllowedSites(graph);

          let filtered = allowedSites;
          if (rawQuery && rawQuery !== '*') {
            const qLower = rawQuery.toLowerCase();
            filtered = allowedSites.filter(
              (s) =>
                (s.displayName && s.displayName.toLowerCase().includes(qLower)) ||
                (s.name && s.name.toLowerCase().includes(qLower)) ||
                (s.webUrl && s.webUrl.toLowerCase().includes(qLower)) ||
                (s.description && s.description.toLowerCase().includes(qLower))
            );
          }

          if (filtered.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      message:
                        "We didn't receive any query results for your query in the configured SharePoint sites. Would you try again and be more specific with your query?",
                      allowedSites: allowedSites.map((s) => ({
                        id: s.id,
                        displayName: s.displayName,
                        webUrl: s.webUrl,
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
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    permissionModel: 'Entra ID Least-Privilege (Sites.Selected - Read-Only)',
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

        // --------------------------------------------------------------------
        // 2. LIST DOCUMENT LIBRARIES IN AN ALLOWED SITE
        // --------------------------------------------------------------------
        case 'query_document_libraries_lookup': {
          const allowedSite = await resolveAllowedSite(graph, args.siteId);
          const drives = await listDrivesForAllowedSite(graph, allowedSite);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    site: {
                      id: allowedSite.id,
                      displayName: allowedSite.displayName,
                      webUrl: allowedSite.webUrl,
                    },
                    libraries: drives,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // --------------------------------------------------------------------
        // 3. LIST ITEMS IN AN ALLOWED SITE'S DOCUMENT LIBRARY / FOLDER
        // --------------------------------------------------------------------
        case 'query_library_items_lookup': {
          const { driveId, site } = await resolveAllowedDrive(graph, args.driveId, args.siteId);
          const folderItemId = await resolveFolderItemId(graph, driveId, args.folderId);

          const endpoint =
            folderItemId === 'root'
              ? `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/root/children`
              : `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(folderItemId, 'folderId')}/children`;

          const response = await graph.get(endpoint, {
            params: {
              $select: 'id,name,size,webUrl,lastModifiedDateTime,createdDateTime,file,folder,createdBy,lastModifiedBy',
              $top: 200,
            },
          });

          const items = (response.data?.value || []).map(formatCitationUrl);
          if (items.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: "We didn't receive any query results for your query. Would you try again and be more specific with your query?",
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    driveId,
                    folderId: folderItemId,
                    totalItems: items.length,
                    items,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // --------------------------------------------------------------------
        // 4. SEARCH FILES WITHIN SPECIFIC ALLOWED SHAREPOINT SITES
        //    (Uses Sites.Selected-native drive traversal so it never fails with 500 spException)
        // --------------------------------------------------------------------
        case 'query_search_files_lookup': {
          const safeQuery = sanitizeSearchQuery(args.query);
          if (!safeQuery) {
            throw new Error("A non-empty search 'query' parameter is required.");
          }

          const targetDrives = [];
          if (args.driveId || args.siteId) {
            const { driveId, site, drive } = await resolveAllowedDrive(graph, args.driveId, args.siteId);
            targetDrives.push({ driveId, site, driveName: drive?.name || 'Documents' });
          } else {
            const allowedSites = await resolveAllowedSites(graph);
            for (const site of allowedSites) {
              const drives = await listDrivesForAllowedSite(graph, site);
              for (const d of drives) {
                if (d.driveType === 'documentLibrary' || d.name === 'Documents' || d.name === 'Shared Documents') {
                  targetDrives.push({ driveId: d.id, site, driveName: d.name });
                }
              }
            }
          }

          const queryTokens = safeQuery
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);

          const results = [];
          for (const target of targetDrives) {
            const allItems = await crawlDriveItems(graph, target.driveId, 3, 300);
            const matched = allItems.filter((item) => {
              if (safeQuery === '*') return true;
              const haystack = `${item.name || ''} ${item.relativePath || ''}`.toLowerCase();
              return (
                haystack.includes(safeQuery.toLowerCase()) ||
                queryTokens.every((tok) => haystack.includes(tok))
              );
            });

            for (const item of matched) {
              results.push({
                ...formatCitationUrl(item),
                siteId: target.site.id,
                siteDisplayName: target.site.displayName,
                siteWebUrl: target.site.webUrl,
                driveId: target.driveId,
                driveName: target.driveName,
              });
            }
          }

          if (results.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: "We didn't receive any query results for your query. Would you try again and be more specific with your query?",
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    query: safeQuery,
                    totalResults: results.length,
                    results,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // --------------------------------------------------------------------
        // 5. GET FILE METADATA (Strictly within Allowed Sites)
        // --------------------------------------------------------------------
        case 'query_file_metadata_lookup': {
          const { driveId, site } = await resolveAllowedDrive(graph, args.driveId, args.siteId);
          const itemId = await resolveFileItemId(graph, driveId, args.itemId);

          const response = await graph.get(
            `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(itemId, 'itemId')}`
          );
          const formatted = formatCitationUrl(response.data);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    driveId,
                    file: formatted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // --------------------------------------------------------------------
        // 6. READ FILE CONTENT (Strictly within Allowed Sites + Size Guard)
        // --------------------------------------------------------------------
        case 'query_file_content_lookup': {
          const { driveId, site } = await resolveAllowedDrive(graph, args.driveId, args.siteId);
          const itemId = await resolveFileItemId(graph, driveId, args.itemId);

          const metaRes = await graph.get(
            `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(itemId, 'itemId')}`,
            {
              params: { $select: 'id,name,size,webUrl,file,lastModifiedDateTime' },
            }
          );

          const fileMeta = formatCitationUrl(metaRes.data);
          const fileName = (fileMeta.name || '').toLowerCase();
          const fileSize = fileMeta.size || 0;

          if (fileSize > MAX_FILE_SIZE_BYTES) {
            throw new Error(
              `File '${fileMeta.name}' (${fileSize} bytes) exceeds the maximum allowed size of ${MAX_FILE_SIZE_BYTES} bytes.`
            );
          }

          const contentEndpoint = `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(itemId, 'itemId')}/content`;

          const buildCitationHeader = (docTypeHint) =>
            `================================================================================\n` +
            `SOURCE DOCUMENT METADATA (USE FOR MANDATORY CLICKABLE LINKS & CITATIONS):\n` +
            `- Document Name: ${fileMeta.name}\n` +
            `- SharePoint Site: ${site.displayName} (${site.webUrl})\n` +
            `- Direct Clickable Web URL: ${fileMeta.citationUrl}\n` +
            `- Citation Rule: ${docTypeHint}\n` +
            `================================================================================\n\n`;

          // Word Documents (.docx)
          if (fileName.endsWith('.docx')) {
            const response = await graph.get(contentEndpoint, {
              responseType: 'arraybuffer',
              maxContentLength: MAX_FILE_SIZE_BYTES,
            });
            const buffer = Buffer.from(response.data);
            // Note: mammoth parses DOCX XML via its internal SAX parser without external entity expansion
            const result = await mammoth.extractRawText({ buffer });
            const header = buildCitationHeader(
              `Format citation as '[${fileMeta.name} (Page N - Section Title)](${fileMeta.citationUrl})'. Apply the +1 Cover Page Rule if the document has a cover page.`
            );
            return {
              content: [{ type: 'text', text: header + (result.value || '[Empty Word Document]') }],
            };
          }

          // Excel Spreadsheets (.xlsx, .xls)
          if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const response = await graph.get(contentEndpoint, {
              responseType: 'arraybuffer',
              maxContentLength: MAX_FILE_SIZE_BYTES,
            });
            const buffer = Buffer.from(response.data);
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            let extractedText = '';
            workbook.SheetNames.forEach((sheetName) => {
              const sheet = workbook.Sheets[sheetName];
              const csv = xlsx.utils.sheet_to_csv(sheet);
              if (csv.trim()) {
                extractedText += `--- Sheet: ${sheetName} ---\n${csv}\n\n`;
              }
            });
            const header = buildCitationHeader(
              `Format citation as '[${fileMeta.name} (Sheet: SheetName)](${fileMeta.citationUrl})'.`
            );
            return {
              content: [{ type: 'text', text: header + (extractedText || '[Empty Excel Workbook]') }],
            };
          }

          // Plain Text / Markdown / CSV / JSON / Code files
          if (
            fileName.endsWith('.txt') ||
            fileName.endsWith('.md') ||
            fileName.endsWith('.csv') ||
            fileName.endsWith('.json') ||
            fileName.endsWith('.xml') ||
            fileName.endsWith('.yaml') ||
            fileName.endsWith('.yml') ||
            fileName.endsWith('.log')
          ) {
            const response = await graph.get(contentEndpoint, {
              responseType: 'text',
              maxContentLength: MAX_FILE_SIZE_BYTES,
            });
            const textContent =
              typeof response.data === 'object' ? JSON.stringify(response.data, null, 2) : String(response.data);
            const header = buildCitationHeader(`Format citation as '[${fileMeta.name}](${fileMeta.citationUrl})'.`);
            return {
              content: [{ type: 'text', text: header + textContent }],
            };
          }

          // PDF or other binary formats: return metadata + citation instructions + download reference
          const downloadRes = await graph.get(
            `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(itemId, 'itemId')}`
          );
          const downloadUrl = downloadRes.data?.['@microsoft.graph.downloadUrl'];
          const header = buildCitationHeader(
            fileName.endsWith('.pdf')
              ? `Format PDF citation as '[${fileMeta.name} (Page N)](${fileMeta.webUrl}#page=N)'`
              : `Format citation as '[${fileMeta.name}](${fileMeta.citationUrl})'`
          );
          return {
            content: [
              {
                type: 'text',
                text:
                  header +
                  JSON.stringify(
                    {
                      note: `Binary document (${fileMeta.name}). Use the webUrl for direct browser viewing or downloadUrl for binary retrieval.`,
                      id: fileMeta.id,
                      name: fileMeta.name,
                      size: fileMeta.size,
                      webUrl: fileMeta.citationUrl,
                      downloadUrl,
                    },
                    null,
                    2
                  ),
              },
            ],
          };
        }

        // --------------------------------------------------------------------
        // 7. GET FILE DOWNLOAD URL (Strictly within Allowed Sites)
        // --------------------------------------------------------------------
        case 'query_file_download_url_lookup': {
          const { driveId, site } = await resolveAllowedDrive(graph, args.driveId, args.siteId);
          const itemId = await resolveFileItemId(graph, driveId, args.itemId);

          const response = await graph.get(
            `/drives/${encodeSafeGraphSegment(driveId, 'driveId')}/items/${encodeSafeGraphSegment(itemId, 'itemId')}`
          );
          const downloadUrl = response.data?.['@microsoft.graph.downloadUrl'];
          const formatted = formatCitationUrl(response.data);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl },
                    id: formatted.id,
                    name: formatted.name,
                    webUrl: formatted.citationUrl,
                    downloadUrl,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          throw new Error(
            `Unknown or disallowed tool '${name}'. This Least-Privilege SharePoint MCP server supports only read-only site-scoped tools.`
          );
      }
    } catch (error) {
      const graphError = error.response?.data?.error?.message || error.message;
      console.error(`Tool execution error [${name}]:`, graphError);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `SharePoint Least-Privilege MCP Error: ${graphError}`,
          },
        ],
      };
    }
  });

  return server;
}

// ============================================================================
// HTTP SERVER & STREAMABLE MCP TRANSPORT (With Hardened Security Headers)
// ============================================================================
const PORT = parseInt(process.env.PORT || '3000', 10);
// Listen on 127.0.0.1 by default for local testing; Dockerfile sets HOST=0.0.0.0 for Cloud Run
const HOST = process.env.HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');

function setSecurityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');

  const origin = req.headers.origin;
  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, mcp-session-id');
}

const httpServer = http.createServer(async (req, res) => {
  setSecurityHeaders(req, res);

  // Enforce strict HTTP method allow-list
  if (!['GET', 'POST', 'OPTIONS'].includes(req.method || '')) {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed. Only GET, POST, and OPTIONS are permitted.' }));
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Enforce rate limiting per client IP
  const clientIp = req.socket?.remoteAddress || '127.0.0.1';
  if (!checkRateLimit(clientIp)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Too Many Requests. Please retry later.' }));
    return;
  }

  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Health check endpoint
  if (req.method === 'GET' && reqUrl.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'least-privilege-sharepoint-mcp-server',
        permissionMode: 'Sites.Selected (Read-Only)',
      })
    );
    return;
  }

  // Dummy OAuth helper endpoints for Gemini Enterprise UI registration compatibility
  if (reqUrl.pathname === '/auth') {
    const redirectUri = reqUrl.searchParams.get('redirect_uri') || '';
    const state = reqUrl.searchParams.get('state') || '';
    // Strictly validate redirect_uri against trusted HTTPS Google Cloud console / Vertex AI origins
    try {
      const parsedRedirect = new URL(redirectUri);
      if (
        parsedRedirect.protocol === 'https:' &&
        (parsedRedirect.hostname.endsWith('.google.com') || parsedRedirect.hostname.endsWith('.googleusercontent.com'))
      ) {
        const redirectTarget = new URL(parsedRedirect.toString());
        redirectTarget.searchParams.set('code', crypto.randomBytes(16).toString('hex'));
        if (state) redirectTarget.searchParams.set('state', state);
        res.writeHead(302, { Location: redirectTarget.toString() });
        res.end();
        return;
      }
    } catch {
      // Fall through to 400
    }
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or untrusted redirect_uri parameter.' }));
    return;
  }

  if (reqUrl.pathname === '/token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        access_token: 'server_managed_sites_selected_credentials',
        token_type: 'Bearer',
        expires_in: 3600,
      })
    );
    return;
  }

  // MCP Endpoint (/mcp or /)
  if (reqUrl.pathname === '/mcp' || reqUrl.pathname === '/') {
    try {
      const authHeader = req.headers['authorization'];
      const mcpServer = createMcpServer(authHeader);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // Stateless HTTP transport for Cloud Run scalability
      });

      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error('Error handling MCP HTTP request:', err.message);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error processing MCP request.' }));
      }
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found. Send MCP requests to /mcp.' }));
  }
});

httpServer.listen(PORT, HOST, () => {
  console.log(
    `🔒 Least-Privilege SharePoint MCP Server (Entra ID Sites.Selected) listening on http://${HOST}:${PORT}/mcp`
  );
});
