#!/usr/bin/env node
/**
 * Public Sector — Zero-Dependency Gemini Enterprise (GE) Federated MCP Bridge
 *
 * Runs automatically on Google Antigravity Desktop's bundled `agy-node` runtime
 * (zero Node.js, Python, or npm installs required on corporate laptops).
 *
 * Designed for Azure/Entra-synced Google Cloud Identity users whose Gemini Enterprise
 * instance hosts federated connectors (Outlook, SharePoint, OneDrive, Teams, Gmail,
 * Google Drive, GitHub). Uses `AssistantService.StreamAssist` and `SearchService.Search`
 * strictly with the signed-in user's own OAuth Bearer token so per-user ACLs and
 * replicated Entra groups are enforced end-to-end.
 */

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { URL, pathToFileURL } from 'node:url';

const SERVER_NAME = 'agy-ge-bridge';
const SERVER_VERSION = '1.0.0';
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const ALLOWED_DE_HOST_RE = /^(?:[a-z0-9-]+-)?discoveryengine\.googleapis\.com$/;

// Resolve persistent plugin data directories across Antigravity Desktop (`~/.gemini/antigravity/plugin_data`),
// `ANTIGRAVITY_APP_DATA_DIR`, Jetski (`~/.gemini/jetski/plugin_data`), and `~/.gemini/config/plugin_data`
// so MCP tools (`PLUGIN_DATA`) and UI sidecars (`ANTIGRAVITY_APP_DATA_DIR`) always share `ge-instance.json`.
function lstatSafe(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

export function getConnectorDataDirs(pluginSlug = 'agy-connectors') {
  const pinned = process.env.ANTIGRAVITY_CONNECTORS_DATA_DIR;
  if (pinned && pinned.trim()) {
    return [path.resolve(pinned.trim())];
  }
  const raw = [];
  const pluginData = (process.env.PLUGIN_DATA || '').trim();
  if (pluginData) {
    const resolvedPd = path.resolve(pluginData);
    if (path.basename(resolvedPd) === pluginSlug) {
      raw.push(resolvedPd);
    } else {
      raw.push(path.resolve(resolvedPd, '..', pluginSlug));
      raw.push(resolvedPd);
    }
  }
  const appData = (process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim();
  if (appData) {
    raw.push(path.join(path.resolve(appData), 'plugin_data', pluginSlug));
  }
  const execData = (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '').trim();
  if (execData) {
    const resolvedExec = path.resolve(execData);
    for (const seg of [`${path.sep}sidecar_data${path.sep}`, `${path.sep}plugin_data${path.sep}`]) {
      const idx = resolvedExec.indexOf(seg);
      if (idx > 0) {
        raw.push(path.join(resolvedExec.slice(0, idx), 'plugin_data', pluginSlug));
      }
    }
  }
  const home = os.homedir();
  raw.push(
    path.join(home, '.gemini', 'antigravity', 'plugin_data', pluginSlug),
    path.join(home, '.gemini', 'jetski', 'plugin_data', pluginSlug),
    path.join(home, '.gemini', 'config', 'plugin_data', pluginSlug)
  );
  if (execData) {
    raw.push(path.resolve(execData));
  }
  const seen = new Set();
  const out = [];
  for (const candidate of raw) {
    if (!candidate) continue;
    const norm = path.resolve(candidate);
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function getDataDir() {
  const pinned = (process.env.ANTIGRAVITY_CONNECTORS_DATA_DIR || '').trim();
  if (pinned) {
    const d = path.resolve(pinned);
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    return d;
  }
  const envDir = (process.env.PLUGIN_DATA || '').trim();
  if (envDir) {
    const d = path.resolve(envDir);
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    return d;
  }
  const appData = (process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim();
  if (appData) {
    const d = path.join(path.resolve(appData), 'plugin_data', 'agy-connectors');
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    return d;
  }
  const home = os.homedir();
  const agyRoot = path.join(home, '.gemini', 'antigravity');
  const baseDir = fs.existsSync(agyRoot)
    ? path.join(agyRoot, 'plugin_data', 'agy-connectors')
    : path.resolve(home, '.gemini', 'config', 'plugin_data', 'agy-connectors');
  fs.mkdirSync(baseDir, { recursive: true, mode: 0o700 });
  return baseDir;
}

function writeAtomicJsonInDir(dir, fileName, dataObj) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirStat = lstatSafe(dir);
  if (!dirStat || dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error('Invalid plugin data directory');
  }
  const safeName = path.basename(fileName);
  const target = path.join(dir, safeName);
  if (!target.startsWith(dir + path.sep)) {
    throw new Error('Blocked path outside plugin data directory.');
  }
  const targetStat = lstatSafe(target);
  if (targetStat && targetStat.isSymbolicLink()) {
    throw new Error('Refusing symlinked target file.');
  }
  const tmp = path.join(dir, `.${safeName}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, target);
  return target;
}

function writePrivateJson(fileName, dataObj) {
  const primaryDir = getDataDir();
  const primaryTarget = writeAtomicJsonInDir(primaryDir, fileName, dataObj);

  // Mirror across Antigravity Desktop and ~/.gemini/config/plugin_data so sidecars and CLI stay in sync
  if (!(process.env.ANTIGRAVITY_CONNECTORS_DATA_DIR || '').trim()) {
    const home = os.homedir();
    const mirrors = [
      process.env.ANTIGRAVITY_APP_DATA_DIR
        ? path.join(path.resolve(process.env.ANTIGRAVITY_APP_DATA_DIR), 'plugin_data', 'agy-connectors')
        : '',
      fs.existsSync(path.join(home, '.gemini', 'antigravity'))
        ? path.join(home, '.gemini', 'antigravity', 'plugin_data', 'agy-connectors')
        : '',
      path.join(home, '.gemini', 'config', 'plugin_data', 'agy-connectors'),
    ].filter(Boolean);
    for (const mDir of mirrors) {
      const resolvedMirror = path.resolve(mDir);
      if (resolvedMirror === primaryDir) continue;
      try {
        writeAtomicJsonInDir(resolvedMirror, fileName, dataObj);
      } catch {}
    }
  }
  return primaryTarget;
}

function isRecordConfigured(fileName, obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (fileName === 'ge-instance.json') {
    if (obj.projectId && obj.engineId) return true;
    if (obj.rawInput) {
      try {
        const p = parseGeInstanceInput(obj.rawInput, obj);
        return Boolean(p.projectId && p.engineId);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (fileName === 'ge-oauth-token.json') {
    return Boolean(obj.refreshToken && obj.clientId);
  }
  return Object.keys(obj).length > 0;
}

function readPrivateJson(fileName) {
  const safeName = path.basename(fileName);
  let best = null;
  for (const dir of getConnectorDataDirs('agy-connectors')) {
    const target = path.join(dir, safeName);
    if (!target.startsWith(dir + path.sep)) continue;
    const st = lstatSafe(target);
    if (!st || st.isSymbolicLink() || !st.isFile()) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      const configured = isRecordConfigured(safeName, parsed);
      const ts = Date.parse(parsed?.updatedAt || parsed?.savedAt || '') || st.mtimeMs || 0;
      if (
        !best ||
        (configured && !best.configured) ||
        (configured === best.configured && ts > best.ts)
      ) {
        best = { parsed, configured, ts };
      }
    } catch {}
  }
  return best ? best.parsed : null;
}

/**
 * Parses a Gemini Enterprise resource string, Cloud Console URL, or GE Web App URL
 * into { projectId, location, collectionId, engineId, webAppUrl }.
 */
export function parseGeInstanceInput(input, overrides = {}) {
  const raw = String(input || '').trim();
  let projectId = String(overrides.projectId || process.env.GE_PROJECT_ID || '').trim();
  let location = String(overrides.location || process.env.GE_LOCATION || '').trim();
  let collectionId = String(overrides.collectionId || process.env.GE_COLLECTION_ID || 'default_collection').trim();
  let engineId = String(overrides.engineId || process.env.GE_ENGINE_ID || '').trim();
  let webAppUrl = String(overrides.webAppUrl || '').trim();

  // Pattern 1: Full or partial resource path projects/{p}/locations/{l}/collections/{c}/engines/{e}
  const resMatch = raw.match(
    /projects\/([A-Za-z0-9._-]+)\/locations\/([A-Za-z0-9._-]+)(?:\/collections\/([A-Za-z0-9._-]+))?\/(?:engines|dataStores)\/([A-Za-z0-9._-]+)/
  );
  if (resMatch) {
    projectId = projectId || resMatch[1];
    location = location || resMatch[2];
    collectionId = resMatch[3] || collectionId || 'default_collection';
    engineId = engineId || resMatch[4];
  } else if (raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      webAppUrl = webAppUrl || raw;
      const qpProject = u.searchParams.get('project');
      if (qpProject && !projectId) projectId = qpProject;

      // Console URL patterns: .../locations/{loc}/collections/{col}/engines/{eng} or .../engines/{eng}
      const pMatch = u.pathname.match(/\/locations\/([A-Za-z0-9._-]+)(?:\/collections\/([A-Za-z0-9._-]+))?\/engines\/([A-Za-z0-9._-]+)/);
      if (pMatch) {
        location = location || pMatch[1];
        collectionId = pMatch[2] || collectionId;
        engineId = engineId || pMatch[3];
      }
      // Web app URL pattern: /home/cid/{configOrEngineId}
      const cidMatch = u.pathname.match(/\/cid\/([A-Za-z0-9._-]+)/);
      if (cidMatch && !engineId) {
        engineId = cidMatch[1];
      }
    } catch {
      // Fall through to plain ID handling
    }
  } else if (raw && SAFE_SEGMENT_RE.test(raw) && !engineId) {
    engineId = raw;
  }

  location = location || 'global';
  collectionId = collectionId || 'default_collection';

  for (const [label, val] of [
    ['projectId', projectId],
    ['location', location],
    ['collectionId', collectionId],
    ['engineId', engineId],
  ]) {
    if (val && !SAFE_SEGMENT_RE.test(val)) {
      throw new Error(`Invalid characters in ${label}. Expected letters, digits, '.', '_', or '-'.`);
    }
  }

  return { projectId, location, collectionId, engineId, webAppUrl, rawInput: raw };
}

function loadActiveGeConfig() {
  const saved = readPrivateJson('ge-instance.json') || {};
  const parsed = parseGeInstanceInput(saved.rawInput || process.env.GE_INSTANCE || '', {
    projectId: saved.projectId,
    location: saved.location,
    collectionId: saved.collectionId,
    engineId: saved.engineId,
    webAppUrl: saved.webAppUrl,
  });
  return {
    ...parsed,
    oauthClientId: saved.oauthClientId || process.env.GE_OAUTH_CLIENT_ID || '',
    oauthClientSecret: saved.oauthClientSecret || process.env.GE_OAUTH_CLIENT_SECRET || '',
  };
}

function discoveryEngineBaseUrl(location) {
  // Allow loopback mock server strictly for local automated self-tests
  const testOrigin = process.env.AGY_GE_TEST_ORIGIN;
  if (testOrigin && /^http:\/\/127\.0\.0\.1:\d+$/.test(testOrigin)) {
    return testOrigin;
  }
  const loc = (location || 'global').toLowerCase();
  const host = loc === 'global'
    ? 'discoveryengine.googleapis.com'
    : `${loc}-discoveryengine.googleapis.com`;
  if (!ALLOWED_DE_HOST_RE.test(host)) {
    throw new Error(`Disallowed Discovery Engine host: ${host}`);
  }
  return `https://${host}`;
}

function httpsJsonRequest(urlString, { method = 'GET', headers = {}, bodyObj = null, formParams = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const isLocalTest = parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1';
    if (parsed.protocol !== 'https:' && !isLocalTest) {
      reject(new Error(`Refusing non-HTTPS request to ${parsed.hostname}`));
      return;
    }
    const transport = isLocalTest ? http : https;
    let payload = null;
    const reqHeaders = { Accept: 'application/json', ...headers };
    if (formParams) {
      payload = new URLSearchParams(formParams).toString();
      reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    } else if (bodyObj !== null) {
      payload = JSON.stringify(bodyObj);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = transport.request(
      parsed,
      { method, headers: reqHeaders, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // Keep raw text when upstream returns streaming chunks or plain error text
          }
          resolve({ status: res.statusCode || 0, json, text });
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Upstream Discovery Engine request timed out.'));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function refreshOAuthToken({ clientId, clientSecret, refreshToken }) {
  const form = {
    client_id: clientId,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  };
  if (clientSecret) form.client_secret = clientSecret;
  const resp = await httpsJsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    formParams: form,
    timeoutMs: 15000,
  });
  if (resp.status !== 200 || !resp.json || !resp.json.access_token) {
    throw new Error(`Token refresh failed (HTTP ${resp.status}). Run ge_sign_in or 'gcloud auth application-default login'.`);
  }
  return {
    accessToken: resp.json.access_token,
    expiresAt: Date.now() + (Number(resp.json.expires_in || 3500) - 60) * 1000,
  };
}

let memoryTokenCache = { accessToken: '', expiresAt: 0, quotaProjectId: '' };

async function resolveUserAccessToken(cfg) {
  if (process.env.AGY_GE_TEST_BEARER && process.env.AGY_GE_TEST_ORIGIN) {
    return { accessToken: process.env.AGY_GE_TEST_BEARER, source: 'test-bearer', quotaProjectId: cfg.projectId };
  }
  if (memoryTokenCache.accessToken && Date.now() < memoryTokenCache.expiresAt) {
    return { accessToken: memoryTokenCache.accessToken, source: 'cached', quotaProjectId: memoryTokenCache.quotaProjectId };
  }

  // Tier 1: Saved PKCE OAuth token in plugin_data (zero gcloud needed on laptop)
  const savedTok = readPrivateJson('ge-oauth-token.json');
  if (savedTok && savedTok.refreshToken && savedTok.clientId) {
    const refreshed = await refreshOAuthToken({
      clientId: savedTok.clientId,
      clientSecret: savedTok.clientSecret || '',
      refreshToken: savedTok.refreshToken,
    });
    memoryTokenCache = { ...refreshed, quotaProjectId: cfg.projectId || '' };
    return { accessToken: refreshed.accessToken, source: 'plugin-oauth', quotaProjectId: cfg.projectId || '' };
  }

  // Tier 2: Standard Google Cloud ADC file (~/.config/gcloud/application_default_credentials.json or %APPDATA%\gcloud\...)
  const adcCandidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json') : '',
  ].filter(Boolean);

  for (const adcPath of adcCandidates) {
    if (fs.existsSync(adcPath)) {
      try {
        const adc = JSON.parse(fs.readFileSync(adcPath, 'utf8'));
        if (adc.type === 'authorized_user' && adc.client_id && adc.refresh_token) {
          const refreshed = await refreshOAuthToken({
            clientId: adc.client_id,
            clientSecret: adc.client_secret || '',
            refreshToken: adc.refresh_token,
          });
          const qp = adc.quota_project_id || cfg.projectId || '';
          memoryTokenCache = { ...refreshed, quotaProjectId: qp };
          return { accessToken: refreshed.accessToken, source: 'adc-authorized-user', quotaProjectId: qp };
        }
      } catch {
        // Fall through to gcloud CLI check
      }
    }
  }

  // Tier 3: gcloud CLI fallback (supports Workforce/Workload or corporate gcloud login)
  const gcloudBins = process.platform === 'win32' ? ['gcloud.cmd', 'gcloud'] : ['gcloud'];
  for (const bin of gcloudBins) {
    try {
      const tok = execFileSync(bin, ['auth', 'print-access-token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 8000,
      }).trim();
      if (tok) {
        memoryTokenCache = { accessToken: tok, expiresAt: Date.now() + 240_000, quotaProjectId: cfg.projectId || '' };
        return { accessToken: tok, source: 'gcloud-cli', quotaProjectId: cfg.projectId || '' };
      }
    } catch {
      // Not installed or not logged in
    }
  }

  throw new Error(
    'No Google Cloud Identity token found yet. Either:\n' +
    '  1. Run `ge_sign_in` (providing your agency Desktop OAuth Client ID if no gcloud is installed) to sign in via Chrome/Edge SSO (Azure/Entra -> Google Identity), OR\n' +
    '  2. Run `gcloud auth application-default login` once in a terminal if Google Cloud SDK is installed.'
  );
}

async function runPkceLoopbackSignIn({ clientId, clientSecret = '' }) {
  if (!clientId || !SAFE_SEGMENT_RE.test(clientId.replace(/\.apps\.googleusercontent\.com$/, ''))) {
    throw new Error('Provide a valid Google OAuth 2.0 Desktop App clientId (ending in .apps.googleusercontent.com).');
  }
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expectedState = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
        if (reqUrl.pathname !== '/oauth-callback') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }
        const gotState = reqUrl.searchParams.get('state') || '';
        const code = reqUrl.searchParams.get('code') || '';
        const stateBufA = Buffer.from(gotState);
        const stateBufB = Buffer.from(expectedState);
        if (stateBufA.length !== stateBufB.length || !crypto.timingSafeEqual(stateBufA, stateBufB)) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid OAuth state parameter.');
          return;
        }
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Authorization cancelled or missing code.');
          return;
        }
        const addr = server.address();
        const redirectUri = `http://127.0.0.1:${addr.port}/oauth-callback`;
        const form = {
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        };
        if (clientSecret) form.client_secret = clientSecret;

        const tokResp = await httpsJsonRequest('https://oauth2.googleapis.com/token', {
          method: 'POST',
          formParams: form,
          timeoutMs: 15000,
        });
        if (tokResp.status !== 200 || !tokResp.json || !tokResp.json.access_token) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Token exchange failed. Check OAuth Client ID configuration.');
          server.close();
          reject(new Error(`OAuth token exchange failed (HTTP ${tokResp.status}).`));
          return;
        }

        writePrivateJson('ge-oauth-token.json', {
          clientId,
          clientSecret,
          refreshToken: tokResp.json.refresh_token || '',
          savedAt: new Date().toISOString(),
        });
        memoryTokenCache = {
          accessToken: tokResp.json.access_token,
          expiresAt: Date.now() + (Number(tokResp.json.expires_in || 3500) - 60) * 1000,
          quotaProjectId: '',
        };

        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'",
        });
        res.end('Google Identity connected to Public Sector Gemini Enterprise Bridge. You can close this tab and return to Antigravity.');
        server.close();
        resolve({ signedIn: true, redirectUri });
      } catch (err) {
        server.close();
        reject(err);
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const redirectUri = `http://127.0.0.1:${addr.port}/oauth-callback`;
      const authHost = 'accounts.google.com';
      const authUrl = new URL('/o/oauth2/v2/auth', 'https://' + authHost);
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/cloud-platform');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', expectedState);

      // Auto-close listener after 180s if user doesn't finish browser login; return URL immediately so user can click it!
      const timer = setTimeout(() => {
        try { server.close(); } catch {}
      }, 180_000);
      timer.unref();

      resolve({
        pendingBrowserAuth: true,
        authorizeUrl: authUrl.toString(),
        instructions:
          'Open the authorizeUrl in Chrome or Edge and sign in with your Public Sector Google Identity (synced with Azure/Entra ID). Once complete, run ge_instance_status to verify.',
      });
    });
  });
}

