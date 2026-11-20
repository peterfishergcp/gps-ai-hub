#!/usr/bin/env node
/**
 * Twin Second Brain & Markdown Vault Sidecar Backend (`main.mjs`)
 *
 * Runs natively on Antigravity Desktop's built-in Node runtime via `sidecar_sdk`
 * (zero npm packages or external Python installs required).
 * 100% User-Driven Refresh — zero automatic sidecar restarts or background reloads.
 */

import fs from 'node:fs';
import os from 'node:os';
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
const SUITE_MODE = PLUGIN_NAME === 'agy-twin-memory' ? 'twin-kit' : 'generic';
const DEFAULT_ROLE = SUITE_MODE === 'twin-kit' ? 'pm' : 'public-sector';
const WRITABLE_EXTENSIONS = new Set(['.md', '.json', '.txt', '.yaml', '.yml']);
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const SAFE_SKILL_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,62}$/;
const MAX_FORK_BYTES = 5 * 1024 * 1024;

function getPersonalSkillsRoot() {
  const custom = process.env.ANTIGRAVITY_PERSONAL_SKILLS_DIR;
  if (custom && custom.trim()) {
    return path.resolve(custom.trim());
  }
  return path.join(os.homedir(), '.gemini', 'config', 'skills');
}

function resolveVault() {
  const root = getVaultRoot();
  if (!fs.existsSync(path.join(root, 'profile', 'identity.md'))) {
    initializeVault({ vaultDir: root, role: DEFAULT_ROLE, seedDemo: true });
  }
  return root;
}

function getCustomSeedsPath(vaultRoot) {
  return path.join(vaultRoot, 'profile', 'custom_seeds.json');
}

