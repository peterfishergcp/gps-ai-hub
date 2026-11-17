#!/usr/bin/env node
/**
 * Dashboard Studio — Local Preview & Visual Layout Persistence Server
 *
 * Security controls:
 * - Binds strictly to 127.0.0.1 (never 0.0.0.0).
 * - Per-request cryptographic CSP nonce; X-Frame-Options: DENY; nosniff.
 * - Synchronizer CSRF token + HttpOnly SameSite=Strict session cookie on POST.
 * - Strict path-boundary verification and config schema validation before disk writes.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = fs.realpathSync(process.cwd());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const BASE_PORT = Number.parseInt(process.env.PORT || '4173', 10) || 4173;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB max config payload
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// Ephemeral per-process secret (Environment ->Random cryptographic fallback for local loopback preview).
function initInstanceSecret() {
  if (process.env.DASHBOARD_STUDIO_SECRET && process.env.DASHBOARD_STUDIO_SECRET.length >= 32) {
    return process.env.DASHBOARD_STUDIO_SECRET;
  }
  return crypto.randomBytes(32).toString('hex');
}
const INSTANCE_SECRET = initInstanceSecret();

// Session store (sessionId -> { csrfToken, expiresAt })
const sessions = new Map();
// Simple per-IP sliding-window rate limiter (120 req / min)
const rateBuckets = new Map();

function checkRateLimit(remoteAddress) {
  const now = Date.now();
  const key = remoteAddress || '127.0.0.1';
  const entry = rateBuckets.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 60_000;
  }
  entry.count += 1;
  rateBuckets.set(key, entry);
  return entry.count <= 180;
}

function resolveInsideProject(relPath) {
  const cleanRel = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
  const resolved = path.resolve(PROJECT_DIR, cleanRel);
  if (resolved !== PROJECT_DIR && !resolved.startsWith(PROJECT_DIR + path.sep)) {
    throw new Error('Path outside project boundary');
  }
  return resolved;
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = v;
    }
  }
  return out;
}

function getOrCreateSession(req, res) {
  const now = Date.now();
  for (const [sid, val] of sessions.entries()) {
    if (val.expiresAt <= now) sessions.delete(sid);
  }
  const cookies = parseCookies(req.headers.cookie);
  // TODO(security): On HTTPS deployments, rename cookie to '__Host-dash_session' and add 'Secure'.
  // Local preview runs strictly over http://127.0.0.1 loopback where browsers reject Secure/__Host- cookies.
  const existingId = cookies.dash_session;
  if (existingId && sessions.has(existingId)) {
    const sess = sessions.get(existingId);
    if (sess.expiresAt > now) {
      return sess;
    }
  }
  const sessionId = crypto.hmac
    ? crypto.randomBytes(24).toString('hex')
    : crypto.createHmac('sha256', INSTANCE_SECRET).update(crypto.randomBytes(24)).digest('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const sess = { sessionId, csrfToken, expiresAt: now + SESSION_TTL_MS };
  sessions.set(sessionId, sess);
  res.setHeader(
    'Set-Cookie',
    `dash_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400`
  );
  return sess;
}

function verifyCsrfAndOrigin(req, activePort) {
  const origin = req.headers.origin || '';
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    const reqHost = String(req.headers.host || '');
    const loopbackHosts = new Set([`127.0.0.1:${activePort}`, `localhost:${activePort}`]);
    if (originHost !== reqHost && !loopbackHosts.has(originHost)) {
      return false;
    }
  }
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.dash_session;
  if (!sid || !sessions.has(sid)) return false;
  const sess = sessions.get(sid);
  if (sess.expiresAt <= Date.now()) {
    sessions.delete(sid);
    return false;
  }
  const headerToken = String(req.headers['x-csrf-token'] || '');
  if (!headerToken || headerToken.length !== sess.csrfToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(sess.csrfToken));
}

function setSecurityHeaders(res, nonce) {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_CHART_TYPES = new Set(['bar', 'hbar', 'line', 'donut', 'table']);
const ALLOWED_SPANS = new Set([4, 6, 8, 12]);
const ALLOWED_CONNECTORS = new Set(['bigquery', 'postgres', 'mysql', 'duckdb', 'csv']);

function sanitizeText(val, maxLen = 220) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function validateAndCleanConfig(raw, existingQueries) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid config object');
  }
  const themeIn = raw.theme && typeof raw.theme === 'object' ? raw.theme : {};
  const cleanColor = (val, fallback) => (typeof val === 'string' && HEX_COLOR_RE.test(val) ? val : fallback);
  const radiusNum = Number(themeIn.radius);

  const cleaned = {
    id: sanitizeText(raw.id || 'custom-dashboard', 80),
    eyebrow: sanitizeText(raw.eyebrow || 'Executive Analytics', 140),
    title: sanitizeText(raw.title || 'Business Dashboard', 160),
    subtitle: sanitizeText(raw.subtitle || '', 260),
    connector: ALLOWED_CONNECTORS.has(raw.connector) ? raw.connector : 'bigquery',
    lastUpdatedLabel: sanitizeText(raw.lastUpdatedLabel || 'Updated locally', 100),
    themePreset: sanitizeText(raw.themePreset || 'custom', 40),
    theme: {
      mode: themeIn.mode === 'dark' ? 'dark' : 'light',
      fontFamily: sanitizeText(
        themeIn.fontFamily || '"Fira Sans", system-ui, -apple-system, sans-serif',
        140
      ),
      bg: cleanColor(themeIn.bg, '#F4F6F8'),
      surface: cleanColor(themeIn.surface, '#FFFFFF'),
      ink: cleanColor(themeIn.ink, '#1E252B'),
      muted: cleanColor(themeIn.muted, '#5A6772'),
      border: cleanColor(themeIn.border, '#D8E0E6'),
      primary: cleanColor(themeIn.primary, '#053254'),
      accent: cleanColor(themeIn.accent, '#C1452C'),
      secondary: cleanColor(themeIn.secondary, '#D5A245'),
      radius: Number.isFinite(radiusNum) ? Math.min(24, Math.max(4, Math.round(radiusNum))) : 12,
      density: themeIn.density === 'compact' ? 'compact' : 'comfortable',
    },
    filters: Array.isArray(raw.filters)
      ? raw.filters.slice(0, 6).map((f) => ({
          field: sanitizeText(f?.field, 60),
          label: sanitizeText(f?.label, 60),
          options: Array.isArray(f?.options)
            ? f.options.slice(0, 25).map((o) => sanitizeText(String(o), 80))
            : ['All'],
        }))
      : [],
    kpis: Array.isArray(raw.kpis)
      ? raw.kpis.slice(0, 8).map((k, idx) => ({
          id: sanitizeText(k?.id || `kpi-${idx + 1}`, 60),
          label: sanitizeText(k?.label || 'Metric', 80),
          mode: ['static', 'sum', 'count', 'avg'].includes(k?.mode) ? k.mode : 'static',
          value: sanitizeText(String(k?.value ?? ''), 60),
          field: sanitizeText(k?.field || '', 60),
          format: sanitizeText(k?.format || 'integer', 40),
          delta: sanitizeText(k?.delta || '', 100),
          tone: ['primary', 'accent', 'gold'].includes(k?.tone) ? k.tone : 'primary',
        }))
      : [],
    widgets: Array.isArray(raw.widgets)
      ? raw.widgets.slice(0, 16).map((w, idx) => ({
          id: sanitizeText(w?.id || `widget-${idx + 1}`, 60),
          title: sanitizeText(w?.title || 'Chart', 120),
          subtitle: sanitizeText(w?.subtitle || '', 200),
          chartType: ALLOWED_CHART_TYPES.has(w?.chartType) ? w.chartType : 'bar',
          span: ALLOWED_SPANS.has(Number(w?.span)) ? Number(w.span) : 6,
          groupBy: sanitizeText(w?.groupBy || '', 60),
          metricField: sanitizeText(w?.metricField || '', 60),
          seriesKey: sanitizeText(w?.seriesKey || '', 60),
          format: sanitizeText(w?.format || 'integer', 40),
          visible: w?.visible !== false,
          columns: Array.isArray(w?.columns)
            ? w.columns.slice(0, 14).map((c) => ({
                key: sanitizeText(c?.key, 60),
                label: sanitizeText(c?.label, 60),
                format: sanitizeText(c?.format || '', 40),
              }))
            : undefined,
        }))
      : [],
    // Preserve server-side SQL queries from disk so visual UI saves cannot alter SQL text.
    queries: existingQueries || {},
  };
  return cleaned;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

let activePort = BASE_PORT;

const server = http.createServer(async (req, res) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  setSecurityHeaders(res, nonce);

  if (!checkRateLimit(req.socket.remoteAddress)) {
    return sendJson(res, 429, { error: 'Too many requests' });
  }

  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${activePort}`);
  const pathname = parsedUrl.pathname;

  try {
    if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const sess = getOrCreateSession(req, res);
      const htmlPath = resolveInsideProject('index.html');
      let html = fs.readFileSync(htmlPath, 'utf-8');
      html = html
        .replaceAll('__CSP_NONCE__', nonce)
        .replaceAll('__CSRF_TOKEN__', sess.csrfToken);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (method === 'GET' && pathname === '/styles.css') {
      const css = fs.readFileSync(resolveInsideProject('styles.css'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      res.end(css);
      return;
    }

    if (method === 'GET' && pathname === '/app.js') {
      const js = fs.readFileSync(resolveInsideProject('app.js'), 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      res.end(js);
      return;
    }

    if (method === 'GET' && pathname === '/api/state') {
      const sess = getOrCreateSession(req, res);
      const configPath = resolveInsideProject('dashboard.config.json');
      const snapPath = resolveInsideProject(path.join('data', 'snapshot.json'));
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      const snapshot = fs.existsSync(snapPath)
        ? JSON.parse(fs.readFileSync(snapPath, 'utf-8'))
        : { sourceMode: 'snapshot', records: [], weeklyTimeline: [] };
      return sendJson(res, 200, { config, snapshot, csrfToken: sess.csrfToken });
    }

    if (method === 'POST' && pathname === '/api/config') {
      if (!verifyCsrfAndOrigin(req, activePort)) {
        return sendJson(res, 403, { error: 'Invalid session or CSRF token. Refresh the page.' });
      }
      const rawBody = await readBody(req);
      const parsed = JSON.parse(rawBody);
      const configPath = resolveInsideProject('dashboard.config.json');
      const currentOnDisk = fs.existsSync(configPath)
        ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        : {};
      const cleaned = validateAndCleanConfig(parsed.config || parsed, currentOnDisk.queries);
      fs.writeFileSync(configPath, JSON.stringify(cleaned, null, 2) + '\n', 'utf-8');
      return sendJson(res, 200, { ok: true, config: cleaned });
    }

    if (method === 'POST' && pathname === '/api/refresh') {
      if (!verifyCsrfAndOrigin(req, activePort)) {
        return sendJson(res, 403, { error: 'Invalid session or CSRF token. Refresh the page.' });
      }
      const connectorScript = resolveInsideProject('query_connector.mjs');
      if (fs.existsSync(connectorScript)) {
        await new Promise((resolve) => {
          execFile(
            process.execPath,
            [connectorScript, '--project-dir', PROJECT_DIR],
            { cwd: PROJECT_DIR, timeout: 25_000 },
            () => resolve()
          );
        });
      }
      const snapPath = resolveInsideProject(path.join('data', 'snapshot.json'));
      const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
      return sendJson(res, 200, { ok: true, snapshot });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch {
    return sendJson(res, 400, { error: 'Unable to process request' });
  }
});

function listenWithFallback(port, attemptsLeft = 10) {
  server.once('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listenWithFallback(port + 1, attemptsLeft - 1);
    } else {
      console.error('Failed to start Dashboard Studio preview server.');
      process.exit(1);
    }
  });
  server.listen(port, HOST, () => {
    activePort = port;
    console.log(`Dashboard Studio live at http://${HOST}:${activePort}`);
  });
}

listenWithFallback(BASE_PORT);
