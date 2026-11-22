#!/usr/bin/env node
/**
 * Chatski — Google Chat & Gemini Enterprise Chat Connector Sidecar (`main.mjs`)
 *
 * Clean-room Antigravity UI sidecar running on the built-in Node runtime (`sidecar_sdk`).
 *
 * Connection Modes:
 *  1. `ge` (Default / Zero Extra Setup): Reuses the user's configured Gemini Enterprise
 *     instance (`~/.gemini/antigravity/plugin_data/agy-connectors/ge-instance.json` or
 *     `~/.gemini/config/plugin_data/agy-connectors/ge-instance.json`) and its Google Chat
 *     (or Microsoft Teams) connector via `AssistantService.StreamAssist` (strictly read-only
 *     retrieval prompts on sync/refresh; explicit human click confirmation required on sends).
 *  2. `direct` (Optional Turbo Upgrade): Direct `https://chat.googleapis.com/v1` REST API
 *     via 1-time Desktop OAuth PKCE (`127.0.0.1` loopback).
 *  3. `demo` (Interactive Sample Workspace): Automatic fallback before `/connect-ge` is
 *     configured (or when toggled on for demos/workshops).
 */

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { URL, fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { buildInlinedSidecarHtml, readOfficialPreloadJs } from './sidecar_html_inliner.mjs';
import { extractStreamAssistPayload, parseGeInstanceInput } from '../../scripts/ge_instance_mcp.mjs';
import { getTokenMeterSummary } from './token_meter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const ALLOWED_DE_HOST_RE = /^(?:[a-z0-9-]+-)?discoveryengine\.googleapis\.com$/;
const ALLOWED_CHAT_HOST = 'chat.googleapis.com';

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * Resolves all candidate `agy-connectors` plugin_data directories in priority order.
 * Antigravity Desktop passes `PLUGIN_DATA` (`~/.gemini/antigravity/plugin_data/agy-connectors`)
 * to MCP servers (`ge_instance_mcp.mjs`), whereas UI sidecars receive `ANTIGRAVITY_APP_DATA_DIR`
 * and `ANTIGRAVITY_EXECUTABLE_DATA_DIR` without `PLUGIN_DATA`. Checking all candidate roots
 * ensures Chatski immediately sees `/connect-ge` credentials regardless of host runtime.
 */
function getConnectorDataDirs() {
  const pinned = (process.env.ANTIGRAVITY_CONNECTORS_DATA_DIR || '').trim();
  if (pinned) {
    return [path.resolve(pinned)];
  }
  const raw = [];
  const pluginData = (process.env.PLUGIN_DATA || '').trim();
  if (pluginData) {
    const resolvedPd = path.resolve(pluginData);
    if (path.basename(resolvedPd) === 'agy-connectors') {
      raw.push(resolvedPd);
    } else {
      raw.push(path.resolve(resolvedPd, '..', 'agy-connectors'));
      raw.push(resolvedPd);
    }
  }
  const appData = (process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim();
  if (appData) {
    raw.push(path.join(path.resolve(appData), 'plugin_data', 'agy-connectors'));
  }
  const execData = (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '').trim();
  if (execData) {
    const resolvedExec = path.resolve(execData);
    for (const seg of [`${path.sep}sidecar_data${path.sep}`, `${path.sep}plugin_data${path.sep}`]) {
      const idx = resolvedExec.indexOf(seg);
      if (idx > 0) {
        raw.push(path.join(resolvedExec.slice(0, idx), 'plugin_data', 'agy-connectors'));
      }
    }
  }
  const home = os.homedir();
  raw.push(
    path.join(home, '.gemini', 'antigravity', 'plugin_data', 'agy-connectors'),
    path.join(home, '.gemini', 'jetski', 'plugin_data', 'agy-connectors'),
    path.join(home, '.gemini', 'config', 'plugin_data', 'agy-connectors')
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

function getConnectorDataDir() {
  const pinned = (process.env.ANTIGRAVITY_CONNECTORS_DATA_DIR || '').trim();
  if (pinned) {
    const d = path.resolve(pinned);
    fs.mkdirSync(d, { recursive: true, mode: 0o700 });
    return d;
  }
  const pd = (process.env.PLUGIN_DATA || '').trim();
  if (pd && path.basename(path.resolve(pd)) === 'agy-connectors') {
    const d = path.resolve(pd);
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
  const dir = fs.existsSync(agyRoot)
    ? path.join(agyRoot, 'plugin_data', 'agy-connectors')
    : path.resolve(home, '.gemini', 'config', 'plugin_data', 'agy-connectors');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function getChatskiStateDir() {
  const execDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR;
  const dir = execDir && execDir.trim()
    ? path.resolve(execDir.trim())
    : getConnectorDataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function readJsonSafe(dir, fileName) {
  const safe = path.basename(fileName);
  const target = path.join(dir, safe);
  if (!target.startsWith(dir + path.sep)) return null;
  const st = lstatOrNull(target);
  if (!st || st.isSymbolicLink() || !st.isFile()) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonSafe(dir, fileName, obj) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dirSt = lstatOrNull(dir);
  if (!dirSt || dirSt.isSymbolicLink() || !dirSt.isDirectory()) {
    throw new Error('Invalid target directory');
  }
  const safe = path.basename(fileName);
  const target = path.join(dir, safe);
  if (!target.startsWith(dir + path.sep)) {
    throw new Error('Blocked write outside data directory');
  }
  const st = lstatOrNull(target);
  if (st && st.isSymbolicLink()) {
    throw new Error('Refusing symlinked target');
  }
  const tmp = path.join(dir, `.${safe}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, target);
  return target;
}

function isConnectorFileConfigured(fileName, obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (fileName === 'ge-instance.json') {
    try {
      const p = parseGeInstanceInput(obj.rawInput || '', obj);
      return Boolean(p.projectId && p.engineId);
    } catch {
      return false;
    }
  }
  if (fileName === 'ge-oauth-token.json' || fileName === 'chatski-direct-oauth.json') {
    return Boolean(obj.refreshToken && obj.clientId);
  }
  return Object.keys(obj).length > 0;
}

function readConnectorJson(fileName) {
  const safe = path.basename(fileName);
  let best = null;
  for (const dir of getConnectorDataDirs()) {
    const target = path.join(dir, safe);
    if (!target.startsWith(dir + path.sep)) continue;
    const st = lstatOrNull(target);
    if (!st || st.isSymbolicLink() || !st.isFile()) continue;
    const parsed = readJsonSafe(dir, safe);
    if (!parsed) continue;
    const configured = isConnectorFileConfigured(safe, parsed);
    const ts = Date.parse(parsed.updatedAt || parsed.savedAt || '') || st.mtimeMs || 0;
    if (
      !best ||
      (configured && !best.configured) ||
      (configured === best.configured && ts > best.ts)
    ) {
      best = { parsed, configured, ts };
    }
  }
  return best ? best.parsed : null;
}

function writeConnectorJson(fileName, obj) {
  const primaryDir = getConnectorDataDir();
  const savedTarget = writeJsonSafe(primaryDir, fileName, obj);

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
        writeJsonSafe(resolvedMirror, fileName, obj);
      } catch {}
    }
  }
  return savedTarget;
}

function httpsJsonRequest(urlString, { method = 'GET', headers = {}, bodyObj = null, formParams = null, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const testOrigin = process.env.AGY_GE_TEST_ORIGIN || '';
    const isLocalTest =
      Boolean(testOrigin) &&
      parsed.protocol === 'http:' &&
      parsed.hostname === '127.0.0.1' &&
      urlString.startsWith(testOrigin);

    const isAllowedHttps =
      parsed.protocol === 'https:' &&
      (ALLOWED_DE_HOST_RE.test(parsed.hostname) ||
        parsed.hostname === ALLOWED_CHAT_HOST ||
        parsed.hostname === 'oauth2.googleapis.com');

    if (!isAllowedHttps && !isLocalTest) {
      reject(new Error(`Blocked outbound request to disallowed host: ${parsed.hostname}`));
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

    const req = transport.request(parsed, { method, headers: reqHeaders, timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        resolve({ status: res.statusCode || 0, json, text });
      });
    });
    req.on('timeout', () => req.destroy(new Error('Upstream Chat/GE request timed out')));
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function loadGeConfig() {
  const saved = readConnectorJson('ge-instance.json') || {};
  const parsed = parseGeInstanceInput(saved.rawInput || process.env.GE_INSTANCE || '', {
    projectId: saved.projectId,
    location: saved.location,
    collectionId: saved.collectionId,
    engineId: saved.engineId,
    webAppUrl: saved.webAppUrl,
  });
  return {
    ...parsed,
    configured: Boolean(parsed.projectId && parsed.engineId),
    oauthClientId: saved.oauthClientId || process.env.GE_OAUTH_CLIENT_ID || '',
    oauthClientSecret: saved.oauthClientSecret || process.env.GE_OAUTH_CLIENT_SECRET || '',
  };
}

function discoveryEngineBaseUrl(location) {
  const testOrigin = process.env.AGY_GE_TEST_ORIGIN;
  if (testOrigin && /^http:\/\/127\.0\.0\.1:\d+$/.test(testOrigin)) {
    return testOrigin;
  }
  const loc = (location || 'global').toLowerCase();
  const host = loc === 'global' ? 'discoveryengine.googleapis.com' : `${loc}-discoveryengine.googleapis.com`;
  if (!ALLOWED_DE_HOST_RE.test(host)) {
    throw new Error(`Invalid Discovery Engine location: ${location}`);
  }
  return `https://${host}`;
}

function chatApiBaseUrl() {
  const testOrigin = process.env.AGY_GE_TEST_ORIGIN;
  if (testOrigin && /^http:\/\/127\.0\.0\.1:\d+$/.test(testOrigin)) {
    return `${testOrigin}/chat-api`;
  }
  return 'https://chat.googleapis.com';
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
    throw new Error(`OAuth token refresh failed (HTTP ${resp.status})`);
  }
  return {
    accessToken: resp.json.access_token,
    expiresAt: Date.now() + (Number(resp.json.expires_in || 3500) - 60) * 1000,
  };
}

let geTokenCache = { accessToken: '', expiresAt: 0, quotaProjectId: '', source: '' };
let directChatTokenCache = { accessToken: '', expiresAt: 0 };

async function resolveGeAccessToken(cfg) {
  if (process.env.AGY_GE_TEST_BEARER && process.env.AGY_GE_TEST_ORIGIN) {
    return { accessToken: process.env.AGY_GE_TEST_BEARER, quotaProjectId: cfg.projectId || '', source: 'test-bearer' };
  }
  if (geTokenCache.accessToken && Date.now() < geTokenCache.expiresAt) {
    return geTokenCache;
  }

  const savedTok = readConnectorJson('ge-oauth-token.json');
  if (savedTok && savedTok.refreshToken && savedTok.clientId) {
    const ref = await refreshOAuthToken({
      clientId: savedTok.clientId,
      clientSecret: savedTok.clientSecret || '',
      refreshToken: savedTok.refreshToken,
    });
    geTokenCache = { ...ref, quotaProjectId: cfg.projectId || '', source: 'ge-oauth' };
    return geTokenCache;
  }

  const adcCandidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json') : '',
  ].filter(Boolean);

  for (const adcPath of adcCandidates) {
    const st = lstatOrNull(adcPath);
    if (st && st.isFile() && !st.isSymbolicLink()) {
      try {
        const adc = JSON.parse(fs.readFileSync(adcPath, 'utf-8'));
        if (adc.type === 'authorized_user' && adc.client_id && adc.refresh_token) {
          const ref = await refreshOAuthToken({
            clientId: adc.client_id,
            clientSecret: adc.client_secret || '',
            refreshToken: adc.refresh_token,
          });
          geTokenCache = { ...ref, quotaProjectId: adc.quota_project_id || cfg.projectId || '', source: 'adc' };
          return geTokenCache;
        }
      } catch {}
    }
  }

  const gcloudBins = process.platform === 'win32' ? ['gcloud.cmd', 'gcloud'] : ['gcloud'];
  for (const bin of gcloudBins) {
    try {
      const tok = execFileSync(bin, ['auth', 'print-access-token'], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 6000,
      }).trim();
      if (tok) {
        geTokenCache = {
          accessToken: tok,
          expiresAt: Date.now() + 240_000,
          quotaProjectId: cfg.projectId || '',
          source: 'gcloud',
        };
        return geTokenCache;
      }
    } catch {}
  }

  throw new Error('No Google Identity token found yet. Run /connect-ge or click Settings (⚙) in Chatski.');
}

async function resolveDirectChatToken() {
  if (process.env.AGY_CHAT_DIRECT_TEST_BEARER && process.env.AGY_GE_TEST_ORIGIN) {
    return process.env.AGY_CHAT_DIRECT_TEST_BEARER;
  }
  if (directChatTokenCache.accessToken && Date.now() < directChatTokenCache.expiresAt) {
    return directChatTokenCache.accessToken;
  }
  const saved = readConnectorJson('chatski-direct-oauth.json');
  if (!saved || !saved.refreshToken || !saved.clientId) return '';
  const ref = await refreshOAuthToken({
    clientId: saved.clientId,
    clientSecret: saved.clientSecret || '',
    refreshToken: saved.refreshToken,
  });
  directChatTokenCache = ref;
  return ref.accessToken;
}

function buildSeedConversations() {
  return [
    {
      id: 'space-antigravity-discussion',
      kind: 'space',
      title: 'Antigravity & Gemini Agents Discussion',
      badgeLetter: 'A',
      badgeColor: '#d97706',
      memberCount: 412,
      pinned: true,
      unreadCount: 2,
      mentionsMe: true,
      updatedAgo: '2m',
      subtitle: 'Space · 412 members · Shared workflows, skills & Orchestrator tips',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-101',
          sender: 'Elena Rostova',
          initials: 'ER',
          avatarColor: '#2563eb',
          timeLabel: '2:14 PM',
          text: 'Has anyone paired the new Orchestrator (Argon) mode with the Gemini Enterprise SharePoint & Chat connectors yet? Seeing ~55% lower quota burn on multi-step doc reviews.',
          reactions: [
            { emoji: '👍', count: 4 },
            { emoji: '🎉', count: 2 },
          ],
          replyCount: 3,
          lastReplyAgo: '8m ago',
        },
        {
          id: 'm-102',
          sender: 'Marcus Chen',
          initials: 'MC',
          avatarColor: '#059669',
          timeLabel: '2:19 PM',
          quotedSender: 'Elena Rostova · 2:14 PM',
          quotedText: 'Has anyone paired the new Orchestrator (Argon) mode with the Gemini Enterprise SharePoint & Chat connectors yet?',
          text: 'Yes! Once the Google Chat connector is authorized in Gemini Enterprise, Antigravity can summarize active Space threads and stage replies right inside Chatski without extra setup.',
          reactions: [{ emoji: '❤️', count: 2 }],
          replyCount: 0,
          mentionsMe: true,
        },
      ],
    },
    {
      id: 'space-broadband-round3',
      kind: 'space',
      title: 'Broadband Grant Round 3 — Ops Room',
      badgeLetter: 'B',
      badgeColor: '#059669',
      memberCount: 28,
      pinned: true,
      unreadCount: 1,
      mentionsMe: false,
      updatedAgo: '14m',
      subtitle: 'Space · 28 members · County intake rubric & FAQ alignment',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-201',
          sender: 'Carla Jennings',
          initials: 'CJ',
          avatarColor: '#7c3aed',
          timeLabel: '1:48 PM',
          text: 'Uploaded the final 12-county match-waiver calculation worksheet. Can we confirm the $15M cap wording matches the stakeholder flyer before 4 PM?',
          reactions: [{ emoji: '👍', count: 3 }],
          replyCount: 2,
          lastReplyAgo: '14m ago',
        },
      ],
    },
    {
      id: 'space-security-governance',
      kind: 'space',
      title: 'Cloud Security & Records Governance',
      badgeLetter: 'C',
      badgeColor: '#0284c7',
      memberCount: 64,
      pinned: false,
      unreadCount: 0,
      mentionsMe: false,
      updatedAgo: '1h',
      subtitle: 'Space · 64 members · Purview eDiscovery, KMS & Assured Workloads',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-301',
          sender: 'Hannah Kim',
          initials: 'HK',
          avatarColor: '#db2777',
          timeLabel: '12:30 PM',
          text: 'Confirmed: segregability citations on the sample records pilot passed legal review with zero findings.',
          reactions: [{ emoji: '🎉', count: 5 }],
          replyCount: 0,
        },
      ],
    },
    {
      id: 'dm-carla-jennings',
      kind: 'dm',
      title: 'Carla Jennings',
      badgeLetter: 'CJ',
      badgeColor: '#7c3aed',
      memberCount: 2,
      pinned: false,
      unreadCount: 1,
      mentionsMe: true,
      updatedAgo: '5m',
      subtitle: 'Direct message · Deputy Bureau Director',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-401',
          sender: 'Carla Jennings',
          initials: 'CJ',
          avatarColor: '#7c3aed',
          timeLabel: '2:25 PM',
          text: 'Hey! Do you have 5 minutes before Thursday\'s rubric sign-off to sanity-check the Spanish FAQ timeline?',
          reactions: [],
          replyCount: 0,
          mentionsMe: true,
        },
      ],
    },
    {
      id: 'dm-group-architecture',
      kind: 'dm',
      title: 'Marcus Chen, Elena Rostova',
      badgeLetter: 'ME',
      badgeColor: '#0d9488',
      memberCount: 3,
      pinned: false,
      unreadCount: 0,
      mentionsMe: false,
      updatedAgo: '38m',
      subtitle: 'Group direct message · 3 members',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-501',
          sender: 'Marcus Chen',
          initials: 'MC',
          avatarColor: '#059669',
          timeLabel: '1:50 PM',
          text: 'Shared the BigQuery 1 GB scan-cap template in our repo—ready for next week\'s cohort.',
          reactions: [{ emoji: '👍', count: 1 }],
          replyCount: 0,
        },
      ],
    },
    {
      id: 'dm-robert-vance',
      kind: 'dm',
      title: 'Robert Vance',
      badgeLetter: 'RV',
      badgeColor: '#ea580c',
      memberCount: 2,
      pinned: false,
      unreadCount: 0,
      mentionsMe: false,
      updatedAgo: '2h',
      subtitle: 'Direct message · County Grants Coordinator',
      webUrl: 'https://mail.google.com/chat/u/0/#chat/home',
      messages: [
        {
          id: 'm-601',
          sender: 'Robert Vance',
          initials: 'RV',
          avatarColor: '#ea580c',
          timeLabel: '11:15 AM',
          text: 'Thanks for sending over the match-waiver instructions—super clear for our rural applicants.',
          reactions: [],
          replyCount: 0,
        },
      ],
    },
  ];
}

