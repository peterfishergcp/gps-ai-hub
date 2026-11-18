#!/usr/bin/env node
/**
 * WV Design Studio — Dashboard Scaffolder & Self-Contained Visual Artifact Builder
 *
 * Generates:
 * 1. Workspace project files (`dashboard.config.json`, `data/snapshot.json`, `index.html`, `styles.css`, `app.js`, `server.mjs`).
 * 2. `dashboard-standalone.html` — a 100% self-contained single-file HTML bundle (inlining CSS, JS, config, and snapshot)
 *    so the agent can write it directly to `<appDataDir>/brain/<conversation-id>/` with `ArtifactMetadata: { UserFacing: true }`
 *    for instant rendered visual preview inside Antigravity (never showing raw HTML code!).
 * 3. Registers the dashboard in `~/.gemini/config/plugin_data/wv-design-studio/deliverables.json` so the built-in
 *    `wv-design-preview` sidecar (`http://127.0.0.1:4175`) can serve and launch it with 1 click and zero terminal prompts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(SKILL_ROOT, 'assets', 'runtime');
const TEMPLATES_DIR = path.join(SKILL_ROOT, 'assets', 'templates');

const ALLOWED_TEMPLATES = new Set([
  'wv-mountain-state-ready',
  'wv-legislative-command-center',
  'wv-incident-triage',
  'executive-kpi',
]);

function parseArgs(argv) {
  let target = process.cwd();
  let template = 'wv-mountain-state-ready';
  let force = false;
  let syncOnly = false;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target' && argv[i + 1]) target = argv[++i];
    else if (argv[i] === '--template' && argv[i + 1]) template = argv[++i];
    else if (argv[i] === '--force') force = true;
    else if (argv[i] === '--sync') syncOnly = true;
  }
  if (!ALLOWED_TEMPLATES.has(template)) {
    template = 'wv-mountain-state-ready';
  }
  return { target: path.resolve(target), template, force, syncOnly };
}

function safeJsonForHtmlScript(obj) {
  // Escape '<' so `</script>` or `<!--` inside strings can never break out of <script type="application/json">
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function buildStandaloneHtml(rawHtml, cssText, jsText, hydratedPayload, titleText) {
  let out = rawHtml;
  if (titleText) {
    out = out.replace('<title>Dashboard Studio</title>', () => `<title>${String(titleText).replace(/[<>&]/g, '')}</title>`);
  }
  // Inline styles.css
  const safeCss = cssText.replace(/<\/style/gi, '<\\/style');
  out = out.replace(
    '<link rel="stylesheet" href="./styles.css">',
    () => `<style>\n${safeCss}\n</style>`
  );
  // Inline initial-data JSON
  out = out.replace(
    '<script id="initial-data" type="application/json">{"config":null,"snapshot":null}</script>',
    () => `<script id="initial-data" type="application/json">${hydratedPayload}</script>`
  );
  // Inline app.js
  const safeJs = jsText.replace(/<\/script/gi, '<\\/script');
  out = out.replace(
    '<script nonce="__CSP_NONCE__" src="./app.js"></script>',
    () => `<script>\n${safeJs}\n</script>`
  );
  return out;
}

function registerDeliverable(targetDir, title, subtitle) {
  try {
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
    const id = 'dash-' + crypto.createHash('sha1').update(targetDir).digest('hex').slice(0, 10);
    const entry = {
      id,
      kind: 'dashboard',
      title: title || 'WV Executive Dashboard',
      subtitle: subtitle || 'Interactive Dashboard Studio (Customize Layout enabled)',
      dirPath: targetDir,
      htmlPath: path.join(targetDir, 'index.html'),
      standalonePath: path.join(targetDir, 'dashboard-standalone.html'),
      updatedAt: new Date().toISOString()
    };
    list = [entry, ...list.filter((item) => item && item.id !== id && item.dirPath !== targetDir)].slice(0, 20);
    fs.writeFileSync(regPath, JSON.stringify(list, null, 2) + '\n', { mode: 0o600 });

    let port = 4175;
    const srvPath = path.join(dataDir, 'preview-server.json');
    if (fs.existsSync(srvPath)) {
      try {
        const srv = JSON.parse(fs.readFileSync(srvPath, 'utf-8'));
        if (srv && Number.isInteger(srv.port)) port = srv.port;
      } catch {
        // use default 4175
      }
    }
    return { id, previewUrl: `http://127.0.0.1:${port}/view/${id}` };
  } catch {
    return { id: 'dashboard', previewUrl: 'http://127.0.0.1:4175/' };
  }
}

function main() {
  const { target, template, force, syncOnly } = parseArgs(process.argv);
  fs.mkdirSync(path.join(target, 'data'), { recursive: true });

  const tplPath = path.join(TEMPLATES_DIR, `${template}.json`);
  const bundle = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));

  const configDest = path.join(target, 'dashboard.config.json');
  if ((!fs.existsSync(configDest) || force) && !syncOnly) {
    fs.writeFileSync(configDest, JSON.stringify(bundle.config, null, 2) + '\n', 'utf-8');
  }
  const activeConfig = JSON.parse(fs.readFileSync(configDest, 'utf-8'));

  const snapDest = path.join(target, 'data', 'snapshot.json');
  if ((!fs.existsSync(snapDest) || force) && !syncOnly) {
    fs.writeFileSync(snapDest, JSON.stringify(bundle.snapshot, null, 2) + '\n', 'utf-8');
  }
  const activeSnapshot = JSON.parse(fs.readFileSync(snapDest, 'utf-8'));

  for (const fileName of ['server.mjs', 'styles.css', 'app.js']) {
    const destFile = path.join(target, fileName);
    if (!syncOnly || !fs.existsSync(destFile)) {
      fs.copyFileSync(path.join(RUNTIME_DIR, fileName), destFile);
    }
  }

  const rawHtml = fs.readFileSync(path.join(RUNTIME_DIR, 'index.html'), 'utf-8');
  const cssText = fs.readFileSync(path.join(target, 'styles.css'), 'utf-8');
  const jsText = fs.readFileSync(path.join(target, 'app.js'), 'utf-8');
  const hydratedPayload = safeJsonForHtmlScript({ config: activeConfig, snapshot: activeSnapshot });

  // 1. Hydrate workspace index.html
  const hydratedHtml = rawHtml.replace(
    '<script id="initial-data" type="application/json">{"config":null,"snapshot":null}</script>',
    () => `<script id="initial-data" type="application/json">${hydratedPayload}</script>`
  );
  fs.writeFileSync(path.join(target, 'index.html'), hydratedHtml, 'utf-8');

  // 2. Build 100% self-contained single-file HTML for Antigravity Visual Artifact Preview (`UserFacing: true`)
  const standaloneHtml = buildStandaloneHtml(
    rawHtml,
    cssText,
    jsText,
    hydratedPayload,
    activeConfig.title || 'WV Dashboard Studio'
  );
  const standalonePath = path.join(target, 'dashboard-standalone.html');
  fs.writeFileSync(standalonePath, standaloneHtml, 'utf-8');

  if (!syncOnly) {
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
  }

  registerDeliverable(target, activeConfig.title, activeConfig.subtitle);

  console.log(`Scaffolded WV Dashboard (${template}) into ${target}`);
  console.log(`STANDALONE_ARTIFACT_HTML=${standalonePath}`);
  console.log('NOTE: Write STANDALONE_ARTIFACT_HTML directly to the Conversation Artifact Directory (<appDataDir>/brain/<conversation-id>/<name>_dashboard_preview.html) with ArtifactMetadata: { UserFacing: true }. Do NOT create 127.0.0.1 .url.json artifacts.');
}

main();
