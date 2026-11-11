// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { GoogleAuth } from "google-auth-library";

const require = createRequire(import.meta.url);
const {
  MCP_APP_MIME_TYPE,
  SKILL_CACHE_TTL_MS,
  loadSkillsCatalog,
  buildMcpAppMeta,
  renderSecureMcpWorkbenchHtml,
  buildV2Capabilities,
} = require("./mcp_v2_extensions.cjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_CATALOG = loadSkillsCatalog(path.join(__dirname, "skills"));

const APP_URI = "ui://vertex-claude-mcp/reasoning-workbench.html";
const { toolMeta: INLINE_APP_META, resourceMeta: APP_RESOURCE_META } = buildMcpAppMeta(APP_URI);
const { toolMeta: LAUNCHER_APP_META } = buildMcpAppMeta(APP_URI, {
  entrypointTitle: "Claude Reasoning Studio",
});

// --- Configuration & Input Validation ---
const PROJECT_ID = (process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
const REGION = (process.env.REGION || "global").trim();
const DEFAULT_MODEL = (process.env.DEFAULT_MODEL || "claude-sonnet-4-6").trim();
const ALLOW_ADC_FALLBACK = process.env.ALLOW_ADC_FALLBACK === "true";
const ALLOW_LOCAL_MOCK_AUTH = process.env.ALLOW_LOCAL_MOCK_AUTH === "true";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 8192;
const MAX_PROMPT_CHARS = 200_000;
const MAX_SSE_CLIENTS = 100;
const SSE_SESSION_TTL_MS = 15 * 60_000;
const MAX_RATE_LIMIT_ENTRIES = 5000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQ = 120;

const PROJECT_ID_REGEX = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_REGEX = /^[a-z0-9-]+$/;
const MODEL_ID_REGEX = /^claude-[a-z0-9.-]{1,64}$/;
const SAFE_HOST_REGEX = /^[a-zA-Z0-9.-]+(?::\d{1,5})?$/;

const ALLOWED_CORS_ORIGINS = new Set(
  (process.env.ALLOWED_CORS_ORIGINS || "https://vertexaisearch.cloud.google.com,https://console.cloud.google.com")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);

if (PROJECT_ID && !PROJECT_ID_REGEX.test(PROJECT_ID)) {
  console.error("FATAL: Invalid PROJECT_ID format.");
  process.exit(1);
}
if (!REGION_REGEX.test(REGION)) {
  console.error("FATAL: Invalid REGION format.");
  process.exit(1);
}
if (!MODEL_ID_REGEX.test(DEFAULT_MODEL)) {
  console.error("FATAL: Invalid DEFAULT_MODEL format.");
  process.exit(1);
}

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

let lastAppPayload = {
  items: [
    {
      id: "ready",
      title: `Vertex AI Claude Studio (${DEFAULT_MODEL})`,
      category: "Ready",
      meta: `Max tokens cap: ${MAX_TOKENS_HARD_CAP}`,
      snippet: "Enter a prompt above or open the Critique Composer to invoke Anthropic Claude on Vertex AI.",
    },
  ],
};

function renderWorkbenchHtml(payload = lastAppPayload) {
  return renderSecureMcpWorkbenchHtml({
    appUri: APP_URI,
    appTitle: "Vertex AI Claude Reasoning & Critique Studio",
    brandBadge: "MCP v2.0 • Skills + Apps",
    subtitle: "Run comparative reasoning on Vertex AI Claude, inspect token telemetry, and attach findings to chat.",
    primaryColor: "#7c3aed",
    primaryLight: "#f3e8ff",
    darkPrimaryColor: "#c084fc",
    darkPrimaryLight: "#3b0764",
    defaultToolName: "ask_claude",
    defaultToolParam: "prompt",
    searchPlaceholder: "Quick prompt to Claude...",
    secondaryActionLabel: "Structured Critique Composer",
    secondaryToolName: "ask_claude",
    secondaryFields: [
      { name: "prompt", label: "Prompt / Code / Architecture Under Review", placeholder: "Paste specification or diff...", multiline: true },
      { name: "system_prompt", label: "System Instructions (Optional)", placeholder: "e.g., Audit for CWE-863 and CWE-287...", multiline: true },
      { name: "model", label: "Model ID (Optional)", placeholder: DEFAULT_MODEL },
      { name: "max_tokens", label: "Max Output Tokens (1..8192)", placeholder: "4096", isNumber: true },
    ],
    initialPayload: payload,
  });
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function resolveRateLimitBucket(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    return `tok:${crypto.createHash("sha256").update(authHeader).digest("hex").slice(0, 16)}`;
  }
  const xff = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ip = xff.length > 0 ? xff[xff.length - 1] : String(req.socket.remoteAddress || "unknown").trim();
  return `ip:${ip}`;
}

const rateLimitMap = new Map();
function checkRateLimit(bucketKey) {
  const now = Date.now();
  const existing = rateLimitMap.get(bucketKey);
  if (existing && now <= existing.resetAt) {
    existing.count += 1;
    return existing.count <= RATE_LIMIT_MAX_REQ;
  }
  if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now > v.resetAt) rateLimitMap.delete(k);
    }
    if (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldest = rateLimitMap.keys().next().value;
      if (oldest) rateLimitMap.delete(oldest);
    }
  }
  rateLimitMap.set(bucketKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
  return true;
}

