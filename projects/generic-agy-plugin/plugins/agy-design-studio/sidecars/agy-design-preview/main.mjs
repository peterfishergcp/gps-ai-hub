#!/usr/bin/env node
/**
 * AGY Design Studio — Serverless Visual Preview Sidecar (`AGY Preview` under Extensions)
 *
 * Runs on Antigravity's built-in Node runtime (`sidecar_sdk`) with ZERO TCP port listeners.
 * Renders Dashboards (`/agy-dashboard`), Slide Decks (`/slides`), and Flyers (`/doc-design`)
 * directly inside the `AGY Preview` Sidebar / AuxPane via `iframe.srcdoc`, with 1-click
 * Standalone HTML Download and Print-to-PDF!
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DATA_DIR = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'agy-design-studio');
const DELIVERABLES_FILE = path.join(DATA_DIR, 'deliverables.json');

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
  return list.filter(
    (item) =>
      item &&
      typeof item.id === 'string' &&
      SAFE_ID_RE.test(item.id) &&
      typeof item.htmlPath === 'string' &&
      fs.existsSync(item.htmlPath)
  );
}

function findDeliverable(id) {
  if (!id || !SAFE_ID_RE.test(id)) return null;
  return readDeliverables().find((item) => item.id === id) || null;
}

function renderDeliverableHtml(item) {
  if (!item || !fs.existsSync(item.htmlPath)) {
    return '<!doctype html><html><body><p>Deliverable not found on disk.</p></body></html>';
  }
  const targetHtml = item.standalonePath && fs.existsSync(item.standalonePath) ? item.standalonePath : item.htmlPath;
  return fs.readFileSync(targetHtml, 'utf-8');
}

const app = new SidecarApp();

app.page('/', () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'));

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

app.api('/api/deliverables', async () => {
  return {
    ok: true,
    deliverables: readDeliverables(),
  };
}, 'GET');

app.api('/api/render', async (data) => {
  const id = String((data && data.id) || '');
  const item = findDeliverable(id);
  if (!item) {
    return { ok: false, error: 'Deliverable not found' };
  }
  return {
    ok: true,
    deliverable: item,
    html: renderDeliverableHtml(item),
  };
}, 'POST');

app.run();