function loadPersistedChatskiState() {
  const dir = getChatskiStateDir();
  const saved = readJsonSafe(dir, 'chatski-state.json');
  if (saved && typeof saved === 'object') {
    return {
      modePreference: saved.modePreference || 'auto', // 'auto' | 'ge' | 'direct' | 'demo'
      lastSyncedIso: saved.lastSyncedIso || '',
      geChatStores: Array.isArray(saved.geChatStores) ? saved.geChatStores : [],
      conversations: Array.isArray(saved.conversations) ? saved.conversations : [],
      drafts: Array.isArray(saved.drafts) ? saved.drafts : [],
    };
  }
  return {
    modePreference: 'auto',
    lastSyncedIso: '',
    geChatStores: [],
    conversations: [],
    drafts: [],
  };
}

function savePersistedChatskiState(next) {
  writeJsonSafe(getChatskiStateDir(), 'chatski-state.json', next);
}

function pickColorForTitle(title) {
  const palette = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#0284c7', '#db2777', '#0d9488', '#ea580c'];
  let h = 0;
  const s = String(title || 'Chat');
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function initialsForName(name) {
  const parts = String(name || 'C')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function parseJsonBlockFromAnswer(answerText) {
  const raw = String(answerText || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      const arr = JSON.parse(candidate.slice(firstBracket, lastBracket + 1));
      if (Array.isArray(arr)) return { conversations: arr };
    } catch {}
  }
  return null;
}

function stripOuterQuotes(s) {
  const t = String(s || '').trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('“') && t.endsWith('”')))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function parseMessageLinesFromProse(rawText) {
  const lines = String(rawText || '').split(/\r?\n/);
  const parsed = [];
  const patTimeFirst =
    /^(?:[-*•]\s+|\d+[.)]\s+)?\[?(\d{4}-\d{2}-\d{2}[T\s][^\-\]]{2,26}|\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|UTC)?)\]?\s*[-–—]\s*\*{0,2}([^:*\n]{1,64})\*{0,2}\s*:\s*(.+)$/i;
  const patSenderFirst = /^(?:[-*•]\s+|\d+[.)]\s+)?\*{0,2}([^(*:\n]{1,64})\*{0,2}\s*\(([^)]{2,32})\)\s*:\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m1 = trimmed.match(patTimeFirst);
    if (m1) {
      parsed.push({
        id: `prose-m-${parsed.length + 1}`,
        timeLabel: m1[1].trim(),
        sender: m1[2].trim(),
        text: stripOuterQuotes(m1[3]),
      });
      continue;
    }
    const m2 = trimmed.match(patSenderFirst);
    if (m2) {
      parsed.push({
        id: `prose-m-${parsed.length + 1}`,
        sender: m2[1].trim(),
        timeLabel: m2[2].trim(),
        text: stripOuterQuotes(m2[3]),
      });
    }
  }

  if (parsed.length >= 2) {
    const tFirst = Date.parse(parsed[0].timeLabel);
    const tLast = Date.parse(parsed[parsed.length - 1].timeLabel);
    if (!Number.isNaN(tFirst) && !Number.isNaN(tLast) && tFirst > tLast) {
      parsed.reverse();
    }
  }
  return parsed;
}

