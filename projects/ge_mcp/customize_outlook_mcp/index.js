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

require("dotenv").config({ path: process.env.DOTENV_CONFIG_PATH || ".env" });
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const axios = require("axios");
const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

// --- Configuration & Security Constants ---
const PORT = Number(process.env.PORT) || 8080;
const BIND_HOST = process.env.HOST || (process.env.K_SERVICE ? "0.0.0.0" : "127.0.0.1");
const ALLOW_APP_CREDENTIALS = process.env.ALLOW_APP_CREDENTIALS === "true";
const ALLOW_LOCAL_MOCK_AUTH = process.env.ALLOW_LOCAL_MOCK_AUTH === "true";
const OUTLOOK_USER_ID = (process.env.OUTLOOK_USER_ID || "").trim();

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB JSON-RPC cap
const GRAPH_MAX_BYTES = 10 * 1024 * 1024; // 10 MB Graph response cap
const GRAPH_TIMEOUT_MS = 30_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQ = 120;
const SESSION_TTL_MS = 3600 * 1000;
const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const SAFE_ID_REGEX = /^[A-Za-z0-9_=-]{1,512}$/;

const DEFAULT_REDIRECT_URIS = [
  "https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html",
  "https://vertexaisearch.cloud.google.com/oauth-redirect",
];
const ALLOWED_OAUTH_REDIRECT_URIS = new Set([
  ...DEFAULT_REDIRECT_URIS,
  ...(process.env.ALLOWED_OAUTH_REDIRECT_URIS || "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean),
]);

const ALLOWED_CORS_ORIGINS = new Set(
  (process.env.ALLOWED_CORS_ORIGINS || "https://vertexaisearch.cloud.google.com,https://console.cloud.google.com")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);

function resolveSigningSecret() {
  if (process.env.MCP_TOKEN_SIGNING_SECRET && process.env.MCP_TOKEN_SIGNING_SECRET.length >= 32) {
    return process.env.MCP_TOKEN_SIGNING_SECRET;
  }
  console.warn(
    "WARNING: MCP_TOKEN_SIGNING_SECRET not set; generating ephemeral per-instance signing key. Configure Secret Manager for multi-instance Cloud Run."
  );
  return crypto.randomBytes(32).toString("hex");
}
const TOKEN_SIGNING_SECRET = resolveSigningSecret();

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

// --- Signed Session Tokens & Single-Use Auth Codes (when ALLOW_APP_CREDENTIALS=true) ---
const pendingAuthCodes = new Map();

function issueSessionToken(subject) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: subject,
      exp: Date.now() + SESSION_TTL_MS,
      nonce: crypto.randomBytes(12).toString("base64url"),
    })
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", TOKEN_SIGNING_SECRET).update(payload).digest("base64url");
  return `mcp_st_${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (typeof token !== "string" || !token.startsWith("mcp_st_")) return null;
  const raw = token.slice("mcp_st_".length);
  const dotIdx = raw.indexOf(".");
  if (dotIdx <= 0) return null;
  const payload = raw.slice(0, dotIdx);
  const sig = raw.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac("sha256", TOKEN_SIGNING_SECRET).update(payload).digest("base64url");
  if (!timingSafeMatch(expectedSig, sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Connection Pooling & Bounded Axios Instance ---
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 50 });
const graphHttp = axios.create({
  httpsAgent,
  timeout: GRAPH_TIMEOUT_MS,
  maxContentLength: GRAPH_MAX_BYTES,
  maxBodyLength: GRAPH_MAX_BYTES,
});

// --- Rate Limiting with Periodic Eviction ---
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= RATE_LIMIT_MAX_REQ;
}

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
  for (const [code, meta] of pendingAuthCodes.entries()) {
    if (now > meta.expiresAt) pendingAuthCodes.delete(code);
  }
}, RATE_LIMIT_WINDOW_MS);
cleanupInterval.unref();

// --- Security Headers ---
function applySecurityHeaders(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");

  const origin = req.headers.origin;
  if (origin && ALLOWED_CORS_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id");
  }
}

// --- Input Sanitization Helpers ---
function escapeODataLiteral(value) {
  return String(value).replace(/[\r\n\0]/g, " ").replace(/'/g, "''").trim();
}

function sanitizeSearchQuery(value) {
  return String(value).replace(/["\\\r\n\0]/g, " ").trim().slice(0, 256);
}

function assertValidIsoDateTime(value, fieldName) {
  if (typeof value !== "string" || !ISO_DATE_REGEX.test(value.trim()) || Number.isNaN(Date.parse(value.trim()))) {
    throw new Error(`Invalid ${fieldName}: must be a valid ISO-8601 timestamp (e.g., 2026-03-01T00:00:00Z).`);
  }
  return value.trim();
}

function assertValidSortOrder(value, defaultOrder = "asc") {
  if (value === undefined || value === null || value === "") return defaultOrder;
  const normalized = String(value).trim().toLowerCase();
  if (normalized !== "asc" && normalized !== "desc") {
    throw new Error("Invalid sortOrder: must be 'asc' or 'desc'.");
  }
  return normalized;
}

function clampLimit(value, defaultLimit = 10, maxLimit = 50) {
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultLimit;
  return Math.min(Math.max(1, Math.trunc(num)), maxLimit);
}

// --- App-Only Token Cache (Used ONLY when ALLOW_APP_CREDENTIALS=true + verified session token) ---
let cachedAppToken = null;
let tokenExpirationTime = 0;

async function getAppAccessToken() {
  const now = Date.now();
  if (cachedAppToken && now < tokenExpirationTime - 300_000) {
    return cachedAppToken;
  }

  const tenantId = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Microsoft Graph credentials in environment variables.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("scope", "https://graph.microsoft.com/.default");
  params.append("client_secret", clientSecret);
  params.append("grant_type", "client_credentials");

  const response = await graphHttp.post(tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  cachedAppToken = response.data.access_token;
  tokenExpirationTime = now + Number(response.data.expires_in || 3600) * 1000;
  return cachedAppToken;
}

// --- Strict Authentication Resolution ---
async function resolveAuthContext(reqAuthHeader) {
  const raw = String(reqAuthHeader || "").trim();
  const match = /^Bearer\s+(\S+)$/i.exec(raw);
  if (!match) {
    const err = new Error("Unauthorized: Missing Authorization Bearer token.");
    err.statusCode = 401;
    throw err;
  }

  const presented = match[1];
  if (ALLOW_LOCAL_MOCK_AUTH && isLoopbackHost(BIND_HOST) && presented === "local-test-token-0000") {
    return {
      isLocalMock: true,
      mailboxBase: "https://graph.microsoft.com/v1.0/me",
      headers: { Authorization: "Bearer local-test-token-0000", "Content-Type": "application/json" },
    };
  }

  // Case 1: Signed MCP session token from built-in /token flow (only valid when ALLOW_APP_CREDENTIALS=true)
  if (presented.startsWith("mcp_st_")) {
    if (!ALLOW_APP_CREDENTIALS) {
      const err = new Error("Unauthorized: App-only session tokens are disabled.");
      err.statusCode = 401;
      throw err;
    }
    const session = verifySessionToken(presented);
    if (!session) {
      const err = new Error("Unauthorized: Invalid or expired MCP session token.");
      err.statusCode = 401;
      throw err;
    }
    if (!OUTLOOK_USER_ID) {
      throw new Error("OUTLOOK_USER_ID environment variable is required when ALLOW_APP_CREDENTIALS=true.");
    }
    const appToken = await getAppAccessToken();
    return {
      isLocalMock: false,
      mailboxBase: `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(OUTLOOK_USER_ID)}`,
      headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
    };
  }

  // Case 2: Delegated Microsoft Entra JWT (3-part JWS passed through to Microsoft Graph /me)
  if (presented.split(".").length === 3 && presented.length >= 64) {
    return {
      isLocalMock: false,
      mailboxBase: "https://graph.microsoft.com/v1.0/me",
      headers: { Authorization: `Bearer ${presented}`, "Content-Type": "application/json" },
    };
  }

  const err = new Error("Unauthorized: Invalid Bearer token format.");
  err.statusCode = 401;
  throw err;
}

function stripHtmlTags(html) {
  if (!html) return "";
  let text = String(html).slice(0, 500_000);
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<\/(p|div|tr|li|h[1-6]|br)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n\n").trim();
}

// --- MCP Server Factory ---
function createMcpServer(getAuthHeader) {
  const server = new Server(
    { name: "microsoft-outlook-mcp", version: "2.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "query_recent_emails_lookup",
          description:
            "Search or list recent emails from the authenticated user's Outlook mailbox. Supports filtering by keyword, sender, or unread status.",
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Optional search keyword to match against email subject, body, or sender.",
              },
              unreadOnly: {
                type: "boolean",
                description: "If true, returns only unread emails.",
              },
              folder: {
                type: "string",
                enum: ["inbox", "sentitems", "drafts", "archive"],
                description: "Optional mail folder to search within. Defaults to all messages.",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 50,
                description: "Maximum number of emails to return (1..50, default 10).",
              },
            },
          },
        },
        {
          name: "query_email_content_lookup",
          description:
            "Read the full body, recipients, timestamps, and attachment metadata of a specific Outlook email by messageId.",
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: "object",
            properties: {
              messageId: {
                type: "string",
                description: "The unique Microsoft Graph message ID returned by query_recent_emails_lookup.",
              },
            },
            required: ["messageId"],
          },
        },
        {
          name: "send_mail_action_lookup",
          description:
            "Send an email via Microsoft Outlook on behalf of the authenticated user. Requires explicit user confirmation.",
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          },
          inputSchema: {
            type: "object",
            properties: {
              toRecipients: {
                type: "array",
                items: { type: "string" },
                description: "List of recipient email addresses (e.g., ['alice@example.com']).",
              },
              ccRecipients: {
                type: "array",
                items: { type: "string" },
                description: "Optional list of CC recipient email addresses.",
              },
              subject: {
                type: "string",
                description: "Subject line of the email.",
              },
              body: {
                type: "string",
                description: "Body content of the email (plain text or HTML).",
              },
              bodyType: {
                type: "string",
                enum: ["Text", "HTML"],
                description: "Format of the email body ('Text' or 'HTML'). Defaults to 'Text'.",
              },
            },
            required: ["toRecipients", "subject", "body"],
          },
        },
        {
          name: "query_calendar_events_lookup",
          description:
            "List or search calendar events and meetings from the authenticated user's Microsoft Outlook calendar.",
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: "object",
            properties: {
              startDateTime: {
                type: "string",
                description: "Optional ISO-8601 start timestamp (e.g., '2026-03-01T00:00:00Z').",
              },
              endDateTime: {
                type: "string",
                description: "Optional ISO-8601 end timestamp (e.g., '2026-03-31T23:59:59Z').",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 50,
                description: "Maximum number of calendar events to return (1..50, default 15).",
              },
              sortOrder: {
                type: "string",
                enum: ["asc", "desc"],
                description: "Sort direction for event start time ('asc' or 'desc'). Defaults to 'asc'.",
              },
            },
          },
        },
        {
          name: "create_event_action_lookup",
          description:
            "Schedule a new meeting or event on the authenticated user's Outlook calendar (with optional Microsoft Teams link).",
          annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: true,
          },
          inputSchema: {
            type: "object",
            properties: {
              subject: {
                type: "string",
                description: "Title/subject of the calendar event.",
              },
              startDateTime: {
                type: "string",
                description: "Event start timestamp in ISO-8601 format (e.g., '2026-03-20T14:00:00').",
              },
              endDateTime: {
                type: "string",
                description: "Event end timestamp in ISO-8601 format (e.g., '2026-03-20T15:00:00').",
              },
              timeZone: {
                type: "string",
                description: "IANA or Windows time zone (e.g., 'UTC', 'America/New_York'). Defaults to 'UTC'.",
              },
              attendees: {
                type: "array",
                items: { type: "string" },
                description: "Optional list of attendee email addresses.",
              },
              location: {
                type: "string",
                description: "Optional physical room or location string.",
              },
              body: {
                type: "string",
                description: "Optional meeting agenda or description.",
              },
              isOnlineMeeting: {
                type: "boolean",
                description: "If true, creates a Microsoft Teams online meeting link. Defaults to false.",
              },
            },
            required: ["subject", "startDateTime", "endDateTime"],
          },
        },
        {
          name: "query_contacts_lookup",
          description:
            "Search the user's personal Outlook contacts or Microsoft 365 People directory by name, email, or department.",
          annotations: { readOnlyHint: true, destructiveHint: false },
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Optional name, email, or keyword to search people/contacts.",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 50,
                description: "Maximum number of contacts to return (1..50, default 10).",
              },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    console.log(JSON.stringify({ event: "mcp_tool_call", tool: name }));

    try {
      const authCtx = await resolveAuthContext(getAuthHeader());
      const { headers, mailboxBase, isLocalMock } = authCtx;

      // 1. Search / List Emails
      if (name === "query_recent_emails_lookup") {
        const limit = clampLimit(args.limit, 10, 50);
        const allowedFolders = new Set(["inbox", "sentitems", "drafts", "archive"]);
        if (args.folder && !allowedFolders.has(String(args.folder).toLowerCase())) {
          throw new Error("Invalid folder: must be one of inbox, sentitems, drafts, archive.");
        }
        const basePath = args.folder
          ? `${mailboxBase}/mailFolders/${encodeURIComponent(String(args.folder).toLowerCase())}/messages`
          : `${mailboxBase}/messages`;

        const params = new URLSearchParams();
        params.append("$top", String(limit));
        params.append("$select", "id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,webLink");

        const requestHeaders = { ...headers };
        if (args.query) {
          const safeQuery = sanitizeSearchQuery(args.query);
          params.append("$search", `"${safeQuery}"`);
          requestHeaders["ConsistencyLevel"] = "eventual";
        } else {
          params.append("$orderby", "receivedDateTime desc");
          if (args.unreadOnly === true) {
            params.append("$filter", "isRead eq false");
          }
        }

        const graphUrl = `${basePath}?${params.toString()}`;
        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, url: graphUrl }, null, 2) }],
          };
        }

        const res = await graphHttp.get(graphUrl, { headers: requestHeaders });
        const messages = (res.data.value || []).map((msg) => ({
          id: msg.id,
          subject: msg.subject || "(No Subject)",
          from: msg.from?.emailAddress ? `${msg.from.emailAddress.name || ""} <${msg.from.emailAddress.address || ""}>` : "Unknown",
          to: (msg.toRecipients || []).map((r) => r.emailAddress?.address).filter(Boolean),
          receivedDateTime: msg.receivedDateTime,
          isRead: msg.isRead,
          hasAttachments: msg.hasAttachments,
          preview: msg.bodyPreview,
          webLink: msg.webLink,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(messages, null, 2) }],
        };
      }

      // 2. Read Specific Email Content
      if (name === "query_email_content_lookup") {
        const messageId = String(args.messageId || "").trim();
        if (!SAFE_ID_REGEX.test(messageId)) {
          throw new Error("Invalid messageId parameter.");
        }

        const msgUrl = `${mailboxBase}/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,body,webLink&$expand=attachments($select=id,name,contentType,size,isInline)`;
        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, url: msgUrl }, null, 2) }],
          };
        }

        const res = await graphHttp.get(msgUrl, { headers });
        const msg = res.data;
        const bodyText =
          msg.body?.contentType?.toLowerCase() === "html" ? stripHtmlTags(msg.body.content) : msg.body?.content || "";

        const formatted = {
          id: msg.id,
          subject: msg.subject || "(No Subject)",
          from: msg.from?.emailAddress,
          to: (msg.toRecipients || []).map((r) => r.emailAddress),
          cc: (msg.ccRecipients || []).map((r) => r.emailAddress),
          receivedDateTime: msg.receivedDateTime,
          sentDateTime: msg.sentDateTime,
          webLink: msg.webLink,
          attachments: (msg.attachments || []).map((a) => ({
            id: a.id,
            name: a.name,
            contentType: a.contentType,
            size: a.size,
          })),
          body: bodyText,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
        };
      }

      // 3. Send Email
      if (name === "send_mail_action_lookup") {
        const { toRecipients, ccRecipients = [], subject, body, bodyType = "Text" } = args;
        if (!Array.isArray(toRecipients) || toRecipients.length === 0 || toRecipients.length > 50) {
          throw new Error("toRecipients must be an array of 1..50 valid email addresses.");
        }
        const validatedTo = toRecipients.map((addr) => {
          const trimmed = String(addr || "").trim();
          if (!EMAIL_REGEX.test(trimmed)) throw new Error(`Invalid recipient email address: ${trimmed}`);
          return { emailAddress: { address: trimmed } };
        });
        const validatedCc = (Array.isArray(ccRecipients) ? ccRecipients : []).slice(0, 50).map((addr) => {
          const trimmed = String(addr || "").trim();
          if (!EMAIL_REGEX.test(trimmed)) throw new Error(`Invalid CC email address: ${trimmed}`);
          return { emailAddress: { address: trimmed } };
        });
        const normalizedBodyType = bodyType === "HTML" ? "HTML" : "Text";

        const payload = {
          message: {
            subject: String(subject || "").slice(0, 500),
            body: {
              contentType: normalizedBodyType,
              content: String(body || "").slice(0, 250_000),
            },
            toRecipients: validatedTo,
            ccRecipients: validatedCc,
          },
          saveToSentItems: true,
        };

        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, status: "sent", recipients: validatedTo.length }) }],
          };
        }

        await graphHttp.post(`${mailboxBase}/sendMail`, payload, { headers });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { status: "sent", to: toRecipients, cc: ccRecipients, subject: payload.message.subject },
                null,
                2
              ),
            },
          ],
        };
      }

      // 4. List Calendar Events (Fixes C-05 startDateTime/endDateTime & S-08 OData injection)
      if (name === "query_calendar_events_lookup") {
        const limit = clampLimit(args.limit, 15, 50);
        const order = assertValidSortOrder(args.sortOrder, "asc");
        const validStart = args.startDateTime ? assertValidIsoDateTime(args.startDateTime, "startDateTime") : null;
        const validEnd = args.endDateTime ? assertValidIsoDateTime(args.endDateTime, "endDateTime") : null;

        const params = new URLSearchParams();
        params.append("$top", String(limit));
        params.append("$select", "id,subject,start,end,location,organizer,attendees,isOnlineMeeting,onlineMeeting,webLink,bodyPreview");
        params.append("$orderby", `start/dateTime ${order}`);

        let endpointPath;
        if (validStart && validEnd) {
          // Use Microsoft Graph /calendarView when bounded by start & end to expand recurring events accurately
          endpointPath = `${mailboxBase}/calendarView`;
          params.append("startDateTime", validStart);
          params.append("endDateTime", validEnd);
        } else {
          endpointPath = `${mailboxBase}/events`;
          if (validStart) {
            params.append("$filter", `start/dateTime ge '${escapeODataLiteral(validStart)}'`);
          } else if (validEnd) {
            params.append("$filter", `end/dateTime le '${escapeODataLiteral(validEnd)}'`);
          }
        }

        const graphUrl = `${endpointPath}?${params.toString()}`;
        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, url: graphUrl }, null, 2) }],
          };
        }

        const res = await graphHttp.get(graphUrl, {
          headers: { ...headers, Prefer: 'outlook.timezone="UTC"' },
        });

        const events = (res.data.value || []).map((ev) => ({
          id: ev.id,
          subject: ev.subject || "(No Title)",
          start: ev.start,
          end: ev.end,
          location: ev.location?.displayName || "",
          organizer: ev.organizer?.emailAddress,
          attendees: (ev.attendees || []).map((a) => ({
            name: a.emailAddress?.name,
            email: a.emailAddress?.address,
            status: a.status?.response,
          })),
          onlineMeetingUrl: ev.onlineMeeting?.joinUrl || null,
          preview: ev.bodyPreview,
          webLink: ev.webLink,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(events, null, 2) }],
        };
      }

      // 5. Create Calendar Event
      if (name === "create_event_action_lookup") {
        const {
          subject,
          startDateTime,
          endDateTime,
          timeZone = "UTC",
          attendees = [],
          location,
          body,
          isOnlineMeeting = false,
        } = args;

        const validStart = assertValidIsoDateTime(startDateTime, "startDateTime");
        const validEnd = assertValidIsoDateTime(endDateTime, "endDateTime");
        const validatedAttendees = (Array.isArray(attendees) ? attendees : []).slice(0, 100).map((email) => {
          const trimmed = String(email || "").trim();
          if (!EMAIL_REGEX.test(trimmed)) throw new Error(`Invalid attendee email: ${trimmed}`);
          return { emailAddress: { address: trimmed }, type: "required" };
        });

        const payload = {
          subject: String(subject || "").slice(0, 500),
          start: { dateTime: validStart, timeZone: String(timeZone || "UTC").slice(0, 64) },
          end: { dateTime: validEnd, timeZone: String(timeZone || "UTC").slice(0, 64) },
          attendees: validatedAttendees,
          isOnlineMeeting: Boolean(isOnlineMeeting),
        };
        if (location) payload.location = { displayName: String(location).slice(0, 256) };
        if (body) payload.body = { contentType: "Text", content: String(body).slice(0, 50_000) };
        if (isOnlineMeeting) payload.onlineMeetingProvider = "teamsForBusiness";

        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, status: "created", subject: payload.subject }) }],
          };
        }

        const res = await graphHttp.post(`${mailboxBase}/events`, payload, { headers });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "created",
                  id: res.data.id,
                  subject: res.data.subject,
                  start: res.data.start,
                  end: res.data.end,
                  webLink: res.data.webLink,
                  onlineMeetingUrl: res.data.onlineMeeting?.joinUrl || null,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // 6. Search Contacts / People
      if (name === "query_contacts_lookup") {
        const limit = clampLimit(args.limit, 10, 50);
        if (args.query) {
          const safeLiteral = escapeODataLiteral(args.query);
          const safeSearch = sanitizeSearchQuery(args.query);
          const peopleParams = new URLSearchParams({ $top: String(limit), $search: `"${safeSearch}"` });
          const peopleUrl = `${mailboxBase}/people?${peopleParams.toString()}`;

          if (isLocalMock) {
            const filterClause = `startswith(displayName,'${safeLiteral}') or startswith(givenName,'${safeLiteral}') or startswith(surname,'${safeLiteral}')`;
            return {
              content: [{ type: "text", text: JSON.stringify({ mock: true, peopleUrl, fallbackFilter: filterClause }, null, 2) }],
            };
          }

          try {
            const peopleRes = await graphHttp.get(peopleUrl, { headers });
            const people = (peopleRes.data.value || []).map((p) => ({
              id: p.id,
              displayName: p.displayName,
              jobTitle: p.jobTitle,
              department: p.department,
              emails: (p.scoredEmailAddresses || []).map((e) => e.address),
              phones: (p.phones || []).map((ph) => ph.number),
            }));
            return {
              content: [{ type: "text", text: JSON.stringify(people, null, 2) }],
            };
          } catch {
            const contactParams = new URLSearchParams({
              $top: String(limit),
              $select: "id,displayName,emailAddresses,businessPhones,mobilePhone,jobTitle,companyName,department",
              $filter: `startswith(displayName,'${safeLiteral}') or startswith(givenName,'${safeLiteral}') or startswith(surname,'${safeLiteral}')`,
            });
            const contactsRes = await graphHttp.get(`${mailboxBase}/contacts?${contactParams.toString()}`, { headers });
            return {
              content: [{ type: "text", text: JSON.stringify(contactsRes.data.value || [], null, 2) }],
            };
          }
        }

        const listParams = new URLSearchParams({
          $top: String(limit),
          $select: "id,displayName,emailAddresses,businessPhones,mobilePhone,jobTitle,companyName,department",
        });
        const listUrl = `${mailboxBase}/contacts?${listParams.toString()}`;
        if (isLocalMock) {
          return {
            content: [{ type: "text", text: JSON.stringify({ mock: true, url: listUrl }, null, 2) }],
          };
        }
        const contactsRes = await graphHttp.get(listUrl, { headers });
        return {
          content: [{ type: "text", text: JSON.stringify(contactsRes.data.value || [], null, 2) }],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      const safeMsg = error.response?.status
        ? `Microsoft Graph API error (HTTP ${error.response.status})`
        : error.message;
      console.error(JSON.stringify({ event: "outlook_tool_error", tool: name, message: safeMsg }));
      return {
        content: [{ type: "text", text: `Error executing ${name}: ${safeMsg}` }],
        isError: true,
      };
    }
  });

  return server;
}

function readBoundedBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let failed = false;
    req.on("data", (chunk) => {
      if (failed) return;
      total += chunk.length;
      if (total > maxBytes) {
        failed = true;
        const err = new Error("Payload Too Large");
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!failed) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => {
      if (!failed) reject(err);
    });
  });
}

// --- HTTP Server ---
const httpServer = http.createServer(async (req, res) => {
  applySecurityHeaders(req, res);

  const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  if (!checkRateLimit(clientIp)) {
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
    pathname = decodeURIComponent(reqUrl.pathname).replace(/\/+$/, "") || "/";
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Malformed request URI" }));
  }

  // Health Check
  if (req.method === "GET" && (pathname === "/" || pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "microsoft-outlook-mcp" }));
  }

  // Hardened OAuth /auth endpoint (S-04: exact-match redirect_uri allowlist)
  if (req.method === "GET" && pathname === "/auth") {
    const redirectUri = (reqUrl.searchParams.get("redirect_uri") || "").trim();
    const state = reqUrl.searchParams.get("state") || "";
    const clientId = (reqUrl.searchParams.get("client_id") || "").trim();

    if (!redirectUri || !ALLOWED_OAUTH_REDIRECT_URIS.has(redirectUri)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid or unauthorized redirect_uri." }));
    }

    if (!ALLOW_APP_CREDENTIALS) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          error: "Built-in OAuth bridge is disabled. Configure Gemini Enterprise directly with Microsoft Entra ID OAuth 2.0 endpoints.",
        })
      );
    }

    const expectedClientId = process.env.MCP_OAUTH_CLIENT_ID || "";
    if (!expectedClientId || !timingSafeMatch(expectedClientId, clientId)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid client_id." }));
    }

    const code = crypto.randomBytes(24).toString("base64url");
    if (pendingAuthCodes.size >= 500) {
      const oldestKey = pendingAuthCodes.keys().next().value;
      if (oldestKey) pendingAuthCodes.delete(oldestKey);
    }
    pendingAuthCodes.set(code, { redirectUri, expiresAt: Date.now() + AUTH_CODE_TTL_MS });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    if (state) target.searchParams.set("state", state);

    res.writeHead(302, { Location: target.toString() });
    return res.end();
  }

  // Hardened OAuth /token endpoint (requires MCP_OAUTH_CLIENT_ID + MCP_OAUTH_CLIENT_SECRET)
  if (req.method === "POST" && pathname === "/token") {
    if (!ALLOW_APP_CREDENTIALS) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Built-in token endpoint is disabled. Use Microsoft Entra ID OAuth 2.0." }));
    }

    let bodyText;
    try {
      bodyText = await readBoundedBody(req, 64 * 1024);
    } catch (err) {
      res.writeHead(err.statusCode || 400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }

    let params = new URLSearchParams(bodyText);
    if ((req.headers["content-type"] || "").includes("application/json")) {
      try {
        const parsedJson = JSON.parse(bodyText);
        params = new URLSearchParams(parsedJson);
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

    const expectedId = process.env.MCP_OAUTH_CLIENT_ID || "";
    const expectedSecret = process.env.MCP_OAUTH_CLIENT_SECRET || "";
    if (!timingSafeMatch(expectedId, clientId) || !timingSafeMatch(expectedSecret, clientSecret)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "invalid_client" }));
    }

    const grantType = params.get("grant_type") || "authorization_code";
    if (grantType === "authorization_code") {
      const code = params.get("code") || "";
      const codeMeta = pendingAuthCodes.get(code);
      pendingAuthCodes.delete(code);
      if (!codeMeta || Date.now() > codeMeta.expiresAt) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid_grant" }));
      }
    } else if (grantType !== "refresh_token" && grantType !== "client_credentials") {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "unsupported_grant_type" }));
    }

    const accessToken = issueSessionToken(clientId);
    const refreshToken = issueSessionToken(`${clientId}:refresh`);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refreshToken,
      })
    );
  }

  // MCP Streamable HTTP Endpoint (/mcp or /sse)
  if (pathname === "/mcp" || pathname === "/sse") {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      res.writeHead(413, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Payload Too Large" }));
    }

    try {
      await resolveAuthContext(req.headers.authorization);
    } catch (authErr) {
      res.writeHead(authErr.statusCode || 401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="microsoft-outlook-mcp"',
      });
      return res.end(JSON.stringify({ error: authErr.message }));
    }

    try {
      let parsedBody;
      if (req.method === "POST") {
        const rawBody = await readBoundedBody(req, MAX_BODY_BYTES);
        parsedBody = JSON.parse(rawBody);
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const mcpServer = createMcpServer(() => req.headers.authorization);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
    } catch (err) {
      const statusCode = err.statusCode || (err instanceof SyntaxError ? 400 : 500);
      if (!res.headersSent) {
        res.writeHead(statusCode, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: statusCode === 400 ? -32700 : -32603, message: statusCode === 413 ? "Payload Too Large" : "Request failed" },
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

httpServer.listen(PORT, BIND_HOST, () => {
  console.log(`Microsoft Outlook MCP Server running on http://${BIND_HOST}:${PORT}`);
});