function requireCompleteGeCoordinates(cfg) {
  const missing = [];
  if (!cfg.projectId) missing.push('projectId (GCP Project ID or Number hosting your Gemini Enterprise app)');
  if (!cfg.engineId) missing.push('engineId (Gemini Enterprise App / Engine ID)');
  if (missing.length > 0) {
    throw new Error(
      `Gemini Enterprise instance is not fully configured yet (missing: ${missing.join(', ')}).\n` +
      `Call \`ge_configure_instance\` with your GE resource path (projects/<PROJECT>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>) or run /connect-ge.`
    );
  }
}

function buildAuthHeaders(accessToken, quotaProjectId) {
  const h = { Authorization: `Bearer ${accessToken}` };
  if (quotaProjectId) h['x-goog-user-project'] = quotaProjectId;
  return h;
}

/**
 * Extracts grounded answer text, citations/search results, and federated connector auth notices
 * from a Discovery Engine `StreamAssist` JSON response (supports JSON array stream or single object).
 */
export function extractStreamAssistPayload(parsedJson, rawText) {
  let frames = [];
  if (Array.isArray(parsedJson)) {
    frames = parsedJson;
  } else if (parsedJson && typeof parsedJson === 'object') {
    frames = [parsedJson];
  } else if (rawText) {
    // Attempt NDJSON fallback
    for (const line of rawText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        frames.push(JSON.parse(trimmed));
      } catch {
        // Ignore partial non-JSON lines
      }
    }
  }

  const textParts = [];
  const citations = [];
  const seenUris = new Set();
  const authPrompts = [];
  const executedActions = [];
  let sessionName = '';

  const extractSnippetText = (node) => {
    if (!node || typeof node !== 'object') return '';
    if (typeof node.snippet === 'string' && node.snippet.trim()) return node.snippet.trim();
    if (typeof node.content === 'string' && node.content.trim()) return node.content.trim();
    if (Array.isArray(node.snippetInfo)) {
      const joined = node.snippetInfo
        .map((s) => (s && typeof s.snippet === 'string' ? s.snippet.trim() : ''))
        .filter(Boolean)
        .join('\n');
      if (joined) return joined;
    }
    if (Array.isArray(node.extractiveAnswers)) {
      const joined = node.extractiveAnswers
        .map((a) => (a && typeof a.content === 'string' ? a.content.trim() : ''))
        .filter(Boolean)
        .join('\n');
      if (joined) return joined;
    }
    if (Array.isArray(node.extractiveSegments)) {
      const joined = node.extractiveSegments
        .map((s) => (s && typeof s.content === 'string' ? s.content.trim() : ''))
        .filter(Boolean)
        .join('\n');
      if (joined) return joined;
    }
    const sd = node.structData || node.derivedStructData;
    if (sd && typeof sd === 'object') {
      const txt = sd.text || sd.message || sd.body || sd.content || sd.snippet || '';
      if (typeof txt === 'string' && txt.trim()) return txt.trim();
    }
    return '';
  };

  const recordSource = (title, uri, snippet, structData = null) => {
    const cleanUri = String(uri || '').trim();
    let cleanTitle = String(title || '').trim();
    if (!cleanTitle && cleanUri) {
      const dmMatch = cleanUri.match(/chat\.google\.com\/dm\/([A-Za-z0-9_-]+)/i);
      const spMatch = cleanUri.match(/(?:chat\.google\.com\/(?:room|space)|#chat\/space)\/([A-Za-z0-9_-]+)/i);
      if (dmMatch) cleanTitle = `Direct Message (spaces/${dmMatch[1]})`;
      else if (spMatch) cleanTitle = `Chat Space (spaces/${spMatch[1]})`;
      else cleanTitle = 'Enterprise Source';
    }
    const cleanSnippet = String(snippet || '').slice(0, 800);
    const key = `${cleanTitle}|${cleanUri}|${cleanSnippet.slice(0, 80)}`;
    if (!cleanTitle && !cleanUri && !cleanSnippet) return;
    if (seenUris.has(key)) return;
    seenUris.add(key);
    citations.push({
      title: cleanTitle || 'Enterprise Source',
      uri: cleanUri,
      snippet: cleanSnippet,
      ...(structData && typeof structData === 'object' ? { structData } : {}),
    });
  };

  const walkForSources = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walkForSources(item);
      return;
    }
    if (node.documentMetadata || node.chunkInfo) {
      const dm = node.documentMetadata || node.chunkInfo?.documentMetadata || {};
      recordSource(
        dm.title || node.title,
        dm.uri || node.uri,
        extractSnippetText(node) || node.chunkInfo?.content || '',
        node.structData || dm.structData || null
      );
    } else if (node.uri || node.document) {
      const snip = extractSnippetText(node);
      if (node.uri || node.title || snip) {
        recordSource(node.title, node.uri || '', snip, node.structData || node.derivedStructData || null);
      }
    }
    if (node.authorizationUrl || node.oauthUri) {
      authPrompts.push(node.authorizationUrl || node.oauthUri);
    }
    for (const val of Object.values(node)) {
      if (val && typeof val === 'object') walkForSources(val);
    }
  };

  for (const frame of frames) {
    if (frame?.sessionInfo?.session) {
      sessionName = frame.sessionInfo.session;
    }
    const steps = frame?.answer?.steps || [];
    for (const step of steps) {
      const actions = step?.actions || [];
      for (const act of actions) {
        if (act && typeof act === 'object') {
          for (const k of Object.keys(act)) {
            if (k !== 'searchAction' && k !== 'observation') {
              executedActions.push(k);
            }
          }
        }
      }
    }
    const replies = frame?.answer?.replies || [];
    for (const rep of replies) {
      const content = rep?.groundedContent?.content;
      if (content?.text && !content?.thought) {
        textParts.push(content.text);
      }
      walkForSources(rep?.groundedContent?.textGroundingMetadata);
    }
    walkForSources(frame?.assistToken ? null : frame?.answer);
    walkForSources(frame?.toolsSpec);
  }

  return {
    answerText: textParts.join('').trim(),
    citations,
    authPrompts,
    executedActions,
    executedConnectorAction: executedActions.length > 0,
    sessionName,
    frameCount: frames.length,
  };
}

