#!/usr/bin/env node
/**
 * State of West Virginia — Antigravity Skill Toggle & Connector Control Center
 *
 * Built on Antigravity's native `sidecar_sdk` (zero npm packages; runs on AGY's bundled Node runtime).
 * Supports:
 * 1. Per-skill enable/disable toggles (`SKILL.md` <-> `SKILL.md.disabled` + persisted toggle ledger).
 * 2. Category plugin enable/disable toggles via LanguageServerService/JetboxWriteState.
 * 3. Default Gemini Enterprise (GE) instance configuration (`ge-instance.json`).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

const SKILL_CATALOG = [
  {
    plugin: 'wv-onboarding',
    categoryLabel: 'Onboarding, Daily Brief & Triage',
    skills: [
      {
        id: 'wv-onboard',
        title: 'Agency Role & Digital Twin Setup',
        subtitle: '60-second role setup, 30-60-90 onboarding plans & SOP builders',
        command: '/wv-onboard',
        badge: 'Playbook + Setup',
        starterPrompt: '/wv-onboard Help me set up my West Virginia agency role, Digital Twin voice, and Gemini Enterprise connection.'
      },
      {
        id: 'model-guide',
        title: 'Model Selection & Using Claude in AGY',
        subtitle: 'Switch between Gemini & Anthropic Claude, tune effort & Dual-Model reviews',
        command: '/model-guide',
        badge: 'Claude + Gemini',
        starterPrompt: '/model-guide Show me how to use Anthropic Claude alongside Google Gemini in Antigravity, when to pick each model, and our West Virginia quota & compliance guardrails.'
      },
      {
        id: 'daily-brief',
        title: 'Daily Executive Brief & Meeting Prep',
        subtitle: 'Morning priorities, calendar prep & action items via Federated GE',
        command: '/daily-brief',
        badge: 'GE Federated',
        starterPrompt: '/daily-brief Summarize my top priorities today, upcoming meetings, and open action items.'
      },
      {
        id: 'digital-twin',
        title: 'Digital Twin Voice & Correspondence Drafter',
        subtitle: 'Drafts emails, official letters & constituent replies (Draft-Only)',
        command: '/digital-twin',
        badge: 'Draft-Only',
        starterPrompt: '/digital-twin Draft a clear, concise reply in my voice to the message below.'
      },
      {
        id: 'inbox-triage',
        title: 'Rule-Driven Inbox & Incident Triage',
        subtitle: 'Threshold triage with fail-safe hold on unreadable attachments',
        command: '/inbox-triage',
        badge: 'GE + Rules',
        starterPrompt: '/inbox-triage Triage my unread emails from the last 48 hours and flag urgent leadership escalations.'
      },
      {
        id: 'wv-update',
        title: 'Fast Git & HTTPS Suite Updater',
        subtitle: 'Syncs latest West Virginia skills & templates in under 2 seconds',
        command: '/wv-update',
        badge: 'Executable',
        starterPrompt: '/wv-update Check if newer West Virginia Antigravity skills or templates are available.'
      }
    ]
  },
  {
    plugin: 'wv-connectors',
    categoryLabel: 'Federated Gemini Enterprise Connectors',
    skills: [
      {
        id: 'connect-ge',
        title: 'Gemini Enterprise (GE) Instance Wizard',
        subtitle: 'Default hub linking Entra-synced Google Identity to federated sources',
        command: '/connect-ge',
        badge: 'MCP Bridge',
        starterPrompt: '/connect-ge Configure and test my West Virginia Gemini Enterprise instance and federated connectors.'
      },
      {
        id: 'connect-m365-workspace',
        title: 'Outlook, SharePoint, OneDrive, Teams & Drive',
        subtitle: 'Chronological thread & citation retrieval across federated M365/Workspace',
        command: '/connect-m365-workspace',
        badge: 'GE Federated',
        starterPrompt: '/connect-m365-workspace Search SharePoint, OneDrive, and Outlook via my GE instance for recent program updates.'
      },
      {
        id: 'connect-github-bigquery',
        title: 'GitHub & Cost-Capped BigQuery Setup',
        subtitle: 'Federated GitHub search + direct PR workflow & 1 GB BigQuery caps',
        command: '/connect-github-bigquery',
        badge: 'Cloud + Repo',
        starterPrompt: '/connect-github-bigquery Help me connect to BigQuery with read-only cost guardrails.'
      }
    ]
  },
  {
    plugin: 'wv-design-studio',
    categoryLabel: 'Design Studio — Dashboards, Slides & Docs',
    skills: [
      {
        id: 'wv-dashboard',
        title: 'Zero-Node Interactive Executive Dashboards',
        subtitle: 'Runs over file:// in Chrome/Edge with drag-and-drop Customize Layout',
        command: '/wv-dashboard',
        badge: 'Executable UI',
        starterPrompt: '/wv-dashboard Spin up a West Virginia branded executive dashboard I can customize visually in Chrome or Edge.'
      },
      {
        id: 'slides',
        title: '16:9 Executive Presentation Decks',
        subtitle: 'Responsive HTML/CSS slide decks with speaker notes & Save-to-PDF',
        command: '/slides',
        badge: 'Visual Deck',
        starterPrompt: '/slides Create an 8-slide West Virginia leadership presentation deck with speaker notes.'
      },
      {
        id: 'doc-design',
        title: 'Branded Stakeholder Flyers & BLUF Memos',
        subtitle: 'Print-CSS fact sheets, 1-page decision memos & public notices',
        command: '/doc-design',
        badge: 'Print-Ready',
        starterPrompt: '/doc-design Design a 2-page print-ready stakeholder flyer and eligibility checklist.'
      }
    ]
  },
  {
    plugin: 'wv-state-workflows',
    categoryLabel: 'State Workflows — FOIA, Legal & Policy',
    skills: [
      {
        id: 'foia-expert',
        title: 'WV FOIA Discovery, Redaction & Vaughn Index',
        subtitle: 'Google Vault + Purview KQL + W. Va. Code § 29B-1-4 segregability audit',
        command: '/foia-expert',
        badge: 'Statutory SOP',
        starterPrompt: '/foia-expert Formulate Google Vault and Purview KQL discovery queries for this FOIA request and build a Vaughn Index report.'
      },
      {
        id: 'legal-procurement-review',
        title: 'State Legal & Procurement Contract Review',
        subtitle: 'Checks sovereign immunity, fiscal non-appropriation & AI terms (1:3:9)',
        command: '/legal-procurement-review',
        badge: '1:3:9 Risk',
        starterPrompt: '/legal-procurement-review Review this vendor contract against West Virginia sovereign immunity and non-appropriation rules.'
      },
      {
        id: 'policy-program-audit',
        title: 'Legislative & Cross-Document Consistency Audit',
        subtitle: 'Catches conflicting caps, dates, or rules across flyers & policy docs',
        command: '/policy-program-audit',
        badge: 'Audit Gate',
        starterPrompt: '/policy-program-audit Check our program rules, stakeholder flyer, and web copy for any conflicting numbers or dates.'
      }
    ]
  },
  {
    plugin: 'wv-engineering-cloud',
    categoryLabel: 'Engineering — Refactoring, Cloud Run & BigQuery',
    skills: [
      {
        id: 'modernize-refactor',
        title: 'Stage-Gated Legacy App Modernization',
        subtitle: 'Stage 0/1/2 Crucible + 6-section blueprint & A/B parity verification',
        command: '/modernize-refactor',
        badge: '3-Stage Crucible',
        starterPrompt: '/modernize-refactor Inspect this legacy codebase and generate a Stage 1 6-section modernization blueprint.'
      },
      {
        id: 'deploy-cloudrun',
        title: 'Zero-Docker Cloud Run Source Deployment',
        subtitle: 'Remote Cloud Build deploy with dedicated SA & Secret Manager',
        command: '/deploy-cloudrun',
        badge: 'Cloud Run',
        starterPrompt: '/deploy-cloudrun Prepare this service for a hardened zero-Docker Cloud Run source deployment in us-east4.'
      },
      {
        id: 'bigquery-architect',
        title: 'BigQuery SQL Translator & Cost Optimizer',
        subtitle: 'Legacy T-SQL/Oracle/Postgres migration, partitioning & dry-run caps',
        command: '/bigquery-architect',
        badge: 'BigQuery SQL',
        starterPrompt: '/bigquery-architect Translate this legacy SQL query to BigQuery Standard SQL with partitioning and a 1 GB cap.'
      },
      {
        id: 'find-cloud-skill',
        title: 'On-Demand Google Cloud Skill Loader',
        subtitle: 'Loads specialized GKE, AlloyDB, Apigee & Vertex AI skills on demand',
        command: '/find-cloud-skill',
        badge: 'Live Catalog',
        starterPrompt: '/find-cloud-skill Load the official Google Cloud skill for Assured Workloads and VPC Service Controls.'
      }
    ]
  },
  {
    plugin: 'wv-security',
    categoryLabel: 'Security, Assured Workloads & IAM Hygiene',
    skills: [
      {
        id: 'security-audit',
        title: 'OWASP, Cloud WAF & Assured Workloads Audit',
        subtitle: 'Zero-install code & architecture security review (CJIS/HIPAA/FedRAMP)',
        command: '/security-audit',
        badge: 'Security Gate',
        starterPrompt: '/security-audit Run an OWASP and Google Cloud WAF security audit on this application.'
      },
      {
        id: 'iam-secret-hygiene',
        title: 'Least-Privilege IAM & Secret Manager Hygiene',
        subtitle: 'Replaces primitive roles & env secrets with Entra-synced groups',
        command: '/iam-secret-hygiene',
        badge: 'IAM + Secrets',
        starterPrompt: '/iam-secret-hygiene Audit our IAM bindings and replace plaintext env secrets with Secret Manager.'
      }
    ]
  }
];

function getPluginsRoot() {
  // __dirname = <pluginsRoot>/wv-onboarding/sidecars/wv-skill-manager
  return path.resolve(__dirname, '..', '..', '..');
}

function getSidecarStateDir() {
  const d = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || process.env.PLUGIN_DATA || path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-onboarding');
  const resolved = path.resolve(d);
  fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
  return resolved;
}

function getLedgerPath() {
  return path.join(getSidecarStateDir(), 'skill-toggles.json');
}

function readToggleLedger() {
  const p = getLedgerPath();
  if (!fs.existsSync(p)) return { disabledSkills: {}, disabledPlugins: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
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
        timeout: 4000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch {}
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

function inspectSkillDiskState(pluginsRoot, pluginName, skillId, ledger) {
  const key = `${pluginName}/${skillId}`;
  if (!SAFE_ID_RE.test(pluginName) || !SAFE_ID_RE.test(skillId)) {
    return true;
  }
  const skillDir = path.join(pluginsRoot, pluginName, 'skills', skillId);
  if (!skillDir.startsWith(pluginsRoot + path.sep)) return true;
  const activeMd = path.join(skillDir, 'SKILL.md');
  const disabledMd = path.join(skillDir, 'SKILL.md.disabled');
  try {
    if (fs.existsSync(disabledMd) && !fs.existsSync(activeMd)) {
      return false;
    }
    if (fs.existsSync(activeMd)) {
      return ledger.disabledSkills[key] ? false : true;
    }
  } catch {
    // Inside strict read-only sibling sandbox on Linux, fall back cleanly to ledger
  }
  return !Boolean(ledger.disabledSkills[key]);
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

  const skillDir = path.join(pluginsRoot, pluginName, 'skills', skillId);
  let diskSynced = false;
  if (skillDir.startsWith(pluginsRoot + path.sep)) {
    const activeMd = path.join(skillDir, 'SKILL.md');
    const disabledMd = path.join(skillDir, 'SKILL.md.disabled');
    try {
      if (!enabled && fs.existsSync(activeMd)) {
        fs.renameSync(activeMd, disabledMd);
        diskSynced = true;
      } else if (enabled && fs.existsSync(disabledMd)) {
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
    path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-connectors', 'ge-instance.json'),
    path.join(getSidecarStateDir(), 'ge-instance.json'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  return { rawInput: '' };
}

function saveGeInstanceConfig(rawInput) {
  const cleaned = String(rawInput || '').trim();
  const payload = {
    rawInput: cleaned,
    updatedAt: new Date().toISOString(),
  };
  // Always save inside sidecar data dir AND attempt shared wv-connectors plugin_data on macOS/Windows
  const localTarget = path.join(getSidecarStateDir(), 'ge-instance.json');
  fs.writeFileSync(localTarget, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });

  const connectorsDir = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-connectors');
  try {
    fs.mkdirSync(connectorsDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(connectorsDir, 'ge-instance.json'), JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  } catch {}
  return payload;
}

const app = new SidecarApp();

app.page('/', () => fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8'));

app.api('/styles.css', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  });
}, 'GET');

app.api('/app.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/api/state', async () => {
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

  const categories = SKILL_CATALOG.map((cat) => {
    const pluginDisabled = lsDisabledMap[cat.plugin] ?? Boolean(ledger.disabledPlugins[cat.plugin]);
    return {
      plugin: cat.plugin,
      categoryLabel: cat.categoryLabel,
      pluginEnabled: !pluginDisabled,
      skills: cat.skills.map((s) => ({
        ...s,
        enabled: !pluginDisabled && inspectSkillDiskState(pluginsRoot, cat.plugin, s.id, ledger),
      })),
    };
  });

  return {
    categories,
    geConfig: readGeInstanceConfig(),
  };
}, 'GET');

app.api('/api/toggle-skill', async (data) => {
  const pluginName = String(data.plugin || '');
  const skillId = String(data.skill || '');
  const enabled = Boolean(data.enabled);
  const res = toggleSkillOnDiskAndLedger(getPluginsRoot(), pluginName, skillId, enabled);
  return { ok: true, ...res };
}, 'POST');

app.api('/api/toggle-category', async (data) => {
  const pluginName = String(data.plugin || '');
  if (!SAFE_ID_RE.test(pluginName)) {
    throw new Error('Invalid plugin identifier.');
  }
  const enabled = Boolean(data.enabled);
  const ledger = readToggleLedger();
  if (enabled) delete ledger.disabledPlugins[pluginName];
  else ledger.disabledPlugins[pluginName] = true;
  writeToggleLedger(ledger);

  // Sync live with Antigravity Language Server config.json
  await callLanguageServerRpc('JetboxWriteState', {
    userConfig: {
      plugins: {
        [pluginName]: { enabled },
      },
    },
  });
  return { ok: true, plugin: pluginName, enabled };
}, 'POST');

app.api('/api/save-ge', async (data) => {
  const saved = saveGeInstanceConfig(data.geInstance || '');
  return { ok: true, geConfig: saved };
}, 'POST');

app.run();