function extractChatSpaceRef(str) {
  const s = String(str || '');
  const urlMatch = s.match(/https:\/\/(?:chat\.google\.com\/(dm|room|space)|mail\.google\.com\/chat\/u\/\d+\/#chat\/(dm|space))\/([A-Za-z0-9_-]+)/i);
  if (urlMatch) {
    const kindHint = (urlMatch[1] || urlMatch[2] || '').toLowerCase() === 'dm' ? 'dm' : 'space';
    const spaceId = urlMatch[3];
    return {
      spaceId,
      spaceName: `spaces/${spaceId}`,
      kind: kindHint,
      webUrl: urlMatch[0],
    };
  }
  const resMatch = s.match(/\bspaces\/([A-Za-z0-9_-]{4,})\b/);
  if (resMatch) {
    const spaceId = resMatch[1];
    return {
      spaceId,
      spaceName: `spaces/${spaceId}`,
      kind: /\bdm\b|direct message/i.test(s) ? 'dm' : 'space',
      webUrl: /\bdm\b|direct message/i.test(s)
        ? `https://chat.google.com/dm/${spaceId}`
        : `https://mail.google.com/chat/u/0/#chat/space/${spaceId}`,
    };
  }
  return null;
}

function parseConversationsFromGroundedProseAndCitations(answerText, citations = []) {
  const proseMsgs = parseMessageLinesFromProse(answerText);
  const groups = new Map();

  for (let i = 0; i < citations.length; i += 1) {
    const cit = citations[i] || {};
    const ref = extractChatSpaceRef(`${cit.uri || ''} ${cit.title || ''} ${cit.snippet || ''}`);
    const key = ref ? ref.spaceName : cit.uri || `cit-${i}`;
    if (!groups.has(key)) {
      const kind = ref ? ref.kind : /\bdm\b|direct/i.test(cit.title || '') ? 'dm' : 'space';
      groups.set(key, {
        id: ref ? `spaces-${ref.spaceId}` : `ge-cit-${i}`,
        spaceName: ref ? ref.spaceName : '',
        kind,
        title: cit.title || (kind === 'dm' ? 'Direct Message' : `Chat Space ${groups.size + 1}`),
        webUrl: cit.uri || (ref ? ref.webUrl : 'https://mail.google.com/chat/u/0/#chat/home'),
        messages: [],
      });
    }
    const g = groups.get(key);
    const snippetMsgs = parseMessageLinesFromProse(cit.snippet || '');
    if (snippetMsgs.length > 0) {
      g.messages.push(...snippetMsgs);
    } else if (cit.snippet) {
      g.messages.push({
        id: `cit-m-${i}`,
        sender: g.kind === 'dm' && g.title !== 'Direct Message' ? g.title : 'Google Chat',
        timeLabel: 'Recent',
        text: stripOuterQuotes(cit.snippet),
      });
    }
  }

  if (groups.size === 0) {
    const proseRef = extractChatSpaceRef(answerText);
    if (proseRef || proseMsgs.length > 0) {
      const kind = proseRef ? proseRef.kind : /\bdm\b|direct message/i.test(answerText) ? 'dm' : 'space';
      const defaultTitle =
        kind === 'dm' && proseMsgs.length > 0
          ? proseMsgs[proseMsgs.length - 1].sender || 'Direct Message'
          : proseRef
            ? `Chat (${proseRef.spaceName})`
            : 'Recent Google Chat Activity';
      groups.set(proseRef ? proseRef.spaceName : 'prose-default', {
        id: proseRef ? `spaces-${proseRef.spaceId}` : 'ge-prose-chat',
        spaceName: proseRef ? proseRef.spaceName : '',
        kind,
        title: defaultTitle,
        webUrl: proseRef ? proseRef.webUrl : 'https://mail.google.com/chat/u/0/#chat/home',
        messages: proseMsgs,
      });
    }
  } else if (groups.size === 1 && proseMsgs.length > 0) {
    const only = groups.values().next().value;
    if (proseMsgs.length >= only.messages.length) {
      only.messages = proseMsgs;
    }
    if (
      only.kind === 'dm' &&
      (only.title === 'Direct Message' || /^spaces\//i.test(only.title)) &&
      proseMsgs[0]?.sender
    ) {
      only.title = proseMsgs[0].sender;
    }
  }

  return normalizeConversationList(Array.from(groups.values()));
}

async function discoverGeChatDataStores(cfg, auth) {
  const base = discoveryEngineBaseUrl(cfg.location);
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  if (auth.quotaProjectId) headers['x-goog-user-project'] = auth.quotaProjectId;
  const parentCol = `projects/${encodeURIComponent(cfg.projectId)}/locations/${encodeURIComponent(cfg.location)}/collections/${encodeURIComponent(cfg.collectionId)}`;
  const [engResp, dsResp] = await Promise.all([
    httpsJsonRequest(`${base}/v1alpha/${parentCol}/engines/${encodeURIComponent(cfg.engineId)}`, { headers }),
    httpsJsonRequest(`${base}/v1alpha/${parentCol}/dataStores?pageSize=50`, { headers }),
  ]);
  const linkedIds = new Set(
    engResp.status === 200 && engResp.json && Array.isArray(engResp.json.dataStoreIds) ? engResp.json.dataStoreIds : []
  );
  const allStores =
    dsResp.status === 200 && dsResp.json && Array.isArray(dsResp.json.dataStores) ? dsResp.json.dataStores : [];
  const engineStores = allStores.filter((ds) => {
    const id = String(ds.name || '').split('/').pop();
    return linkedIds.size === 0 || linkedIds.has(id);
  });

  const chatStores = engineStores.filter((ds) => {
    const hay = JSON.stringify(ds || {}).toLowerCase();
    return hay.includes('chat') || hay.includes('dynamite') || hay.includes('teams');
  });

  return {
    allEngineStores: engineStores,
    chatStores,
  };
}

async function callGeStreamAssist(cfg, auth, { queryText, dataStores = [], session = '' }) {
  const base = discoveryEngineBaseUrl(cfg.location);
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  if (auth.quotaProjectId) headers['x-goog-user-project'] = auth.quotaProjectId;

  const assistantPath =
    `projects/${encodeURIComponent(cfg.projectId)}/locations/${encodeURIComponent(cfg.location)}` +
    `/collections/${encodeURIComponent(cfg.collectionId)}/engines/${encodeURIComponent(cfg.engineId)}` +
    `/assistants/default_assistant`;

  // Discovery Engine v1alpha StreamAssistRequest accepts { query, toolsSpec, session } only.
  // Never pass unknown top-level fields like actionSpec (rejected with HTTP 400).
  const body = {
    query: { text: queryText },
  };
  if (dataStores.length > 0) {
    body.toolsSpec = {
      vertexAiSearchSpec: {
        dataStoreSpecs: dataStores.map((ds) => ({ dataStore: ds.name })),
      },
    };
  }
  if (session && String(session).trim()) {
    body.session = String(session).trim();
  }

  const resp = await httpsJsonRequest(`${base}/v1alpha/${assistantPath}:streamAssist`, {
    method: 'POST',
    headers,
    bodyObj: body,
    timeoutMs: 55000,
  });
  if (resp.status !== 200) {
    throw new Error(`Gemini Enterprise StreamAssist returned HTTP ${resp.status}: ${resp.text.slice(0, 260)}`);
  }
  return {
    ...extractStreamAssistPayload(resp.json, resp.text),
    rawFrames: resp.json,
  };
}

function normalizeConversationList(rawConvs) {
  if (!Array.isArray(rawConvs)) return [];
  return rawConvs
    .slice(0, 40)
    .map((c, idx) => {
      const title = String(c.title || c.displayName || c.name || `Conversation ${idx + 1}`).trim();
      const kind = String(c.kind || c.type || '').toLowerCase().includes('dm') || String(c.kind || '').toLowerCase() === 'direct'
        ? 'dm'
        : 'space';
      const rawMsgs = Array.isArray(c.messages) ? c.messages : [];
      const messages = rawMsgs.slice(-25).map((m, mIdx) => {
        const sender = String(m.sender || m.author || 'Teammate').trim();
        return {
          id: String(m.id || `msg-${idx}-${mIdx}`),
          sender,
          initials: initialsForName(sender),
          avatarColor: pickColorForTitle(sender),
          timeLabel: String(m.timeLabel || m.timestamp || m.createTime || 'Recent'),
          quotedSender: m.quotedSender ? String(m.quotedSender) : '',
          quotedText: m.quotedText ? String(m.quotedText) : '',
          text: String(m.text || m.snippet || '').trim(),
          reactions: Array.isArray(m.reactions)
            ? m.reactions.map((r) => ({ emoji: String(r.emoji || '👍'), count: Number(r.count || 1) }))
            : [],
          replyCount: Number(m.replyCount || 0),
          lastReplyAgo: m.lastReplyAgo ? String(m.lastReplyAgo) : '',
          mentionsMe: Boolean(m.mentionsMe),
        };
      });
      return {
        id: String(c.id || c.spaceName || `ge-conv-${idx}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 28)}`),
        spaceResource: String(c.spaceName || c.resourceName || ''),
        kind,
        title,
        badgeLetter: kind === 'dm' ? initialsForName(title) : title.charAt(0).toUpperCase() || 'S',
        badgeColor: pickColorForTitle(title),
        memberCount: Number(c.memberCount || (kind === 'dm' ? 2 : 12)),
        pinned: Boolean(c.pinned),
        unreadCount: Number(c.unreadCount || 0),
        mentionsMe: Boolean(c.mentionsMe || messages.some((m) => m.mentionsMe)),
        updatedAgo: String(c.updatedAgo || 'Recent'),
        subtitle: String(
          c.subtitle ||
            (kind === 'dm' ? 'Direct message · Gemini Enterprise Chat Connector' : 'Space · Gemini Enterprise Chat Connector')
        ),
        webUrl: String(c.webUrl || c.uri || 'https://mail.google.com/chat/u/0/#chat/home'),
        messages,
      };
    })
    .filter((c) => c.title);
}

async function syncConversationsFromGe() {
  const cfg = loadGeConfig();
  if (!cfg.configured) {
    throw new Error('Gemini Enterprise instance is not configured yet. Run /connect-ge first.');
  }
  const auth = await resolveGeAccessToken(cfg);
  const { allEngineStores, chatStores } = await discoverGeChatDataStores(cfg, auth);
  const targetStores = allEngineStores.length > 0 ? allEngineStores : chatStores;

  const rosterPrompt = [
    'Retrieve and list only (do NOT send, post, or modify any messages): use the connected Google Chat (or Microsoft Teams) connector to list my most recent Direct Messages and Spaces (up to 12 total) along with the 2–5 most recent messages in each.',
    'Return ONLY valid JSON matching this exact schema (no extra commentary):',
    '{"conversations":[{"id":"spaces/AAAA... or slug","spaceName":"spaces/AAAA...","kind":"space|dm","title":"Space or Person Name","unreadCount":0,"updatedAgo":"5m","webUrl":"https://...","messages":[{"id":"m1","sender":"Full Name","timeLabel":"2:15 PM","text":"Message text","mentionsMe":false}]}]}',
  ].join('\n');

  const assist = await callGeStreamAssist(cfg, auth, {
    queryText: rosterPrompt,
    dataStores: targetStores,
  });

  let convs = [];
  const parsed = parseJsonBlockFromAnswer(assist.answerText);
  if (parsed && Array.isArray(parsed.conversations)) {
    convs = normalizeConversationList(parsed.conversations);
  }

  // Fallback: coalesce grounded Google Chat citations + timestamped prose bullets into DMs/Spaces
  if (convs.length === 0) {
    convs = parseConversationsFromGroundedProseAndCitations(assist.answerText, assist.citations || []);
  }

  // If GE answered in plain text with zero citations/structured lines, surface as an Inbox Digest space
  if (convs.length === 0 && assist.answerText) {
    convs = normalizeConversationList([
      {
        id: 'ge-chat-digest',
        kind: 'space',
        title: 'Gemini Enterprise Chat Digest',
        subtitle: 'Grounded summary from your Gemini Enterprise Chat Connector',
        messages: [
          {
            id: 'ge-digest-1',
            sender: 'Gemini Enterprise Connector',
            timeLabel: 'Just now',
            text: assist.answerText,
          },
        ],
      },
    ]);
  }

  return {
    conversations: convs,
    chatStoreNames: (chatStores.length > 0 ? chatStores : allEngineStores).map(
      (d) => d.displayName || String(d.name || '').split('/').pop()
    ),
    authPrompts: assist.authPrompts || [],
  };
}

async function syncConversationsFromDirectApi() {
  const token = await resolveDirectChatToken();
  if (!token) {
    throw new Error('Direct Google Chat OAuth is not configured yet.');
  }
  const base = chatApiBaseUrl();
  const headers = { Authorization: `Bearer ${token}` };
  const spacesResp = await httpsJsonRequest(`${base}/v1/spaces?pageSize=20`, { headers });
  if (spacesResp.status !== 200) {
    throw new Error(`Google Chat API spaces.list returned HTTP ${spacesResp.status}`);
  }
  const rawSpaces = Array.isArray(spacesResp.json?.spaces) ? spacesResp.json.spaces : [];
  const convs = [];
  for (const sp of rawSpaces.slice(0, 14)) {
    const spaceName = String(sp.name || '');
    if (!/^spaces\/[A-Za-z0-9_-]+$/.test(spaceName)) continue;
    const isDm = sp.spaceType === 'DIRECT_MESSAGE' || sp.spaceType === 'GROUP_CHAT' || sp.type === 'DM';
    const msgResp = await httpsJsonRequest(
      `${base}/v1/${spaceName}/messages?pageSize=10&orderBy=createTime%20desc`,
      { headers }
    );
    const rawMsgs = Array.isArray(msgResp.json?.messages) ? msgResp.json.messages.slice().reverse() : [];
    convs.push({
      id: spaceName.replace('/', '-'),
      spaceName,
      kind: isDm ? 'dm' : 'space',
      title: sp.displayName || (isDm ? 'Direct Message' : spaceName),
      webUrl: sp.spaceUri || `https://mail.google.com/chat/u/0/#chat/space/${spaceName.split('/')[1]}`,
      messages: rawMsgs.map((m) => ({
        id: m.name || '',
        sender: m.sender?.displayName || m.sender?.name || 'Member',
        timeLabel: m.createTime ? new Date(m.createTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '',
        text: m.formattedText || m.text || '',
      })),
    });
  }
  return normalizeConversationList(convs);
}

function buildEffectiveState() {
  const persisted = loadPersistedChatskiState();
  const geCfg = loadGeConfig();
  const hasDirectToken = Boolean(
    (process.env.AGY_CHAT_DIRECT_TEST_BEARER && process.env.AGY_GE_TEST_ORIGIN) ||
      readConnectorJson('chatski-direct-oauth.json')?.refreshToken
  );

  let activeMode = persisted.modePreference;
  if (activeMode === 'auto') {
    if (hasDirectToken) activeMode = 'direct';
    else if (geCfg.configured) activeMode = 'ge';
    else activeMode = 'demo';
  }

  const useSeed = activeMode === 'demo' || persisted.conversations.length === 0;
  const conversations = useSeed ? buildSeedConversations() : persisted.conversations;

  return {
    ok: true,
    activeMode,
    showingSamplePreview: useSeed && activeMode !== 'demo',
    modePreference: persisted.modePreference,
    lastSyncedIso: persisted.lastSyncedIso,
    geConfigured: geCfg.configured,
    geEngineResource: geCfg.configured
      ? `projects/${geCfg.projectId}/locations/${geCfg.location}/collections/${geCfg.collectionId}/engines/${geCfg.engineId}`
      : '',
    geWebAppUrl: geCfg.webAppUrl || '',
    geChatStores: persisted.geChatStores,
    directApiConnected: hasDirectToken,
    conversations,
    drafts: persisted.drafts,
  };
}

const app = new SidecarApp();

app.page('/', () => buildInlinedSidecarHtml(__dirname, ['token_pill_ui.js', 'app.js']));

app.api(
  '/preload.js',
  () =>
    new Response(readOfficialPreloadJs(), {
      contentType: 'application/javascript; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/styles.css',
  () =>
    new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
      contentType: 'text/css; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/app.js',
  () =>
    new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
      contentType: 'application/javascript; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/token_pill_ui.js',
  () =>
    new Response(fs.readFileSync(path.join(__dirname, 'token_pill_ui.js'), 'utf-8'), {
      contentType: 'application/javascript; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/api/token-summary',
  async (data) => getTokenMeterSummary((data && data.convId) || ''),
  'GET'
);

app.api('/api/state', async () => buildEffectiveState(), 'GET');

app.api('/api/mode', async (data) => {
  const nextMode = String((data && data.mode) || 'auto').trim();
  if (!['auto', 'ge', 'direct', 'demo'].includes(nextMode)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid mode' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const persisted = loadPersistedChatskiState();
  persisted.modePreference = nextMode;
  savePersistedChatskiState(persisted);
  return buildEffectiveState();
});

app.api('/api/save-ge', async (data) => {
  try {
    const rawInstance = String((data && data.geInstance) || '').trim().slice(0, 500);
    const existing = readConnectorJson('ge-instance.json') || {};
    const parsed = parseGeInstanceInput(rawInstance, {
      projectId: (data && data.projectId) || '',
      location: (data && data.location) || '',
      collectionId: (data && data.collectionId) || '',
      engineId: (data && data.engineId) || '',
      webAppUrl: (data && data.webAppUrl) || existing.webAppUrl || '',
    });
    const record = {
      ...parsed,
      rawInput: rawInstance,
      oauthClientId: existing.oauthClientId || '',
      oauthClientSecret: existing.oauthClientSecret || '',
      updatedAt: new Date().toISOString(),
    };
    writeConnectorJson('ge-instance.json', record);
    geTokenCache = { accessToken: '', expiresAt: 0, quotaProjectId: '', source: '' };
    return buildEffectiveState();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Invalid Gemini Enterprise resource' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
});

app.api('/api/sync', async () => {
  const persisted = loadPersistedChatskiState();
  const stateBefore = buildEffectiveState();
  try {
    if (stateBefore.activeMode === 'direct') {
      const convs = await syncConversationsFromDirectApi();
      persisted.conversations = convs;
      persisted.lastSyncedIso = new Date().toISOString();
      savePersistedChatskiState(persisted);
      return { ...buildEffectiveState(), syncSource: 'direct' };
    }
    if (stateBefore.geConfigured) {
      const geRes = await syncConversationsFromGe();
      if (geRes.conversations.length > 0) {
        persisted.conversations = geRes.conversations;
      }
      persisted.geChatStores = geRes.chatStoreNames;
      persisted.lastSyncedIso = new Date().toISOString();
      if (persisted.modePreference === 'demo') {
        persisted.modePreference = 'ge';
      }
      savePersistedChatskiState(persisted);
      return {
        ...buildEffectiveState(),
        syncSource: 'ge',
        authPrompts: geRes.authPrompts,
      };
    }
    return {
      ...buildEffectiveState(),
      syncSource: 'demo',
      notice: 'Connect your Gemini Enterprise instance (/connect-ge) to sync live Google Chat & Teams spaces.',
    };
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Sync failed' }), {
      contentType: 'application/json',
      status: 500,
    });
  }
});

app.api('/api/messages/refresh', async (data) => {
  const convId = String((data && data.conversationId) || '').trim();
  const persisted = loadPersistedChatskiState();
  const eff = buildEffectiveState();
  const target = eff.conversations.find((c) => c.id === convId);
  if (!target) {
    return new Response(JSON.stringify({ ok: false, error: 'Conversation not found' }), {
      contentType: 'application/json',
      status: 404,
    });
  }
  if (!eff.geConfigured && !eff.directApiConnected) {
    return eff;
  }

  try {
    if (eff.activeMode === 'direct' && target.spaceResource) {
      const token = await resolveDirectChatToken();
      const resp = await httpsJsonRequest(
        `${chatApiBaseUrl()}/v1/${target.spaceResource}/messages?pageSize=20&orderBy=createTime%20desc`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resp.status === 200 && Array.isArray(resp.json?.messages)) {
        const refreshedMsgs = resp.json.messages
          .slice()
          .reverse()
          .map((m, idx) => {
            const sender = m.sender?.displayName || 'Member';
            return {
              id: m.name || `dm-${idx}`,
              sender,
              initials: initialsForName(sender),
              avatarColor: pickColorForTitle(sender),
              timeLabel: m.createTime
                ? new Date(m.createTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : 'Recent',
              text: m.formattedText || m.text || '',
              reactions: [],
              replyCount: 0,
            };
          });
        const idx = persisted.conversations.findIndex((c) => c.id === convId);
        if (idx >= 0) {
          persisted.conversations[idx].messages = refreshedMsgs;
          persisted.conversations[idx].unreadCount = 0;
          savePersistedChatskiState(persisted);
        }
      }
      return buildEffectiveState();
    }

    const cfg = loadGeConfig();
    const auth = await resolveGeAccessToken(cfg);
    const { allEngineStores, chatStores } = await discoverGeChatDataStores(cfg, auth);
    const prompt = [
      `Retrieve and list only (do NOT send, post, or modify any messages): use the Google Chat connector to retrieve the latest 12 messages in "${target.title}"${target.spaceResource ? ` (${target.spaceResource})` : ''}.`,
      'Return ONLY valid JSON: {"messages":[{"id":"m1","sender":"Full Name","timeLabel":"2:30 PM","text":"Message text","replyCount":0}]}',
    ].join('\n');
    const assist = await callGeStreamAssist(cfg, auth, {
      queryText: prompt,
      dataStores: allEngineStores.length > 0 ? allEngineStores : chatStores,
    });
    const parsed = parseJsonBlockFromAnswer(assist.answerText);
    const candidateMsgs =
      parsed && Array.isArray(parsed.messages)
        ? parsed.messages
        : parseMessageLinesFromProse(assist.answerText);
    if (candidateMsgs.length > 0) {
      const normalized = normalizeConversationList([{ ...target, messages: candidateMsgs }])[0];
      if (normalized) {
        const existingIdx = persisted.conversations.findIndex((c) => c.id === convId);
        if (existingIdx >= 0) {
          persisted.conversations[existingIdx].messages = normalized.messages;
          persisted.conversations[existingIdx].unreadCount = 0;
        } else {
          persisted.conversations.unshift(normalized);
        }
        savePersistedChatskiState(persisted);
      }
    }
    return buildEffectiveState();
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Thread refresh failed' }), {
      contentType: 'application/json',
      status: 500,
    });
  }
});

app.api('/api/drafts/save', async (data) => {
  const conversationId = String((data && data.conversationId) || '').trim();
  const conversationTitle = String((data && data.conversationTitle) || 'Chat').trim();
  const text = String((data && data.text) || '').trim();
  const note = String((data && data.note) || '').trim();
  const draftId = String((data && data.draftId) || `d_${crypto.randomBytes(4).toString('hex')}`).trim();

  if (!conversationId || !text) {
    return new Response(JSON.stringify({ ok: false, error: 'conversationId and text are required' }), {
      contentType: 'application/json',
      status: 400,
    });
  }

  const persisted = loadPersistedChatskiState();
  const nowIso = new Date().toISOString();
  const idx = persisted.drafts.findIndex((d) => d.id === draftId);
  const record = {
    id: draftId,
    conversationId,
    conversationTitle,
    text,
    note,
    updatedAt: nowIso,
  };
  if (idx >= 0) persisted.drafts[idx] = record;
  else persisted.drafts.unshift(record);
  savePersistedChatskiState(persisted);
  return { ok: true, draft: record, state: buildEffectiveState() };
});

app.api('/api/drafts/delete', async (data) => {
  const draftId = String((data && data.draftId) || '').trim();
  const persisted = loadPersistedChatskiState();
  persisted.drafts = persisted.drafts.filter((d) => d.id !== draftId);
  savePersistedChatskiState(persisted);
  return { ok: true, state: buildEffectiveState() };
});

app.api('/api/send', async (data) => {
  // CRITICAL GUARDRAIL: Never send without explicit human click confirmation from UI
  if (!data || data.confirmedByUser !== true) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Explicit user confirmation is required before sending a Chat message.' }),
      { contentType: 'application/json', status: 400 }
    );
  }
  const conversationId = String(data.conversationId || '').trim();
  const text = String(data.text || '').trim();
  const geSession = String(data.geSession || '').trim();
  const draftId = String(data.draftId || '').trim();

  if (!conversationId || !text) {
    return new Response(JSON.stringify({ ok: false, error: 'conversationId and message text are required' }), {
      contentType: 'application/json',
      status: 400,
    });
  }

  const eff = buildEffectiveState();
  const target = eff.conversations.find((c) => c.id === conversationId);
  const spaceTitle = target ? target.title : conversationId;
  const spaceResource = target ? target.spaceResource : '';
  const persisted = loadPersistedChatskiState();

  function appendLocalSentEcho() {
    const nowTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const msgObj = {
      id: `local-${Date.now()}`,
      sender: 'You',
      initials: 'ME',
      avatarColor: '#2563eb',
      timeLabel: nowTime,
      text,
      reactions: [],
      replyCount: 0,
    };
    if (persisted.conversations.length === 0) {
      persisted.conversations = buildSeedConversations();
    }
    const cIdx = persisted.conversations.findIndex((c) => c.id === conversationId);
    if (cIdx >= 0) {
      persisted.conversations[cIdx].messages.push(msgObj);
      persisted.conversations[cIdx].updatedAgo = 'Just now';
    }
    if (draftId) {
      persisted.drafts = persisted.drafts.filter((d) => d.id !== draftId);
    }
    savePersistedChatskiState(persisted);
  }

  try {
    // Path 1: Direct Google Chat REST API
    if (eff.activeMode === 'direct' && spaceResource && /^spaces\/[A-Za-z0-9_-]+$/.test(spaceResource)) {
      const token = await resolveDirectChatToken();
      const sendResp = await httpsJsonRequest(`${chatApiBaseUrl()}/v1/${spaceResource}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        bodyObj: { text },
      });
      if (sendResp.status !== 200) {
        throw new Error(`Google Chat API messages.create returned HTTP ${sendResp.status}`);
      }
      appendLocalSentEcho();
      return { ok: true, delivery: 'direct-chat-api', state: buildEffectiveState() };
    }

    // Path 2: Gemini Enterprise Google Chat Connector (StreamAssist with Actions enabled)
    if (eff.activeMode === 'ge' && eff.geConfigured) {
      const cfg = loadGeConfig();
      const auth = await resolveGeAccessToken(cfg);
      const { allEngineStores, chatStores } = await discoverGeChatDataStores(cfg, auth);
      const prompt = geSession
        ? 'Yes, I confirm. Send the Google Chat message now.'
        : `Use the Google Chat connector send_message tool to send the following exact message to "${spaceTitle}"${spaceResource ? ` (${spaceResource})` : ''}:\n\n${text}`;

      const assist = await callGeStreamAssist(cfg, auth, {
        queryText: prompt,
        dataStores: allEngineStores.length > 0 ? allEngineStores : chatStores,
        session: geSession,
      });

      const ansLower = (assist.answerText || '').toLowerCase();
      const asksConfirm =
        !geSession &&
        Boolean(assist.sessionName) &&
        (ansLower.includes('confirm') || ansLower.includes('would you like me to send') || ansLower.includes('proceed'));

      if (asksConfirm) {
        return {
          ok: true,
          pendingGeConfirmation: true,
          geSession: assist.sessionName,
          assistantPrompt: assist.answerText,
          state: buildEffectiveState(),
        };
      }

      const readOnlyHint =
        ansLower.includes('cannot send') ||
        ansLower.includes("don't have permission to send") ||
        ansLower.includes('read-only') ||
        ansLower.includes('unable to send');

      if (readOnlyHint) {
        return {
          ok: false,
          readOnlyConnector: true,
          openChatUrl: (target && target.webUrl) || 'https://mail.google.com/chat/u/0/#chat/home',
          error:
            'Your Gemini Enterprise Chat connector appears to be in Federated Read-Only mode (Send Action disabled by admin). Use "Copy & Open in Google Chat" or connect Direct Chat API in Settings (⚙).',
        };
      }

      appendLocalSentEcho();
      return {
        ok: true,
        delivery: 'ge-chat-connector',
        assistantReply: assist.answerText,
        state: buildEffectiveState(),
      };
    }

    // Path 3: Interactive Demo / Sample Preview echo
    appendLocalSentEcho();
    return {
      ok: true,
      delivery: 'demo-preview',
      state: buildEffectiveState(),
    };
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Send failed' }), {
      contentType: 'application/json',
      status: 500,
    });
  }
});

app.api('/api/direct-oauth/start', async (data) => {
  const geCfg = loadGeConfig();
  const clientId = String((data && data.clientId) || geCfg.oauthClientId || '').trim();
  const clientSecret = String((data && data.clientSecret) || geCfg.oauthClientSecret || '').trim();
  if (!clientId || !SAFE_SEGMENT_RE.test(clientId.replace(/\.apps\.googleusercontent\.com$/, ''))) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Provide a valid Google Cloud Desktop OAuth Client ID (*.apps.googleusercontent.com).',
      }),
      { contentType: 'application/json', status: 400 }
    );
  }

  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const expectedState = crypto.randomBytes(16).toString('hex');

  return await new Promise((resolve) => {
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
        const bufA = Buffer.from(gotState);
        const bufB = Buffer.from(expectedState);
        if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB) || !code) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid OAuth callback state or missing code.');
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
        if (tokResp.status === 200 && tokResp.json && tokResp.json.access_token) {
          writeConnectorJson('chatski-direct-oauth.json', {
            clientId,
            clientSecret,
            refreshToken: tokResp.json.refresh_token || '',
            savedAt: new Date().toISOString(),
          });
          directChatTokenCache = {
            accessToken: tokResp.json.access_token,
            expiresAt: Date.now() + (Number(tokResp.json.expires_in || 3500) - 60) * 1000,
          };
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Chatski Direct Google Chat API connected! Close this tab and click Sync in Chatski.');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('OAuth token exchange failed.');
        }
        server.close();
      } catch {
        server.close();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const redirectUri = `http://127.0.0.1:${addr.port}/oauth-callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set(
        'scope',
        [
          'https://www.googleapis.com/auth/chat.spaces.readonly',
          'https://www.googleapis.com/auth/chat.messages',
          'https://www.googleapis.com/auth/chat.users.readstate.readonly',
        ].join(' ')
      );
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      authUrl.searchParams.set('state', expectedState);

      const t = setTimeout(() => {
        try {
          server.close();
        } catch {}
      }, 180_000);
      t.unref();

      resolve({
        ok: true,
        authorizeUrl: authUrl.toString(),
      });
    });
  });
});

await app.run();
