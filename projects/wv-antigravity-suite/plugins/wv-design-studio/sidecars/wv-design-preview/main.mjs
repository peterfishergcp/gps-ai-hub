#!/usr/bin/env node
/**
 * WV Design Studio — Live Visual Preview & 1-Click Browser Launcher Sidecar
 *
 * Runs automatically on Antigravity's built-in Node runtime (`sidecar_sdk`).
 * Eliminates raw HTML source-code confusion and terminal `open` confirmation prompts by:
 * 1. Rendering generated Dashboards (`/wv-dashboard`), Slide Decks (`/slides`), and Flyers (`/doc-design`)
 *    visually inside Antigravity's Sidebar & AuxPane (`WV Preview`).
 * 2. Hosting a local loopback preview server on `http://127.0.0.1:4175/view/<id>` (with full `/api/dashboard`
 *    and `PUT /api/config` visual layout saving) so `.url.json` cards in chat open directly in Chrome/Edge.
 * 3. Providing a 1-click "Launch in Browser" endpoint (`POST /api/open-browser`) inside the Sidecar UI.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DATA_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-design-studio');
const DELIVERABLES_FILE = path.join(DATA_DIR, 'deliverables.json');
const SERVER_INFO_FILE = path.join(DATA_DIR, 'preview-server.json');

let activeLoopbackPort = 4175;
const LOOPBACK_CSRF = crypto.randomBytes(16).toString('hex');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
}

function readDeliverables() {
  ensureDataDir();
  let list = [];
  if (fs.existsSync(DELIVERABLES_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(DELIVERABLES_FILE, 'utf-8'));
      if (Array.isArray(raw)) list = raw;
    } catch {
      list = [];
    }
  }
  // Filter to files that still exist on disk
  return list
    .filter((item) => item && typeof item.id === 'string' && SAFE_ID_RE.test(item.id) && typeof item.htmlPath === 'string' && fs.existsSync(item.htmlPath))
    .map((item) => ({
      ...item,
      previewUrl: `http://127.0.0.1:${activeLoopbackPort}/view/${item.id}`
    }));
}

function findDeliverable(id) {
  if (!id || !SAFE_ID_RE.test(id)) return null;
  const list = readDeliverables();
  return list.find((item) => item.id === id) || null;
}

function safeJsonForHtmlScript(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function renderDeliverableHtml(item) {
  if (!item || !fs.existsSync(item.htmlPath)) {
    return '<!doctype html><html><body><p>Deliverable not found on disk.</p></body></html>';
  }
  // Prefer standalonePath if available so CSS/JS are self-contained even inside nested iframes
  const targetHtml = (item.standalonePath && fs.existsSync(item.standalonePath)) ? item.standalonePath : item.htmlPath;
  let html = fs.readFileSync(targetHtml, 'utf-8');
  html = html.replace('__CSRF_TOKEN__', LOOPBACK_CSRF);
  return html;
}

function updateDashboardConfigOnDisk(item, newConfig) {
  if (!item || item.kind !== 'dashboard' || !item.dirPath) {
    throw new Error('Deliverable is not an editable dashboard project.');
  }
  const configPath = path.join(item.dirPath, 'dashboard.config.json');
  const snapPath = path.join(item.dirPath, 'data', 'snapshot.json');
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(snapPath) && fs.existsSync(item.htmlPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapPath, 'utf-8'));
    const payload = safeJsonForHtmlScript({ config: newConfig, snapshot });
    const re = /<script id="initial-data" type="application\/json">[\s\S]*?<\/script>/;
    for (const f of [item.htmlPath, item.standalonePath]) {
      if (f && fs.existsSync(f)) {
        const cur = fs.readFileSync(f, 'utf-8');
        if (re.test(cur)) {
          fs.writeFileSync(f, cur.replace(re, `<script id="initial-data" type="application/json">${payload}</script>`), 'utf-8');
        }
      }
    }
  }
}

function openUrlInDefaultBrowser(targetUrl) {
  if (typeof targetUrl !== 'string' || !/^https?:\/\/127\.0\.0\.1:\d+\//.test(targetUrl)) {
    throw new Error('Only loopback 127.0.0.1 preview URLs can be launched.');
  }
  const platform = process.platform;
  if (platform === 'darwin') {
    execFile('open', [targetUrl], () => {});
  } else if (platform === 'win32') {
    execFile('cmd.exe', ['/c', 'start', '', targetUrl], () => {});
  } else {
    execFile('xdg-open', [targetUrl], () => {});
  }
}

// 1. Start Loopback HTTP Server (`http://127.0.0.1:4175`) for Browser & `.url.json` Cards
const loopbackServer = http.createServer((req, res) => {
  try {
    const u = new URL(req.url || '/', `http://127.0.0.1:${activeLoopbackPort}`);
    const pathname = u.pathname;

    if (req.method === 'GET' && pathname === '/') {
      const list = readDeliverables();
      if (list.length > 0) {
        res.writeHead(302, { Location: `/view/${list[0].id}` });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><body style="font-family:sans-serif;padding:24px;"><h2>WV Design Studio Preview Server</h2><p>Run <code>/wv-dashboard</code>, <code>/slides</code>, or <code>/doc-design</code> in Antigravity to preview deliverables here.</p></body></html>');
      return;
    }

    // Match /view/:id or /view/:id/...
    const m = pathname.match(/^\/view\/([a-z0-9][a-z0-9_-]*)(?:\/(.*))?$/);
    if (m) {
      const id = m[1];
      const subPath = m[2] || '';
      const item = findDeliverable(id);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Deliverable not found.');
        return;
      }

      if (req.method === 'GET' && (subPath === '' || subPath === 'index.html')) {
        const html = renderDeliverableHtml(item);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && subPath === 'styles.css' && item.dirPath) {
        const p = path.join(item.dirPath, 'styles.css');
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
          res.end(fs.readFileSync(p, 'utf-8'));
          return;
        }
      }

      if (req.method === 'GET' && subPath === 'app.js' && item.dirPath) {
        const p = path.join(item.dirPath, 'app.js');
        if (fs.existsSync(p)) {
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(fs.readFileSync(p, 'utf-8'));
          return;
        }
      }

      if (req.method === 'GET' && subPath === 'api/dashboard' && item.dirPath) {
        const cfg = JSON.parse(fs.readFileSync(path.join(item.dirPath, 'dashboard.config.json'), 'utf-8'));
        const snap = JSON.parse(fs.readFileSync(path.join(item.dirPath, 'data', 'snapshot.json'), 'utf-8'));
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ config: cfg, data: snap, meta: { source: 'live-preview', connector: cfg.connector || 'bigquery' } }));
        return;
      }

      if (req.method === 'PUT' && subPath === 'api/config' && item.dirPath) {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 524288) req.destroy();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            updateDashboardConfigOnDisk(item, parsed);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: String(err.message || err) }));
          }
        });
        return;
      }
    }

    // Also handle root /api/dashboard and PUT /api/config via Referer when index.html uses relative `./api/dashboard`
    if ((pathname === '/api/dashboard' || pathname === '/api/config') && req.headers.referer) {
      const refMatch = String(req.headers.referer).match(/\/view\/([a-z0-9][a-z0-9_-]*)/);
      if (refMatch) {
        const item = findDeliverable(refMatch[1]);
        if (item && item.dirPath) {
          if (req.method === 'GET' && pathname === '/api/dashboard') {
            const cfg = JSON.parse(fs.readFileSync(path.join(item.dirPath, 'dashboard.config.json'), 'utf-8'));
            const snap = JSON.parse(fs.readFileSync(path.join(item.dirPath, 'data', 'snapshot.json'), 'utf-8'));
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ config: cfg, data: snap, meta: { source: 'live-preview', connector: cfg.connector || 'bigquery' } }));
            return;
          }
          if (req.method === 'PUT' && pathname === '/api/config') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
              if (body.length > 524288) req.destroy();
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                updateDashboardConfigOnDisk(item, parsed);
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ ok: true }));
              } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: String(err.message || err) }));
              }
            });
            return;
          }
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Preview error');
  }
});

function startLoopbackServer(preferredPort) {
  loopbackServer.once('error', () => {
    loopbackServer.listen(0, '127.0.0.1', () => {
      const addr = loopbackServer.address();
      if (addr && typeof addr === 'object') {
        activeLoopbackPort = addr.port;
        ensureDataDir();
        fs.writeFileSync(SERVER_INFO_FILE, JSON.stringify({ port: activeLoopbackPort, url: `http://127.0.0.1:${activeLoopbackPort}` }, null, 2) + '\n', { mode: 0o600 });
      }
    });
  });
  loopbackServer.listen(preferredPort, '127.0.0.1', () => {
    const addr = loopbackServer.address();
    if (addr && typeof addr === 'object') {
      activeLoopbackPort = addr.port;
      ensureDataDir();
      fs.writeFileSync(SERVER_INFO_FILE, JSON.stringify({ port: activeLoopbackPort, url: `http://127.0.0.1:${activeLoopbackPort}` }, null, 2) + '\n', { mode: 0o600 });
    }
  });
}

startLoopbackServer(4175);

// 2. Sidecar UI App (`WV Preview` inside Antigravity Sidebar & AuxPane)
const app = new SidecarApp();

function serveStaticFile(relPath, contentType) {
  const fullPath = path.join(__dirname, relPath);
  return new Response(fs.readFileSync(fullPath), {
    status: 200,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' }
  });
}

app.get('/', () => serveStaticFile('index.html', 'text/html; charset=utf-8'));
app.get('/index.html', () => serveStaticFile('index.html', 'text/html; charset=utf-8'));
app.get('/styles.css', () => serveStaticFile('styles.css', 'text/css; charset=utf-8'));
app.get('/app.js', () => serveStaticFile('app.js', 'application/javascript; charset=utf-8'));

app.get('/api/deliverables', () => {
  return Response.json({
    ok: true,
    loopbackPort: activeLoopbackPort,
    deliverables: readDeliverables()
  });
});

app.get('/api/render', (req) => {
  const u = new URL(req.url || '/api/render', 'http://localhost');
  const id = u.searchParams.get('id') || '';
  const item = findDeliverable(id);
  if (!item) {
    return Response.json({ ok: false, error: 'Deliverable not found' }, { status: 404 });
  }
  return Response.json({
    ok: true,
    deliverable: item,
    html: renderDeliverableHtml(item)
  });
});

app.post('/api/open-browser', async (req) => {
  try {
    const body = await req.json();
    const id = body && typeof body.id === 'string' ? body.id : '';
    const item = findDeliverable(id);
    if (!item) {
      return Response.json({ ok: false, error: 'Deliverable not found' }, { status: 404 });
    }
    openUrlInDefaultBrowser(item.previewUrl);
    return Response.json({ ok: true, launchedUrl: item.previewUrl });
  } catch (err) {
    return Response.json({ ok: false, error: String(err.message || err) }, { status: 400 });
  }
});

app.run();
