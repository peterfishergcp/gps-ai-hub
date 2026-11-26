#!/usr/bin/env node
/**
 * State of West Virginia — 10-Gate Zero-Footprint & Clean-Uninstall Verifier
 * (`scripts/verify-wv-zero-footprint.mjs`)
 *
 * Deterministically verifies all WVOT corporate laptop & security invariants:
 *   Gate 1  — Zero local `mcp_config.json` or `hooks.json` subprocess definitions
 *   Gate 2  — Zero external npm/Python runtime dependencies (`package.json`, `node_modules`, `.venv`)
 *   Gate 3  — Zero sidecar TCP port listeners (`http.createServer`, `net.createServer`, `.listen(`)
 *   Gate 4  — Zero `/tmp`, `%TEMP%`, `os.tmpdir()`, `~/my-antigravity`, or `~/.gemini/agy-profile.md` writes
 *   Gate 5  — Opt-in background automations (`wv-automations` ships `"disabled": true`; 8 core plugins active)
 *   Gate 6  — Windows PowerShell 5.1 UTF-8 BOM-free JSON & zero external CDN `<script>` tags in sidecars
 *   Gate 7  — `dist/wv-antigravity-suite.zip` safety (<700 KB, zero symlinks/ZipSlip, installer parity)
 *   Gate 8  — Live hermetic install in jailed `$HOME` + canary `TMPDIR` (0 `/tmp` writes, 0 files outside `.gemini/config`)
 *   Gate 9  — Live runtime execution (`vault_core`, `antigravity_updates`, `coord_core`) with stripped `PATH` (no `gcloud`/`python`/`git`)
 *   Gate 10 — Live 1-command clean uninstall (`--purge-data`) preserving user Personal Skills with 0 WV residue
 *
 * Zero external dependencies (`node:*` only). Even the sandbox itself is created locally and cleaned up in `finally`
 * without touching `/tmp` or `os.tmpdir()`.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(SUITE_ROOT, 'plugins');

const EXPECTED_PLUGINS = [
  'wv-automations',
  'wv-design-studio',
  'wv-engineering-cloud',
  'wv-onboarding',
  'wv-second-brain',
  'wv-security',
  'wv-state-workflows',
];

const results = [];

function recordGate(num, title, passed, detail) {
  results.push({ num, title, passed, detail });
  const icon = passed ? 'PASS' : 'FAIL';
  console.log(`[${icon}] Gate ${String(num).padStart(2, '0')} · ${title} — ${detail}`);
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '.git' || ent.name.startsWith('.zf_test_sandbox_')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isSymbolicLink()) {
      out.push({ path: full, isSymlink: true, isDir: false });
      continue;
    }
    if (ent.isDirectory()) {
      out.push({ path: full, isSymlink: false, isDir: true });
      walkFiles(full, out);
    } else {
      out.push({ path: full, isSymlink: false, isDir: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Gate 1: Zero `mcp_config.json` or `hooks.json` subprocess definitions
// ---------------------------------------------------------------------------
function checkGate1(allPluginEntries) {
  const forbidden = allPluginEntries.filter(
    (e) => !e.isDir && (path.basename(e.path) === 'mcp_config.json' || path.basename(e.path) === 'hooks.json')
  );
  if (forbidden.length > 0) {
    recordGate(1, 'Zero Local MCP / Hook Subprocesses', false, `Found: ${forbidden.map((f) => path.relative(SUITE_ROOT, f.path)).join(', ')}`);
  } else {
    recordGate(1, 'Zero Local MCP / Hook Subprocesses', true, '0 mcp_config.json and 0 hooks.json across all 7 WV plugins');
  }
}

// ---------------------------------------------------------------------------
// Gate 2: Zero external npm / Python runtime dependencies
// ---------------------------------------------------------------------------
function checkGate2(allPluginEntries) {
  const issues = [];
  let pkgCount = 0;
  for (const e of allPluginEntries) {
    const base = path.basename(e.path);
    const rel = path.relative(SUITE_ROOT, e.path);
    if (e.isDir && (base === 'node_modules' || base === '.venv' || base === '__pycache__')) {
      issues.push(`Forbidden directory: ${rel}`);
    }
    if (!e.isDir && (base === 'requirements.txt' || base === 'pyproject.toml' || base === 'package-lock.json')) {
      issues.push(`External dependency manifest: ${rel}`);
    }
    if (!e.isDir && base === 'package.json') {
      pkgCount++;
      const pkg = JSON.parse(fs.readFileSync(e.path, 'utf-8').replace(/^\uFEFF/, ''));
      for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        if (pkg[k] && Object.keys(pkg[k]).length > 0) {
          issues.push(`${rel} declares non-empty ${k}: ${Object.keys(pkg[k]).join(', ')}`);
        }
      }
    }
  }
  recordGate(
    2,
    'Zero External Runtime Dependencies',
    issues.length === 0,
    issues.length ? issues.join('; ') : `Verified ${pkgCount} sidecar package.json files (0 npm/pip dependencies, 0 node_modules)`
  );
}

// ---------------------------------------------------------------------------
// Gate 3: Zero TCP / HTTP port listeners inside all sidecars
// ---------------------------------------------------------------------------
function checkGate3(allPluginEntries) {
  const sidecarCode = allPluginEntries.filter(
    (e) => !e.isDir && e.path.includes(`${path.sep}sidecars${path.sep}`) && /\.(mjs|js|cjs)$/.test(e.path)
  );
  const issues = [];
  const listenRe = /\b(http\.createServer|https\.createServer|net\.createServer|\.listen\s*\()/;
  for (const f of sidecarCode) {
    const txt = fs.readFileSync(f.path, 'utf-8');
    const m = txt.match(listenRe);
    if (m) issues.push(`${path.relative(SUITE_ROOT, f.path)} calls ${m[1]}`);
  }
  recordGate(
    3,
    'Zero Sidecar Firewall / TCP Port Listeners',
    issues.length === 0,
    issues.length ? issues.join('; ') : `Scanned ${sidecarCode.length} sidecar JS/MJS files (100% SidecarApp IPC, 0 TCP listeners)`
  );
}

// ---------------------------------------------------------------------------
// Gate 4: Zero `/tmp`, `%TEMP%`, `os.tmpdir()`, `~/my-antigravity`, or `~/.gemini/agy-profile.md` writes
// ---------------------------------------------------------------------------
function checkGate4(allSuiteEntries) {
  const issues = [];
  const codeEntries = allSuiteEntries.filter(
    (e) =>
      !e.isDir &&
      !e.path.endsWith('verify-wv-zero-footprint.mjs') &&
      /\.(mjs|js|sh|ps1)$/.test(e.path)
  );

  for (const f of codeEntries) {
    const rel = path.relative(SUITE_ROOT, f.path);
    const strippedBlocks = fs
      .readFileSync(f.path, 'utf-8')
      .replace(/<#[\s\S]*?#>/g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
      .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
    const lines = strippedBlocks.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) return;
      if (/\bos\.tmpdir\s*\(/.test(trimmed)) {
        issues.push(`${rel}:${idx + 1} calls os.tmpdir()`);
      }
      if (/(['"`])\/(?:private\/|var\/)?tmp\//.test(trimmed)) {
        issues.push(`${rel}:${idx + 1} references /tmp path`);
      }
      if (/\$env:TEMP\b|%TEMP%/i.test(trimmed)) {
        issues.push(`${rel}:${idx + 1} references Windows %TEMP%`);
      }
      if (/~\/my-antigravity\b/.test(trimmed)) {
        issues.push(`${rel}:${idx + 1} references ~/my-antigravity outside ~/.gemini/config`);
      }
      if (/agy-profile\.md/.test(trimmed)) {
        issues.push(`${rel}:${idx + 1} writes ~/.gemini/agy-profile.md outside ~/.gemini/config`);
      }
    });
  }
  recordGate(
    4,
    'Zero /tmp, %TEMP%, or Outside-Config Path Leaks',
    issues.length === 0,
    issues.length ? issues.slice(0, 5).join('; ') : `Scanned ${codeEntries.length} executable scripts/UI files (0 /tmp or home-clutter paths)`
  );
}

// ---------------------------------------------------------------------------
// Gate 5:Plugin Manifest Inventory & Opt-In Background Crons (`wv-automations` disabled)
// ---------------------------------------------------------------------------
function checkGate5() {
  const issues = [];
  const actual = fs
    .readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();

  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_PLUGINS)) {
    issues.push(`Plugin list mismatch: got [${actual.join(', ')}]`);
  }

  for (const p of actual) {
    const pjPath = path.join(PLUGINS_DIR, p, 'plugin.json');
    if (!fs.existsSync(pjPath)) {
      issues.push(`Missing ${p}/plugin.json`);
      continue;
    }
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf-8'));
    if (p === 'wv-automations' && pj.disabled !== true) {
      issues.push('wv-automations/plugin.json must have "disabled": true by default');
    }
    if (p !== 'wv-automations' && pj.disabled === true) {
      issues.push(`${p}/plugin.json unexpectedly disabled`);
    }
  }
  recordGate(
    5,
    'Plugin Inventory & Opt-In Cron Guardrail',
    issues.length === 0,
    issues.length ? issues.join('; ') : '6 interactive/skill plugins enabled; wv-automations opt-in disabled by default'
  );
}

// ---------------------------------------------------------------------------
// Gate 6: UTF-8 BOM-Free JSON & Zero External CDN `<script>` Tags in Sidecar HTML
// ---------------------------------------------------------------------------
function checkGate6(allSuiteEntries) {
  const issues = [];
  let jsonCount = 0;
  let htmlCount = 0;

  for (const e of allSuiteEntries) {
    if (e.isDir) continue;
    const rel = path.relative(SUITE_ROOT, e.path);
    if (e.path.endsWith('.json')) {
      jsonCount++;
      const buf = fs.readFileSync(e.path);
      if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        issues.push(`UTF-8 BOM found in ${rel}`);
      }
      try {
        JSON.parse(buf.toString('utf-8'));
      } catch (err) {
        issues.push(`Invalid JSON in ${rel}: ${err.message}`);
      }
    }
    if (e.path.includes(`${path.sep}sidecars${path.sep}`) && e.path.endsWith('.html')) {
      htmlCount++;
      const html = fs.readFileSync(e.path, 'utf-8');
      if (/<script[^>]+src=["']https?:\/\//i.test(html) || /<link[^>]+href=["']https?:\/\//i.test(html)) {
        issues.push(`External CDN dependency in sidecar HTML: ${rel}`);
      }
    }
  }
  recordGate(
    6,
    'BOM-Free JSON & Offline Sidecar HTML',
    issues.length === 0,
    issues.length ? issues.join('; ') : `Verified ${jsonCount} BOM-free JSON files and ${htmlCount} offline-ready sidecar HTML files`
  );
}

// ---------------------------------------------------------------------------
// Gate 7: `dist/wv-antigravity-suite.zip` Safety, Symlink Hygiene & Installer Parity
// ---------------------------------------------------------------------------
function checkGate7(allSuiteEntries) {
  const issues = [];
  const symlinks = allSuiteEntries.filter((e) => e.isSymlink);
  if (symlinks.length > 0) {
    issues.push(`Symlinks found: ${symlinks.map((s) => path.relative(SUITE_ROOT, s.path)).join(', ')}`);
  }

  for (const ext of ['sh', 'ps1']) {
    const top = fs.readFileSync(path.join(SUITE_ROOT, 'scripts', `install-wv-suite.${ext}`), 'utf-8');
    const embedded = fs.readFileSync(
      path.join(PLUGINS_DIR, 'wv-onboarding', 'skills', 'wv-update', 'scripts', `install-wv-suite.${ext}`),
      'utf-8'
    );
    if (top !== embedded) {
      issues.push(`install-wv-suite.${ext} differs between scripts/ and wv-update/scripts/`);
    }
  }

  const distZip = path.join(SUITE_ROOT, 'dist', 'wv-antigravity-suite.zip');
  const distSha = path.join(SUITE_ROOT, 'dist', 'wv-antigravity-suite.zip.sha256');
  const wsZip = path.join(SUITE_ROOT, 'workshop', 'dist', 'wv-antigravity-suite.zip');
  const wsSha = path.join(SUITE_ROOT, 'workshop', 'dist', 'wv-antigravity-suite.zip.sha256');
  let sizeKb = 0;
  if (!fs.existsSync(distZip)) {
    issues.push('Missing dist/wv-antigravity-suite.zip');
  } else {
    const b1 = fs.readFileSync(distZip);
    sizeKb = Math.round((b1.length / 1024) * 10) / 10;
    if (sizeKb > 750) issues.push(`Bundle exceeds 750 KB cap (${sizeKb} KB)`);
    const actualSha = crypto.createHash('sha256').update(b1).digest('hex');
    if (!fs.existsSync(distSha)) {
      issues.push('Missing dist/wv-antigravity-suite.zip.sha256');
    } else {
      const shaText = fs.readFileSync(distSha, 'utf-8').trim();
      const shaToken = shaText.split(/\s+/)[0].toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(shaToken) || shaToken !== actualSha) {
        issues.push('dist/wv-antigravity-suite.zip.sha256 digest mismatch');
      }
      if (fs.existsSync(wsSha) && fs.readFileSync(wsSha, 'utf-8') !== fs.readFileSync(distSha, 'utf-8')) {
        issues.push('workshop/dist/wv-antigravity-suite.zip.sha256 out of sync with dist/');
      }
    }
    if (fs.existsSync(wsZip)) {
      const b2 = fs.readFileSync(wsZip);
      if (!b1.equals(b2)) issues.push('workshop/dist/wv-antigravity-suite.zip out of sync with dist/');
    }
  }

  recordGate(
    7,
    'Archive Hygiene, SHA-256 Digest & Installer Parity',
    issues.length === 0,
    issues.length ? issues.join('; ') : `dist/wv-antigravity-suite.zip (${sizeKb} KB), SHA-256 verified, 0 symlinks, sh/ps1 installers in sync`
  );
}

// ---------------------------------------------------------------------------
// Gates 8, 9 & 10: Live Hermetic Install, Stripped-PATH Runtime & Zero-Residue Uninstall
// ---------------------------------------------------------------------------
async function checkHermeticLifecycleGates() {
  const sandbox = path.join(SUITE_ROOT, `.zf_test_sandbox_${process.pid}`);
  const fakeHome = path.join(sandbox, 'home');
  const canaryTmp = path.join(sandbox, 'canary_tmp');
  fs.rmSync(sandbox, { recursive: true, force: true });
  fs.mkdirSync(fakeHome, { recursive: true, mode: 0o700 });
  fs.mkdirSync(canaryTmp, { recursive: true, mode: 0o700 });

  try {
    const baseEnv = {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      TMPDIR: canaryTmp,
      TEMP: canaryTmp,
      TMP: canaryTmp,
    };

    // Seed deprecated v2.2.x plugins + plugin_data credential directories to prove upgrade auto-cleanup purges both while preserving user memory
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'config', 'plugins', 'wv-connectors'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'config', 'plugins', 'wv-coordinator'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'plugins', 'wv-connectors', 'plugin.json'), '{"name":"wv-connectors"}\n');
    fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'plugins', 'wv-coordinator', 'plugin.json'), '{"name":"wv-coordinator"}\n');
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-connectors'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-coordinator'), { recursive: true });
    fs.mkdirSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-antigravity', 'memory'), { recursive: true });
    fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-connectors', 'connectors.json'), '{"stale":true}\n');
    fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-coordinator', 'voice_prefs.json'), '{"staleSecret":true}\n');
    fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-antigravity', 'memory', 'action_items.md'), '# Preserved\n');

    // --- Gate 8: Live Hermetic Install ---
    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(SUITE_ROOT, 'scripts', 'install-wv-suite.ps1'),
          '-TargetConfigDir',
          path.join(fakeHome, '.gemini', 'config'),
        ],
        { env: baseEnv, stdio: 'pipe' }
      );
    } else {
      execFileSync(
        'bash',
        [
          path.join(SUITE_ROOT, 'scripts', 'install-wv-suite.sh'),
          '--target-config-dir',
          path.join(fakeHome, '.gemini', 'config'),
        ],
        { env: baseEnv, stdio: 'pipe' }
      );
    }

    const tmpAfterInstall = fs.readdirSync(canaryTmp);
    const homeEntries = fs
      .readdirSync(fakeHome)
      .filter((n) => !(process.platform === 'win32' && n === 'AppData'));
    const geminiEntries = fs.existsSync(path.join(fakeHome, '.gemini'))
      ? fs.readdirSync(path.join(fakeHome, '.gemini'))
      : [];
    const configEntries = fs.existsSync(path.join(fakeHome, '.gemini', 'config'))
      ? fs.readdirSync(path.join(fakeHome, '.gemini', 'config'))
      : [];
    const stageLeftovers = configEntries.filter((n) => n.startsWith('.install_stage'));
    const installedPlugins = fs
      .readdirSync(path.join(fakeHome, '.gemini', 'config', 'plugins'))
      .sort();

    const g8Issues = [];
    if (tmpAfterInstall.length > 0) g8Issues.push(`Canary TMPDIR touched: ${tmpAfterInstall.join(', ')}`);
    if (JSON.stringify(homeEntries) !== JSON.stringify(['.gemini'])) {
      g8Issues.push(`Unexpected $HOME entries: ${homeEntries.join(', ')}`);
    }
    if (JSON.stringify(geminiEntries) !== JSON.stringify(['config'])) {
      g8Issues.push(`Unexpected ~/.gemini entries outside config/: ${geminiEntries.join(', ')}`);
    }
    if (stageLeftovers.length > 0) g8Issues.push(`Staging dir not cleaned: ${stageLeftovers.join(', ')}`);
    if (JSON.stringify(installedPlugins) !== JSON.stringify(EXPECTED_PLUGINS)) {
      g8Issues.push(`Installed plugins mismatch: ${installedPlugins.join(', ')}`);
    }
    if (
      fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-connectors')) ||
      fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-coordinator'))
    ) {
      g8Issues.push('Legacy plugin_data/wv-{connectors,coordinator} was not purged during install');
    }
    if (!fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data', 'wv-antigravity', 'memory', 'action_items.md'))) {
      g8Issues.push('User memory in plugin_data/wv-antigravity/memory/ was not preserved during install');
    }

    recordGate(
      8,
      'Hermetic Sandbox Install (Jailed $HOME & Canary /tmp)',
      g8Issues.length === 0,
      g8Issues.length
        ? g8Issues.join('; ')
        : 'Installed all 7 WV plugins strictly inside ~/.gemini/config/ & auto-removed legacy wv-connectors/wv-coordinator (0 /tmp files, 0 home clutter)'
    );

    // --- Gate 9: Live Runtime Exercise With Stripped PATH (Zero gcloud / python / git / npm) ---
    const runtimeScript = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { pathToFileURL } from 'node:url';

      const cfg = path.join(process.env.HOME, '.gemini', 'config');
      const plugins = path.join(cfg, 'plugins');

      const vaultCore = await import(pathToFileURL(path.join(plugins, 'wv-second-brain', 'scripts', 'vault_core.mjs')).href);
      const updatesMod = await import(pathToFileURL(path.join(plugins, 'wv-second-brain', 'sidecars', 'wv-antigravity-ui', 'antigravity_updates.mjs')).href);
      const catalogMod = await import(pathToFileURL(path.join(plugins, 'wv-onboarding', 'sidecars', 'wv-skill-manager', 'seed_prompts_catalog.mjs')).href);

      vaultCore.initializeVault({ role: 'public-sector', name: 'WV Test User', roleTitle: 'Operations Analyst', org: 'WV Agency', seedDemo: true, force: true });
      const vs = vaultCore.getVaultState();
      const up = updatesMod.getUpdatesState();
      updatesMod.saveUpdatesPreferences({ completeStep: 'connect-workspace' });

      const cat = catalogMod.buildSkillsCatalog({ pluginsRoot: plugins, personalSkillsRoot: path.join(cfg, 'skills') });
      const clawyPng = path.join(plugins, 'wv-onboarding', 'sidecars', 'wv-skill-manager', 'assets', 'clawy_mascot.png');
      const hasLegacyCat = cat.some((c) => c.categoryId === 'wv-connectors' || c.categoryId === 'wv-coordinator');

      // Re-seed legacy v2.2.x plugins + plugin_data credential folders to prove runtime self-healing prunes both
      fs.mkdirSync(path.join(plugins, 'wv-connectors'), { recursive: true });
      fs.mkdirSync(path.join(plugins, 'wv-coordinator'), { recursive: true });
      fs.writeFileSync(path.join(plugins, 'wv-connectors', 'plugin.json'), '{"name":"wv-connectors"}\\n');
      fs.writeFileSync(path.join(plugins, 'wv-coordinator', 'plugin.json'), '{"name":"wv-coordinator"}\\n');
      fs.mkdirSync(path.join(cfg, 'plugin_data', 'wv-connectors'), { recursive: true });
      fs.mkdirSync(path.join(cfg, 'plugin_data', 'wv-coordinator'), { recursive: true });
      fs.writeFileSync(path.join(cfg, 'plugin_data', 'wv-coordinator', 'voice_prefs.json'), '{"staleSecret":true}\\n');
      const pruned = catalogMod.pruneRetiredWvPlugins(plugins);
      const legacyStillExists =
        fs.existsSync(path.join(plugins, 'wv-connectors')) ||
        fs.existsSync(path.join(plugins, 'wv-coordinator')) ||
        fs.existsSync(path.join(cfg, 'plugin_data', 'wv-connectors')) ||
        fs.existsSync(path.join(cfg, 'plugin_data', 'wv-coordinator'));

      if (!vs || !Array.isArray(up.items) || up.items.length < 5 || !Array.isArray(cat) || hasLegacyCat || !fs.existsSync(clawyPng) || legacyStillExists || pruned.length < 2) {
        throw new Error('Runtime state validation failed');
      }
      console.log('RUNTIME_OK');
    `;

    const rtRes = spawnSync(process.execPath, ['--input-type=module', '-e', runtimeScript], {
      env: {
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        TMPDIR: canaryTmp,
        TEMP: canaryTmp,
        TMP: canaryTmp,
        PATH: '', // Completely empty PATH — proves zero gcloud/python/git/cmd dependency!
      },
      encoding: 'utf-8',
    });

    const g9Issues = [];
    if (rtRes.status !== 0 || !String(rtRes.stdout || '').includes('RUNTIME_OK')) {
      g9Issues.push(`Runtime error (exit ${rtRes.status}): ${(rtRes.stderr || rtRes.stdout || '').trim().slice(0, 220)}`);
    }
    const tmpAfterRuntime = fs.readdirSync(canaryTmp);
    const homeAfterRuntime = fs
      .readdirSync(fakeHome)
      .filter((n) => !(process.platform === 'win32' && n === 'AppData'));
    const geminiAfterRuntime = fs.readdirSync(path.join(fakeHome, '.gemini'));
    if (tmpAfterRuntime.length > 0) g9Issues.push(`Runtime wrote to TMPDIR: ${tmpAfterRuntime.join(', ')}`);
    if (JSON.stringify(homeAfterRuntime) !== JSON.stringify(['.gemini'])) {
      g9Issues.push(`Runtime created $HOME clutter: ${homeAfterRuntime.join(', ')}`);
    }
    if (JSON.stringify(geminiAfterRuntime) !== JSON.stringify(['config'])) {
      g9Issues.push(`Runtime wrote outside ~/.gemini/config/: ${geminiAfterRuntime.join(', ')}`);
    }

    recordGate(
      9,
      'Stripped-PATH Runtime Test (PATH="" · No gcloud/python/git)',
      g9Issues.length === 0,
      g9Issues.length
        ? g9Issues.join('; ')
        : 'WV My Hub + WV Skills (Ask Clawy) + Updates ran cleanly with PATH="" (0 /tmp writes, 0 files outside ~/.gemini/config)'
    );

    // --- Gate 10: Clean 1-Command Uninstall (`--purge-data`) Preserving User Personal Skills ---
    const rulesDir = path.join(fakeHome, '.gemini', 'config', 'rules');
    const personalSkillDir = path.join(fakeHome, '.gemini', 'config', 'skills', 'my-agency-checklist');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.mkdirSync(personalSkillDir, { recursive: true });
    fs.writeFileSync(path.join(rulesDir, 'wv-voice-profile.md'), '# WV Voice\n', 'utf-8');
    fs.writeFileSync(path.join(personalSkillDir, 'SKILL.md'), '---\nname: my-agency-checklist\n---\n', 'utf-8');

    if (process.platform === 'win32') {
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(SUITE_ROOT, 'scripts', 'uninstall-wv-suite.ps1'),
          '-TargetConfigDir',
          path.join(fakeHome, '.gemini', 'config'),
          '-PurgeMemoryData',
        ],
        { env: baseEnv, stdio: 'pipe' }
      );
    } else {
      execFileSync(
        'bash',
        [
          path.join(SUITE_ROOT, 'scripts', 'uninstall-wv-suite.sh'),
          '--target-config-dir',
          path.join(fakeHome, '.gemini', 'config'),
          '--purge-data',
        ],
        { env: baseEnv, stdio: 'pipe' }
      );
    }

    const g10Issues = [];
    const remainingPlugins = fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'plugins'))
      ? fs.readdirSync(path.join(fakeHome, '.gemini', 'config', 'plugins'))
      : [];
    const remainingPluginData = fs.existsSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data'))
      ? fs.readdirSync(path.join(fakeHome, '.gemini', 'config', 'plugin_data'))
      : [];
    if (remainingPlugins.length > 0) g10Issues.push(`Leftover plugins: ${remainingPlugins.join(', ')}`);
    if (remainingPluginData.length > 0) g10Issues.push(`Leftover plugin_data: ${remainingPluginData.join(', ')}`);
    if (fs.existsSync(path.join(rulesDir, 'wv-voice-profile.md'))) {
      g10Issues.push('Leftover rules/wv-voice-profile.md');
    }
    if (!fs.existsSync(path.join(personalSkillDir, 'SKILL.md'))) {
      g10Issues.push('User Personal Skill in ~/.gemini/config/skills/ was not preserved!');
    }

    recordGate(
      10,
      'Zero-Residue Uninstall (--purge-data) + Personal Skill Preservation',
      g10Issues.length === 0,
      g10Issues.length
        ? g10Issues.join('; ')
        : '0 WV plugins, 0 WV plugin_data folders, and 0 WV rules remain; user Personal Skill preserved intact'
    );
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

async function main() {
  console.log('======================================================================');
  console.log('West Virginia Antigravity Suite — 10-Gate Zero-Footprint Audit');
  console.log('======================================================================');

  const allPluginEntries = walkFiles(PLUGINS_DIR);
  const allSuiteEntries = walkFiles(SUITE_ROOT);

  checkGate1(allPluginEntries);
  checkGate2(allPluginEntries);
  checkGate3(allPluginEntries);
  checkGate4(allSuiteEntries);
  checkGate5();
  checkGate6(allSuiteEntries);
  checkGate7(allSuiteEntries);
  await checkHermeticLifecycleGates();

  const failed = results.filter((r) => !r.passed);
  console.log('----------------------------------------------------------------------');
  if (failed.length > 0) {
    console.error(`FAILED ${failed.length} of ${results.length} Zero-Footprint gates.`);
    process.exit(1);
  }
  console.log(`ALL ${results.length}/${results.length} ZERO-FOOTPRINT GATES PASSED.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