const TOOLS = [
  {
    name: 'ge_configure_instance',
    description:
      'Saves the user\'s Gemini Enterprise (GE) instance coordinates so Antigravity can query all federated and ingested connectors (Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, GitHub). Accepts a full resource string (projects/.../locations/.../collections/default_collection/engines/...), Cloud Console URL, GE Web App URL, or explicit projectId + location + engineId.',
    inputSchema: {
      type: 'object',
      properties: {
        instance: {
          type: 'string',
          description: 'GE resource path (projects/<p>/locations/<l>/collections/default_collection/engines/<e>), Console URL, or Engine ID.',
        },
        projectId: { type: 'string', description: 'GCP Project ID or Number hosting the Gemini Enterprise instance.' },
        location: { type: 'string', description: 'GE location: global (default), us, or eu.' },
        collectionId: { type: 'string', description: 'Collection ID (defaults to default_collection).' },
        engineId: { type: 'string', description: 'Gemini Enterprise Engine / App ID.' },
        webAppUrl: { type: 'string', description: 'Optional Gemini Enterprise Web App URL for quick 1-click federated connector authorization.' },
        oauthClientId: { type: 'string', description: 'Optional Desktop OAuth 2.0 Client ID for browser SSO on laptops without gcloud.' },
        oauthClientSecret: { type: 'string', description: 'Optional Desktop OAuth 2.0 Client Secret paired with oauthClientId (stored 0600 locally).' },
      },
    },
  },
  {
    name: 'ge_instance_status',
    description:
      'Verifies connectivity, Google Cloud Identity authentication (synced with Azure/Entra ID), and connected data stores / federated connectors on the configured Gemini Enterprise instance.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'ge_sign_in',
    description:
      'Starts a zero-gcloud 1-click Google Identity browser OAuth PKCE sign-in on 127.0.0.1 (redirecting seamlessly through Public Sector\'s Azure/Entra ID SSO) when gcloud ADC is not present on the corporate laptop.',
    inputSchema: {
      type: 'object',
      properties: {
        oauthClientId: {
          type: 'string',
          description: 'Google Cloud OAuth 2.0 Desktop App Client ID (*.apps.googleusercontent.com). Uses saved clientId if omitted.',
        },
        oauthClientSecret: {
          type: 'string',
          description: 'Google Cloud OAuth 2.0 Desktop App Client Secret paired with oauthClientId. Uses saved clientSecret if omitted.',
        },
      },
    },
  },
  {
    name: 'ge_ask_instance',
    description:
      'Queries the user\'s Gemini Enterprise Assistant (StreamAssist) across ALL federated and ingested connectors configured on their GE instance—including Microsoft Outlook, SharePoint, OneDrive, Teams, Gmail, Google Drive, and GitHub—enforcing the user\'s Entra-synced Google Identity ACLs and returning grounded answers with source links.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language question or retrieval prompt (e.g., "Find unread emails and SharePoint docs from this week about Civic Ready 2026 grants").',
        },
        session: {
          type: 'string',
          description: 'Optional session resource name from a previous ge_ask_instance call for multi-turn follow-ups.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'ge_search_records',
    description:
      'Runs structured Discovery Engine record search (SearchService.Search) against the user\'s Gemini Enterprise engine with pagination and optional metadata filter expressions—ideal for inbox triage, briefings, and FOIA scoping.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query keywords or phrase.' },
        pageSize: { type: 'integer', description: 'Number of records to return (1-25, default 10).' },
        filter: { type: 'string', description: 'Optional Discovery Engine filter expression.' },
      },
      required: ['query'],
    },
  },
];

