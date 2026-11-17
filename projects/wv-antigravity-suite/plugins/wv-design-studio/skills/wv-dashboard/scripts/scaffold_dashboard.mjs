#!/usr/bin/env node
/**
 * WV Design Studio — Dashboard Scaffolder (Supports BOTH Zero-Node file:// Mode & 127.0.0.1 Node Server)
 *
 * Hydrates `<script id="initial-data" type="application/json">` inside `index.html` so
 * locked-down corporate laptops without Node.js can open `index.html` directly over `file://`
 * in Chrome or Microsoft Edge, while also writing `dashboard.config.json` and `data/snapshot.json`
 * for Antigravity edits and optional `node server.mjs` live BigQuery queries.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(SKILL_ROOT, 'assets', 'runtime');
const TEMPLATES_DIR = path.join(SKILL_ROOT, 'assets', 'templates');

const ALLOWED_TEMPLATES = new Set([
  'wv-mountain-state-ready',
  'wv-incident-triage',
  'executive-kpi',
]);

function parseArgs(argv) {
  let target = process.cwd();
  let template = 'wv-mountain-state-ready';
  let force = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) target = argv[++i];
    else if (argv[i] === '--template' && argv[i + 1]) template = argv[++i];
    else if (argv[i] === '--force') force = true;
  }
  if (!ALLOWED_TEMPLATES.has(template)) {
    template = 'wv-mountain-state-ready';
  }
  return { target: path.resolve(target), template, force };
}

function safeJsonForHtmlScript(obj) {
  // Escape '<' so `</script>` or `<!--` inside strings can never break out of <script type="application/json">
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function main() {
  const { target, template, force } = parseArgs(process.argv);
  fs.mkdirSync(path.join(target, 'data'), { recursive: true });

  const tplPath = path.join(TEMPLATES_DIR, `${template}.json`);
  const bundle = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));

  const configDest = path.join(target, 'dashboard.config.json');
  if (!fs.existsSync(configDest) || force) {
    fs.writeFileSync(configDest, JSON.stringify(bundle.config, null, 2) + '\n', 'utf-8');
  }
  const activeConfig = JSON.parse(fs.readFileSync(configDest, 'utf-8'));

  const snapDest = path.join(target, 'data', 'snapshot.json');
  if (!fs.existsSync(snapDest) || force) {
    fs.writeFileSync(snapDest, JSON.stringify(bundle.snapshot, null, 2) + '\n', 'utf-8');
  }
  const activeSnapshot = JSON.parse(fs.readFileSync(snapDest, 'utf-8'));

  for (const fileName of ['server.mjs', 'styles.css', 'app.js']) {
    fs.copyFileSync(path.join(RUNTIME_DIR, fileName), path.join(target, fileName));
  }

  // Hydrate index.html for Zero-Node Browser Mode (`file://` in Chrome/Edge)
  const rawHtml = fs.readFileSync(path.join(RUNTIME_DIR, 'index.html'), 'utf-8');
  const hydratedPayload = safeJsonForHtmlScript({ config: activeConfig, snapshot: activeSnapshot });
  const hydratedHtml = rawHtml.replace(
    '<script id="initial-data" type="application/json">{"config":null,"snapshot":null}</script>',
    `<script id="initial-data" type="application/json">${hydratedPayload}</script>`
  );
  fs.writeFileSync(path.join(target, 'index.html'), hydratedHtml, 'utf-8');

  fs.copyFileSync(
    path.join(__dirname, 'query_connector.mjs'),
    path.join(target, 'query_connector.mjs')
  );

  const envExample = [
    '# WV Design Studio Dashboard Database Configuration (BigQuery is default)',
    'DASHBOARD_CONNECTOR=bigquery',
    '# GCP_PROJECT_ID=your-gcp-project-id',
    'BQ_LOCATION=US',
    'BQ_MAX_BYTES_BILLED=1073741824',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(target, '.env.example'), envExample, 'utf-8');

  const gitignore = ['.env', '.env.*', '!.env.example', 'node_modules/', '.DS_Store', ''].join('\n');
  const gitignorePath = path.join(target, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, gitignore, 'utf-8');
  }

  console.log(`Scaffolded WV Dashboard (${template}) with Zero-Node Browser Mode into ${target}`);
}

main();
