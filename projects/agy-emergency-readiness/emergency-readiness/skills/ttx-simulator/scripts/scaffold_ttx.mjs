#!/usr/bin/env node
/**
 * Zero-dependency HSEEP Tabletop & Crisis Simulator Scaffolder & Verifier.
 * Uses exclusively Node.js built-in modules (node:fs, node:path, node:crypto, node:url)
 * and function-callback .replace(target, () => replacement) so '$' characters in
 * JSON/JS/CSS payloads are never corrupted.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(SKILL_ROOT, 'assets', 'templates');
const RUNTIME_DIR = path.join(SKILL_ROOT, 'assets', 'runtime');
const REFERENCES_DIR = path.join(SKILL_ROOT, 'references');

function parseArgs(argv) {
  const opts = {
    target: '',
    template: 'wv-operation-winter-gorge',
    county: '',
    force: false,
    sync: false,
    verifyOnly: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target' && argv[i + 1]) {
      opts.target = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--target=')) {
      opts.target = arg.slice('--target='.length);
    } else if (arg === '--template' && argv[i + 1]) {
      opts.template = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--template=')) {
      opts.template = arg.slice('--template='.length);
    } else if (arg === '--county' && argv[i + 1]) {
      opts.county = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--county=')) {
      opts.county = arg.slice('--county='.length);
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--sync') {
      opts.sync = true;
    } else if (arg === '--verify') {
      opts.verifyOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  return opts;
}

function printUsage() {
  console.log([
    'Usage: node scaffold_ttx.mjs --target <dir> [options]',
    '',
    'Options:',
    '  --target <dir>       Target output directory for TTX files (required)',
    '  --template <name>    Scenario template id (default: wv-operation-winter-gorge)',
    '  --county <name>      Override default WV county (any of 55 WV counties or "Anonymized WV Valley Town")',
    '  --sync               Re-bundle index.html and ttx-standalone.html from existing ttx.config.json',
    '  --verify             Run deterministic ERG 2024 & WV statutory checks on ttx.config.json',
    '  --force              Overwrite existing ttx.config.json from template'
  ].join('\n'));
}

function safeWriteWithinBoundary(baseDir, fileName, content) {
  const cleanName = path.basename(fileName);
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, cleanName);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('Security boundary violation: target file escaped project root.');
  }
  fs.writeFileSync(resolvedTarget, content, 'utf8');
  return resolvedTarget;
}

function resolveTemplatePath(templateInput) {
  const sanitized = path.basename(String(templateInput || '')).replace(/[^a-zA-Z0-9_-]/g, () => '');
  if (!sanitized) {
    throw new Error('Invalid template identifier.');
  }
  const resolvedTemplatesRoot = path.resolve(TEMPLATES_DIR);
  const candidate = path.resolve(resolvedTemplatesRoot, `${sanitized}.json`);
  if (!candidate.startsWith(resolvedTemplatesRoot + path.sep)) {
    throw new Error('Security boundary violation: template path outside templates directory.');
  }
  if (!fs.existsSync(candidate)) {
    throw new Error(`Template not found: ${sanitized}.json`);
  }
  return candidate;
}

function verifyConfigDeterministically(config) {
  const findings = [];
  const verifierPath = path.join(REFERENCES_DIR, 'erg2024_and_wv_code_verifier.json');
  const countiesPath = path.join(REFERENCES_DIR, 'wv_55_counties_crosswalk.json');

  const verifier = JSON.parse(fs.readFileSync(verifierPath, 'utf8'));
  const counties = JSON.parse(fs.readFileSync(countiesPath, 'utf8'));

  // 1. Verify all 55 West Virginia counties are present in jurisdictions
  const jurNames = new Set((config.jurisdictions || []).map((j) => j.county));
  for (const c of counties) {
    if (!jurNames.has(c.county)) {
      findings.push(`Missing WV county in jurisdictions crosswalk: ${c.county}`);
    }
  }

  // 2. Verify defaultCounty exists in jurisdictions
  const defCounty = config.meta && config.meta.defaultCounty;
  if (!defCounty || !jurNames.has(defCounty)) {
    findings.push(`meta.defaultCounty "${defCounty}" is not present in config.jurisdictions.`);
  }

  // 3. Verify ERG 2024 Hazmat Profile against authoritative erg2024 table
  const haz = config.meta && config.meta.hazmatProfile;
  if (haz && haz.un) {
    const ergMatch = (verifier.erg2024 || []).find((entry) => entry.un === haz.un);
    if (!ergMatch) {
      findings.push(`Hazmat UN "${haz.un}" not found in erg2024_and_wv_code_verifier.json.`);
    } else {
      if (String(haz.guide) !== String(ergMatch.guide)) {
        findings.push(
          `ERG Guide mismatch for ${haz.un}: config has "${haz.guide}", expected "${ergMatch.guide}".`
        );
      }
      const isLarge = Number(haz.releaseQuantityLb || 0) >= 500 || /large/i.test(String(haz.spillCategory || ''));
      const expectedIso = isLarge ? ergMatch.largeIsolationFt : ergMatch.smallIsolationFt;
      const expectedDay = isLarge ? ergMatch.largeDownwindDayMi : ergMatch.smallDownwindDayMi;
      const expectedNight = isLarge ? ergMatch.largeDownwindNightMi : ergMatch.smallDownwindNightMi;

      if (Number(haz.initialIsolationFt) !== Number(expectedIso)) {
        findings.push(
          `ERG 2024 isolation mismatch for ${haz.un}: config=${haz.initialIsolationFt} ft, expected=${expectedIso} ft.`
        );
      }
      if (Number(haz.downwindDayMi) !== Number(expectedDay)) {
        findings.push(
          `ERG 2024 daytime downwind mismatch for ${haz.un}: config=${haz.downwindDayMi} mi, expected=${expectedDay} mi.`
        );
      }
      if (Number(haz.downwindNightMi) !== Number(expectedNight)) {
        findings.push(
          `ERG 2024 nighttime downwind mismatch for ${haz.un}: config=${haz.downwindNightMi} mi, expected=${expectedNight} mi.`
        );
      }
    }
  }

  // 4. Verify Roles, Resources, and Timed Injects completeness
  if (!Array.isArray(config.roles) || config.roles.length < 2) {
    findings.push('Expected at least 2 Fog-of-War agency roles in config.roles.');
  }
  if (!Array.isArray(config.resources) || config.resources.length < 4) {
    findings.push('Expected dispatchable WV units in config.resources.');
  }
  if (!Array.isArray(config.injects) || config.injects.length < 1) {
    findings.push('Expected timed multi-domain injects in config.injects.');
  } else {
    for (const inj of config.injects) {
      const hasRecommended = (inj.options || []).some((o) => o.grade === 'RECOMMENDED');
      if (!hasRecommended) {
        findings.push(`Inject ${inj.id} lacks a RECOMMENDED option.`);
      }
    }
  }

  return {
    passed: findings.length === 0,
    findings,
    checkedJurisdictions: (config.jurisdictions || []).length,
    checkedInjects: (config.injects || []).length,
    checkedUnits: (config.resources || []).length
  };
}

function sha256Base64(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('base64');
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.target) {
    printUsage();
    process.exit(1);
  }

  const targetDir = path.resolve(opts.target);
  fs.mkdirSync(targetDir, { recursive: true });

  const configPath = path.resolve(targetDir, 'ttx.config.json');
  if (!configPath.startsWith(targetDir + path.sep)) {
    throw new Error('Invalid target directory.');
  }

  let configObj;
  if (opts.verifyOnly) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot --verify: ${configPath} does not exist.`);
    }
    configObj = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const report = verifyConfigDeterministically(configObj);
    if (!report.passed) {
      console.error('TTX Deterministic Verification FAILED:', report.findings);
      process.exit(2);
    }
    console.log(
      `TTX Deterministic Verification PASSED (${report.checkedJurisdictions} jurisdictions, ${report.checkedUnits} units, ${report.checkedInjects} injects).`
    );
    return;
  }

  if (opts.sync) {
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot --sync: ${configPath} not found. Run without --sync first.`);
    }
    configObj = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else if (fs.existsSync(configPath) && !opts.force) {
    console.log(`Preserving existing ttx.config.json at ${configPath} (pass --force to overwrite).`);
    configObj = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    const templateFile = resolveTemplatePath(opts.template);
    configObj = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
  }

  if (opts.county) {
    const matched = (configObj.jurisdictions || []).find(
      (j) => j.county.toLowerCase() === opts.county.trim().toLowerCase()
    );
    if (!matched) {
      throw new Error(`Unknown WV county "${opts.county}". Expected one of 55 WV counties or "Anonymized WV Valley Town".`);
    }
    configObj.meta.defaultCounty = matched.county;
  }

  const verification = verifyConfigDeterministically(configObj);
  if (!verification.passed) {
    console.error('ERG 2024 / WV Statutory Verification FAILED:');
    for (const f of verification.findings) {
      console.error('  -', f);
    }
    process.exit(2);
  }

  // Persist formatted ttx.config.json
  safeWriteWithinBoundary(targetDir, 'ttx.config.json', JSON.stringify(configObj, null, 2) + '\n');

  // Read clean runtime sources
  const htmlTemplate = fs.readFileSync(path.join(RUNTIME_DIR, 'index.html'), 'utf8');
  const cssContent = fs.readFileSync(path.join(RUNTIME_DIR, 'styles.css'), 'utf8');
  const jsContent = fs.readFileSync(path.join(RUNTIME_DIR, 'app.js'), 'utf8');

  // Escape '<' inside JSON block so '</script>' can never break out
  const safeJson = JSON.stringify(configObj).replace(/</g, () => '\\u003c');

  // 1. Write multi-file runtime assets (styles.css, app.js, index.html)
  safeWriteWithinBoundary(targetDir, 'styles.css', cssContent);
  safeWriteWithinBoundary(targetDir, 'app.js', jsContent);

  const localCspMeta =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' data: blob:; connect-src \'self\'; base-uri \'none\'; form-action \'none\';">';

  const multiFileHtml = htmlTemplate
    .replace('<!-- __CSP_META__ -->', () => localCspMeta)
    .replace('<!-- __STYLES_TAG__ -->', () => '<link rel="stylesheet" href="./styles.css">')
    .replace('<!-- __CONFIG_SCRIPT__ -->', () => `<script id="ttx-config-data" type="application/json">${safeJson}</script>`)
    .replace('<!-- __APP_SCRIPT__ -->', () => '<script src="./app.js"></script>');

  safeWriteWithinBoundary(targetDir, 'index.html', multiFileHtml);

  // 2. Write self-contained serverless offline bundle (ttx-standalone.html) with SHA-256 CSP hashes
  const styleHash = sha256Base64(cssContent);
  const scriptHash = sha256Base64(jsContent);
  const standaloneCspMeta =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; img-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';">`;

  const standaloneHtml = htmlTemplate
    .replace('<!-- __CSP_META__ -->', () => standaloneCspMeta)
    .replace('<!-- __STYLES_TAG__ -->', () => `<style id="ttx-inline-styles">${cssContent}</style>`)
    .replace('<!-- __CONFIG_SCRIPT__ -->', () => `<script id="ttx-config-data" type="application/json">${safeJson}</script>`)
    .replace('<!-- __APP_SCRIPT__ -->', () => `<script id="ttx-inline-script">${jsContent}</script>`);

  const standalonePath = safeWriteWithinBoundary(targetDir, 'ttx-standalone.html', standaloneHtml);

  console.log([
    `Scaffolded WV HSEEP TTX Simulator -> ${targetDir}`,
    `  Default Jurisdiction : ${configObj.meta.defaultCounty} (${verification.checkedJurisdictions} WV options verified)`,
    `  ERG 2024 & Statutes  : PASS (${configObj.meta.hazmatProfile.un} Guide ${configObj.meta.hazmatProfile.guide}, ${verification.checkedInjects} injects, ${verification.checkedUnits} units)`,
    `  Standalone Artifact  : ${standalonePath}`
  ].join('\n'));
}

main();
