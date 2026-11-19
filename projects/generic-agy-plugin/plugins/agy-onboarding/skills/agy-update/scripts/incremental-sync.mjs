#!/usr/bin/env node
/**
 * Public Sector — Zero-Git Incremental Skill & Plugin Updater (`incremental-sync.mjs`)
 *
 * Solves the "full re-install" problem:
 * - Runs on Antigravity's built-in Node runtime over HTTPS 443 (ZERO `git`, `python`, or `unzip` required).
 * - Fetches `version-manifest.json` from `https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin/version-manifest.json`.
 * - Compares SHA-256 hashes of every local skill file against `skillManifest`.
 * - Downloads ONLY new or modified files (or a single `--skill <id>` target), preserving unchanged plugins,
 *   user skill toggle states (`SKILL.md.disabled` / `skill-toggles.json`), and `ge-instance.json`.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/generic-agy-plugin';
const SAFE_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function parseArgs(argv) {
  let skillFilter = '';
  let checkOnly = false;
  let jsonOutput = false;
  let rawBase = process.env.AGY_SUITE_RAW_BASE || DEFAULT_RAW_BASE;
  let configDir = path.join(os.homedir(), '.gemini', 'config');

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--skill' && argv[i + 1]) skillFilter = argv[++i].trim().replace(/^\//, '');
    else if (argv[i] === '--check') checkOnly = true;
    else if (argv[i] === '--json') jsonOutput = true;
    else if (argv[i] === '--raw-base' && argv[i + 1]) rawBase = argv[++i].replace(/\/+$/, '');
    else if (argv[i] === '--config-dir' && argv[i + 1]) configDir = path.resolve(argv[++i]);
  }
  return { skillFilter, checkOnly, jsonOutput, rawBase, configDir };
}

function isSafeRelPath(relPath) {
  if (!relPath || typeof relPath !== 'string' || relPath.startsWith('/') || relPath.includes('\\')) {
    return false;
  }
  const parts = relPath.split('/');
  return parts.every((p) => p.length > 0 && p !== '.' && p !== '..' && SAFE_SEGMENT_RE.test(p));
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function sha256FileIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const st = fs.lstatSync(filePath);
    if (st.isSymbolicLink() || !st.isFile()) return null;
    return sha256Buffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

function httpsGetBuffer(urlStr, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') {
      reject(new Error(`Refusing non-HTTPS URL: ${urlStr}`));
      return;
    }
    const req = https.get(
      u,
      {
        headers: {
          'User-Agent': 'Generic-AGY-Plugin-Incremental-Updater/1.3',
          Accept: '*/*'
        },
        timeout: 12000
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          resolve(httpsGetBuffer(nextUrl, redirectsLeft - 1));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} fetching ${urlStr}`));
          return;
        }
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          total += chunk.length;
          if (total > 5 * 1024 * 1024) {
            req.destroy(new Error('Response exceeded 5 MB safety cap'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${urlStr}`));
    });
  });
}