function readCustomSeeds(vaultRoot) {
  const p = getCustomSeedsPath(vaultRoot);
  try {
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch {}
  return {};
}

function writeCustomSeeds(vaultRoot, seedsObj) {
  const p = getCustomSeedsPath(vaultRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(seedsObj, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, p);
}

function loadCatalogForState(vaultRoot) {
  const personalRoot = getPersonalSkillsRoot();
  const customSeedsMap = readCustomSeeds(vaultRoot);
  return buildSkillsCatalog(PLUGINS_SUITE_ROOT, {
    personalSkillsRoot: personalRoot,
    customSeedsMap,
    suiteMode: SUITE_MODE,
  });
}

function buildManagedPersonalSkillsTree(personalRoot) {
  if (!personalRoot || !fs.existsSync(personalRoot)) return [];
  let dirs = [];
  try {
    dirs = fs
      .readdirSync(personalRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
  const nodes = [];
  for (const name of dirs) {
    const sDir = path.join(personalRoot, name);
    if (!fs.existsSync(path.join(sDir, '.twin-skill-meta.json'))) continue;
    const children = buildDirectoryTree(sDir, personalRoot);
    nodes.push({
      name,
      type: 'dir',
      path: sDir,
      relPath: name,
      children,
    });
  }
  return nodes;
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
  if (!fs.existsSync(resolvedRoot)) {
    return false;
  }
  const realRoot = fs.realpathSync(resolvedRoot);
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

  const personalRoot = getPersonalSkillsRoot();
  if (fs.existsSync(personalRoot)) {
    const realPersonalRoot = fs.realpathSync(personalRoot);
    const personalPrefix = realPersonalRoot.endsWith(path.sep) ? realPersonalRoot : realPersonalRoot + path.sep;
    const ancestorInPersonal = realAncestor === realPersonalRoot || realAncestor.startsWith(personalPrefix);
    if (ancestorInPersonal && realResolved.startsWith(personalPrefix)) {
      const hasSymlink = hasSymlinkUnderRoot(resolved, personalRoot);
      const ext = path.extname(resolved).toLowerCase();
      const extAllowed = WRITABLE_EXTENSIONS.has(ext);
      return {
        allowed: !hasSymlink,
        writable: !hasSymlink && extAllowed,
        hasSymlink,
        extAllowed,
        rootId: 'my-skills',
        resolved,
        realResolved,
      };
    }
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

function rewriteSkillFrontmatterName(markdownText, newSlug) {
  const raw = String(markdownText || '');
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
    fs.mkdirSync(curDest, { recursive: true });
    const entries = fs.readdirSync(curSrc, { withFileTypes: true });
    for (const entry of entries) {
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
          fs.writeFileSync(destPath, rewritten, 'utf-8');
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    }
  }

  walkAndCopy(srcDir, destDir, true);
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
    const personalRoot = getPersonalSkillsRoot();
    const personalTree = buildManagedPersonalSkillsTree(personalRoot);
    const pluginsTree = buildDirectoryTree(PLUGINS_SUITE_ROOT, PLUGINS_SUITE_ROOT);
    const skillsCatalog = loadCatalogForState(vaultRoot);
    return {
      ok: true,
      ...state,
      personalSkillsRoot: personalRoot,
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
          id: 'my-skills',
          label: '★ My Custom Skills',
          subtitle: '~/.gemini/config/skills (Editable & Update-Proof)',
          writable: true,
          path: personalRoot,
          tree: personalTree,
        },
        {
          id: 'plugins',
          label: 'Installed Plugins',
          subtitle: 'Stock Suite Skills & Rules (Read-Only)',
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
      JSON.stringify({ ok: false, error: 'Symbolic links are not permitted' }),
      { contentType: 'application/json', status: 403 }
    );
  }
  if (!check.allowed || (check.rootId !== 'vault' && check.rootId !== 'my-skills')) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Write access is restricted to Memory Vault and ★ My Custom Skills' }),
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

  const targetRoot = check.rootId === 'my-skills' ? getPersonalSkillsRoot() : vaultRoot;
  fs.mkdirSync(path.dirname(check.resolved), { recursive: true });
  if (hasSymlinkUnderRoot(check.resolved, targetRoot)) {
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
    skillsCatalog: loadCatalogForState(vaultRoot),
  };
});

app.api('/api/skills/fork', async (data) => {
  const vaultRoot = resolveVault();
  const personalRoot = getPersonalSkillsRoot();
  const sourcePlugin = String((data && data.sourcePlugin) || '').trim();
  const sourceSkillId = String((data && data.sourceSkillId) || '').trim();
  const rawTargetSlug = String((data && data.targetSlug) || '')
    .trim()
    .replace(/^\/+/, '')
    .toLowerCase();
  const overwrite = Boolean(data && data.overwrite);

  if (!SAFE_ID_RE.test(sourcePlugin) || !SAFE_SKILL_SLUG_RE.test(sourceSkillId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid source skill identifier' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  if (!SAFE_SKILL_SLUG_RE.test(rawTargetSlug)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'New skill command must be 2–63 lowercase letters, numbers, or hyphens (e.g. slides-exec)',
      }),
      { contentType: 'application/json', status: 400 }
    );
  }

  const srcDir =
    sourcePlugin === 'my-skills'
      ? path.join(personalRoot, sourceSkillId)
      : path.join(PLUGINS_SUITE_ROOT, sourcePlugin, 'skills', sourceSkillId);
  const srcRoot = sourcePlugin === 'my-skills' ? personalRoot : PLUGINS_SUITE_ROOT;

  if (!fs.existsSync(srcDir) || hasSymlinkUnderRoot(srcDir, srcRoot)) {
    return new Response(JSON.stringify({ ok: false, error: 'Source skill directory not found' }), {
      contentType: 'application/json',
      status: 404,
    });
  }

  fs.mkdirSync(personalRoot, { recursive: true, mode: 0o700 });
  const personalStat = lstatOrNull(personalRoot);
  if (!personalStat || personalStat.isSymbolicLink()) {
    return new Response(JSON.stringify({ ok: false, error: 'Personal skills root cannot be a symbolic link' }), {
      contentType: 'application/json',
      status: 403,
    });
  }

  const destDir = path.join(personalRoot, rawTargetSlug);
  if (fs.existsSync(destDir)) {
    const hasManagedMarker = fs.existsSync(path.join(destDir, '.twin-skill-meta.json'));
    if (!overwrite) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `/${rawTargetSlug} already exists in ~/.gemini/config/skills/. Pick another name or enable Replace Existing Copy.`,
        }),
        { contentType: 'application/json', status: 409 }
      );
    }
    if (!hasManagedMarker) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Refusing to overwrite pre-existing global skill /${rawTargetSlug} that was not created by Save My Copy.`,
        }),
        { contentType: 'application/json', status: 409 }
      );
    }
    if (hasSymlinkUnderRoot(destDir, personalRoot)) {
      return new Response(JSON.stringify({ ok: false, error: 'Refusing symlinked destination skill path' }), {
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

  const metaPayload = {
    slug: rawTargetSlug,
    forkedFrom: sourceSkillId,
    sourcePlugin,
    mode,
    title: customTitle,
    subtitle: customSubtitle,
    seedPrompt: normalizedSeed,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  fs.writeFileSync(path.join(destDir, '.twin-skill-meta.json'), JSON.stringify(metaPayload, null, 2) + '\n', 'utf-8');

  const seeds = readCustomSeeds(vaultRoot);
  seeds[rawTargetSlug] = {
    seedPrompt: normalizedSeed,
    title: customTitle,
    subtitle: customSubtitle,
    isPersonalCopy: true,
    updatedAt: nowIso,
  };
  writeCustomSeeds(vaultRoot, seeds);

  return {
    ok: true,
    slug: rawTargetSlug,
    command: `/${rawTargetSlug}`,
    mode,
    skillMdPath: path.join(destDir, 'SKILL.md'),
    skillsCatalog: loadCatalogForState(vaultRoot),
  };
});

app.api('/api/skills/save-seed', async (data) => {
  const vaultRoot = resolveVault();
  const skillId = String((data && data.skillId) || '').trim().replace(/^\/+/, '');
  if (!SAFE_SKILL_SLUG_RE.test(skillId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid skill ID' }), {
      contentType: 'application/json',
      status: 400,
    });
  }

  const seeds = readCustomSeeds(vaultRoot);
  if (data && data.reset) {
    if (seeds[skillId] && seeds[skillId].isPersonalCopy) {
      delete seeds[skillId].seedPrompt;
    } else {
      delete seeds[skillId];
    }
  } else {
    const promptText = String((data && data.seedPrompt) || '').trim();
    if (!promptText) {
      return new Response(JSON.stringify({ ok: false, error: 'Seed prompt cannot be empty' }), {
        contentType: 'application/json',
        status: 400,
      });
    }
    const existing = seeds[skillId] || {};
    seeds[skillId] = {
      ...existing,
      seedPrompt: promptText,
      updatedAt: new Date().toISOString(),
    };
  }
  writeCustomSeeds(vaultRoot, seeds);
  return {
    ok: true,
    skillId,
    skillsCatalog: loadCatalogForState(vaultRoot),
  };
});

app.api('/api/skills/delete-copy', async (data) => {
  const vaultRoot = resolveVault();
  const personalRoot = getPersonalSkillsRoot();
  const slug = String((data && data.slug) || '').trim().replace(/^\/+/, '');
  if (!SAFE_SKILL_SLUG_RE.test(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid personal skill slug' }), {
      contentType: 'application/json',
      status: 400,
    });
  }

  const targetDir = path.join(personalRoot, slug);
  const markerPath = path.join(targetDir, '.twin-skill-meta.json');
  if (!fs.existsSync(targetDir) || !fs.existsSync(markerPath) || hasSymlinkUnderRoot(targetDir, personalRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Only personal copies created via Save My Copy can be removed here' }),
      { contentType: 'application/json', status: 403 }
    );
  }

  fs.rmSync(targetDir, { recursive: true, force: false });
  const seeds = readCustomSeeds(vaultRoot);
  delete seeds[slug];
  writeCustomSeeds(vaultRoot, seeds);

  return {
    ok: true,
    slug,
    skillsCatalog: loadCatalogForState(vaultRoot),
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
    role: data && data.role ? String(data.role) : DEFAULT_ROLE,
    name: data && data.name ? String(data.name) : '',
    roleTitle: data && data.roleTitle ? String(data.roleTitle) : '',
    org: data && data.org ? String(data.org) : '',
    timezone: data && data.timezone ? String(data.timezone) : '',
    seedDemo: data && data.seedDemo !== undefined ? Boolean(data.seedDemo) : true,
    force: true,
  });
  return res;
});

await app.run();