const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
}, RATE_LIMIT_WINDOW_MS);
evictionTimer.unref();

function hashCallerIdentity(bearerToken) {
  return crypto
    .createHash("sha256")
    .update(bearerToken ? `bearer:${bearerToken}` : "adc-fallback")
    .digest();
}

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Mcp-Session-Id");
  }
}

function readBoundedBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let aborted = false;
    req.on("data", (chunk) => {
      if (aborted) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
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

function extractBearerToken(req) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  if (!match) return null;
  const token = match[1];
  if (
    token.length < 16 ||
    token.toLowerCase() === "mock" ||
    token.toLowerCase() === "null" ||
    token.toLowerCase() === "undefined"
  ) {
    return null;
  }
  return token;
}

async function invokeClaude({ prompt, systemPrompt, model, maxTokens, bearerToken, allowMock }) {
  const startedAt = Date.now();
  const clampedMaxTokens = Math.min(
    Math.max(1, Math.trunc(Number(maxTokens) || MAX_TOKENS_DEFAULT)),
    MAX_TOKENS_HARD_CAP
  );

  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    throw new Error("Parameter 'prompt' must be a non-empty string.");
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Parameter 'prompt' exceeds maximum length of ${MAX_PROMPT_CHARS} characters.`);
  }
  if (systemPrompt !== undefined && (typeof systemPrompt !== "string" || systemPrompt.length > MAX_PROMPT_CHARS)) {
    throw new Error("Parameter 'system_prompt' must be a string within size bounds.");
  }

  const resolvedModel = (model || DEFAULT_MODEL).trim();
  if (!MODEL_ID_REGEX.test(resolvedModel)) {
    throw new Error("Invalid model identifier. Expected an approved Claude model ID (e.g., claude-sonnet-4-6).");
  }

  if (allowMock && bearerToken === "local-test-token-0000") {
    const mockObj = {
      mock: true,
      model: resolvedModel,
      clamped_max_tokens: clampedMaxTokens,
      prompt_chars: prompt.length,
      latency_ms: Date.now() - startedAt,
      answer: `[Mock Claude Response from ${resolvedModel}] Processed ${prompt.length} chars.`,
    };
    return { text: JSON.stringify(mockObj), structured: mockObj };
  }

  if (!PROJECT_ID) {
    throw new Error("Server misconfiguration: PROJECT_ID environment variable is required.");
  }

  let token = bearerToken;
  if (!token) {
    if (!ALLOW_ADC_FALLBACK) {
      const err = new Error("Unauthorized: Bearer token is required.");
      err.statusCode = 401;
      throw err;
    }
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    token = tokenResponse?.token || tokenResponse;
  }

  const host = REGION === "global" ? "aiplatform.googleapis.com" : `${REGION}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${encodeURIComponent(PROJECT_ID)}/locations/${encodeURIComponent(
    REGION
  )}/publishers/anthropic/models/${encodeURIComponent(resolvedModel)}:rawPredict`;

  const payload = {
    anthropic_version: "vertex-2023-10-16",
    messages: [{ role: "user", content: prompt }],
    max_tokens: clampedMaxTokens,
  };
  if (systemPrompt) payload.system = systemPrompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Vertex AI upstream error (${response.status})`);
  }

  const data = await response.json();
  const answer =
    data.content && Array.isArray(data.content)
      ? data.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
      : "Received non-text response from Claude.";

  return {
    text: answer,
    structured: {
      model: resolvedModel,
      clamped_max_tokens: clampedMaxTokens,
      prompt_chars: prompt.length,
      latency_ms: Date.now() - startedAt,
      answer,
      normalizedItems: [
        {
          id: `claude-${Date.now()}`,
          title: `Claude Critique (${resolvedModel})`,
          category: `${clampedMaxTokens} max_tokens`,
          severity: "ok",
          meta: `Latency: ${Date.now() - startedAt} ms • Prompt: ${prompt.length} chars`,
          snippet: answer,
        },
      ],
    },
  };
}

