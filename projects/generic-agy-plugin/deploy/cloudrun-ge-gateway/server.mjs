#!/usr/bin/env node
/**
 * Stateless Cloud Run Streamable HTTP MCP Gateway for Gemini Enterprise (GE).
 * Enforces strict end-user Bearer token passthrough—never uses ambient metadata credentials.
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 8080);
const BIND_HOST = process.env.BIND_HOST || (process.env.K_SERVICE ? '0.0.0.0' : '127.0.0.1');
const SAFE_RE = /^[A-Za-z0-9._-]+$/;
const ALLOWED_DE_HOST_RE = /^(?:[a-z0-9-]+-)?discoveryengine\.googleapis\.com$/;

const GE_PROJECT_ID = String(process.env.GE_PROJECT_ID || '').trim();
const GE_LOCATION = String(process.env.GE_LOCATION || 'global').trim();
const GE_COLLECTION_ID = String(process.env.GE_COLLECTION_ID || 'default_collection').trim();
const GE_ENGINE_ID = String(process.env.GE_ENGINE_ID || '').trim();
const MAX_BODY_BYTES = 256 * 1024;

function validateSeg(name, val) {
  if (!val || !SAFE_RE.test(val)) {
    throw new Error(`Invalid or missing ${name}`);
  }
  return encodeURIComponent(val);
}

function getDeHost(loc) {
  const l = loc.toLowerCase();
  const host = l === 'global' ? 'discoveryengine.googleapis.com' : `${l}-discoveryengine.googleapis.com`;
  if (!ALLOWED_DE_HOST_RE.test(host)) throw new Error('Disallowed Discovery Engine host');
  return host;
}

function callDiscoveryEngine(pathname, bearerToken, bodyObj) {
  return new Promise((resolve, reject) => {
    const host = getDeHost(GE_LOCATION);
    const payload = JSON.stringify(bodyObj);
    const req = https.request(
      {
        hostname: host,
        path: pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 55000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch {}
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Discovery Engine request timed out')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const TOOLS = [
  {
    name: 'ge_ask_instance',
    description: 'Queries Gemini Enterprise Assistant (StreamAssist) across all federated and ingested connectors using the caller\'s Entra-synced Google Identity.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, session: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    name: 'ge_search_records',
    description: 'Runs structured Discovery Engine Search across the configured Gemini Enterprise engine.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, pageSize: { type: 'integer' }, filter: { type: 'string' } },
      required: ['query'],
    },
  },
];

function writeJson(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function summarizeStreamAssist(parsedJson, rawText) {
  const frames = Array.isArray(parsedJson) ? parsedJson : (parsedJson ? [parsedJson] : []);
  const textParts = [];
  let session = '';
  for (const f of frames) {
    if (f?.sessionInfo?.session) session = f.sessionInfo.session;
    for (const rep of f?.answer?.replies || []) {
      const c = rep?.groundedContent?.content;
      if (c?.text && !c?.thought) textParts.push(c.text);
    }
  }
  if (textParts.length === 0) return rawText;
  return JSON.stringify({ answer: textParts.join('').trim(), session: session || undefined }, null, 2);
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && reqUrl.pathname === '/healthz') {
    writeJson(res, 200, { ok: true, service: 'agy-cloudrun-ge-gateway' });
    return;
  }

  if (reqUrl.pathname === '/.well-known/oauth-protected-resource') {
    const authHost = 'accounts.google.com';
    writeJson(res, 200, {
      authorization_servers: ['https://' + authHost],
      scopes_supported: ['https://www.googleapis.com/auth/cloud-platform'],
      bearer_methods_supported: ['header'],
    });
    return;
  }

  if (req.method !== 'POST' || reqUrl.pathname !== '/mcp') {
    writeJson(res, 404, { error: 'Not found' });
    return;
  }

  const authHeader = String(req.headers.authorization || '');
  const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);
  if (!bearerMatch) {
    writeJson(
      res,
      401,
      { error: 'End-user OAuth Bearer token required' },
      { 'WWW-Authenticate': 'Bearer realm="agy-ge-mcp", scope="https://www.googleapis.com/auth/cloud-platform"' }
    );
    return;
  }
  const userToken = bearerMatch[1];

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      writeJson(res, 413, { error: 'Payload too large' });
      return;
    }
    chunks.push(chunk);
  }

  let rpc;
  try {
    rpc = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    writeJson(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  const { id, method, params } = rpc || {};
  if (id === undefined || id === null) {
    res.writeHead(202);
    res.end();
    return;
  }

  try {
    if (method === 'initialize') {
      writeJson(res, 200, {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2025-03-26',
          capabilities: { tools: {} },
          serverInfo: { name: 'agy-cloudrun-ge-gateway', version: '1.0.0' },
        },
      });
      return;
    }
    if (method === 'tools/list') {
      writeJson(res, 200, { jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      const p = validateSeg('GE_PROJECT_ID', GE_PROJECT_ID);
      const l = validateSeg('GE_LOCATION', GE_LOCATION);
      const c = validateSeg('GE_COLLECTION_ID', GE_COLLECTION_ID);
      const e = validateSeg('GE_ENGINE_ID', GE_ENGINE_ID);

      const tName = params?.name;
      const tArgs = params?.arguments || {};
      if (tName === 'ge_ask_instance') {
        const body = { query: { text: String(tArgs.query || '') } };
        if (tArgs.session) body.session = String(tArgs.session);
        const upstream = await callDiscoveryEngine(
          `/v1alpha/projects/${p}/locations/${l}/collections/${c}/engines/${e}/assistants/default_assistant:streamAssist`,
          userToken,
          body
        );
        writeJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: upstream.status === 200 ? summarizeStreamAssist(upstream.json, upstream.text) : upstream.text }],
            isError: upstream.status !== 200,
          },
        });
        return;
      }
      if (tName === 'ge_search_records') {
        const body = {
          query: String(tArgs.query || ''),
          pageSize: Math.max(1, Math.min(25, Number(tArgs.pageSize || 10))),
        };
        if (tArgs.filter) body.filter = String(tArgs.filter);
        const upstream = await callDiscoveryEngine(
          `/v1alpha/projects/${p}/locations/${l}/collections/${c}/engines/${e}/servingConfigs/default_search:search`,
          userToken,
          body
        );
        writeJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: upstream.text }],
            isError: upstream.status !== 200,
          },
        });
        return;
      }
      writeJson(res, 200, {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: `Unknown tool: ${tName}` }], isError: true },
      });
      return;
    }
    writeJson(res, 200, { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (err) {
    writeJson(res, 200, { jsonrpc: '2.0', id, error: { code: -32603, message: err.message || 'Gateway error' } });
  }
});

server.listen(PORT, BIND_HOST, () => {
  console.error(`agy-cloudrun-ge-gateway listening on ${BIND_HOST}:${PORT}`);
});
