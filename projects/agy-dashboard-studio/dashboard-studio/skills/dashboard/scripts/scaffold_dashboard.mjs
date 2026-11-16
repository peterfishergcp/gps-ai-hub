#!/usr/bin/env node
/**
 * Dashboard Studio — Project Scaffolder
 *
 * Usage:
 *   node scaffold_dashboard.mjs --target ./ --template wv-mountain-state-ready
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

function main() {
  const { target, template, force } = parseArgs(process.argv);
  fs.mkdirSync(path.join(target, 'data'), { recursive: true });

  const tplPath = path.join(TEMPLATES_DIR, `${template}.json`);
  const bundle = JSON.parse(fs.readFileSync(tplPath, 'utf-8'));

  const configDest = path.join(target, 'dashboard.config.json');
  if (!fs.existsSync(configDest) || force) {
    fs.writeFileSync(configDest, JSON.stringify(bundle.config, null, 2) + '\n', 'utf-8');
  }

  const snapDest = path.join(target, 'data', 'snapshot.json');
  if (!fs.existsSync(snapDest) || force) {
    fs.writeFileSync(snapDest, JSON.stringify(bundle.snapshot, null, 2) + '\n', 'utf-8');
  }

  for (const fileName of ['server.mjs', 'index.html', 'styles.css', 'app.js']) {
    fs.copyFileSync(path.join(RUNTIME_DIR, fileName), path.join(target, fileName));
  }

  fs.copyFileSync(
    path.join(__dirname, 'query_connector.mjs'),
    path.join(target, 'query_connector.mjs')
  );

  const envExample = [
    '# Dashboard Studio Database Configuration (BigQuery is default)',
    'DASHBOARD_CONNECTOR=bigquery',
    '# Uncomment and set your Google Cloud Project ID for live BigQuery queries:',
    '# GCP_PROJECT_ID=your-gcp-project-id',
    'BQ_LOCATION=US',
    'BQ_MAX_BYTES_BILLED=1073741824',
    '',
    '# Optional secondary connectors (postgres | mysql | duckdb | csv):',
    '# DUCKDB_PATH=./data/warehouse.duckdb',
    '# CSV_PATH=./data/input.csv',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(target, '.env.example'), envExample, 'utf-8');

  const gitignore = ['.env', '.env.*', '!.env.example', 'node_modules/', '.DS_Store', ''].join('\n');
  const gitignorePath = path.join(target, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, gitignore, 'utf-8');
  }

  console.log(`Scaffolded Dashboard Studio (${template}) into ${target}`);
}

main();