const TOOLS = [
  {
    name: "ask_claude",
    description:
      "Consult Anthropic Claude on Vertex AI (defaults to Claude Sonnet 4.6) for complex reasoning, coding, security review, or comparative analysis. Supports inline MCP App visualization.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
    _meta: INLINE_APP_META,
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The prompt, question, or task to send to Claude.",
        },
        system_prompt: {
          type: "string",
          description: "Optional system instructions to set persona, constraints, or formatting.",
        },
        model: {
          type: "string",
          description: `Optional Vertex AI Anthropic model ID. Defaults to '${DEFAULT_MODEL}'.`,
        },
        max_tokens: {
          type: "integer",
          minimum: 1,
          maximum: MAX_TOKENS_HARD_CAP,
          description: `Maximum output tokens to generate (clamped to 1..${MAX_TOKENS_HARD_CAP}). Defaults to ${MAX_TOKENS_DEFAULT}.`,
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "open_claude_reasoning_workbench",
    description:
      "Open the interactive Vertex AI Claude Reasoning & Critique Studio MCP App (ui://vertex-claude-mcp/reasoning-workbench.html).",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    _meta: LAUNCHER_APP_META,
    inputSchema: {
      type: "object",
      properties: {
        initial_topic: {
          type: "string",
          description: "Optional topic or context note to display when opening the studio.",
        },
      },
    },
  },
];

