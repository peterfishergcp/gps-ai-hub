#!/usr/bin/env node

const __parseJsonNoBom = (s) =>
  JSON.parse(
    typeof s === 'string'
      ? s.replace(/^\uFEFF/, '')
      : Buffer.isBuffer(s)
        ? s.toString('utf-8').replace(/^\uFEFF/, '')
        : s
  );

/**
 * Dedicated Skills & Personal Skills Hub Sidecar (`main.mjs`)
 *
 * Replaces the legacy table Skill Manager with the AI-Inbox Card Grid UI while
 * preserving 100% of admin capabilities:
 * 1. Full discovery of user Personal Skills (~/.gemini/config/skills/) + Workspace Skills (.gemini/skills/).
 * 2. Per-skill & per-category Enable/Disable toggles (`SKILL.md` <-> `SKILL.md.disabled` + ledger + LS sync).
 * 3. + New Personal Skill wizard, Save My Copy (fork/override), Edit Seed Prompt, & SKILL.md viewer/editor.
 * 4. Safe Personal Skill Export (`POST /api/skills/export-safe` — deterministic secret/PII/internal-link scrub check).
 * 5. Gemini Enterprise (`ge-instance.json`) Connector Hub & <1s SHA-256 Incremental Updater.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { buildSkillsCatalog, SUITE_VARIANT } from './seed_prompts_catalog.mjs';
import { getTokenMeterSummary } from './token_meter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const SAFE_SKILL_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const SAFE_SEG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const MAX_FORK_BYTES = 5 * 1024 * 1024;
const WRITABLE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);
const ALLOWED_EMOJI_CODES = new Set(['2728', '1f60e', '1f36a', '1f48e', '2699_fe0f']);

const DEFAULT_RAW_BASE =
  SUITE_VARIANT === 'wv'
    ? 'https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite'
    : 'https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin';

const CONNECTORS_PLUGIN_NAME = SUITE_VARIANT === 'wv' ? 'wv-connectors' : 'agy-connectors';
const AUTOMATIONS_PLUGIN_NAME = SUITE_VARIANT === 'wv' ? 'wv-automations' : 'agy-twin-automations';
const MEMORY_PLUGIN_DATA_NAME = SUITE_VARIANT === 'wv' ? 'wv-antigravity' : 'my-antigravity';
const ONBOARDING_PLUGIN_NAME = SUITE_VARIANT === 'wv' ? 'wv-onboarding' : 'agy-onboarding';

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function getPluginsRoot() {
  if (process.env.ANTIGRAVITY_PLUGINS_ROOT && process.env.ANTIGRAVITY_PLUGINS_ROOT.trim()) {
    return path.resolve(process.env.ANTIGRAVITY_PLUGINS_ROOT.trim());
  }
  return path.resolve(__dirname, '..', '..', '..');
}

function getPersonalSkillsRoot() {
  const custom = process.env.ANTIGRAVITY_PERSONAL_SKILLS_DIR;
  return custom && custom.trim()
    ? path.resolve(custom.trim())
    : path.join(os.homedir(), '.gemini', 'config', 'skills');
}

function getWorkspaceSkillsRoot() {
  const ws = process.env.ANTIGRAVITY_WORKSPACE_ROOT || process.env.WORKSPACE_ROOT || '';
  if (!ws || !ws.trim()) return '';
  return path.join(path.resolve(ws.trim()), '.gemini', 'skills');
}

function getSidecarStateDir() {
  const d =
    process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
    process.env.PLUGIN_DATA ||
    path.join(os.homedir(), '.gemini', 'config', 'plugin_data', ONBOARDING_PLUGIN_NAME);
  const resolved = path.resolve(d);
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  return resolved;
}

function getCustomSeedsPaths() {
  const memSeeds = path.join(
    os.homedir(),
    '.gemini',
    'config',
    'plugin_data',
    MEMORY_PLUGIN_DATA_NAME,
    'memory',
    'profile',
    'custom_seeds.json'
  );
  const localSeeds = path.join(getSidecarStateDir(), 'custom_seeds.json');
  return [localSeeds, memSeeds];
}

function readCustomSeeds() {
  const merged = {};
  for (const p of getCustomSeedsPaths().reverse()) {
    try {
      if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
        const parsed = __parseJsonNoBom(fs.readFileSync(p, 'utf-8'));
        if (parsed && typeof parsed === 'object') {
          Object.assign(merged, parsed);
        }
      }
    } catch {}
  }
  return merged;
}

function writeCustomSeeds(seedsObj) {
  const [localSeeds, memSeeds] = getCustomSeedsPaths();
  fs.mkdirSync(path.dirname(localSeeds), { recursive: true, mode: 0o700 });
  const tmp = `${localSeeds}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(seedsObj, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, localSeeds);

  // Best-effort mirror to memory profile custom_seeds.json when permitted by sandbox
  try {
    fs.mkdirSync(path.dirname(memSeeds), { recursive: true, mode: 0o700 });
    const tmp2 = `${memSeeds}.tmp-${process.pid}`;
    fs.writeFileSync(tmp2, JSON.stringify(seedsObj, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(tmp2, memSeeds);
  } catch {}
}

function hasSymlinkUnderRoot(resolvedPath, rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  if (!fs.existsSync(resolvedRoot)) return false;
  const rootStat = lstatOrNull(resolvedRoot);
  if (!rootStat || rootStat.isSymbolicLink()) return true;
  const realRoot = fs.realpathSync(resolvedRoot);
  const prefix = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  let cur = resolvedRoot;
  const rel = path.relative(resolvedRoot, path.resolve(resolvedPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return true;
  for (const seg of rel.split(path.sep)) {
    cur = path.join(cur, seg);
    const st = lstatOrNull(cur);
    if (!st) break;
    if (st.isSymbolicLink()) return true;
    const realCur = fs.realpathSync(cur);
    if (realCur !== realRoot && !realCur.startsWith(prefix)) return true;
  }
  return false;
}

function classifySkillFilePath(rawPath) {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.includes('\0')) {
    return { allowed: false, writable: false };
  }
  const resolved = path.resolve(rawPath);
  const personalRoot = getPersonalSkillsRoot();
  if (fs.existsSync(personalRoot) && !hasSymlinkUnderRoot(resolved, personalRoot)) {
    const rel = path.relative(personalRoot, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      const ext = path.extname(resolved).toLowerCase();
      const isDisabledMd = resolved.endsWith('SKILL.md.disabled');
      const writable = WRITABLE_EXTENSIONS.has(ext) || isDisabledMd;
      return { allowed: true, writable, rootId: 'my-skills', resolved };
    }
  }

  const wsRoot = getWorkspaceSkillsRoot();
  if (wsRoot && fs.existsSync(wsRoot) && !hasSymlinkUnderRoot(resolved, wsRoot)) {
    const rel = path.relative(wsRoot, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return { allowed: true, writable: false, rootId: 'workspace-skills', resolved };
    }
  }

  const pluginsRoot = getPluginsRoot();
  if (fs.existsSync(pluginsRoot) && !hasSymlinkUnderRoot(resolved, pluginsRoot)) {
    const rel = path.relative(pluginsRoot, resolved);
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      return { allowed: true, writable: false, rootId: 'plugins', resolved };
    }
  }

  return { allowed: false, writable: false };
}

function httpsGetBuffer(urlStr, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:' || u.hostname !== 'raw.githubusercontent.com') {
      reject(new Error('Only raw.githubusercontent.com HTTPS updates are permitted'));
      return;
    }
    const req = https.get(
      u,
      { headers: { 'User-Agent': 'AGY-Skills-Hub/2.1' }, timeout: 12000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          return resolve(httpsGetBuffer(new URL(res.headers.location, urlStr).toString(), redirectsLeft - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > 5 * 1024 * 1024) return req.destroy(new Error('Response too large'));
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
  });
}

function getBaselineHashesPath() {
  return path.join(getSidecarStateDir(), 'baseline-hashes.json');
}

function readBaselineHashes(pluginsRoot) {
  const p = getBaselineHashesPath();
  if (fs.existsSync(p)) {
    try {
      const parsed = __parseJsonNoBom(fs.readFileSync(p, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        return { skills: parsed.skills || {}, sidecars: parsed.sidecars || {} };
      }
    } catch {}
  }
  const seeded = { skills: {}, sidecars: {} };
  const localManifestPath = path.resolve(pluginsRoot, '..', 'version-manifest.json');
  if (fs.existsSync(localManifestPath)) {
    try {
      const lm = __parseJsonNoBom(fs.readFileSync(localManifestPath, 'utf-8'));
      for (const [sid, entry] of Object.entries(lm.skillManifest || {})) {
        seeded.skills[sid] = { ...(entry.files || {}) };
      }
    } catch {}
  }
  return seeded;
}

function writeBaselineHashes(baseline) {
  const p = getBaselineHashesPath();
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(baseline, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p);
}

async function syncSkillsIncrementally(skillFilter = '') {
  const manifestBuf = await httpsGetBuffer(`${DEFAULT_RAW_BASE}/version-manifest.json`);
  const manifest = __parseJsonNoBom(manifestBuf.toString('utf-8'));
  const skillManifest = manifest.skillManifest || {};
  const pluginsRoot = getPluginsRoot();
  const baseline = readBaselineHashes(pluginsRoot);
  const targetSkills = Object.keys(skillManifest).filter((id) => !skillFilter || id === skillFilter);

  let updatedSkillsCount = 0;
  let updatedFilesCount = 0;
  const updatedSkillIds = [];
  const protectedSkillIds = [];

  for (const skillId of targetSkills) {
    const entry = skillManifest[skillId];
    const pluginName = entry.plugin;
    if (!SAFE_ID_RE.test(pluginName) || !SAFE_ID_RE.test(skillId)) continue;

    const skillDir = path.join(pluginsRoot, pluginName, 'skills', skillId);
    const isDisabled =
      !fs.existsSync(path.join(skillDir, 'SKILL.md')) &&
      fs.existsSync(path.join(skillDir, 'SKILL.md.disabled'));

    if (!baseline.skills[skillId]) baseline.skills[skillId] = {};

    let skillChanged = false;
    let skillProtected = false;
    for (const [relPath, expectedSha] of Object.entries(entry.files || {})) {
      if (!relPath || relPath.startsWith('/') || relPath.includes('\\')) continue;
      const parts = relPath.split('/');
      if (!parts.every((p) => p && p !== '.' && p !== '..' && SAFE_SEG_RE.test(p))) continue;

      const diskRel = relPath === 'SKILL.md' && isDisabled ? 'SKILL.md.disabled' : relPath;
      const localPath = path.join(skillDir, diskRel);
      let localSha = null;
      try {
        if (fs.existsSync(localPath) && fs.lstatSync(localPath).isFile()) {
          localSha = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
        }
      } catch {}

      if (localSha === expectedSha) {
        baseline.skills[skillId][relPath] = expectedSha;
        continue;
      }

      const prevBaselineSha = baseline.skills[skillId][relPath] || null;
      if (localSha && prevBaselineSha && localSha !== prevBaselineSha) {
        skillProtected = true;
        continue;
      }

      const buf = await httpsGetBuffer(`${DEFAULT_RAW_BASE}/plugins/${pluginName}/skills/${skillId}/${relPath}`);
      const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
      if (actualSha !== expectedSha) {
        throw new Error(`Hash mismatch on ${skillId}/${relPath}`);
      }
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      const tmp = `${localPath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, localPath);
      baseline.skills[skillId][relPath] = expectedSha;
      updatedFilesCount += 1;
      skillChanged = true;
    }
    if (skillProtected) protectedSkillIds.push(skillId);
    if (skillChanged) {
      updatedSkillsCount += 1;
      updatedSkillIds.push(skillId);
    }
  }

  const updatedSidecarIds = [];
  if (!skillFilter && manifest.sidecarManifest) {
    for (const [scKey, scEntry] of Object.entries(manifest.sidecarManifest)) {
      const pluginName = scEntry.plugin;
      const scId = scEntry.sidecar || scKey.split('/').pop();
      if (pluginName === AUTOMATIONS_PLUGIN_NAME) continue;
      if (!SAFE_ID_RE.test(pluginName) || !SAFE_ID_RE.test(scId)) continue;
      const scDir = path.join(pluginsRoot, pluginName, 'sidecars', scId);
      let sidecarChanged = false;
      for (const [relPath, expectedSha] of Object.entries(scEntry.files || {})) {
        if (!relPath || relPath.startsWith('/') || relPath.includes('\\')) continue;
        const parts = relPath.split('/');
        if (!parts.every((p) => p && p !== '.' && p !== '..' && SAFE_SEG_RE.test(p))) continue;
        const localPath = path.join(scDir, relPath);
        let localSha = null;
        try {
          if (fs.existsSync(localPath) && fs.lstatSync(localPath).isFile()) {
            localSha = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
          }
        } catch {}
        if (localSha !== expectedSha) {
          const buf = await httpsGetBuffer(`${DEFAULT_RAW_BASE}/plugins/${pluginName}/sidecars/${scId}/${relPath}`);
          if (crypto.createHash('sha256').update(buf).digest('hex') !== expectedSha) {
            throw new Error(`Hash mismatch on sidecar ${scId}/${relPath}`);
          }
          fs.mkdirSync(path.dirname(localPath), { recursive: true });
          const tmp = `${localPath}.tmp-${process.pid}`;
          fs.writeFileSync(tmp, buf);
          fs.renameSync(tmp, localPath);
          updatedFilesCount += 1;
          sidecarChanged = true;
        }
      }
      if (sidecarChanged) updatedSidecarIds.push(`${pluginName}/${scId}`);
    }
  }

  writeBaselineHashes(baseline);
  return {
    ok: true,
    suiteVersion: manifest.suiteVersion || '2.0.0',
    checkedSkillsCount: targetSkills.length,
    updatedSkillsCount,
    updatedFilesCount,
    updatedSkillIds,
    protectedSkillIds,
    updatedSidecarIds,
  };
}

function getLedgerPath() {
  return path.join(getSidecarStateDir(), 'skill-toggles.json');
}

function readToggleLedger() {
  const p = getLedgerPath();
  if (!fs.existsSync(p)) return { disabledSkills: {}, disabledPlugins: {} };
  try {
    const parsed = __parseJsonNoBom(fs.readFileSync(p, 'utf-8'));
    return {
      disabledSkills: parsed.disabledSkills || {},
      disabledPlugins: parsed.disabledPlugins || {},
    };
  } catch {
    return { disabledSkills: {}, disabledPlugins: {} };
  }
}

function writeToggleLedger(ledger) {
  const dir = getSidecarStateDir();
  const target = getLedgerPath();
  const tmp = path.join(dir, `.skill-toggles.${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, target);
}

function callLanguageServerRpc(method, bodyObj) {
  return new Promise((resolve) => {
    const lsAddr = process.env.ANTIGRAVITY_LS_ADDRESS || '';
    const csrf = process.env.ANTIGRAVITY_CSRF_TOKEN || '';
    if (!lsAddr || !csrf || lsAddr === 'mock') {
      resolve({ ok: false, skipped: true });
      return;
    }
    const [host, portStr] = lsAddr.split(':');
    const payload = JSON.stringify(bodyObj);
    const req = http.request(
      {
        hostname: host || '127.0.0.1',
        port: Number(portStr || 5387),
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-codeium-csrf-token': csrf,
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 3500,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          let json = null;
          try {
            json = __parseJsonNoBom(text);
          } catch {}
          resolve({ ok: res.statusCode === 200, json });
        });
      }
    );
    req.on('error', () => resolve({ ok: false }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false });
    });
    req.write(payload);
    req.end();
  });
}

function toggleSkillOnDiskAndLedger(pluginsRoot, pluginName, skillId, enabled) {
  if (!SAFE_ID_RE.test(pluginName) || !SAFE_ID_RE.test(skillId)) {
    throw new Error('Invalid plugin or skill identifier.');
  }
  const ledger = readToggleLedger();
  const key = `${pluginName}/${skillId}`;
  if (enabled) {
    delete ledger.disabledSkills[key];
  } else {
    ledger.disabledSkills[key] = true;
  }
  writeToggleLedger(ledger);

  const personalRoot = getPersonalSkillsRoot();
  const baseRoot = pluginName === 'my-skills' ? personalRoot : pluginsRoot;
  const skillDir =
    pluginName === 'my-skills'
      ? path.join(personalRoot, skillId)
      : path.join(pluginsRoot, pluginName, 'skills', skillId);

  let diskSynced = false;
  if (!hasSymlinkUnderRoot(skillDir, baseRoot)) {
    const activeMd = path.join(skillDir, 'SKILL.md');
    const disabledMd = path.join(skillDir, 'SKILL.md.disabled');
    try {
      if (!enabled && fs.existsSync(activeMd) && !lstatOrNull(activeMd).isSymbolicLink()) {
        fs.renameSync(activeMd, disabledMd);
        diskSynced = true;
      } else if (enabled && fs.existsSync(disabledMd) && !lstatOrNull(disabledMd).isSymbolicLink()) {
        fs.renameSync(disabledMd, activeMd);
        diskSynced = true;
      } else if ((enabled && fs.existsSync(activeMd)) || (!enabled && fs.existsSync(disabledMd))) {
        diskSynced = true;
      }
    } catch {
      diskSynced = false;
    }
  }
  return { enabled, diskSynced };
}

function readGeInstanceConfig() {
  const candidates = [
    path.join(os.homedir(), '.gemini', 'config', 'plugin_data', CONNECTORS_PLUGIN_NAME, 'ge-instance.json'),
    path.join(getSidecarStateDir(), 'ge-instance.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
        return __parseJsonNoBom(fs.readFileSync(p, 'utf-8'));
      }
    } catch {}
  }
  return { rawInput: '' };
}

function saveGeInstanceConfig(rawInput) {
  const cleaned = String(rawInput || '').trim().slice(0, 500);
  const payload = {
    rawInput: cleaned,
    updatedAt: new Date().toISOString(),
  };
  const localTarget = path.join(getSidecarStateDir(), 'ge-instance.json');
  fs.writeFileSync(localTarget, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });

  const connectorsDir = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', CONNECTORS_PLUGIN_NAME);
  try {
    fs.mkdirSync(connectorsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(connectorsDir, 'ge-instance.json'), JSON.stringify(payload, null, 2) + '\n', {
      mode: 0o600,
    });
  } catch {}
  return payload;
}

function rewriteSkillFrontmatterName(markdownText, newSlug) {
  const raw = String(markdownText || '').replace(/^\uFEFF/, '');
  const fmMatch = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  if (!fmMatch) {
    return `---\nname: ${newSlug}\ndescription: Custom personal skill (${newSlug}).\n---\n\n${raw}`;
  }
  const body = fmMatch[2];
  const updatedBody = /^name\s*:/m.test(body)
    ? body.replace(/^name\s*:.*$/m, `name: ${newSlug}`)
    : `name: ${newSlug}\n${body}`;
  return `${fmMatch[1]}${updatedBody}${fmMatch[3]}${raw.slice(fmMatch[0].length)}`;
}

function copySkillBundleRecursive(srcDir, destDir, newSlug) {
  let totalBytes = 0;
  function walkAndCopy(curSrc, curDest, isRoot) {
    fs.mkdirSync(curDest, { recursive: true, mode: 0o700 });
    for (const entry of fs.readdirSync(curSrc, { withFileTypes: true })) {
      if (entry.name.startsWith('.') && entry.name !== '.gitkeep') continue;
      if (entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const srcPath = path.join(curSrc, entry.name);
      const lst = lstatOrNull(srcPath);
      if (!lst || lst.isSymbolicLink()) {
        throw new Error('Refusing to copy symbolic link inside skill directory');
      }
      if (lst.isDirectory()) {
        walkAndCopy(srcPath, path.join(curDest, entry.name), false);
      } else if (lst.isFile()) {
        totalBytes += lst.size;
        if (totalBytes > MAX_FORK_BYTES) {
          throw new Error('Skill bundle exceeds 5 MB copy limit');
        }
        const outName = isRoot && entry.name === 'SKILL.md.disabled' ? 'SKILL.md' : entry.name;
        const destPath = path.join(curDest, outName);
        if (isRoot && outName === 'SKILL.md') {
          const rewritten = rewriteSkillFrontmatterName(fs.readFileSync(srcPath, 'utf-8'), newSlug);
          fs.writeFileSync(destPath, rewritten, { mode: 0o600 });
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }
  walkAndCopy(srcDir, destDir, true);
}

function scanSkillForSafeExport(mdText) {
  const findings = [];
  const rules = [
    { re: /\bAIza[0-9A-Za-z_-]{30,}\b/, label: 'API key (AIza...)' },
    { re: /\bsk-[A-Za-z0-9_-]{20,}\b/, label: 'Secret token (sk-...)' },
    { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'Private key block' },
    { re: /\b\d{3}-\d{2}-\d{4}\b/, label: 'SSN-like pattern' },
    { re: /\b(?:go|b|cl)\/[a-zA-Z0-9_-]{2,}\b/, label: 'Internal shortlink (go/, b/, cl/)' },
    { re: /\/usr\/local\/google\/home\/[a-z0-9_]+/i, label: 'Local home path' },
    { re: /\[(?:CONFIRM|TODO):[^\]]*\]/i, label: 'Unresolved [CONFIRM]/[TODO] placeholder' },
  ];
  for (const r of rules) {
    if (r.re.test(mdText)) findings.push(r.label);
  }
  return findings;
}

async function buildFullState() {
  const pluginsRoot = getPluginsRoot();
  const ledger = readToggleLedger();
  const lsRes = await callLanguageServerRpc('GetAllPlugins', {});
  const lsDisabledMap = {};
  if (lsRes.ok && lsRes.json && Array.isArray(lsRes.json.plugins)) {
    for (const p of lsRes.json.plugins) {
      const dirName = String(p.path || '').split('/').pop();
      if (dirName) lsDisabledMap[dirName] = Boolean(p.disabled);
    }
  }

  const categories = buildSkillsCatalog(pluginsRoot, {
    personalSkillsRoot: getPersonalSkillsRoot(),
    workspaceSkillsRoot: getWorkspaceSkillsRoot(),
    customSeedsMap: readCustomSeeds(),
    toggleLedger: ledger,
    lsDisabledMap,
    suiteMode: 'generic',
  });

  return {
    ok: true,
    suiteVariant: SUITE_VARIANT,
    personalSkillsRoot: getPersonalSkillsRoot(),
    workspaceSkillsRoot: getWorkspaceSkillsRoot(),
    categories,
    geConfig: readGeInstanceConfig(),
  };
}

const app = new SidecarApp();

app.page('/', () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'));

app.api('/styles.css', () =>
  new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  }),
  'GET'
);

app.api('/app.js', () =>
  new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  }),
  'GET'
);

app.api('/token_pill_ui.js', () =>
  new Response(fs.readFileSync(path.join(__dirname, 'token_pill_ui.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  }),
  'GET'
);

app.api(
  '/api/emoji-png',
  (data) => {
    const code = String((data && data.code) || '').trim();
    if (!ALLOWED_EMOJI_CODES.has(code)) {
      return new Response('Not found', { status: 404, contentType: 'text/plain; charset=utf-8' });
    }
    const pngPath = path.join(__dirname, 'assets', 'emoji', `${code}.png`);
    if (!fs.existsSync(pngPath)) {
      return new Response('Not found', { status: 404, contentType: 'text/plain; charset=utf-8' });
    }
    return new Response(fs.readFileSync(pngPath), { contentType: 'image/png' });
  },
  'GET'
);

app.api(
  '/api/token-summary',
  async (data) => getTokenMeterSummary((data && data.convId) || '', getSidecarStateDir()),
  'GET'
);

app.api('/api/state', async () => buildFullState(), 'GET');

app.api('/api/toggle-skill', async (data) => {
  try {
    const pluginsRoot = getPluginsRoot();
    const pluginName = String((data && data.plugin) || '');
    const skillId = String((data && data.skill) || '');
    const enabled = Boolean(data && data.enabled);
    if (pluginName === 'workspace-skills') {
      return new Response(JSON.stringify({ ok: false, error: 'Workspace skills are managed in your repo .gemini/skills/ folder.' }), {
        contentType: 'application/json',
        status: 400,
      });
    }
    const res = toggleSkillOnDiskAndLedger(pluginsRoot, pluginName, skillId, enabled);
    if (enabled && pluginName !== 'my-skills') {
      const ledger = readToggleLedger();
      if (ledger.disabledPlugins[pluginName] === true) {
        ledger.disabledPlugins[pluginName] = false;
        writeToggleLedger(ledger);
        await callLanguageServerRpc('JetboxWriteState', {
          userConfig: { plugins: { [pluginName]: { enabled: true } } },
        });
      }
    }
    return { ok: true, ...res };
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Invalid identifier' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
}, 'POST');

app.api('/api/toggle-category', async (data) => {
  const pluginName = String((data && data.plugin) || '');
  const categoryId = String((data && data.categoryId) || pluginName);
  if (!SAFE_ID_RE.test(pluginName)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid plugin identifier' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const enabled = Boolean(data && data.enabled);
  const full = await buildFullState();
  const targetCat = full.categories.find((c) => (c.categoryId || c.plugin) === categoryId);
  if (targetCat) {
    const pluginsRoot = getPluginsRoot();
    for (const s of targetCat.skills) {
      if (s.plugin !== 'workspace-skills') {
        toggleSkillOnDiskAndLedger(pluginsRoot, s.plugin || pluginName, s.id, enabled);
      }
    }
  }
  if (pluginName !== 'my-skills') {
    const ledger = readToggleLedger();
    ledger.disabledPlugins[pluginName] = !enabled;
    writeToggleLedger(ledger);
    await callLanguageServerRpc('JetboxWriteState', {
      userConfig: { plugins: { [pluginName]: { enabled } } },
    });
  }
  return { ok: true, categoryId, plugin: pluginName, enabled };
}, 'POST');

app.api('/api/save-ge', async (data) => {
  const saved = saveGeInstanceConfig((data && data.geInstance) || '');
  return { ok: true, geConfig: saved };
}, 'POST');

app.api('/api/incremental-sync', async (data) => {
  const skillFilter = data && typeof data.skill === 'string' ? data.skill.trim() : '';
  return await syncSkillsIncrementally(skillFilter);
}, 'POST');

app.api('/api/skills/create', async (data) => {
  const personalRoot = getPersonalSkillsRoot();
  const rawSlug = String((data && data.slug) || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
  const title = String((data && data.title) || '').trim().slice(0, 90);
  const description = String((data && data.description) || '').trim().slice(0, 260);
  const instructions = String((data && data.instructions) || '').trim();
  const seedPromptRaw = String((data && data.seedPrompt) || '').trim();

  if (!SAFE_SKILL_SLUG_RE.test(rawSlug)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Skill command slug must be 2–63 lowercase letters, numbers, or hyphens (e.g. weekly-grant-check).',
      }),
      { contentType: 'application/json', status: 400 }
    );
  }

  fs.mkdirSync(personalRoot, { recursive: true, mode: 0o700 });
  const rootStat = lstatOrNull(personalRoot);
  if (!rootStat || rootStat.isSymbolicLink()) {
    return new Response(JSON.stringify({ ok: false, error: 'Personal skills root cannot be a symlink' }), {
      contentType: 'application/json',
      status: 403,
    });
  }

  const destDir = path.join(personalRoot, rawSlug);
  if (fs.existsSync(destDir)) {
    return new Response(
      JSON.stringify({ ok: false, error: `/${rawSlug} already exists in ~/.gemini/config/skills/.` }),
      { contentType: 'application/json', status: 409 }
    );
  }

  fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
  const cleanTitle = title || rawSlug;
  const cleanDesc = description || `Personal Antigravity workflow for ${cleanTitle}.`;
  const cleanBody =
    instructions ||
    `# ${cleanTitle}\n\n## Goal\n${cleanDesc}\n\n## Workflow Steps\n1. Gather context from the user or workspace.\n2. Execute the checklist deterministically.\n3. Return a concise summary with next actions.\n`;

  const mdContent = `---\nname: ${rawSlug}\ndescription: >-\n  ${cleanDesc.replace(/\r?\n/g, ' ')}\n---\n\n${cleanBody}\n`;
  const mdPath = path.join(destDir, 'SKILL.md');
  fs.writeFileSync(mdPath, mdContent, { mode: 0o600 });

  const nowIso = new Date().toISOString();
  const seedPrompt = seedPromptRaw
    ? seedPromptRaw.startsWith('/') ? seedPromptRaw : `/${rawSlug} ${seedPromptRaw}`
    : `/${rawSlug} Run my ${cleanTitle} workflow on the task below.`;

  fs.writeFileSync(
    path.join(destDir, '.agy-skill-meta.json'),
    JSON.stringify(
      {
        slug: rawSlug,
        mode: 'authored',
        title: cleanTitle,
        subtitle: cleanDesc,
        seedPrompt,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );

  const seeds = readCustomSeeds();
  seeds[rawSlug] = {
    title: cleanTitle,
    subtitle: cleanDesc,
    seedPrompt,
    isPersonalCopy: true,
    updatedAt: nowIso,
  };
  writeCustomSeeds(seeds);

  return {
    ok: true,
    slug: rawSlug,
    command: `/${rawSlug}`,
    skillMdPath: mdPath,
  };
}, 'POST');

app.api('/api/skills/fork', async (data) => {
  const pluginsRoot = getPluginsRoot();
  const personalRoot = getPersonalSkillsRoot();
  const sourcePlugin = String((data && data.sourcePlugin) || '').trim();
  const sourceSkillId = String((data && data.sourceSkillId) || '').trim();
  const rawTargetSlug = String((data && data.targetSlug) || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
  const overwrite = Boolean(data && data.overwrite);

  if (!SAFE_ID_RE.test(sourcePlugin) || !SAFE_SKILL_SLUG_RE.test(sourceSkillId) || !SAFE_SKILL_SLUG_RE.test(rawTargetSlug)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid skill identifier or target slug' }), {
      contentType: 'application/json',
      status: 400,
    });
  }

  const srcDir =
    sourcePlugin === 'my-skills'
      ? path.join(personalRoot, sourceSkillId)
      : path.join(pluginsRoot, sourcePlugin, 'skills', sourceSkillId);
  const srcRoot = sourcePlugin === 'my-skills' ? personalRoot : pluginsRoot;

  if (!fs.existsSync(srcDir) || hasSymlinkUnderRoot(srcDir, srcRoot)) {
    return new Response(JSON.stringify({ ok: false, error: 'Source skill directory not found' }), {
      contentType: 'application/json',
      status: 404,
    });
  }

  fs.mkdirSync(personalRoot, { recursive: true, mode: 0o700 });
  const rootStat = lstatOrNull(personalRoot);
  if (!rootStat || rootStat.isSymbolicLink()) {
    return new Response(JSON.stringify({ ok: false, error: 'Personal skills root cannot be a symlink' }), {
      contentType: 'application/json',
      status: 403,
    });
  }

  const destDir = path.join(personalRoot, rawTargetSlug);
  if (fs.existsSync(destDir)) {
    const hasMeta =
      fs.existsSync(path.join(destDir, '.agy-skill-meta.json')) ||
      fs.existsSync(path.join(destDir, '.twin-skill-meta.json'));
    if (!overwrite) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `/${rawTargetSlug} already exists in ~/.gemini/config/skills/. Pick another name or check Replace Existing.`,
        }),
        { contentType: 'application/json', status: 409 }
      );
    }
    if (!hasMeta) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Refusing to overwrite pre-existing personal skill /${rawTargetSlug} that was not created here.`,
        }),
        { contentType: 'application/json', status: 409 }
      );
    }
    if (hasSymlinkUnderRoot(destDir, personalRoot)) {
      return new Response(JSON.stringify({ ok: false, error: 'Refusing symlinked destination' }), {
        contentType: 'application/json',
        status: 403,
      });
    }
    fs.rmSync(destDir, { recursive: true, force: false });
  }

  try {
    copySkillBundleRecursive(srcDir, destDir, rawTargetSlug);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message || 'Copy failed' }), {
      contentType: 'application/json',
      status: 500,
    });
  }

  const nowIso = new Date().toISOString();
  const mode = rawTargetSlug === sourceSkillId ? 'override' : 'copy';
  const customTitle = String((data && data.title) || '').trim();
  const customSubtitle = String((data && data.subtitle) || '').trim();
  const rawSeed = String((data && data.seedPrompt) || '').trim();
  const normalizedSeed = rawSeed
    ? rawSeed.replace(new RegExp(`^/${sourceSkillId}\\b`), `/${rawTargetSlug}`)
    : `/${rawTargetSlug} Run my customized workflow.`;

  fs.writeFileSync(
    path.join(destDir, '.agy-skill-meta.json'),
    JSON.stringify(
      {
        slug: rawTargetSlug,
        forkedFrom: sourceSkillId,
        sourcePlugin,
        mode,
        title: customTitle,
        subtitle: customSubtitle,
        seedPrompt: normalizedSeed,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2
    ) + '\n',
    { mode: 0o600 }
  );

  const seeds = readCustomSeeds();
  seeds[rawTargetSlug] = {
    seedPrompt: normalizedSeed,
    title: customTitle,
    subtitle: customSubtitle,
    isPersonalCopy: true,
    updatedAt: nowIso,
  };
  writeCustomSeeds(seeds);

  return {
    ok: true,
    slug: rawTargetSlug,
    command: `/${rawTargetSlug}`,
    mode,
    skillMdPath: path.join(destDir, 'SKILL.md'),
  };
}, 'POST');

app.api('/api/skills/save-seed', async (data) => {
  const skillId = String((data && data.skillId) || '').trim().replace(/^\/+/, '');
  if (!SAFE_SKILL_SLUG_RE.test(skillId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid skill ID' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const seeds = readCustomSeeds();
  if (data && data.reset) {
    delete seeds[skillId];
  } else {
    const promptText = String((data && data.seedPrompt) || '').trim();
    if (!promptText) {
      return new Response(JSON.stringify({ ok: false, error: 'Seed prompt cannot be empty' }), {
        contentType: 'application/json',
        status: 400,
      });
    }
    const existing = seeds[skillId] || {};
    const nextTitle = data && typeof data.title === 'string' ? data.title.trim() : existing.title;
    seeds[skillId] = {
      ...existing,
      ...(nextTitle ? { title: nextTitle } : {}),
      seedPrompt: promptText,
      updatedAt: new Date().toISOString(),
    };
  }
  writeCustomSeeds(seeds);
  return { ok: true, skillId };
}, 'POST');

app.api('/api/skills/delete-copy', async (data) => {
  const personalRoot = getPersonalSkillsRoot();
  const slug = String((data && data.slug) || '').trim().replace(/^\/+/, '');
  if (!SAFE_SKILL_SLUG_RE.test(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid personal skill slug' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const targetDir = path.join(personalRoot, slug);
  const hasMeta =
    fs.existsSync(path.join(targetDir, '.agy-skill-meta.json')) ||
    fs.existsSync(path.join(targetDir, '.twin-skill-meta.json'));
  if (!fs.existsSync(targetDir) || !hasMeta || hasSymlinkUnderRoot(targetDir, personalRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only managed personal copies created in this hub can be deleted here.' }),
      { contentType: 'application/json', status: 403 }
    );
  }
  fs.rmSync(targetDir, { recursive: true, force: false });
  const seeds = readCustomSeeds();
  delete seeds[slug];
  writeCustomSeeds(seeds);
  return { ok: true, slug };
}, 'POST');

app.api('/api/skills/export-safe', async (data) => {
  const check = classifySkillFilePath(data && data.path);
  if (!check.allowed || !fs.existsSync(check.resolved)) {
    return new Response(JSON.stringify({ ok: false, error: 'Skill file not accessible' }), {
      contentType: 'application/json',
      status: 403,
    });
  }
  const st = lstatOrNull(check.resolved);
  if (!st || st.isSymbolicLink() || !st.isFile() || st.size > 1024 * 1024) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid skill file' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const content = fs.readFileSync(check.resolved, 'utf-8');
  const findings = scanSkillForSafeExport(content);
  return {
    ok: findings.length === 0,
    clean: findings.length === 0,
    findings,
    content: findings.length === 0 ? content : '',
  };
}, 'POST');

app.api('/api/file', async (data) => {
  const check = classifySkillFilePath(data && data.path);
  if (!check.allowed || !fs.existsSync(check.resolved)) {
    return new Response(JSON.stringify({ ok: false, error: 'Path outside allowed skill roots or contains symlink' }), {
      contentType: 'application/json',
      status: 403,
    });
  }
  const lst = lstatOrNull(check.resolved);
  if (!lst || lst.isSymbolicLink() || !lst.isFile() || lst.size > 2 * 1024 * 1024) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid or oversized file' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  return {
    ok: true,
    path: check.resolved,
    name: path.basename(check.resolved),
    writable: check.writable,
    rootId: check.rootId,
    content: fs.readFileSync(check.resolved, 'utf-8'),
  };
}, 'GET');

app.api('/api/file', async (data) => {
  const check = classifySkillFilePath(data && data.path);
  if (!check.allowed || !check.writable || check.rootId !== 'my-skills') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only personal skills in ~/.gemini/config/skills/ are directly writable.' }),
      { contentType: 'application/json', status: 403 }
    );
  }
  const content = typeof (data && data.content) === 'string' ? data.content : '';
  if (Buffer.byteLength(content, 'utf-8') > 2 * 1024 * 1024) {
    return new Response(JSON.stringify({ ok: false, error: 'Payload exceeds 2 MB limit' }), {
      contentType: 'application/json',
      status: 413,
    });
  }
  const lst = lstatOrNull(check.resolved);
  if (lst && (lst.isSymbolicLink() || lst.isDirectory())) {
    return new Response(JSON.stringify({ ok: false, error: 'Target is not a regular file' }), {
      contentType: 'application/json',
      status: 403,
    });
  }
  const tmp = `${check.resolved}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, check.resolved);
  return { ok: true, path: check.resolved };
}, 'POST');

await app.run();
