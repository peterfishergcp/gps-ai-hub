#!/usr/bin/env node
/**
 * scaffold_ops_kit.mjs
 * Zero-dependency Node.js scaffolder and standalone HTML bundler for field-ops-kit.
 * Uses only Node built-in modules and strict function-callback String.prototype.replace()
 * so dollar amounts ($68.00, $23,140.40) and code tokens are never mutated.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_ROOT = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.join(SKILL_ROOT, 'assets', 'runtime');
const DEFAULT_TEMPLATE = path.join(
  SKILL_ROOT,
  'assets',
  'templates',
  'wv-fema-pa-debris-and-crosswalk.json'
);

const ALLOWED_FLAGS = new Set([
  '--target',
  '--template',
  '--county',
  '--title',
  '--force',
  '--help',
  '-h'
]);

const FORBIDDEN_SYSTEM_PREFIXES = [
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/proc',
  '/root',
  '/sbin',
  '/sys',
  '/usr/bin',
  '/usr/lib',
  '/usr/sbin'
];

function printUsage() {
  const helpText = [
    'Usage: node scripts/scaffold_ops_kit.mjs --target <dir> [options]',
    '',
    'Options:',
    '  --target <dir>       Output directory for ops-kit-standalone.html & runtime files (required)',
    '  --template <file>    Custom JSON dataset path (defaults to WV FEMA PA & 55-County template)',
    '  --county <name>      Optional default WV county pre-selected in 25-Question Self-Check',
    '  --title <text>       Optional custom kit title override',
    '  --force              Overwrite existing files in target directory',
    '  --help, -h           Show this usage summary'
  ].join('\n');
  process.stdout.write(helpText + '\n');
}

function parseCliArgs(argv) {
  const opts = {
    target: '',
    template: DEFAULT_TEMPLATE,
    county: '',
    title: '',
    force: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!ALLOWED_FLAGS.has(arg)) {
      throw new Error(`Unsupported CLI argument: ${arg}`);
    }
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--target') {
      opts.target = argv[++i] || '';
    } else if (arg === '--template') {
      opts.template = argv[++i] || '';
    } else if (arg === '--county') {
      opts.county = argv[++i] || '';
    } else if (arg === '--title') {
      opts.title = argv[++i] || '';
    }
  }
  return opts;
}

function assertSafeTargetDir(rawTarget) {
  if (!rawTarget || typeof rawTarget !== 'string') {
    throw new Error('Missing required --target <directory> argument.');
  }
  const resolved = path.resolve(rawTarget);
  if (resolved === '/' || resolved === path.parse(resolved).root) {
    throw new Error('Refusing to scaffold into filesystem root.');
  }
  for (const blocked of FORBIDDEN_SYSTEM_PREFIXES) {
    if (resolved === blocked || resolved.startsWith(blocked + path.sep)) {
      throw new Error(`Refusing to write into protected system path: ${resolved}`);
    }
  }
  return resolved;
}

function safeJoinWithin(baseDir, relativeSubpath) {
  const candidate = path.resolve(baseDir, relativeSubpath);
  const boundary = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (candidate !== baseDir && !candidate.startsWith(boundary)) {
    throw new Error(`Path traversal blocked outside target boundary: ${relativeSubpath}`);
  }
  return candidate;
}

function validateKitPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Template JSON must be a top-level object.');
  }
  if (!Array.isArray(payload.binderTabs) || payload.binderTabs.length === 0) {
    throw new Error('Template JSON requires a non-empty binderTabs array.');
  }
  if (!Array.isArray(payload.selfCheckPillars) || payload.selfCheckPillars.length === 0) {
    throw new Error('Template JSON requires a non-empty selfCheckPillars array.');
  }
  if (
    !payload.forensicCrosswalk ||
    !Array.isArray(payload.forensicCrosswalk.loads) ||
    payload.forensicCrosswalk.loads.length === 0
  ) {
    throw new Error('Template JSON requires forensicCrosswalk.loads array.');
  }
  if (
    !payload.regionalCrosswalk ||
    !Array.isArray(payload.regionalCrosswalk.counties) ||
    payload.regionalCrosswalk.counties.length === 0
  ) {
    throw new Error('Template JSON requires regionalCrosswalk.counties array.');
  }
}

function escapeJsonForScriptTag(jsonObject) {
  const serialized = JSON.stringify(jsonObject, null, 2);
  return serialized
    .replace(/<\//g, () => '<\\/')
    .replace(/<!--/g, () => '<\\!--');
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.help) {
    printUsage();
    return;
  }

  const targetDir = assertSafeTargetDir(opts.target);
  const templatePath = path.resolve(opts.template);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template JSON not found: ${templatePath}`);
  }

  if (fs.existsSync(targetDir)) {
    const existingEntries = fs.readdirSync(targetDir);
    if (existingEntries.length > 0 && !opts.force) {
      throw new Error(
        `Target directory is non-empty (${targetDir}). Re-run with --force to update.`
      );
    }
  } else {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const rawTemplate = fs.readFileSync(templatePath, 'utf-8');
  const payload = JSON.parse(rawTemplate);
  validateKitPayload(payload);

  if (opts.title) {
    payload.title = String(opts.title).slice(0, 180);
  }
  if (opts.county) {
    payload.defaultCounty = String(opts.county).slice(0, 60);
  }

  const indexTemplate = fs.readFileSync(path.join(RUNTIME_DIR, 'index.html'), 'utf-8');
  const stylesCss = fs.readFileSync(path.join(RUNTIME_DIR, 'styles.css'), 'utf-8');
  const appJs = fs.readFileSync(path.join(RUNTIME_DIR, 'app.js'), 'utf-8');
  const safeEmbeddedJson = escapeJsonForScriptTag(payload);

  // 1. Hydrated multi-file index.html (with external ./styles.css and ./app.js)
  const hydratedIndexHtml = indexTemplate.replace(
    '__OPS_KIT_JSON_PAYLOAD__',
    () => safeEmbeddedJson
  );

  // 2. Single-file offline serverless bundle: ops-kit-standalone.html
  // Uses function callbacks in every .replace() so $ characters are never corrupted.
  const standaloneHtml = indexTemplate
    .replace(
      '<link rel="stylesheet" href="./styles.css">',
      () => `<style>\n${stylesCss}\n</style>`
    )
    .replace('__OPS_KIT_JSON_PAYLOAD__', () => safeEmbeddedJson)
    .replace(
      '<script src="./app.js" defer></script>',
      () => `<script>\n${appJs}\n</script>`
    );

  const dataDir = safeJoinWithin(targetDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(safeJoinWithin(targetDir, 'ops-kit-standalone.html'), standaloneHtml, 'utf-8');
  fs.writeFileSync(safeJoinWithin(targetDir, 'index.html'), hydratedIndexHtml, 'utf-8');
  fs.writeFileSync(safeJoinWithin(targetDir, 'styles.css'), stylesCss, 'utf-8');
  fs.writeFileSync(safeJoinWithin(targetDir, 'app.js'), appJs, 'utf-8');
  fs.writeFileSync(
    safeJoinWithin(dataDir, 'ops-kit-data.json'),
    JSON.stringify(payload, null, 2) + '\n',
    'utf-8'
  );

  const readmeContent = [
    `# ${payload.title}`,
    '',
    'Generated by `field-ops-kit` (`scripts/scaffold_ops_kit.mjs`).',
    '',
    '## Quick Launch (100% Offline)',
    '- Open `ops-kit-standalone.html` directly in any browser or inside the Antigravity Side Pane.',
    '- Zero external network calls, zero npm packages, and strict safe DOM node construction.',
    '',
    '## Customizing Data',
    'Edit `data/ops-kit-data.json` and re-bundle with:',
    '```bash',
    'node <path-to-skill>/scripts/scaffold_ops_kit.mjs --target . --template ./data/ops-kit-data.json --force',
    '```',
    ''
  ].join('\n');
  fs.writeFileSync(safeJoinWithin(targetDir, 'README.md'), readmeContent, 'utf-8');

  const toolCount = payload.binderTabs.reduce((s, t) => s + t.tools.length, 0);
  const questionCount = payload.selfCheckPillars.reduce((s, p) => s + p.questions.length, 0);

  process.stdout.write(
    [
      `Scaffolded Field Operations Kit -> ${targetDir}`,
      `  Standalone App : ${path.join(targetDir, 'ops-kit-standalone.html')}`,
      `  Modules Built  : ${payload.binderTabs.length} Binder Tabs (${toolCount} Tools) · ${questionCount} Self-Check Controls · ${payload.forensicCrosswalk.loads.length} Forensic Loads · ${payload.regionalCrosswalk.counties.length} Counties`
    ].join('\n') + '\n'
  );
}

try {
  main();
} catch (err) {
  process.stderr.write(`[scaffold_ops_kit] ERROR: ${err.message}\n`);
  process.exit(1);
}