async function processJsonRpc(rpc, authContext) {
  if (!rpc || typeof rpc !== "object" || !rpc.method) return null;

  if (rpc.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        protocolVersion: rpc.params?.protocolVersion || "2025-06-18",
        capabilities: buildV2Capabilities(),
        serverInfo: {
          name: "vertex-claude-mcp",
          version: "2.0.0",
        },
      },
    };
  }

  if (rpc.method.startsWith("notifications/")) return null;
  if (rpc.method === "ping") return { jsonrpc: "2.0", id: rpc.id, result: {} };

  // SEP-2640: skills/list
  if (rpc.method === "skills/list") {
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        resultType: "complete",
        skills: Array.from(SKILLS_CATALOG.skillsByUri.values()),
        ttlMs: SKILL_CACHE_TTL_MS,
        cacheScope: "public",
      },
    };
  }

  // SEP-2640: skills/get
  if (rpc.method === "skills/get") {
    const uri = String(rpc.params?.uri || "").trim();
    const skill = SKILLS_CATALOG.skillsByUri.get(uri);
    if (!skill) {
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32602, message: `Unknown skill URI: ${uri}` },
      };
    }
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        resultType: "complete",
        skill,
        ttlMs: SKILL_CACHE_TTL_MS,
        cacheScope: "public",
      },
    };
  }

  // SEP-2640: resources/directory/read
  if (rpc.method === "resources/directory/read") {
    const cleanUri = String(rpc.params?.uri || "").trim().replace(/\/+$/, "");
    const dirMap = SKILLS_CATALOG.directoriesByUri.get(cleanUri);
    if (!dirMap) {
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        error: { code: -32602, message: `Unknown skill directory URI: ${cleanUri}` },
      };
    }
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        resultType: "complete",
        resources: Array.from(dirMap.values()),
        ttlMs: SKILL_CACHE_TTL_MS,
        cacheScope: "public",
      },
    };
  }

  // Base MCP Resources + SEP-1865 UI Resource + SEP-2640 Skill Resources
  if (rpc.method === "resources/list") {
    const resources = [
      {
        uri: APP_URI,
        name: "Vertex AI Claude Reasoning Studio",
        description: "Interactive MCP App for multi-model Claude prompts, critiques, and telemetry.",
        mimeType: MCP_APP_MIME_TYPE,
        _meta: APP_RESOURCE_META,
      },
      ...Array.from(SKILLS_CATALOG.skillsByUri.values()).map((s) => ({
        uri: s.uri,
        name: s.frontmatter.name,
        description: s.frontmatter.description,
        mimeType: "text/markdown",
      })),
    ];
    return { jsonrpc: "2.0", id: rpc.id, result: { resources } };
  }

  if (rpc.method === "resources/read") {
    const uri = String(rpc.params?.uri || "").trim();
    if (uri === APP_URI) {
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          resultType: "complete",
          contents: [
            {
              uri: APP_URI,
              mimeType: MCP_APP_MIME_TYPE,
              text: renderWorkbenchHtml(lastAppPayload),
              _meta: APP_RESOURCE_META,
            },
          ],
          ttlMs: 60_000,
          cacheScope: "private",
        },
      };
    }
    const skillFile = SKILLS_CATALOG.filesByUri.get(uri);
    if (skillFile) {
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          resultType: "complete",
          contents: [
            {
              uri: skillFile.uri,
              mimeType: skillFile.mimeType,
              text: skillFile.text,
            },
          ],
          ttlMs: SKILL_CACHE_TTL_MS,
          cacheScope: "public",
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32602, message: `Unknown resource URI: ${uri}` },
    };
  }

  if (rpc.method === "tools/list") {
    return { jsonrpc: "2.0", id: rpc.id, result: { tools: TOOLS } };
  }

  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name;
    const args = rpc.params?.arguments || {};

    if (toolName === "open_claude_reasoning_workbench") {
      const topic = typeof args.initial_topic === "string" ? args.initial_topic.slice(0, 500) : "";
      const payload = topic
        ? {
            normalizedItems: [
              {
                id: "topic-init",
                title: `Studio Ready: ${topic}`,
                category: DEFAULT_MODEL,
                severity: "ok",
                meta: `Cap: ${MAX_TOKENS_HARD_CAP} tokens`,
                snippet: "Use the quick search bar or Structured Critique Composer above to query Claude.",
              },
            ],
          }
        : lastAppPayload;
      lastAppPayload = payload;
      return {
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          content: [
            { type: "text", text: JSON.stringify({ status: "opened", appUri: APP_URI, defaultModel: DEFAULT_MODEL }) },
            {
              type: "resource",
              resource: {
                uri: APP_URI,
                mimeType: MCP_APP_MIME_TYPE,
                text: renderWorkbenchHtml(payload),
                _meta: APP_RESOURCE_META,
              },
            },
          ],
          structuredContent: payload,
        },
      };
    }

    if (toolName === "ask_claude") {
      try {
        const out = await invokeClaude({
          prompt: args.prompt,
          systemPrompt: args.system_prompt,
          model: args.model,
          maxTokens: args.max_tokens,
          bearerToken: authContext.bearerToken,
          allowMock: authContext.allowMock,
        });
        lastAppPayload = out.structured;
        return {
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            content: [{ type: "text", text: out.text }],
            structuredContent: out.structured,
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            content: [{ type: "text", text: `Error executing Claude request: ${err.message}` }],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    };
  }

  if (rpc.id !== undefined) {
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      error: { code: -32601, message: `Method not supported: ${rpc.method}` },
    };
  }
  return null;
}

const sseClients = new Map();
const PORT = Number(process.env.PORT) || 8080;
const BIND_HOST = process.env.HOST || (process.env.K_SERVICE ? "0.0.0.0" : "127.0.0.1");

function resolveSafeBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  }
  const rawHost = String(req.headers.host || "127.0.0.1").trim();
  const safeHost = SAFE_HOST_REGEX.test(rawHost) ? rawHost : "127.0.0.1";
  const protoHeader = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  const protocol = protoHeader === "https" ? "https" : "http";
  return `${protocol}://${safeHost}`;
}

