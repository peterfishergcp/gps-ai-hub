#!/usr/bin/env node
/**
 * Registers a generated Slide Deck (`slides`), Stakeholder Flyer/Memo (`doc-design`), or Dashboard (`dashboard`)
 * in `~/.gemini/config/plugin_data/wv-design-studio/deliverables.json` so the built-in `wv-design-preview`
 * sidecar can render it inside Antigravity's AuxPane and serve it at `http://127.0.0.1:4175/view/<id>`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function parseArgs(argv) {
  let htmlPath = '';
  let kind = 'document';
  let title = 'WV Design Deliverable';
  let subtitle = '';
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--file' && argv[i + 1]) htmlPath = argv[++i];
    else if (argv[i] === '--kind' && argv[i + 1]) kind = argv[++i];
    else if (argv[i] === '--title' && argv[i + 1]) title = argv[++i];
    else if (argv[i] === '--subtitle' && argv[i + 1]) subtitle = argv[++i];
  }
  if (!htmlPath) {
    console.error('Usage: node register_deliverable.mjs --file <path/to/file.html> [--kind dashboard|slides|doc] [--title "..."]');
    process.exit(2);
  }
  return { htmlPath: path.resolve(htmlPath), kind, title, subtitle };
}

function main() {
  const { htmlPath, kind, title, subtitle } = parseArgs(process.argv);
  const dataDir = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-design-studio');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const regPath = path.join(dataDir, 'deliverables.json');

  let list = [];
  if (fs.existsSync(regPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }

  const prefix = kind === 'slides' ? 'slides-' : kind === 'dashboard' ? 'dash-' : 'doc-';
  const id = prefix + crypto.createHash('sha1').update(htmlPath).digest('hex').slice(0, 10);
  const dirPath = path.dirname(htmlPath);
  const entry = {
    id,
    kind,
    title,
    subtitle: subtitle || (kind === 'slides' ? '16:9 Executive Presentation Deck' : 'Print-Ready Stakeholder Flyer / Memo'),
    dirPath,
    htmlPath,
    standalonePath: htmlPath,
    updatedAt: new Date().toISOString()
  };

  list = [entry, ...list.filter((item) => item && item.id !== id && item.htmlPath !== htmlPath)].slice(0, 20);
  fs.writeFileSync(regPath, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });

  let port = 4175;
  const srvPath = path.join(dataDir, 'preview-server.json');
  if (fs.existsSync(srvPath)) {
    try {
      const srv = JSON.parse(fs.readFileSync(srvPath, 'utf-8'));
      if (srv && Number.isInteger(srv.port)) port = srv.port;
    } catch {
      // default 4175
    }
  }

  console.log(`DELIVERABLE_ID=${id}`);
  console.log(`LIVE_PREVIEW_URL=http://127.0.0.1:${port}/view/${id}`);
}

main();