async function handleToolCall(name, args = {}) {
  if (name === 'ge_configure_instance') {
    const existing = readPrivateJson('ge-instance.json') || {};
    const parsed = parseGeInstanceInput(args.instance || existing.rawInput || '', {
      projectId: args.projectId || existing.projectId,
      location: args.location || existing.location,
      collectionId: args.collectionId || existing.collectionId,
      engineId: args.engineId || existing.engineId,
      webAppUrl: args.webAppUrl || existing.webAppUrl,
    });
    const record = {
      ...parsed,
      oauthClientId: args.oauthClientId || existing.oauthClientId || '',
      oauthClientSecret: args.oauthClientSecret || existing.oauthClientSecret || '',
      updatedAt: new Date().toISOString(),
    };
    const savedPath = writePrivateJson('ge-instance.json', record);
    return {
      configured: Boolean(record.projectId && record.engineId),
      savedTo: savedPath,
      engineResource: record.projectId && record.engineId
        ? `projects/${record.projectId}/locations/${record.location}/collections/${record.collectionId}/engines/${record.engineId}`
        : '(incomplete — provide both projectId and engineId)',
      note:
        record.projectId && record.engineId
          ? 'Saved! Call `ge_instance_status` next to verify your Entra-synced Google Identity token and federated connectors.'
          : 'Web URL saved, but `projectId` or `engineId` still needs to be supplied. Provide the full resource path `projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>` or Cloud Console URL.',
    };
  }

  if (name === 'ge_sign_in') {
    const cfg = loadActiveGeConfig();
    const clientId = args.oauthClientId || cfg.oauthClientId;
    const clientSecret = args.oauthClientSecret || cfg.oauthClientSecret;
    return await runPkceLoopbackSignIn({ clientId, clientSecret });
  }

  if (name === 'ge_instance_status') {
    const cfg = loadActiveGeConfig();
    requireCompleteGeCoordinates(cfg);
    const auth = await resolveUserAccessToken(cfg);
    const base = discoveryEngineBaseUrl(cfg.location);
    const parentCol = `projects/${encodeURIComponent(cfg.projectId)}/locations/${encodeURIComponent(cfg.location)}/collections/${encodeURIComponent(cfg.collectionId)}`;
    const enginePath = `${parentCol}/engines/${encodeURIComponent(cfg.engineId)}`;

    const [engResp, dsResp] = await Promise.all([
      httpsJsonRequest(`${base}/v1alpha/${enginePath}`, {
        headers: buildAuthHeaders(auth.accessToken, auth.quotaProjectId),
      }),
      httpsJsonRequest(`${base}/v1alpha/${parentCol}/dataStores?pageSize=50`, {
        headers: buildAuthHeaders(auth.accessToken, auth.quotaProjectId),
      }),
    ]);

    if (engResp.status !== 200) {
      throw new Error(
        `Gemini Enterprise Engine check returned HTTP ${engResp.status}: ${engResp.text.slice(0, 300)}\n` +
        `Verify that your Entra-synced Google Identity has Discovery Engine access (e.g. Discovery Engine Viewer / Gemini Enterprise User) on project '${cfg.projectId}'.`
      );
    }

    const engine = engResp.json || {};
    const allStores = (dsResp.json && Array.isArray(dsResp.json.dataStores)) ? dsResp.json.dataStores : [];
    const linkedIds = new Set(engine.dataStoreIds || []);
    const connectedStores = allStores
      .filter((ds) => {
        const id = String(ds.name || '').split('/').pop();
        return linkedIds.size === 0 || linkedIds.has(id);
      })
      .map((ds) => ({
        id: String(ds.name || '').split('/').pop(),
        displayName: ds.displayName || '',
        connectorModes: ds.StartingSchema ? 'structured' : 'enterprise/federated',
      }));

    return {
      ok: true,
      authSource: auth.source,
      engineResource: `projects/${cfg.projectId}/locations/${cfg.location}/collections/${cfg.collectionId}/engines/${cfg.engineId}`,
      displayName: engine.displayName || cfg.engineId,
      solutionType: engine.solutionType || 'SOLUTION_TYPE_SEARCH',
      connectedDataStoresAndFederatedConnectors: connectedStores,
      federatedAuthReminder:
        'For federated connectors (Microsoft Outlook, SharePoint, OneDrive, Teams, GitHub), ensure you have opened the Gemini Enterprise Web App once and clicked "Authorize" next to each federated source so your 3P token is linked to your Google Identity.',
      webAppUrl: cfg.webAppUrl || '(optional — add via ge_configure_instance if desired)',
    };
  }

  if (name === 'ge_ask_instance') {
    const cfg = loadActiveGeConfig();
    requireCompleteGeCoordinates(cfg);
    const query = String(args.query || '').trim();
    if (!query) throw new Error('`query` is required.');

    const auth = await resolveUserAccessToken(cfg);
    const base = discoveryEngineBaseUrl(cfg.location);
    const headers = buildAuthHeaders(auth.accessToken, auth.quotaProjectId);
    const parentCol = `projects/${encodeURIComponent(cfg.projectId)}/locations/${encodeURIComponent(cfg.location)}/collections/${encodeURIComponent(cfg.collectionId)}`;
    const assistantPath =
      `${parentCol}/engines/${encodeURIComponent(cfg.engineId)}` +
      `/assistants/default_assistant`;

    // StreamAssist requires explicit toolsSpec.vertexAiSearchSpec.dataStoreSpecs for federated Workspace/3P connectors
    const [engResp, dsResp] = await Promise.all([
      httpsJsonRequest(`${base}/v1alpha/${parentCol}/engines/${encodeURIComponent(cfg.engineId)}`, { headers }),
      httpsJsonRequest(`${base}/v1alpha/${parentCol}/dataStores?pageSize=50`, { headers }),
    ]);
    const linkedIds = new Set((engResp.status === 200 && engResp.json && Array.isArray(engResp.json.dataStoreIds)) ? engResp.json.dataStoreIds : []);
    const allStores = (dsResp.status === 200 && dsResp.json && Array.isArray(dsResp.json.dataStores)) ? dsResp.json.dataStores : [];
    const dataStoreSpecs = allStores
      .filter((ds) => {
        const id = String(ds.name || '').split('/').pop();
        return linkedIds.size === 0 || linkedIds.has(id);
      })
      .map((ds) => ({ dataStore: ds.name }));

    const body = {
      query: { text: query },
    };
    if (dataStoreSpecs.length > 0) {
      body.toolsSpec = {
        vertexAiSearchSpec: {
          dataStoreSpecs,
        },
      };
    }
    if (args.session && String(args.session).trim()) {
      body.session = String(args.session).trim();
    }

    const resp = await httpsJsonRequest(`${base}/v1alpha/${assistantPath}:streamAssist`, {
      method: 'POST',
      headers,
      bodyObj: body,
      timeoutMs: 60000,
    });

    if (resp.status !== 200) {
      throw new Error(
        `StreamAssist returned HTTP ${resp.status}: ${resp.text.slice(0, 400)}\n` +
        `If a federated connector (Outlook/SharePoint/Teams/GitHub) has not been linked yet, open your Gemini Enterprise Web App once and click Authorize on that connector.`
      );
    }

    const extracted = extractStreamAssistPayload(resp.json, resp.text);
    return {
      answer: extracted.answerText || '(No grounded text returned — check whether your federated connectors are authorized in the GE Web App.)',
      citations: extracted.citations,
      session: extracted.sessionName || undefined,
      connectorAuthPrompts: extracted.authPrompts.length > 0
        ? {
            actionRequired: 'One or more federated connectors require a 1-time user OAuth authorization in your Gemini Enterprise Web App.',
            urls: extracted.authPrompts,
          }
        : undefined,
    };
  }

  if (name === 'ge_search_records') {
    const cfg = loadActiveGeConfig();
    requireCompleteGeCoordinates(cfg);
    const query = String(args.query || '').trim();
    if (!query) throw new Error('`query` is required.');
    const pageSize = Math.max(1, Math.min(25, Number(args.pageSize || 10)));

    const auth = await resolveUserAccessToken(cfg);
    const base = discoveryEngineBaseUrl(cfg.location);
    const servingPath =
      `projects/${encodeURIComponent(cfg.projectId)}/locations/${encodeURIComponent(cfg.location)}` +
      `/collections/${encodeURIComponent(cfg.collectionId)}/engines/${encodeURIComponent(cfg.engineId)}` +
      `/servingConfigs/default_search`;

    const body = {
      query,
      pageSize,
      contentSearchSpec: {
        snippetSpec: { returnSnippet: true },
        extractiveContentSpec: { maxExtractiveAnswerCount: 2 },
      },
    };
    if (args.filter && String(args.filter).trim()) {
      body.filter = String(args.filter).trim();
    }

    const resp = await httpsJsonRequest(`${base}/v1alpha/${servingPath}:search`, {
      method: 'POST',
      headers: buildAuthHeaders(auth.accessToken, auth.quotaProjectId),
      bodyObj: body,
      timeoutMs: 30000,
    });

    if (resp.status !== 200) {
      throw new Error(`Discovery Engine Search returned HTTP ${resp.status}: ${resp.text.slice(0, 400)}`);
    }

    const results = Array.isArray(resp.json?.results) ? resp.json.results : [];
    const formatted = results.map((r) => {
      const doc = r.document || {};
      const derived = doc.derivedStructData || {};
      const struct = doc.structData || {};
      return {
        id: doc.id || r.id || '',
        title: derived.title || struct.title || doc.name || 'Untitled Record',
        uri: derived.link || struct.url || struct.uri || '',
        snippets: (derived.snippets || []).map((s) => s.snippet).filter(Boolean),
        extractiveAnswers: (derived.extractive_answers || []).map((a) => a.content).filter(Boolean),
      };
    });

    return {
      totalSize: resp.json?.totalSize ?? formatted.length,
      results: formatted,
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

// --- JSON-RPC 2.0 Stdio MCP Transport (supports both NDJSON & Content-Length framing) ---
let useContentLengthFraming = false;
let inputBuffer = Buffer.alloc(0);

function sendRpcMessage(msgObj) {
  const json = JSON.stringify(msgObj);
  if (useContentLengthFraming) {
    const byteLen = Buffer.byteLength(json, 'utf8');
    process.stdout.write(`Content-Length: ${byteLen}\r\n\r\n${json}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

async function dispatchRpc(msg) {
  if (!msg || typeof msg !== 'object') return;
  const { id, method, params } = msg;

  // Notifications have no id
  if (id === undefined || id === null) return;

  try {
    if (method === 'initialize') {
      sendRpcMessage({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
      return;
    }
    if (method === 'ping') {
      sendRpcMessage({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      sendRpcMessage({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      try {
        const out = await handleToolCall(toolName, toolArgs);
        sendRpcMessage({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
            isError: false,
          },
        });
      } catch (toolErr) {
        sendRpcMessage({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Error: ${toolErr.message || String(toolErr)}` }],
            isError: true,
          },
        });
      }
      return;
    }

    sendRpcMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (err) {
    sendRpcMessage({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: err.message || 'Internal error' },
    });
  }
}

