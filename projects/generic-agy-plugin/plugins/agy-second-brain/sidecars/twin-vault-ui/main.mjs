#!/usr/bin/env node
/**
 * Twin Second Brain & Markdown Vault Sidecar Backend (`main.mjs`)
 *
 * Runs natively on Antigravity Desktop's built-in Node runtime via `sidecar_sdk`
 * (zero npm packages or external Python installs required).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import {
  ROLE_PRESETS,
  addGtdTask,
  buildDirectoryTree,
  createOrUpdateInitiative,
  getVaultRoot,
  getVaultState,
  initializeVault,
  toggleGtdTask,
  touchContact,
} from '../../scripts/vault_core.mjs';
import { buildSkillsCatalog } from './seed_prompts_catalog.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_NAME = path.basename(PLUGIN_ROOT);
const PLUGINS_SUITE_ROOT = path.resolve(PLUGIN_ROOT, '..');
const WRITABLE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_SEG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const SUITE_REPO_PROJECT = PLUGIN_NAME === 'agy-twin-memory' ? 'agy-digital-twin-kit' : 'generic-agy-plugin';
const RAW_SYNC_BASE = `https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/${SUITE_REPO_PROJECT}`;

function computeLocalUiSignature() {
  const h = crypto.createHash('sha256');
  for (const fname of ['index.html', 'app.js', 'styles.css', 'main.mjs', 'seed_prompts_catalog.mjs']) {
    const p = path.join(__dirname, fname);
    try {
      if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
        h.update(fname).update(fs.readFileSync(p));
      }
    } catch {}
  }
  return h.digest('hex');
}

const BOOT_UI_SIGNATURE = computeLocalUiSignature();

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
        timeout: 4000,
      },
      (res) => {
        res.resume();
        resolve({ ok: res.statusCode === 200 });
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

function httpsGetBuffer(urlStr, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return reject(new Error('HTTPS required'));
    const req = https.get(
      u,
      { headers: { 'User-Agent': 'AGY-Twin-Vault-Sidecar/1.2' }, timeout: 12000 },
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

async function syncSuiteFromGithub() {
  const manifestBuf = await httpsGetBuffer(`${RAW_SYNC_BASE}/version-manifest.json`);
  const manifest = JSON.parse(manifestBuf.toString('utf-8'));
  let updatedFilesCount = 0;
  const updatedSidecarIds = [];

  for (const [skillId, entry] of Object.entries(manifest.skillManifest || {})) {
    const pName = entry.plugin;
    if (!SAFE_ID_RE.test(pName) || !SAFE_ID_RE.test(skillId)) continue;
    const skillDir = path.join(PLUGINS_SUITE_ROOT, pName, 'skills', skillId);
    const isDisabled =
      !fs.existsSync(path.join(skillDir, 'SKILL.md')) &&
      fs.existsSync(path.join(skillDir, 'SKILL.md.disabled'));
    for (const [relPath, expectedSha] of Object.entries(entry.files || {})) {
      if (!relPath || relPath.startsWith('/') || relPath.includes('\\')) continue;
      if (!relPath.split('/').every((p) => p && p !== '.' && p !== '..' && SAFE_SEG_RE.test(p))) continue;
      const diskRel = relPath === 'SKILL.md' && isDisabled ? 'SKILL.md.disabled' : relPath;
      const localPath = path.join(skillDir, diskRel);
      let localSha = null;
      try {
        if (fs.existsSync(localPath) && fs.lstatSync(localPath).isFile()) {
          localSha = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
        }
      } catch {}
      if (localSha !== expectedSha) {
        const buf = await httpsGetBuffer(`${RAW_SYNC_BASE}/plugins/${pName}/skills/${skillId}/${relPath}`);
        if (crypto.createHash('sha256').update(buf).digest('hex') !== expectedSha) {
          throw new Error(`Hash mismatch on ${skillId}/${relPath}`);
        }
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        const tmp = `${localPath}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, localPath);
        updatedFilesCount += 1;
      }
    }
  }

  for (const [scKey, scEntry] of Object.entries(manifest.sidecarManifest || {})) {
    const pName = scEntry.plugin;
    const scId = scEntry.sidecar || scKey.split('/').pop();
    if (pName === 'agy-twin-automations') continue;
    if (!SAFE_ID_RE.test(pName) || !SAFE_ID_RE.test(scId)) continue;
    const scDir = path.join(PLUGINS_SUITE_ROOT, pName, 'sidecars', scId);
    let scChanged = false;
    for (const [relPath, expectedSha] of Object.entries(scEntry.files || {})) {
      if (!relPath || relPath.startsWith('/') || relPath.includes('\\')) continue;
      if (!relPath.split('/').every((p) => p && p !== '.' && p !== '..' && SAFE_SEG_RE.test(p))) continue;
      const localPath = path.join(scDir, relPath);
      let localSha = null;
      try {
        if (fs.existsSync(localPath) && fs.lstatSync(localPath).isFile()) {
          localSha = crypto.createHash('sha256').update(fs.readFileSync(localPath)).digest('hex');
        }
      } catch {}
      if (localSha !== expectedSha) {
        const buf = await httpsGetBuffer(`${RAW_SYNC_BASE}/plugins/${pName}/sidecars/${scId}/${relPath}`);
        if (crypto.createHash('sha256').update(buf).digest('hex') !== expectedSha) {
          throw new Error(`Hash mismatch on sidecar ${scId}/${relPath}`);
        }
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        const tmp = `${localPath}.tmp-${process.pid}`;
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, localPath);
        updatedFilesCount += 1;
        scChanged = true;
      }
    }
    if (scChanged) updatedSidecarIds.push(`${pName}/${scId}`);
  }

  const selfSidecarId = `${PLUGIN_NAME}/twin-vault-ui`;
  for (const fullScId of updatedSidecarIds) {
    if (fullScId !== selfSidecarId) {
      await callLanguageServerRpc('ManageSidecar', {
        sidecarId: fullScId,
        action: 'SIDECAR_ACTION_RESTART',
      });
    }
  }
  const reloadSelf = updatedSidecarIds.includes(selfSidecarId) || computeLocalUiSignature() !== BOOT_UI_SIGNATURE;
  if (reloadSelf) {
    setTimeout(() => {
      callLanguageServerRpc('ManageSidecar', {
        sidecarId: selfSidecarId,
        action: 'SIDECAR_ACTION_RESTART',
      });
    }, 350);
  }

  return {
    ok: true,
    suiteVersion: manifest.suiteVersion || '1.0.0',
    updatedFilesCount,
    updatedSidecarIds,
    reloadSelf,
  };
}

function resolveVault() {
  const root = getVaultRoot();
  if (!fs.existsSync(path.join(root, 'profile', 'identity.md'))) {
    initializeVault({ vaultDir: root, role: 'public-sector', seedDemo: true });
  }
  return root;
}

function lstatOrNull(targetPath) {
  try {
    return fs.lstatSync(targetPath);
  } catch {
    return null;
  }
}

function findNearestExistingAncestor(targetPath) {
  let current = path.dirname(targetPath);
  while (true) {
    if (lstatOrNull(current) !== null) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return current;
    }
    current = parent;
  }
}

function hasSymlinkUnderRoot(resolvedPath, rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const realRoot = fs.existsSync(resolvedRoot) ? fs.realpathSync(resolvedRoot) : resolvedRoot;
  const rootPrefixResolved = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  const rootPrefixReal = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  const baseRoot = resolvedPath.startsWith(rootPrefixResolved)
    ? resolvedRoot
    : resolvedPath.startsWith(rootPrefixReal)
      ? realRoot
      : null;
  if (!baseRoot) {
    return true;
  }

  const rootStat = lstatOrNull(baseRoot);
  if (!rootStat || rootStat.isSymbolicLink()) {
    return true;
  }

  const rel = path.relative(baseRoot, resolvedPath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return true;
  }

  let current = baseRoot;
  for (const segment of rel.split(path.sep)) {
    current = path.join(current, segment);
    const st = lstatOrNull(current);
    if (!st) {
      break;
    }
    if (st.isSymbolicLink()) {
      return true;
    }
  }
  return false;
}

function classifyAllowedPath(rawPath, vaultRoot) {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.includes('\0')) {
    return { allowed: false, writable: false, hasSymlink: false, extAllowed: false, resolved: '' };
  }

  const resolved = path.resolve(rawPath);
  const existingAncestor = findNearestExistingAncestor(resolved);
  let realAncestor;
  try {
    realAncestor = fs.realpathSync(existingAncestor);
  } catch {
    return { allowed: false, writable: false, hasSymlink: false, extAllowed: false, resolved };
  }

  const relFromAncestor = path.relative(existingAncestor, resolved);
  if (relFromAncestor.startsWith('..') || path.isAbsolute(relFromAncestor)) {
    return { allowed: false, writable: false, hasSymlink: false, extAllowed: false, resolved };
  }

  let realResolved = path.resolve(realAncestor, relFromAncestor);
  const targetLstat = lstatOrNull(resolved);
  if (targetLstat) {
    if (targetLstat.isSymbolicLink()) {
      try {
        realResolved = fs.realpathSync(resolved);
      } catch {
        return { allowed: false, writable: false, hasSymlink: true, extAllowed: false, resolved };
      }
    } else {
      realResolved = fs.realpathSync(resolved);
    }
  }

  const realVaultRoot = fs.realpathSync(vaultRoot);
  const vaultPrefix = realVaultRoot.endsWith(path.sep) ? realVaultRoot : realVaultRoot + path.sep;
  const ancestorInVault = realAncestor === realVaultRoot || realAncestor.startsWith(vaultPrefix);

  if (ancestorInVault && realResolved.startsWith(vaultPrefix)) {
    const hasSymlink = hasSymlinkUnderRoot(resolved, vaultRoot);
    const ext = path.extname(resolved).toLowerCase();
    const extAllowed = WRITABLE_EXTENSIONS.has(ext);
    return {
      allowed: !hasSymlink,
      writable: !hasSymlink && extAllowed,
      hasSymlink,
      extAllowed,
      rootId: 'vault',
      resolved,
      realResolved,
    };
  }

  if (fs.existsSync(PLUGINS_SUITE_ROOT)) {
    const realPluginsRoot = fs.realpathSync(PLUGINS_SUITE_ROOT);
    const pluginsPrefix = realPluginsRoot.endsWith(path.sep) ? realPluginsRoot : realPluginsRoot + path.sep;
    const ancestorInPlugins = realAncestor === realPluginsRoot || realAncestor.startsWith(pluginsPrefix);
    if (ancestorInPlugins && realResolved.startsWith(pluginsPrefix)) {
      const hasSymlink = hasSymlinkUnderRoot(resolved, PLUGINS_SUITE_ROOT);
      return {
        allowed: !hasSymlink,
        writable: false,
        hasSymlink,
        extAllowed: false,
        rootId: 'plugins',
        resolved,
        realResolved,
      };
    }
  }

  return { allowed: false, writable: false, hasSymlink: false, extAllowed: false, resolved };
}

const app = new SidecarApp();

app.page('/', () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'));

app.api(
  '/styles.css',
  () =>
    new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
      contentType: 'text/css; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/app.js',
  () =>
    new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
      contentType: 'application/javascript; charset=utf-8',
    }),
  'GET'
);

app.api(
  '/api/state',
  async () => {
    const vaultRoot = resolveVault();
    const state = getVaultState(vaultRoot);
    const pluginsTree = buildDirectoryTree(PLUGINS_SUITE_ROOT, PLUGINS_SUITE_ROOT);
    const skillsCatalog = buildSkillsCatalog(PLUGINS_SUITE_ROOT);
    const uiOutdated = computeLocalUiSignature() !== BOOT_UI_SIGNATURE;
    if (uiOutdated) {
      setTimeout(() => {
        callLanguageServerRpc('ManageSidecar', {
          sidecarId: `${PLUGIN_NAME}/twin-vault-ui`,
          action: 'SIDECAR_ACTION_RESTART',
        });
      }, 300);
    }
    return {
      ok: true,
      ...state,
      uiOutdated,
      skillsCatalog,
      presets: Object.values(ROLE_PRESETS).map((p) => ({
        id: p.id,
        label: p.label,
        defaultRoleTitle: p.defaultRoleTitle,
        defaultOrg: p.defaultOrg,
      })),
      roots: [
        {
          id: 'vault',
          label: 'Memory Vault',
          subtitle: '~/antigravity-twin/memory',
          writable: true,
          path: vaultRoot,
          tree: state.tree,
        },
        {
          id: 'plugins',
          label: 'Installed Plugins',
          subtitle: 'Skills, Rules & Automations (Read-Only View)',
          writable: false,
          path: PLUGINS_SUITE_ROOT,
          tree: pluginsTree,
        },
      ],
    };
  },
  'GET'
);

app.api(
  '/api/file',
  async (data) => {
    const vaultRoot = resolveVault();
    const check = classifyAllowedPath(data && data.path, vaultRoot);
    if (check.hasSymlink || !check.allowed) {
      return new Response(JSON.stringify({ ok: false, error: 'Path is outside allowed roots or contains a symlink' }), {
        contentType: 'application/json',
        status: 403,
      });
    }
    const lst = lstatOrNull(check.resolved);
    if (!lst || lst.isSymbolicLink() || !lst.isFile()) {
      return new Response(JSON.stringify({ ok: false, error: 'File not found' }), {
        contentType: 'application/json',
        status: 404,
      });
    }
    const stat = fs.statSync(check.resolved);
    if (stat.size > 2 * 1024 * 1024) {
      return new Response(JSON.stringify({ ok: false, error: 'File exceeds 2 MB viewer cap' }), {
        contentType: 'application/json',
        status: 413,
      });
    }
    const content = fs.readFileSync(check.resolved, 'utf-8');
    return {
      ok: true,
      path: check.resolved,
      name: path.basename(check.resolved),
      rootId: check.rootId,
      writable: check.writable,
      size: stat.size,
      modifiedIso: stat.mtime.toISOString(),
      content,
    };
  },
  'GET'
);

app.api('/api/file', async (data) => {
  const vaultRoot = resolveVault();
  const check = classifyAllowedPath(data && data.path, vaultRoot);
  if (check.hasSymlink) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Symbolic links are not permitted in the Memory Vault' }),
      { contentType: 'application/json', status: 403 }
    );
  }
  if (!check.allowed || check.rootId !== 'vault') {
    return new Response(
      JSON.stringify({ ok: false, error: 'Write access is restricted to the Memory Vault directory' }),
      { contentType: 'application/json', status: 403 }
    );
  }
  const ext = path.extname(check.resolved).toLowerCase();
  if (!WRITABLE_EXTENSIONS.has(ext) || !check.writable) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Writable file extensions are restricted to .md, .json, .txt, .yaml, and .yml',
      }),
      { contentType: 'application/json', status: 403 }
    );
  }

  const existingLstat = lstatOrNull(check.resolved);
  if (existingLstat && (existingLstat.isSymbolicLink() || existingLstat.isDirectory())) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Target path is not a writable regular file' }),
      { contentType: 'application/json', status: 403 }
    );
  }

  const content = typeof (data && data.content) === 'string' ? data.content : '';
  if (Buffer.byteLength(content, 'utf-8') > 2 * 1024 * 1024) {
    return new Response(JSON.stringify({ ok: false, error: 'Payload too large' }), {
      contentType: 'application/json',
      status: 413,
    });
  }

  fs.mkdirSync(path.dirname(check.resolved), { recursive: true });
  if (hasSymlinkUnderRoot(check.resolved, vaultRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Symbolic links are not permitted in ancestor directories' }),
      { contentType: 'application/json', status: 403 }
    );
  }

  const tmpPath = `${check.resolved}.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, check.resolved);
  const stat = fs.statSync(check.resolved);
  return {
    ok: true,
    path: check.resolved,
    size: stat.size,
    modifiedIso: stat.mtime.toISOString(),
    state: getVaultState(vaultRoot),
  };
});

app.api('/api/gtd/toggle', async (data) => {
  const vaultRoot = resolveVault();
  return toggleGtdTask(vaultRoot, {
    lineNumber: data && data.lineNumber ? Number(data.lineNumber) : undefined,
    rawMatch: data && data.rawMatch ? String(data.rawMatch) : undefined,
  });
});

app.api('/api/gtd/add', async (data) => {
  const vaultRoot = resolveVault();
  return addGtdTask(vaultRoot, {
    initiative: data && data.initiative ? String(data.initiative) : 'General',
    task: data && data.task ? String(data.task) : '',
    priority: data && data.priority ? String(data.priority) : 'P0',
    owner: data && data.owner ? String(data.owner) : 'Me',
  });
});

app.api('/api/initiatives/create', async (data) => {
  const vaultRoot = resolveVault();
  const res = createOrUpdateInitiative(vaultRoot, {
    slug: data && data.slug ? String(data.slug) : '',
    title: data && data.title ? String(data.title) : 'New Initiative',
    rag: data && data.rag ? String(data.rag) : 'GREEN',
    milestone: data && data.milestone ? String(data.milestone) : 'TBD',
    summary: data && data.summary ? String(data.summary) : '',
    force: true,
  });
  return {
    ok: true,
    initiative: res,
    state: getVaultState(vaultRoot),
  };
});

app.api('/api/contacts/touch', async (data) => {
  const vaultRoot = resolveVault();
  return touchContact(vaultRoot, {
    name: data && data.name ? String(data.name) : '',
    date: data && data.date ? String(data.date) : '',
  });
});

app.api('/api/vault/init', async (data) => {
  const vaultRoot = getVaultRoot();
  const res = initializeVault({
    vaultDir: vaultRoot,
    role: data && data.role ? String(data.role) : 'pm',
    name: data && data.name ? String(data.name) : '',
    roleTitle: data && data.roleTitle ? String(data.roleTitle) : '',
    org: data && data.org ? String(data.org) : '',
    timezone: data && data.timezone ? String(data.timezone) : '',
    seedDemo: data && data.seedDemo !== undefined ? Boolean(data.seedDemo) : true,
    force: true,
  });
  return res;
});

app.api('/api/sync-updates', async () => {
  return syncSuiteFromGithub();
});

await app.run();
