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

import http from "node:http";
import crypto from "node:crypto";
import { GoogleAuth } from "google-auth-library";

// --- Configuration & Input Validation ---
const PROJECT_ID = (process.env.PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || "").trim();
const REGION = (process.env.REGION || "global").trim();
const DEFAULT_MODEL = (process.env.DEFAULT_MODEL || "claude-sonnet-4-6").trim();
const ALLOW_ADC_FALLBACK = process.env.ALLOW_ADC_FALLBACK === "true";
const ALLOW_LOCAL_MOCK_AUTH = process.env.ALLOW_LOCAL_MOCK_AUTH === "true";

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB hard cap
const MAX_TOKENS_DEFAULT = 4096;
const MAX_TOKENS_HARD_CAP = 8192;
const MAX_PROMPT_CHARS = 200_000;
const MAX_SSE_CLIENTS = 100;
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
if (ALLOW_ADC_FALLBACK) {
  console.warn(
    "WARNING: ALLOW_ADC_FALLBACK=true is enabled. Ensure Cloud Run IAM authentication (--no-allow-unauthenticated) is enforced in production."
  );
}

const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

// --- Per-IP Rate Limiter with Expired Entry Eviction ---
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  if (rateLimitMap.size > 5000) {
    for (const [key, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }
  const existing = rateLimitMap.get(ip);
  if (!existing || now > existing.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  existing.count += 1;
  return existing.count <= RATE_LIMIT_MAX_REQ;
}

const evictionTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}, RATE_LIMIT_WINDOW_MS);
evictionTimer.unref();

// --- Security & CORS Headers ---
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

// --- Bounded Request Body Reader ---
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
  if (token.length < 16 || token.toLowerCase() === "mock" || token.toLowerCase() === "null" || token.toLowerCase() === "undefined") {
    return null;
  }
  return token;
}

// --- Core Vertex AI Claude Execution ---
async function invokeClaude({ prompt, systemPrompt, model, maxTokens, bearerToken, allowMock }) {
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
    return JSON.stringify({
      mock: true,
      model: resolvedModel,
      clamped_max_tokens: clampedMaxTokens,
      prompt_chars: prompt.length,
    });
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
  const url = `https://${host}/v1/projects/${encodeURIComponent(PROJECT_ID)}/locations/${encodeURIComponent(REGION)}/publishers/anthropic/models/${encodeURIComponent(resolvedModel)}:rawPredict`;

  const payload = {
    anthropic_version: "vertex-2023-10-16",
    messages: [{ role: "user", content: prompt }],
    max_tokens: clampedMaxTokens,
  };

  if (systemPrompt) {
    payload.system = systemPrompt;
  }

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
  if (data.content && Array.isArray(data.content)) {
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  return "Received non-text response from Claude.";
}

// --- Tool Definitions ---
const TOOLS = [
  {
    name: "ask_claude",
    description:
      "Consult Anthropic Claude on Vertex AI (defaults to Claude Sonnet 4.6) for complex reasoning, coding, analysis, or comparative text generation.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: true,
    },
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
];

// --- JSON-RPC Protocol Router ---
async function processJsonRpc(rpc, authContext) {
  if (!rpc || typeof rpc !== "object" || !rpc.method) return null;

  console.log(JSON.stringify({ event: "mcp_rpc", method: rpc.method, id: rpc.id ?? null }));

  if (rpc.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: {
        protocolVersion: rpc.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "vertex-claude-mcp",
          version: "2.1.0",
        },
      },
    };
  }

  if (rpc.method === "notifications/initialized" || rpc.method.startsWith("notifications/")) {
    return null;
  }

  if (rpc.method === "ping") {
    return { jsonrpc: "2.0", id: rpc.id, result: {} };
  }

  if (rpc.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: rpc.id,
      result: { tools: TOOLS },
    };
  }

  if (rpc.method === "tools/call") {
    const toolName = rpc.params?.name;
    const args = rpc.params?.arguments || {};

    if (toolName === "ask_claude") {
      try {
        const clampedMaxTokens = Math.min(
          Math.max(1, Math.trunc(Number(args.max_tokens) || MAX_TOKENS_DEFAULT)),
          MAX_TOKENS_HARD_CAP
        );
        console.log(
          JSON.stringify({
            event: "ask_claude_invoke",
            model: args.model || DEFAULT_MODEL,
            max_tokens: clampedMaxTokens,
            prompt_chars: typeof args.prompt === "string" ? args.prompt.length : 0,
          })
        );
        const answer = await invokeClaude({
          prompt: args.prompt,
          systemPrompt: args.system_prompt,
          model: args.model,
          maxTokens: clampedMaxTokens,
          bearerToken: authContext.bearerToken,
          allowMock: authContext.allowMock,
        });
        return {
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            content: [{ type: "text", text: answer }],
          },
        };
      } catch (err) {
        console.error(JSON.stringify({ event: "ask_claude_error", message: err.message }));
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

// --- Dual-Transport HTTP Server (Streamable HTTP + Legacy SSE) ---
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

  const clientIp = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown")
    .split(",")[0]
    .trim();
  if (!checkRateLimit(clientIp)) {
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

  // 1. Health Check (scrubbed: never expose internal project IDs or config policies)
  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ status: "ok", service: "vertex-claude-mcp", default_model: DEFAULT_MODEL }));
  }

  // Enforce authentication before opening SSE streams or executing MCP JSON-RPC calls
  const bearerToken = extractBearerToken(req);
  const allowMock = ALLOW_LOCAL_MOCK_AUTH && isLoopbackHost(BIND_HOST);
  if (!bearerToken && !ALLOW_ADC_FALLBACK) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer realm="vertex-claude-mcp"',
    });
    return res.end(JSON.stringify({ error: "Unauthorized: Valid Authorization Bearer token required." }));
  }

  // 2. Legacy SSE Transport Discovery (GET /sse or GET /mcp)
  if (req.method === "GET" && (url.pathname === "/sse" || url.pathname === "/mcp")) {
    if (sseClients.size >= MAX_SSE_CLIENTS) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Too many active SSE sessions" }));
    }
    const sessionId = crypto.randomUUID();
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const endpointUrl = `${resolveSafeBaseUrl(req)}/messages?sessionId=${encodeURIComponent(sessionId)}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);
    sseClients.set(sessionId, res);

    req.on("close", () => {
      sseClients.delete(sessionId);
    });
    return;
  }

  // 3. MCP JSON-RPC Execution (POST /mcp, POST /sse, POST /messages)
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

      const authContext = { bearerToken, allowMock };
      const responses = [];
      for (const msg of messages) {
        const reply = await processJsonRpc(msg, authContext);
        if (reply) responses.push(reply);
      }

      const sessionId = url.searchParams.get("sessionId");
      if (sessionId && sseClients.has(sessionId)) {
        const sseRes = sseClients.get(sessionId);
        for (const r of responses) {
          sseRes.write(`event: message\ndata: ${JSON.stringify(r)}\n\n`);
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
  console.log(`Vertex AI Claude MCP Server listening on http://${BIND_HOST}:${PORT} (Model: ${DEFAULT_MODEL})`);
});
