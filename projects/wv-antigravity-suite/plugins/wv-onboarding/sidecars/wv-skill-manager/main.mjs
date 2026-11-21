#!/usr/bin/env node

const __parseJsonNoBom = (s) => JSON.parse(typeof s === 'string' ? s.replace(/^\uFEFF/, '') : Buffer.isBuffer(s) ? s.toString('utf-8').replace(/^\uFEFF/, '') : s);
/**
 * Generic AGY Plugin — Skill Toggle & Connector Control Center
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
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { getTokenMeterSummary } from './token_meter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAFE_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const SAFE_SEG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/peterfishergcp/gps-ai-hub/main/projects/wv-antigravity-suite';

function httpsGetBuffer(urlStr, redirectsLeft = 4) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') {
      reject(new Error('HTTPS required'));
      return;
    }
    const req = https.get(
      u,
      { headers: { 'User-Agent': 'AGY-Skill-Manager-Sidecar/1.3' }, timeout: 12000 },
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
  // Seed from local version-manifest.json if available alongside plugins/
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

function getPersonalSkillsRoot() {
  const custom = process.env.ANTIGRAVITY_PERSONAL_SKILLS_DIR;
  return custom && custom.trim() ? path.resolve(custom.trim()) : path.join(os.homedir(), '.gemini', 'config', 'skills');
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
        // User edited this stock file directly on disk — NEVER overwrite it!
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
    if (skillProtected) {
      protectedSkillIds.push(skillId);
    }
    if (skillChanged) {
      updatedSkillsCount += 1;
      updatedSkillIds.push(skillId);
    }
  }

  // Sync UI sidecar files on disk ONLY (zero automatic ManageSidecar restarts — 100% user-driven Refresh)
  const updatedSidecarIds = [];
  if (!skillFilter && manifest.sidecarManifest) {
    for (const [scKey, scEntry] of Object.entries(manifest.sidecarManifest)) {
      const pluginName = scEntry.plugin;
      const scId = scEntry.sidecar || scKey.split('/').pop();
      if (pluginName === 'wv-automations') continue;
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
      if (sidecarChanged) {
        updatedSidecarIds.push(`${pluginName}/${scId}`);
      }
    }
  }

  writeBaselineHashes(baseline);

  return {
    ok: true,
    suiteVersion: manifest.suiteVersion || '1.0.0',
    checkedSkillsCount: targetSkills.length,
    updatedSkillsCount,
    updatedFilesCount,
    updatedSkillIds,
    protectedSkillIds,
    updatedSidecarIds,
  };
}

const SKILL_CATALOG = [
  {
    plugin: 'wv-onboarding',
    categoryLabel: 'Onboarding, Daily Brief & Triage',
    skills: [
      {
        id: 'wv-onboard',
        title: 'Agency Role, Workspace Memory & GE Quickstart',
        subtitle: '60-second role + workspace memory setup, 30-60-90 plans & SOP builders',
        command: '/wv-onboard',
        badge: 'Playbook + Setup',
        starterPrompt: '/wv-onboard Help me set up my Public Sector agency role, Personal Workspace Memory, and Gemini Enterprise connection.'
      },
      {
        id: 'model-guide',
        title: 'Model Selection & Using Claude in AGY',
        subtitle: 'Switch between Gemini 4, Orchestrator & Anthropic Claude 5.5 + Dual-Model reviews',
        command: '/model-guide',
        badge: 'Gemini 4 + Claude',
        starterPrompt: '/model-guide Show me how to use Google Gemini 4, Orchestrator, and Anthropic Claude 5.5 in Antigravity, when to pick each model, and our Public Sector quota & compliance guardrails.'
      },
      {
        id: 'orchestrator-guide',
        title: 'Mastering Orchestrator (Planner + Hydrogen)',
        subtitle: 'Pair Gemini 4 Neon/Argon/Carbon planning with fast Hydrogen execution & auto-recovery',
        command: '/orchestrator-guide',
        badge: 'Orchestrator',
        starterPrompt: '/orchestrator-guide Show me how to select and prompt Orchestrator (Neon, Argon, Carbon) in Antigravity App and CLI for faster execution and lower quota burn.'
      },
      {
        id: 'token-usage',
        title: 'Token & Quota Consumption Analyzer',
        subtitle: 'Retrieve exact 5h, 24h & 7d local token telemetry, cache hit % & rendered HTML report',
        command: '/token-usage',
        badge: 'Token Telemetry',
        starterPrompt: '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.'
      },
      {
        id: 'daily-brief',
        title: 'Daily Executive Kickoff Brief',
        subtitle: 'Unified morning priorities, GE calendar/inbox + open Action Items & >21d contacts',
        command: '/daily-brief',
        badge: 'GE + Memory',
        starterPrompt: '/daily-brief Summarize my top priorities today, upcoming meetings, open Action Items, and stale stakeholder check-ins.'
      },
      {
        id: 'my-voice',
        title: 'My Voice & Correspondence Drafter',
        subtitle: 'Drafts emails, memos, official letters & replies calibrated to voice.md (Draft-Only)',
        command: '/my-voice',
        badge: 'Draft-Only',
        starterPrompt: '/my-voice Draft a clear, concise reply in my voice to the message below.'
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
        subtitle: 'Syncs latest Public Sector skills & templates in under 2 seconds',
        command: '/wv-update',
        badge: 'Executable',
        starterPrompt: '/wv-update Check if newer Public Sector Antigravity skills or templates are available.'
      }
    ]
  },
  {
    plugin: 'wv-connectors',
    categoryLabel: 'Chatski & Gemini Enterprise Connectors',
    skills: [
      {
        id: 'chatski',
        title: 'Chatski — Google Chat & GE Connector Companion',
        subtitle: 'Summarizes unread Spaces/DMs via GE Chat Connector & stages Draft-Only replies in Chatski',
        command: '/chatski',
        badge: 'Left Panel + GE',
        starterPrompt: '/chatski Summarize my unread Google Chat spaces and direct messages via my Gemini Enterprise Chat Connector and stage Draft-Only replies in Chatski.'
      },
      {
        id: 'connect-ge',
        title: 'Gemini Enterprise (GE) Instance Wizard',
        subtitle: 'Default hub linking Entra-synced Google Identity to federated sources',
        command: '/connect-ge',
        badge: 'MCP Bridge',
        starterPrompt: '/connect-ge Configure and test my Public Sector Gemini Enterprise instance and federated connectors.'
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
        starterPrompt: '/slides Create an 8-slide Public Sector leadership presentation deck with speaker notes.'
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
    categoryId: 'wv-state-workflows',
    plugin: 'wv-state-workflows',
    categoryLabel: 'WV State Skills — WV FOIA (§ 29B-1-4), Legal & Policy',
    chipLabel: 'WV State Skills',
    skills: [
      {
        id: 'foia-expert',
        title: 'Public Records / FOIA Discovery, Redaction & Vaughn Index',
        subtitle: 'Google Vault + Purview KQL + W. Va. Code § 29B-1-4 & 5 U.S.C. § 552 segregability audit',
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
        starterPrompt: '/legal-procurement-review Review this vendor contract against Public Sector sovereign immunity and non-appropriation rules.'
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
    categoryId: 'public_sector',
    plugin: 'wv-state-workflows',
    categoryLabel: 'Government Services (public_sector) Skills',
    chipLabel: 'Government Services (public_sector)',
    skills: [
      {
        id: 'document-intake-cleanup-and-validation',
        title: 'Public Sector Document Intake & Validation',
        subtitle: 'Validates citizen paystubs, leases, residency proofs & monthly gross income math',
        command: '/document-intake-cleanup-and-validation',
        badge: 'public_sector',
        starterPrompt: '/document-intake-cleanup-and-validation Validate this citizen\'s uploaded paystubs and residential lease, and calculate prospective monthly gross income.'
      },
      {
        id: 'expense-auditor',
        title: 'Expense Auditor (2 CFR Part 200)',
        subtitle: 'Audits grant expenditure ledgers, receipts & vouchers against Uniform Guidance',
        command: '/expense-auditor',
        badge: 'public_sector',
        starterPrompt: '/expense-auditor Audit this grant expenditure ledger against 2 CFR Part 200 Uniform Guidance and flag any unallowable costs.'
      },
      {
        id: 'foia-request-processing',
        title: 'FOIA Request Processing',
        subtitle: 'First-pass search & 3-table officer report across connected agency systems',
        command: '/foia-request-processing',
        badge: 'public_sector',
        starterPrompt: '/foia-request-processing Review this public records request, confirm the governing law, search connected systems, and return the three-table first-pass report.'
      },
      {
        id: 'plain-language-notice-generator',
        title: 'Plain Language Notice Generator',
        subtitle: 'Rewrites public advisories & notices into plain language with zero fact invention',
        command: '/plain-language-notice-generator',
        badge: 'public_sector',
        starterPrompt: '/plain-language-notice-generator Rewrite this public health advisory into compliant plain language while preserving all dates, contacts, and regulatory blocks.'
      },
      {
        id: 'policy-and-statute-assistant',
        title: 'Policy and Statute Assistant',
        subtitle: 'Pinpoint federal/CFR & state administrative code citations with hierarchy',
        command: '/policy-and-statute-assistant',
        badge: 'public_sector',
        starterPrompt: '/policy-and-statute-assistant Research the controlling federal regulation and state administrative rule for this program eligibility question.'
      },
      {
        id: 'public-records-redaction',
        title: 'Public Records Redaction',
        subtitle: 'Drafts 50-state & federal FOIA redactions with pinpoint citations & officer flags',
        command: '/public-records-redaction',
        badge: 'public_sector',
        starterPrompt: '/public-records-redaction Draft first-pass public records redactions on this document under Federal FOIA (5 U.S.C. § 552) and applicable State Public Records law with citations and reasons.'
      },
      {
        id: 'rfp-vendor-evaluation',
        title: 'RFP Vendor Evaluation',
        subtitle: 'Cross-checks vendor bid packages against RFP rubrics with page-cited matrices',
        command: '/rfp-vendor-evaluation',
        badge: 'public_sector',
        starterPrompt: '/rfp-vendor-evaluation Evaluate these vendor proposals against our RFP mandatory requirements and compile page-cited rubric evidence.'
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
  },
  {
    categoryId: 'second-brain',
    plugin: 'wv-second-brain',
    categoryLabel: 'Memory, Action Items, Prep & Anti-Slop',
    chipLabel: 'Memory & Prep',
    skills: [
      {
        id: 'memory',
        title: 'Personal Workspace Memory & Action Items',
        subtitle: 'Role-adaptive setup, Action Items (action_items.md) & >21d stakeholder pulse',
        command: '/memory',
        badge: 'Memory + Actions',
        starterPrompt: '/memory Initialize my personal workspace memory using the public-sector preset and summarize my active Action Items and initiatives.'
      },
      {
        id: 'meeting-notes',
        title: 'Meeting Notes Harvester & Action Extractor',
        subtitle: 'Strips base64 bloat, applies 4-Tier compaction & extracts Action Items',
        command: '/meeting-notes',
        badge: '4-Tier Memory',
        starterPrompt: '/meeting-notes Ingest and compact these call notes into my initiative folder, extract open to-dos to action_items.md, and update contacts.md.'
      },
      {
        id: 'meeting-prep',
        title: 'T-15m Pre-Meeting Brief & SCQA Red-Team Coach',
        subtitle: '1-card initiative brief + Adversarial Minto Pyramid (SCQA) pushback critic',
        command: '/meeting-prep',
        badge: 'SCQA Critic',
        starterPrompt: '/meeting-prep Build a 1-page pre-meeting brief and Adversarial Minto SCQA Critic for my top active initiative.'
      },
      {
        id: 'followup-plan',
        title: 'Follow-Up & Action Item Sweep',
        subtitle: 'Audits sent replies first, syncs action_items.md & stages [Draft-Only] messages',
        command: '/followup-plan',
        badge: 'Action Sweep',
        starterPrompt: '/followup-plan Run a follow-up sweep across my workspace memory and stage [Draft-Only] replies for open P0 and P1 action items.'
      },
      {
        id: 'swarm-prep',
        title: '4-Agent Parallel Swarm Orchestrator',
        subtitle: 'Fans out Memory Scout, SCQA Critic, Solution Architect & Safety Auditor',
        command: '/swarm-prep',
        badge: '4-Agent Swarm',
        starterPrompt: '/swarm-prep Run a 4-agent parallel 360 prep pack for my highest-priority initiative.'
      },
      {
        id: 'weekly-impact',
        title: 'Friday Closeout & 3-Altitude Impact Ledger',
        subtitle: 'Distills Executive Outcomes, Reusable Assets & Velocity into weekly/ & ledger.json',
        command: '/weekly-impact',
        badge: '3-Altitude ROI',
        starterPrompt: '/weekly-impact Generate my Friday 3-Altitude weekly impact summary from my workspace memory.'
      },
      {
        id: 'no-ai-slop',
        title: 'Hardlined Anti-AI-Slop Editor',
        subtitle: 'Cuts 17 LLM filler patterns, binary contrasts & em-dash clusters',
        command: '/no-ai-slop',
        badge: 'Voice Polish',
        starterPrompt: '/no-ai-slop Tighten the draft below and strip all AI-slop clichés while keeping concrete numbers and citations intact.'
      },
      {
        id: 'outbound-scrub',
        title: 'Deterministic Outbound Safety & PII Scrubber',
        subtitle: 'Scans external drafts for secrets, SSNs, [CONFIRM] tags & slop (Node + regex fallback)',
        command: '/outbound-scrub',
        badge: 'Safety Gate',
        starterPrompt: '/outbound-scrub Run a deterministic outbound safety, PII/secret, and placeholder check on the deliverable below before sharing.'
      }
    ]
  },
  {
    categoryId: 'automations',
    plugin: 'wv-automations',
    categoryLabel: 'Scheduled Automations (Opt-In)',
    chipLabel: 'Automations',
    skills: [
      {
        id: 'automations',
        title: 'Scheduled Briefings & Memory Compactor Setup',
        subtitle: 'Configures IANA timezone & enables opt-in weekday briefings in Automations',
        command: '/automations',
        badge: 'Opt-In Cron',
        starterPrompt: '/automations Set my IANA timezone across my scheduled automations and show me how to enable them in the Automations dashboard.'
      }
    ]
  }
];

function getPluginsRoot() {
  // __dirname = <pluginsRoot>/wv-onboarding/sidecars/agy-skill-manager
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
    const parsed = __parseJsonNoBom(fs.readFileSync(p, 'utf8'));
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
          try { json = __parseJsonNoBom(text); } catch {}
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

  const personalRoot = getPersonalSkillsRoot();
  const baseRoot = pluginName === 'my-skills' ? personalRoot : pluginsRoot;
  const skillDir = pluginName === 'my-skills' ? path.join(personalRoot, skillId) : path.join(pluginsRoot, pluginName, 'skills', skillId);
  let diskSynced = false;
  if (skillDir.startsWith(baseRoot + path.sep)) {
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
        return __parseJsonNoBom(fs.readFileSync(p, 'utf8'));
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
  // Always save inside sidecar data dir AND attempt shared agy-connectors plugin_data on macOS/Windows
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

app.api('/token_pill_ui.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'token_pill_ui.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/api/token-summary', async (data) => {
  return getTokenMeterSummary((data && data.convId) || '');
}, 'GET');

function readPluginDefaultDisabled(pluginsRoot, pluginName) {
  if (!SAFE_ID_RE.test(pluginName)) return false;
  const manifestPath = path.join(pluginsRoot, pluginName, 'plugin.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const parsed = __parseJsonNoBom(fs.readFileSync(manifestPath, 'utf8'));
      return Boolean(parsed.disabled);
    }
  } catch {}
  return false;
}

function isPluginCurrentlyDisabled(pluginsRoot, pluginName, lsDisabledMap, ledger) {
  if (lsDisabledMap[pluginName] !== undefined) return Boolean(lsDisabledMap[pluginName]);
  if (ledger.disabledPlugins && ledger.disabledPlugins[pluginName] !== undefined) {
    return Boolean(ledger.disabledPlugins[pluginName]);
  }
  return readPluginDefaultDisabled(pluginsRoot, pluginName);
}

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

  const sharedPluginCounts = {};
  for (const cat of SKILL_CATALOG) {
    sharedPluginCounts[cat.plugin] = (sharedPluginCounts[cat.plugin] || 0) + 1;
  }

  const categories = SKILL_CATALOG.map((cat) => {
    const catPluginDisabled = isPluginCurrentlyDisabled(pluginsRoot, cat.plugin, lsDisabledMap, ledger);
    const mappedSkills = cat.skills.map((s) => {
      const skillPlugin = s.plugin || cat.plugin;
      const skillPluginDisabled = isPluginCurrentlyDisabled(pluginsRoot, skillPlugin, lsDisabledMap, ledger);
      return {
        ...s,
        plugin: skillPlugin,
        enabled: !skillPluginDisabled && inspectSkillDiskState(pluginsRoot, skillPlugin, s.id, ledger),
      };
    });
    const isSharedPlugin = (sharedPluginCounts[cat.plugin] || 0) > 1;
    const categoryEnabled = isSharedPlugin
      ? !catPluginDisabled && mappedSkills.some((s) => s.enabled)
      : !catPluginDisabled;
    return {
      categoryId: cat.categoryId || cat.plugin,
      plugin: cat.plugin,
      categoryLabel: cat.categoryLabel,
      chipLabel: cat.chipLabel || '',
      pluginEnabled: categoryEnabled,
      skills: mappedSkills,
    };
  });

  // Prepend ★ My Custom Skills from ~/.gemini/config/skills/ if present
  const personalRoot = getPersonalSkillsRoot();
  if (fs.existsSync(personalRoot)) {
    try {
      const personalSkills = [];
      const pDirs = fs
        .readdirSync(personalRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .sort();
      for (const sid of pDirs) {
        const sDir = path.join(personalRoot, sid);
        const newMeta = path.join(sDir, '.agy-skill-meta.json');
        const legacyMeta = path.join(sDir, '.twin-skill-meta.json');
        const metaPath = fs.existsSync(newMeta) ? newMeta : legacyMeta;
        const activeMd = path.join(sDir, 'SKILL.md');
        const disabledMd = path.join(sDir, 'SKILL.md.disabled');
        if (!fs.existsSync(metaPath) || (!fs.existsSync(activeMd) && !fs.existsSync(disabledMd))) continue;
        let meta = {};
        try {
          meta = __parseJsonNoBom(fs.readFileSync(metaPath, 'utf-8'));
        } catch {}
        personalSkills.push({
          id: sid,
          plugin: 'my-skills',
          isPersonalCopy: true,
          title: meta.title || `${sid} (My Copy)`,
          subtitle: meta.subtitle || 'Saved in ~/.gemini/config/skills/ — protected from plugin updates',
          command: `/${sid}`,
          badge: meta.mode === 'override' ? 'My Override · Protected' : 'My Copy · Protected',
          starterPrompt: meta.seedPrompt || `/${sid} Run my customized workflow.`,
          enabled: fs.existsSync(activeMd),
        });
      }
      if (personalSkills.length > 0) {
        categories.unshift({
          categoryId: 'my-skills',
          plugin: 'my-skills',
          categoryLabel: '★ My Custom Skills (Protected in ~/.gemini/config/skills/)',
          chipLabel: '★ My Skills',
          pluginEnabled: personalSkills.some((s) => s.enabled),
          skills: personalSkills,
        });
      }
    } catch {}
  }

  // Record initial stock hashes on first state read if baseline-hashes.json does not exist yet
  if (!fs.existsSync(getBaselineHashesPath())) {
    try {
      const baseline = readBaselineHashes(pluginsRoot);
      for (const cat of SKILL_CATALOG) {
        for (const s of cat.skills) {
          const pName = s.plugin || cat.plugin;
          const sDir = path.join(pluginsRoot, pName, 'skills', s.id);
          const md = fs.existsSync(path.join(sDir, 'SKILL.md'))
            ? path.join(sDir, 'SKILL.md')
            : path.join(sDir, 'SKILL.md.disabled');
          if (fs.existsSync(md) && fs.lstatSync(md).isFile()) {
            if (!baseline.skills[s.id]) baseline.skills[s.id] = {};
            if (!baseline.skills[s.id]['SKILL.md']) {
              baseline.skills[s.id]['SKILL.md'] = crypto.createHash('sha256').update(fs.readFileSync(md)).digest('hex');
            }
          }
        }
      }
      writeBaselineHashes(baseline);
    } catch {}
  }

  return {
    categories,
    geConfig: readGeInstanceConfig(),
  };
}, 'GET');

app.api('/api/toggle-skill', async (data) => {
  const pluginsRoot = getPluginsRoot();
  const pluginName = String(data.plugin || '');
  const skillId = String(data.skill || '');
  const enabled = Boolean(data.enabled);
  const res = toggleSkillOnDiskAndLedger(pluginsRoot, pluginName, skillId, enabled);
  if (enabled) {
    const ledger = readToggleLedger();
    if (ledger.disabledPlugins[pluginName] === true || readPluginDefaultDisabled(pluginsRoot, pluginName)) {
      ledger.disabledPlugins[pluginName] = false;
      writeToggleLedger(ledger);
      await callLanguageServerRpc('JetboxWriteState', {
        userConfig: { plugins: { [pluginName]: { enabled: true } } },
      });
    }
  }
  return { ok: true, ...res };
}, 'POST');

app.api('/api/toggle-category', async (data) => {
  const pluginName = String(data.plugin || '');
  const categoryId = String(data.categoryId || pluginName);
  if (!SAFE_ID_RE.test(pluginName)) {
    throw new Error('Invalid plugin identifier.');
  }
  const enabled = Boolean(data.enabled);
  const matchingCats = SKILL_CATALOG.filter((c) => c.plugin === pluginName);
  if (matchingCats.length > 1) {
    // Multiple UI categories live inside the same plugin (e.g., agy-public-workflows + public_sector):
    // toggle only the skills belonging to this specific category so sibling categories remain untouched!
    const targetCat = SKILL_CATALOG.find((c) => (c.categoryId || c.plugin) === categoryId);
    if (targetCat) {
      const pluginsRoot = getPluginsRoot();
      for (const s of targetCat.skills) {
        toggleSkillOnDiskAndLedger(pluginsRoot, s.plugin || pluginName, s.id, enabled);
      }
      if (enabled) {
        const ledger = readToggleLedger();
        ledger.disabledPlugins[pluginName] = false;
        writeToggleLedger(ledger);
        await callLanguageServerRpc('JetboxWriteState', {
          userConfig: { plugins: { [pluginName]: { enabled: true } } },
        });
      }
    }
    return { ok: true, categoryId, plugin: pluginName, enabled };
  }

  const ledger = readToggleLedger();
  ledger.disabledPlugins[pluginName] = !enabled;
  writeToggleLedger(ledger);

  // Sync live with Antigravity Language Server config.json
  await callLanguageServerRpc('JetboxWriteState', {
    userConfig: {
      plugins: {
        [pluginName]: { enabled },
      },
    },
  });
  return { ok: true, categoryId, plugin: pluginName, enabled };
}, 'POST');

app.api('/api/save-ge', async (data) => {
  const saved = saveGeInstanceConfig(data.geInstance || '');
  return { ok: true, geConfig: saved };
}, 'POST');

app.api('/api/incremental-sync', async (data) => {
  const skillFilter = data && typeof data.skill === 'string' ? data.skill.trim() : '';
  return await syncSkillsIncrementally(skillFilter);
}, 'POST');

app.api('/api/fork-skill', async (data) => {
  const pluginsRoot = getPluginsRoot();
  const personalRoot = getPersonalSkillsRoot();
  const pluginName = String((data && data.plugin) || '').trim();
  const skillId = String((data && data.skill) || '').trim();
  if (!SAFE_ID_RE.test(pluginName) || !SAFE_ID_RE.test(skillId)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid skill identifier' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const srcDir = path.join(pluginsRoot, pluginName, 'skills', skillId);
  if (!fs.existsSync(srcDir)) {
    return new Response(JSON.stringify({ ok: false, error: 'Source skill not found' }), {
      contentType: 'application/json',
      status: 404,
    });
  }
  fs.mkdirSync(personalRoot, { recursive: true, mode: 0o700 });
  let targetSlug = `${skillId}-my`;
  let suffix = 2;
  while (fs.existsSync(path.join(personalRoot, targetSlug))) {
    targetSlug = `${skillId}-my-${suffix}`;
    suffix += 1;
  }
  const destDir = path.join(personalRoot, targetSlug);

  function copyRecursive(curSrc, curDest, isRoot) {
    fs.mkdirSync(curDest, { recursive: true });
    for (const entry of fs.readdirSync(curSrc, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      const sp = path.join(curSrc, entry.name);
      const st = fs.lstatSync(sp);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        copyRecursive(sp, path.join(curDest, entry.name), false);
      } else if (st.isFile()) {
        const outName = isRoot && entry.name === 'SKILL.md.disabled' ? 'SKILL.md' : entry.name;
        const dp = path.join(curDest, outName);
        if (isRoot && outName === 'SKILL.md') {
          const raw = fs.readFileSync(sp, 'utf-8');
          const rewritten = raw.replace(/^(---\r?\n[\s\S]*?^name\s*:).*$/m, `$1 ${targetSlug}`);
          fs.writeFileSync(dp, rewritten, 'utf-8');
        } else {
          fs.copyFileSync(sp, dp);
        }
      }
    }
  }

  copyRecursive(srcDir, destDir, true);
  const nowIso = new Date().toISOString();
  const baseTitle = String((data && data.title) || skillId).trim();
  const starter = String((data && data.starterPrompt) || `/${targetSlug} Run my customized workflow.`)
    .trim()
    .replace(new RegExp(`^/${skillId}\\b`), `/${targetSlug}`);
  fs.writeFileSync(
    path.join(destDir, '.agy-skill-meta.json'),
    JSON.stringify(
      {
        slug: targetSlug,
        forkedFrom: skillId,
        sourcePlugin: pluginName,
        mode: 'copy',
        title: `${baseTitle} (My Copy)`,
        subtitle: String((data && data.subtitle) || '').trim(),
        seedPrompt: starter,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );
  return { ok: true, slug: targetSlug, command: `/${targetSlug}` };
}, 'POST');

app.run();
