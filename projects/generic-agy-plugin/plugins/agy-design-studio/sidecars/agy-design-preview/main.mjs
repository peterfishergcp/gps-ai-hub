#!/usr/bin/env node

const __parseJsonNoBom = (s) => JSON.parse(typeof s === 'string' ? s.replace(/^\uFEFF/, '') : Buffer.isBuffer(s) ? s.toString('utf-8').replace(/^\uFEFF/, '') : s);
/**
 * Preview — Antigravity Serverless Visual Deliverable Sidecar (`Preview` under Extensions)
 *
 * Runs on Antigravity's built-in Node runtime (`sidecar_sdk`) with ZERO TCP port listeners.
 * Automatically discovers all generated visual `.html` deliverables across:
 *   1. `<appDataDir>/brain/<conversation-id>/*.html` (derived dynamically from `ANTIGRAVITY_EXECUTABLE_DATA_DIR`,
 *      `ANTIGRAVITY_BRAIN_DIR`, `~/.gemini/antigravity/brain`, and `~/.gemini/jetski/brain`),
 *      plus `<convDir>/scratch/*` standalone HTML fallbacks when no top-level artifact was written.
 *   2. `~/.gemini/config/plugin_data/agy-design-studio/deliverables.json` (scaffold registry).
 *
 * Security:
 * - Never trusts client-supplied file paths; `/api/render` only accepts an allow-listed `id`
 *   resolved against server-discovered deliverables.
 * - Rejects symbolic links (`fs.lstatSync().isSymbolicLink()`) and enforces a 15 MB size ceiling.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { buildInlinedSidecarHtml } from './sidecar_html_inliner.mjs';
import { getTokenMeterSummary } from './token_meter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const MAX_HTML_BYTES = 15 * 1024 * 1024;
const MAX_DELIVERABLES = 50;
const DATA_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'agy-design-studio');
const DELIVERABLES_FILE = path.join(DATA_DIR, 'deliverables.json');

const GENERIC_TITLES = new Set([
  '',
  'document',
  'dashboard',
  'dashboard studio',
  'slides',
  'presentation',
  'untitled',
  'preview',
]);

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  } catch {
    // Non-fatal in restricted sandboxes; brain artifact discovery still works.
  }
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&middot;|&#183;/gi, '·')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeFilename(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  const cleaned = base
    .replace(/_(dashboard|slides|flyer|ttx|field_ops)?_?preview$/i, '')
    .replace(/-standalone$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!cleaned) return 'Visual Deliverable';
  return cleaned.replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function extractTitleAndKind(filePath, headSnippet) {
  const fileLower = path.basename(filePath).toLowerCase();
  const snippetLower = headSnippet.toLowerCase();

  let title = '';
  if (snippetLower.includes('id="initial-data"')) {
    const cfgTitleMatch = headSnippet.match(/"title"\s*:\s*"([^"]{3,160})"/);
    if (cfgTitleMatch && cfgTitleMatch[1]) {
      const candidate = decodeHtmlEntities(cfgTitleMatch[1]);
      if (!GENERIC_TITLES.has(candidate.toLowerCase())) {
        title = candidate;
      }
    }
  }

  if (!title) {
    const titleMatch = headSnippet.match(/<title[^>]*>([\s\S]{1,240}?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      const candidate = decodeHtmlEntities(titleMatch[1]);
      if (!GENERIC_TITLES.has(candidate.toLowerCase())) {
        title = candidate;
      }
    }
  }

  if (!title) {
    const cfgTitleMatch = headSnippet.match(/"title"\s*:\s*"([^"]{3,160})"/);
    if (cfgTitleMatch && cfgTitleMatch[1]) {
      const candidate = decodeHtmlEntities(cfgTitleMatch[1]);
      if (!GENERIC_TITLES.has(candidate.toLowerCase())) {
        title = candidate;
      }
    }
  }

  if (!title) {
    const h1Match = headSnippet.match(/<h1[^>]*>([\s\S]{1,200}?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      const stripped = decodeHtmlEntities(h1Match[1].replace(/<[^>]+>/g, ' '));
      if (!GENERIC_TITLES.has(stripped.toLowerCase())) {
        title = stripped;
      }
    }
  }

  if (!title) {
    title = humanizeFilename(filePath);
  }
  if (title.length > 96) {
    title = title.slice(0, 93).trimEnd() + '...';
  }

  let kind = 'interactive';
  if (
    fileLower.includes('slide') ||
    fileLower.includes('deck') ||
    snippetLower.includes('class="slide"') ||
    snippetLower.includes('13.333in 7.5in')
  ) {
    kind = 'slides';
  } else if (
    fileLower.includes('flyer') ||
    fileLower.includes('memo') ||
    fileLower.includes('brief') ||
    fileLower.includes('notice') ||
    snippetLower.includes('@page { size: letter')
  ) {
    kind = 'flyer';
  } else if (
    fileLower.includes('ttx') ||
    fileLower.includes('tabletop') ||
    snippetLower.includes('tabletop exercise') ||
    snippetLower.includes('inject ')
  ) {
    kind = 'ttx';
  } else if (
    fileLower.includes('dashboard') ||
    fileLower.includes('command') ||
    fileLower.includes('portfolio') ||
    fileLower.includes('kpi') ||
    fileLower.includes('ops_kit') ||
    fileLower.includes('ops-kit') ||
    snippetLower.includes('id="initial-data"') ||
    snippetLower.includes('customize layout') ||
    snippetLower.includes('dashboard')
  ) {
    kind = 'dashboard';
  }

  return { title, kind };
}

function readHeadSnippet(realPath, sizeBytes) {
  const len = Math.min(sizeBytes, 24576);
  const buf = Buffer.alloc(len);
  const fd = fs.openSync(realPath, 'r');
  try {
    const bytesRead = fs.readSync(fd, buf, 0, len, 0);
    return buf.toString('utf-8', 0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function getCandidateBrainRoots() {
  const candidates = [];

  if (process.env.ANTIGRAVITY_BRAIN_DIR) {
    candidates.push(process.env.ANTIGRAVITY_BRAIN_DIR);
  }

  const execDataDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '';
  if (execDataDir) {
    const marker = path.sep + 'sidecar_data' + path.sep;
    const idx = execDataDir.indexOf(marker);
    if (idx > 0) {
      candidates.push(path.join(execDataDir.slice(0, idx), 'brain'));
    } else {
      candidates.push(path.join(path.resolve(execDataDir, '..', '..', '..', '..'), 'brain'));
      candidates.push(path.join(path.resolve(execDataDir, '..', '..', '..'), 'brain'));
    }
  }

  // If ANTIGRAVITY_BRAIN_DIR is explicitly set to an isolated directory (e.g. E2E test),
  // only scan default home brain dirs when ANTIGRAVITY_BRAIN_ISOLATED !== '1'.
  if (process.env.ANTIGRAVITY_BRAIN_ISOLATED !== '1') {
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
    candidates.push(path.join(os.homedir(), '.gemini', 'jetski', 'brain'));
  }

  const seenReal = new Set();
  const roots = [];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const lstat = fs.lstatSync(raw);
      if (!lstat.isDirectory() || lstat.isSymbolicLink()) continue;
      const real = fs.realpathSync(raw);
      if (seenReal.has(real)) continue;
      seenReal.add(real);
      roots.push(real);
    } catch {
      // Directory does not exist on this OS/install; skip cleanly.
    }
  }
  return roots;
}

function inspectSafeHtmlFile(candidatePath, allowedRoot, convId) {
  try {
    if (path.extname(candidatePath).toLowerCase() !== '.html') return null;
    const lstat = fs.lstatSync(candidatePath);
    if (!lstat.isFile() || lstat.isSymbolicLink()) return null;
    if (lstat.size < 64 || lstat.size > MAX_HTML_BYTES) return null;

    const realPath = fs.realpathSync(candidatePath);
    if (allowedRoot && !realPath.startsWith(allowedRoot + path.sep)) return null;

    const snippet = readHeadSnippet(realPath, lstat.size);
    const { title, kind } = extractTitleAndKind(realPath, snippet);
    const id = 'art-' + crypto.createHash('sha1').update(realPath).digest('hex').slice(0, 12);

    const tsMs = Math.max(lstat.mtimeMs || 0, lstat.birthtimeMs || 0);
    return {
      id,
      kind,
      title,
      subtitle: path.basename(realPath),
      convId: convId || '',
      fileName: path.basename(realPath),
      htmlPath: realPath,
      standalonePath: realPath,
      mtimeMs: tsMs,
      updatedAt: new Date(tsMs).toISOString(),
    };
  } catch {
    return null;
  }
}

function discoverBrainDeliverables() {
  const discovered = [];
  const brainRoots = getCandidateBrainRoots();

  for (const brainRoot of brainRoots) {
    let convEntries = [];
    try {
      convEntries = fs.readdirSync(brainRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const convDirent of convEntries) {
      if (!convDirent.isDirectory() || convDirent.isSymbolicLink()) continue;
      if (convDirent.name.startsWith('.')) continue;

      const convId = convDirent.name;
      const convDir = path.join(brainRoot, convId);
      let files = [];
      try {
        files = fs.readdirSync(convDir, { withFileTypes: true });
      } catch {
        continue;
      }

      const convHits = [];
      for (const f of files) {
        if (!f.isFile() || f.isSymbolicLink()) continue;
        if (f.name.startsWith('.') || !f.name.toLowerCase().endsWith('.html')) continue;
        // Skip our own static demo preview artifact if present so real user deliverables stay front-and-center
        if (f.name === 'preview_panel_demo.html' || f.name === 'twin_vault_skills_preview.html') continue;
        const item = inspectSafeHtmlFile(path.join(convDir, f.name), brainRoot, convId);
        if (item) convHits.push(item);
      }

      // Fallback: if an agent scaffolded into `<convDir>/scratch/<dir>/dashboard-standalone.html`
      // without copying to top-level `<convDir>/*.html`, capture standalone HTML there too.
      if (convHits.length === 0) {
        const scratchDir = path.join(convDir, 'scratch');
        try {
          const sStat = fs.lstatSync(scratchDir);
          if (sStat.isDirectory() && !sStat.isSymbolicLink()) {
            const scratchEntries = fs.readdirSync(scratchDir, { withFileTypes: true });
            for (const se of scratchEntries) {
              if (se.isSymbolicLink() || se.name.startsWith('.')) continue;
              if (se.isFile() && /(standalone|deck|flyer|preview)\.html$/i.test(se.name)) {
                const hit = inspectSafeHtmlFile(path.join(scratchDir, se.name), brainRoot, convId);
                if (hit) convHits.push(hit);
              } else if (se.isDirectory()) {
                const subDir = path.join(scratchDir, se.name);
                const subFiles = fs.readdirSync(subDir, { withFileTypes: true });
                for (const sf of subFiles) {
                  if (!sf.isFile() || sf.isSymbolicLink()) continue;
                  if (/(standalone|deck|flyer)\.html$/i.test(sf.name)) {
                    const hit = inspectSafeHtmlFile(path.join(subDir, sf.name), brainRoot, convId);
                    if (hit) convHits.push(hit);
                  }
                }
              }
            }
          }
        } catch {
          // No scratch dir; ignore.
        }
      }

      discovered.push(...convHits);
    }
  }

  return discovered;
}

function readRegistryDeliverables() {
  ensureDataDir();
  if (process.env.ANTIGRAVITY_BRAIN_ISOLATED === '1' && !process.env.ANTIGRAVITY_DESIGN_DATA_DIR) {
    return [];
  }
  const regFile = process.env.ANTIGRAVITY_DESIGN_DATA_DIR
    ? path.join(process.env.ANTIGRAVITY_DESIGN_DATA_DIR, 'deliverables.json')
    : DELIVERABLES_FILE;

  if (!fs.existsSync(regFile)) return [];

  let rawList = [];
  try {
    const parsed = __parseJsonNoBom(fs.readFileSync(regFile, 'utf-8'));
    if (Array.isArray(parsed)) rawList = parsed;
  } catch {
    return [];
  }

  const out = [];
  for (const entry of rawList) {
    if (!entry || typeof entry.id !== 'string' || !SAFE_ID_RE.test(entry.id)) continue;
    const candidate =
      typeof entry.standalonePath === 'string' && fs.existsSync(entry.standalonePath)
        ? entry.standalonePath
        : entry.htmlPath;
    if (typeof candidate !== 'string' || path.extname(candidate).toLowerCase() !== '.html') continue;
    try {
      const lstat = fs.lstatSync(candidate);
      if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size > MAX_HTML_BYTES) continue;
      const realPath = fs.realpathSync(candidate);
      const parsedTs = entry.updatedAt ? Date.parse(entry.updatedAt) || 0 : 0;
      const mtimeMs = Math.max(lstat.mtimeMs || 0, lstat.birthtimeMs || 0, parsedTs);
      out.push({
        id: entry.id,
        kind: entry.kind || 'dashboard',
        title: entry.title || humanizeFilename(realPath),
        subtitle: entry.subtitle || path.basename(realPath),
        convId: entry.convId || '',
        fileName: path.basename(realPath),
        htmlPath: realPath,
        standalonePath: realPath,
        mtimeMs,
        updatedAt: new Date(mtimeMs).toISOString(),
      });
    } catch {
      continue;
    }
  }
  return out;
}

function readDeliverables() {
  const brainItems = discoverBrainDeliverables();
  const registryItems = readRegistryDeliverables();

  const seenRealPaths = new Set();
  const seenTitlesInBrain = new Set();
  const merged = [];

  // Brain artifacts take priority because they are guaranteed self-contained single-file HTMLs
  // and carry the conversationId (`convId`) for 1-click "Open Chat" navigation.
  for (const item of brainItems) {
    if (seenRealPaths.has(item.htmlPath)) continue;
    seenRealPaths.add(item.htmlPath);
    seenTitlesInBrain.add(item.title.toLowerCase());
    merged.push(item);
  }

  for (const item of registryItems) {
    if (seenRealPaths.has(item.htmlPath)) continue;
    if (seenTitlesInBrain.has(String(item.title || '').toLowerCase())) continue;
    seenRealPaths.add(item.htmlPath);
    merged.push(item);
  }

  merged.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0));

  return merged.slice(0, MAX_DELIVERABLES).map((item) => ({
    id: item.id,
    kind: item.kind,
    title: item.title,
    subtitle: item.subtitle,
    convId: item.convId,
    fileName: item.fileName,
    mtimeMs: item.mtimeMs || 0,
    updatedAt: item.updatedAt,
    _realPath: item.htmlPath,
  }));
}

const PREVIEW_BRIDGE_SCRIPT =
  '<script>(function(){if(window.__agyPreviewBridge)return;window.__agyPreviewBridge=true;document.addEventListener("click",function(ev){var btn=ev.target&&ev.target.closest?ev.target.closest("button,a"):null;if(!btn)return;var id=btn.id||"";var txt=(btn.textContent||"").trim().toLowerCase();var action="";if(id==="downloadHtmlBtn"||txt.indexOf("open / download html")!==-1||txt.indexOf("download html")!==-1){action="open-or-save";}else if(id==="printViewBtn"||txt==="print view"||txt.indexOf("print / save as pdf")!==-1||txt.indexOf("print / pdf")!==-1){action="print";}if(action&&window.parent&&window.parent!==window){ev.preventDefault();ev.stopImmediatePropagation();window.parent.postMessage({type:"agy-preview-action",action:action},"*");}},true);})();</script>';

const AUTOPRINT_SCRIPT =
  '<script>window.addEventListener("load",function(){setTimeout(function(){try{window.print();}catch(_){}},220);});</script>';

function injectBeforeBodyEnd(html, snippet) {
  const s = String(html || '');
  const idx = s.lastIndexOf('</body>');
  if (idx !== -1) {
    return s.slice(0, idx) + snippet + s.slice(idx);
  }
  return s + snippet;
}

function sanitizeExportFilename(rawName, fallbackTitle) {
  const base = path.basename(String(rawName || '')).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  let name = base;
  if (!name || name === '.html') {
    const slug = String(fallbackTitle || 'agy-deliverable')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    name = (slug || 'agy-deliverable') + '.html';
  }
  if (!name.toLowerCase().endsWith('.html')) {
    name += '.html';
  }
  return name.slice(0, 120);
}

function saveHtmlToUserDownloads(html, safeFilename) {
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  if (fs.existsSync(downloadsDir)) {
    const st = fs.lstatSync(downloadsDir);
    if (!st.isDirectory() || st.isSymbolicLink()) {
      throw new Error('Downloads folder is not a regular directory');
    }
  } else {
    fs.mkdirSync(downloadsDir, { recursive: true, mode: 0o700 });
  }
  const realDownloads = fs.realpathSync(downloadsDir);
  const ext = '.html';
  const stem = safeFilename.slice(0, -ext.length);
  let targetPath = path.join(realDownloads, safeFilename);
  let suffix = 2;
  while (fs.existsSync(targetPath) && suffix <= 50) {
    targetPath = path.join(realDownloads, `${stem}-${suffix}${ext}`);
    suffix += 1;
  }
  if (fs.existsSync(targetPath)) {
    const existing = fs.lstatSync(targetPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error('Refusing unsafe export target');
    }
  }
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(realDownloads + path.sep)) {
    throw new Error('Export path outside Downloads');
  }
  fs.writeFileSync(resolved, html, 'utf-8');
  return { savedPath: resolved, fileName: path.basename(resolved) };
}

function renderDeliverableById(id) {
  if (!id || !SAFE_ID_RE.test(id)) return null;
  const match = readDeliverables().find((item) => item.id === id);
  if (!match || !match._realPath) return null;

  try {
    const lstat = fs.lstatSync(match._realPath);
    if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.size > MAX_HTML_BYTES) {
      return null;
    }
    const html = fs.readFileSync(match._realPath, 'utf-8');
    const { _realPath, ...publicMeta } = match;
    return { deliverable: publicMeta, html };
  } catch {
    return null;
  }
}

const app = new SidecarApp();

app.page('/', () => buildInlinedSidecarHtml(__dirname, ['token_pill_ui.js', 'app.js']));

app.api('/styles.css', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  });
}, 'GET');

app.api('/app.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/token_pill_ui.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'token_pill_ui.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/api/token-summary', async (data) => {
  return getTokenMeterSummary((data && data.convId) || '');
}, 'GET');

app.api('/api/deliverables', async () => {
  const list = readDeliverables().map(({ _realPath, ...publicMeta }) => publicMeta);
  return {
    ok: true,
    deliverables: list,
  };
}, 'GET');

app.api('/api/render', async (data) => {
  const id = String((data && data.id) || '');
  const result = renderDeliverableById(id);
  if (!result) {
    return { ok: false, error: 'Deliverable not found' };
  }
  return {
    ok: true,
    deliverable: result.deliverable,
    html: injectBeforeBodyEnd(result.html, PREVIEW_BRIDGE_SCRIPT),
  };
}, 'POST');

const RAW_HTML_SECURITY_HEADERS = {
  // Unique opaque origin via CSP sandbox (intentionally omits allow-same-origin) so
  // agent-generated HTML opened in a browser tab cannot access sidecar APIs or tokens.
  'Content-Security-Policy':
    "sandbox allow-scripts allow-forms allow-downloads allow-modals; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: https:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

app.api('/api/raw', (data) => {
  const id = String((data && data.id) || '').trim();
  const autoPrint = String((data && data.autoprint) || '') === '1';
  const result = renderDeliverableById(id);
  if (!result) {
    return new Response('Deliverable not found', { status: 404, contentType: 'text/plain; charset=utf-8' });
  }
  const body = autoPrint ? injectBeforeBodyEnd(result.html, AUTOPRINT_SCRIPT) : result.html;
  return new Response(body, {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headers: RAW_HTML_SECURITY_HEADERS,
  });
}, 'GET');

app.api('/api/download', (data) => {
  const id = String((data && data.id) || '').trim();
  const result = renderDeliverableById(id);
  if (!result) {
    return new Response('Deliverable not found', { status: 404, contentType: 'text/plain; charset=utf-8' });
  }
  const safeName = sanitizeExportFilename(result.deliverable.fileName, result.deliverable.title);
  return new Response(result.html, {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headers: {
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
  });
}, 'GET');

app.api('/api/save-download', async (data) => {
  const id = String((data && data.id) || '').trim();
  const result = renderDeliverableById(id);
  if (!result) {
    return new Response(JSON.stringify({ ok: false, error: 'Deliverable not found' }), {
      status: 404,
      contentType: 'application/json',
    });
  }
  try {
    const safeName = sanitizeExportFilename(result.deliverable.fileName, result.deliverable.title);
    const saved = saveHtmlToUserDownloads(result.html, safeName);
    return { ok: true, savedPath: saved.savedPath, fileName: saved.fileName };
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err && err.message ? err.message : 'Save failed' }), {
      status: 500,
      contentType: 'application/json',
    });
  }
}, 'POST');

function pruneRetiredAgyPlugins() {
  try {
    const pluginsRoot =
      process.env.ANTIGRAVITY_PLUGINS_ROOT && process.env.ANTIGRAVITY_PLUGINS_ROOT.trim()
        ? path.resolve(process.env.ANTIGRAVITY_PLUGINS_ROOT.trim())
        : path.resolve(__dirname, '..', '..', '..');
    const rootStat = fs.lstatSync(pluginsRoot);
    if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return;
    for (const legacyName of ['agy-connectors', 'agy-coordinator']) {
      const target = path.resolve(pluginsRoot, legacyName);
      if (target !== path.join(pluginsRoot, legacyName) || !target.startsWith(pluginsRoot + path.sep)) continue;
      let st = null;
      try {
        st = fs.lstatSync(target);
      } catch {
        continue;
      }
      if (!st || st.isSymbolicLink() || !st.isDirectory()) continue;
      if (!fs.existsSync(path.join(target, 'plugin.json'))) continue;
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {}
    }
    const pluginDataRoot = path.resolve(pluginsRoot, '..', 'plugin_data');
    try {
      const dataRootStat = fs.lstatSync(pluginDataRoot);
      if (dataRootStat && !dataRootStat.isSymbolicLink() && dataRootStat.isDirectory()) {
        for (const legacyName of ['agy-connectors', 'agy-coordinator']) {
          const dataTarget = path.resolve(pluginDataRoot, legacyName);
          if (dataTarget !== path.join(pluginDataRoot, legacyName) || !dataTarget.startsWith(pluginDataRoot + path.sep)) continue;
          let dst = null;
          try {
            dst = fs.lstatSync(dataTarget);
          } catch {
            continue;
          }
          if (!dst || dst.isSymbolicLink() || !dst.isDirectory()) continue;
          try {
            fs.rmSync(dataTarget, { recursive: true, force: true });
          } catch {}
        }
      }
    } catch {}
  } catch {}
}

pruneRetiredAgyPlugins();
app.run();