function processStdioBuffer() {
  while (inputBuffer.length > 0) {
    const headerProbe = inputBuffer.subarray(0, Math.min(inputBuffer.length, 32)).toString('utf8');
    if (headerProbe.startsWith('Content-Length:')) {
      useContentLengthFraming = true;
      const sepIdx = inputBuffer.indexOf('\r\n\r\n');
      if (sepIdx === -1) return;
      const headerStr = inputBuffer.subarray(0, sepIdx).toString('utf8');
      const m = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (!m) {
        inputBuffer = inputBuffer.subarray(sepIdx + 4);
        continue;
      }
      const len = Number(m[1]);
      const bodyStart = sepIdx + 4;
      if (inputBuffer.length < bodyStart + len) return;
      const bodyStr = inputBuffer.subarray(bodyStart, bodyStart + len).toString('utf8');
      inputBuffer = inputBuffer.subarray(bodyStart + len);
      try {
        dispatchRpc(JSON.parse(bodyStr));
      } catch {}
    } else {
      const nlIdx = inputBuffer.indexOf('\n');
      if (nlIdx === -1) return;
      const line = inputBuffer.subarray(0, nlIdx).toString('utf8').trim();
      inputBuffer = inputBuffer.subarray(nlIdx + 1);
      if (!line) continue;
      try {
        dispatchRpc(JSON.parse(line));
      } catch {}
    }
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    const resolvedHref = pathToFileURL(path.resolve(process.argv[1])).href;
    if (import.meta.url === resolvedHref) return true;
    const realHref = pathToFileURL(fs.realpathSync(process.argv[1])).href;
    return import.meta.url === realHref;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    processStdioBuffer();
  });
}