export async function runIncrementalSync({ skillFilter = '', checkOnly = false, rawBase = DEFAULT_RAW_BASE, configDir = path.join(os.homedir(), '.gemini', 'config') } = {}) {
  const manifestUrl = `${rawBase}/version-manifest.json`;
  const manifestBuf = await httpsGetBuffer(manifestUrl);
  const manifest = JSON.parse(manifestBuf.toString('utf-8'));
  const skillManifest = manifest.skillManifest || {};
  const pluginsRoot = path.join(configDir, 'plugins');

  const targetSkills = Object.keys(skillManifest).filter((sId) => !skillFilter || sId === skillFilter);
  if (skillFilter && targetSkills.length === 0) {
    throw new Error(`Skill "${skillFilter}" not found in remote version-manifest.json (available: ${Object.keys(skillManifest).join(', ')})`);
  }

  const results = [];
  let updatedSkillsCount = 0;
  let updatedFilesCount = 0;

  for (const skillId of targetSkills) {
    const entry = skillManifest[skillId];
    const pluginName = entry.plugin;
    if (!SAFE_SEGMENT_RE.test(pluginName) || !SAFE_SEGMENT_RE.test(skillId)) continue;

    const skillDir = path.join(pluginsRoot, pluginName, 'skills', skillId);
    const isDisabledOnDisk =
      !fs.existsSync(path.join(skillDir, 'SKILL.md')) &&
      fs.existsSync(path.join(skillDir, 'SKILL.md.disabled'));

    const filesMap = entry.files || {};
    const changedFiles = [];

    for (const [relPath, expectedSha] of Object.entries(filesMap)) {
      if (!isSafeRelPath(relPath)) continue;
      const diskRelPath = relPath === 'SKILL.md' && isDisabledOnDisk ? 'SKILL.md.disabled' : relPath;
      const localPath = path.join(skillDir, diskRelPath);
      const localSha = sha256FileIfExists(localPath);

      if (localSha !== expectedSha) {
        changedFiles.push({ relPath, diskRelPath, localPath, expectedSha, isNew: localSha === null });
      }
    }

    if (changedFiles.length > 0 && !checkOnly) {
      for (const cf of changedFiles) {
        const fileUrl = `${rawBase}/plugins/${pluginName}/skills/${skillId}/${cf.relPath}`;
        const buf = await httpsGetBuffer(fileUrl);
        const actualSha = sha256Buffer(buf);
        if (actualSha !== cf.expectedSha) {
          throw new Error(`SHA-256 mismatch on ${skillId}/${cf.relPath}: expected ${cf.expectedSha}, got ${actualSha}`);
        }
        fs.mkdirSync(path.dirname(cf.localPath), { recursive: true });
        const tmpPath = `${cf.localPath}.tmp-${process.pid}`;
        fs.writeFileSync(tmpPath, buf);
        if (cf.relPath.endsWith('.sh') || cf.relPath.endsWith('.mjs') || cf.relPath.endsWith('.py')) {
          try { fs.chmodSync(tmpPath, 0o755); } catch {}
        }
        fs.renameSync(tmpPath, cf.localPath);
        updatedFilesCount += 1;
      }
      updatedSkillsCount += 1;
    } else if (changedFiles.length > 0 && checkOnly) {
      updatedSkillsCount += 1;
      updatedFilesCount += changedFiles.length;
    }

    results.push({
      skill: skillId,
      plugin: pluginName,
      status: changedFiles.length === 0 ? 'up-to-date' : checkOnly ? 'update-available' : 'updated',
      changedFiles: changedFiles.map((c) => c.relPath)
    });
  }

  // Also sync sidecars (agy-skill-manager & agy-design-preview) when running a full suite sync (!skillFilter)
  const sidecarManifest = manifest.sidecarManifest || {};
  if (!skillFilter) {
    for (const [scId, scEntry] of Object.entries(sidecarManifest)) {
      const pluginName = scEntry.plugin;
      if (!SAFE_SEGMENT_RE.test(pluginName) || !SAFE_SEGMENT_RE.test(scId)) continue;
      const scDir = path.join(pluginsRoot, pluginName, 'sidecars', scId);
      for (const [relPath, expectedSha] of Object.entries(scEntry.files || {})) {
        if (!isSafeRelPath(relPath)) continue;
        const localPath = path.join(scDir, relPath);
        const localSha = sha256FileIfExists(localPath);
        if (localSha !== expectedSha) {
          if (!checkOnly) {
            const buf = await httpsGetBuffer(`${rawBase}/plugins/${pluginName}/sidecars/${scId}/${relPath}`);
            if (sha256Buffer(buf) !== expectedSha) {
              throw new Error(`SHA-256 mismatch on sidecar ${scId}/${relPath}`);
            }
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            const tmpPath = `${localPath}.tmp-${process.pid}`;
            fs.writeFileSync(tmpPath, buf);
            fs.renameSync(tmpPath, localPath);
          }
          updatedFilesCount += 1;
        }
      }
    }
  }

  return {
    ok: true,
    suiteVersion: manifest.suiteVersion || 'unknown',
    checkOnly,
    skillFilter: skillFilter || 'all',
    checkedSkillsCount: targetSkills.length,
    updatedSkillsCount,
    updatedFilesCount,
    skills: results
  };
}

async function cliMain() {
  const opts = parseArgs(process.argv);
  try {
    const summary = await runIncrementalSync(opts);
    if (opts.jsonOutput) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }
    const modeLabel = summary.checkOnly ? 'Check Only' : 'Incremental Sync';
    console.log(`=== Generic AGY Plugin ${modeLabel} (Remote v${summary.suiteVersion}) ===`);
    console.log(`Skills Checked: ${summary.checkedSkillsCount} | Skills ${summary.checkOnly ? 'With Updates' : 'Updated'}: ${summary.updatedSkillsCount} | Files ${summary.checkOnly ? 'Changed' : 'Downloaded'}: ${summary.updatedFilesCount}`);
    for (const s of summary.skills) {
      if (s.changedFiles.length > 0) {
        console.log(`  ↻ /${s.skill} (${s.plugin}): ${s.status} -> [${s.changedFiles.join(', ')}]`);
      }
    }
    if (summary.updatedSkillsCount === 0) {
      console.log('  ✓ All checked skills match the latest remote SHA-256 hashes (0 files downloaded).');
    } else if (!summary.checkOnly) {
      console.log('  ✓ Incremental update complete (preserved user skill toggles & GE instance settings).');
    }
  } catch (err) {
    console.error(`Incremental sync error: ${err.message || err}`);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  cliMain();
}