const server = http.createServer(async (req, res) => {
  applySecurityHeaders(req, res);

  if (!checkRateLimit(resolveRateLimitBucket(req))) {
    res.writeHead(429, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Too many requests" }));
  }

  if (!["GET", "POST", "OPTIONS"].includes(req.method || "")) {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "GET, POST, OPTIONS" });
    return res.end(JSON.stringify({ error: "Method Not Allowed" }));
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
    decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Malformed request URI" }));
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({
        status: "ok",
        service: "vertex-claude-mcp",
        version: "2.0.0",
        default_model: DEFAULT_MODEL,
        extensions: ["io.modelcontextprotocol/skills", "io.modelcontextprotocol/ui"],
      })
    );
  }

  const bearerToken = extractBearerToken(req);
  const allowMock = ALLOW_LOCAL_MOCK_AUTH && isLoopbackHost(BIND_HOST);
  if (!bearerToken && !ALLOW_ADC_FALLBACK) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="vertex-claude-mcp"',
    });
    return res.end(JSON.stringify({ error: "Unauthorized: Valid Authorization Bearer token required." }));
  }

  if (req.method === "GET" && url.pathname === "/mcp") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST, OPTIONS" });
    return res.end(JSON.stringify({ error: "SSE stream not used on /mcp; use POST /mcp or GET /sse." }));
  }

  if (req.method === "GET" && url.pathname === "/sse") {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Too many active SSE sessions" }));
    }
    const sessionId = crypto.randomUUID();
    const ownerDigest = hashCallerIdentity(bearerToken);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const endpointUrl = `${resolveSafeBaseUrl(req)}/messages?sessionId=${encodeURIComponent(sessionId)}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    const ttlTimer = setTimeout(() => {
      sseClients.delete(sessionId);
      res.end();
    }, SSE_SESSION_TTL_MS);
    ttlTimer.unref();
    sseClients.set(sessionId, { res, ownerDigest, expiresAt: Date.now() + SSE_SESSION_TTL_MS });
    req.on("close", () => {
      clearTimeout(ttlTimer);
      sseClients.delete(sessionId);
    });
    return;
  }

  if (req.method === "POST" && ["/mcp", "/sse", "/messages"].includes(url.pathname)) {
    let rawBody;
    try {
      rawBody = await readBoundedBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const code = err.statusCode || 400;
      res.writeHead(code, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: err.message }));
    }

    try {
      const parsed = JSON.parse(rawBody);
      const isBatch = Array.isArray(parsed);
      const messages = isBatch ? parsed : [parsed];
      if (messages.length > 20) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Batch limit exceeded" }));
      }

      const sessionId = url.searchParams.get("sessionId");
      let activeSseEntry = null;
      if (sessionId) {
        activeSseEntry = sseClients.get(sessionId);
        if (!activeSseEntry || Date.now() > activeSseEntry.expiresAt) {
          sseClients.delete(sessionId);
          res.writeHead(404, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Unknown or expired SSE sessionId" }));
        }
        const callerDigest = hashCallerIdentity(bearerToken);
        if (!crypto.timingSafeEqual(activeSseEntry.ownerDigest, callerDigest)) {
          res.writeHead(403, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "Forbidden: SSE session belongs to a different principal" }));
        }
      }

      const authContext = { bearerToken, allowMock };
      const responses = [];
      for (const msg of messages) {
        const reply = await processJsonRpc(msg, authContext);
        if (reply) responses.push(reply);
      }

      if (activeSseEntry) {
        for (const r of responses) {
          activeSseEntry.res.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
        }
        res.writeHead(202, { "Content-Type": "text/plain" });
        return res.end("Accepted");
      }

      if (responses.length === 0) {
        res.writeHead(202);
        return res.end();
      }

      const output = isBatch ? responses : responses[0];
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(output));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32700, message: "Parse error" },
          id: null,
        })
      );
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, BIND_HOST, () => {
  console.log(`Vertex AI Claude MCP Server v2.0.0 listening on http://${BIND_HOST}:${PORT} (Model: ${DEFAULT_MODEL})`);
});
