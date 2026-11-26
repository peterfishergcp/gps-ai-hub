const __parseJsonNoBom = (s) =>
  JSON.parse(
    typeof s === 'string'
      ? s.replace(/^\uFEFF/, '')
      : Buffer.isBuffer(s)
        ? s.toString('utf-8').replace(/^\uFEFF/, '')
        : s
  );

/**
 * Curated 1-Click Seed Prompts, Full Personal Skills Discovery (~/.gemini/config/skills/
 * + optional workspace .gemini/skills/), and Category Metadata for Installed Antigravity Skills.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SUITE_VARIANT = 'generic'; // 'generic' | 'wv'

export const RETIRED_AGY_PLUGINS = ['agy-connectors', 'agy-coordinator'];

export function pruneRetiredAgyPlugins(pluginsRoot) {
  const removed = [];
  if (SUITE_VARIANT !== 'generic' || !pluginsRoot) return removed;
  try {
    const resolvedRoot = path.resolve(pluginsRoot);
    const rootStat = fs.lstatSync(resolvedRoot);
    if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) return removed;
    for (const legacyName of RETIRED_AGY_PLUGINS) {
      const target = path.resolve(resolvedRoot, legacyName);
      if (target !== path.join(resolvedRoot, legacyName)) continue;
      if (!target.startsWith(resolvedRoot + path.sep)) continue;
      let st = null;
      try {
        st = fs.lstatSync(target);
      } catch {
        continue;
      }
      if (!st || st.isSymbolicLink() || !st.isDirectory()) continue;
      if (!fs.existsSync(path.join(target, 'plugin.json'))) continue;
      try {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(legacyName);
      } catch {}
    }
    const pluginDataRoot = path.resolve(resolvedRoot, '..', 'plugin_data');
    try {
      const dataRootStat = fs.lstatSync(pluginDataRoot);
      if (dataRootStat && !dataRootStat.isSymbolicLink() && dataRootStat.isDirectory()) {
        for (const legacyName of RETIRED_AGY_PLUGINS) {
          const dataTarget = path.resolve(pluginDataRoot, legacyName);
          if (dataTarget !== path.join(pluginDataRoot, legacyName)) continue;
          if (!dataTarget.startsWith(pluginDataRoot + path.sep)) continue;
          let dst = null;
          try {
            dst = fs.lstatSync(dataTarget);
          } catch {
            continue;
          }
          if (!dst || dst.isSymbolicLink() || !dst.isDirectory()) continue;
          try {
            fs.rmSync(dataTarget, { recursive: true, force: true });
          } catch {}
        }
      }
    } catch {}
  } catch {}
  return removed;
}

export const PUBLIC_SECTOR_GOV_SKILLS = new Set([
  'document-intake-cleanup-and-validation',
  'expense-auditor',
  'foia-request-processing',
  'plain-language-notice-generator',
  'policy-and-statute-assistant',
  'public-records-redaction',
  'rfp-vendor-evaluation',
]);

const GENERIC_CATEGORIES = {
  'agy-onboarding': {
    order: 10,
    categoryLabel: 'Onboarding, Token Telemetry & Triage',
    chipLabel: 'Onboarding',
  },
  'agy-design-studio': {
    order: 30,
    categoryLabel: 'Design Studio — Dashboards, Slides & Docs',
    chipLabel: 'Design Studio',
  },
  'agy-public-workflows': {
    order: 40,
    categoryLabel: 'Public Workflows — FOIA, Legal & Policy',
    chipLabel: 'Public Workflows',
  },
  public_sector: {
    order: 45,
    categoryLabel: 'Government Services (public_sector) Skills',
    chipLabel: 'Government Services (public_sector)',
  },
  'agy-engineering-cloud': {
    order: 50,
    categoryLabel: 'Engineering — Refactoring, Cloud Run & BigQuery',
    chipLabel: 'Engineering',
  },
  'agy-security': {
    order: 60,
    categoryLabel: 'Security, Assured Workloads & IAM Hygiene',
    chipLabel: 'Security',
  },
  'agy-second-brain': {
    order: 70,
    categoryLabel: 'My Hub — Memory, Action Items, Swarm Prep & Anti-Slop',
    chipLabel: 'Memory & Prep',
  },
  'agy-twin-automations': {
    order: 80,
    categoryLabel: 'Scheduled Automations (Opt-In Cron)',
    chipLabel: 'Automations',
  },
  'emergency-readiness': {
    order: 85,
    categoryLabel: 'Emergency Readiness & HSEEP Crisis Studio',
    chipLabel: 'Emergency Readiness',
  },
  'dashboard-studio': {
    order: 86,
    categoryLabel: 'Dashboard Studio — Visual BI & BigQuery',
    chipLabel: 'Dashboard Studio',
  },
};

const WV_CATEGORIES = {
  'wv-onboarding': {
    order: 10,
    categoryLabel: 'WV Onboarding, Token Telemetry & Triage',
    chipLabel: 'WV Onboarding',
  },
  'wv-connectors': {
    order: 20,
    categoryLabel: 'WV Gemini Enterprise & Cloud Connectors',
    chipLabel: 'WV Connectors',
  },
  'wv-design-studio': {
    order: 30,
    categoryLabel: 'WV Design Studio — Dashboards, Slides & Docs',
    chipLabel: 'WV Design Studio',
  },
  'wv-state-workflows': {
    order: 40,
    categoryLabel: 'WV State Skills — WV FOIA (§ 29B-1-4), Legal & Policy',
    chipLabel: 'WV State Skills',
  },
  public_sector: {
    order: 45,
    categoryLabel: 'Government Services (public_sector) Skills',
    chipLabel: 'Government Services (public_sector)',
  },
  'wv-engineering-cloud': {
    order: 50,
    categoryLabel: 'WV Engineering — Refactoring, Cloud Run & BigQuery',
    chipLabel: 'WV Engineering',
  },
  'wv-security': {
    order: 60,
    categoryLabel: 'WV Security, Assured Workloads & IAM Hygiene',
    chipLabel: 'WV Security',
  },
  'wv-second-brain': {
    order: 70,
    categoryLabel: 'WV Antigravity — Memory, Action Items & 4-Agent Swarm',
    chipLabel: 'Memory & Prep',
  },
  'wv-automations': {
    order: 80,
    categoryLabel: 'Scheduled Automations (Opt-In Cron)',
    chipLabel: 'Automations',
  },
  'emergency-readiness': {
    order: 85,
    categoryLabel: 'Emergency Readiness & HSEEP Crisis Studio',
    chipLabel: 'Emergency Readiness',
  },
  'dashboard-studio': {
    order: 86,
    categoryLabel: 'Dashboard Studio — Visual BI & BigQuery',
    chipLabel: 'Dashboard Studio',
  },
};

export const CATEGORY_DEFINITIONS = SUITE_VARIANT === 'wv' ? WV_CATEGORIES : GENERIC_CATEGORIES;

const MEM_PATH_HINT =
  SUITE_VARIANT === 'wv'
    ? '~/.gemini/config/plugin_data/wv-antigravity/memory/'
    : '~/.gemini/config/plugin_data/my-antigravity/memory/';

export const CURATED_SKILL_SEEDS = {
  // 1. Onboarding (both generic & wv IDs supported cleanly)
  'agy-onboard': {
    title: 'Agency Role & Workspace Setup',
    subtitle: '60-second role setup, zero-footprint memory seeding & 30-60-90 SOP builders',
    badge: 'Playbook + Setup',
    seedPrompt: `/agy-onboard Help me set up my role profile, initialize my personal workspace memory in ${MEM_PATH_HINT}, and check my Gemini Enterprise connection.`,
  },
  'wv-onboard': {
    title: 'Agency Role & Workspace Setup',
    subtitle: '60-second role setup, zero-footprint memory seeding & 30-60-90 SOP builders',
    badge: 'Playbook + Setup',
    seedPrompt: `/wv-onboard Help me set up my Public Sector role profile, initialize my personal workspace memory in ${MEM_PATH_HINT}, and check my Gemini Enterprise connection.`,
  },
  'model-guide': {
    title: 'Model Selection & Using Claude in AGY',
    subtitle: 'Switch between Gemini 4, Orchestrator & Anthropic Claude 5.5 + Dual-Model reviews',
    badge: 'Gemini 4 + Claude',
    seedPrompt:
      '/model-guide Show me when to use Google Gemini 4, Orchestrator, and Anthropic Claude 5.5 in Antigravity, how to run a 2-pass Dual-Model adversarial review, and our compliance guardrails.',
  },
  'orchestrator-guide': {
    title: 'Mastering Orchestrator (Planner + Hydrogen)',
    subtitle: 'Pair Gemini 4 Neon/Argon/Carbon planning with fast Hydrogen execution & auto-recovery',
    badge: 'Orchestrator',
    seedPrompt:
      '/orchestrator-guide Show me how to select and prompt Orchestrator (Neon, Argon, Carbon) in Antigravity App and CLI for faster execution and lower quota burn.',
  },
  'token-usage': {
    title: 'Token & Quota Consumption Analyzer',
    subtitle: 'Retrieve exact 5h, 24h, 7d & 30d local token telemetry, cache hit % & HTML report',
    badge: 'Token Telemetry',
    seedPrompt:
      '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.',
  },
  'daily-brief': {
    title: 'Daily Executive Brief & Kickoff',
    subtitle: 'Combines Federated GE calendar/inbox with open Action Items & >21d contacts',
    badge: 'GE + Memory',
    seedPrompt:
      '/daily-brief Run my morning kickoff brief combining any connected Gemini Enterprise updates with my open P0/P1 Action Items, active milestones, and >21d stale contacts.',
  },
  'my-voice': {
    title: 'My Voice & Correspondence Drafter',
    subtitle: 'Drafts emails, official letters & constituent replies in your voice (Draft-Only)',
    badge: 'Draft-Only',
    seedPrompt:
      "/my-voice Draft a concise, BLUF [Draft-Only] email reply in my voice confirming next week's milestone review, listing 2 decisions needed, and flagging any unverified dates with [CONFIRM].",
  },
  'inbox-triage': {
    title: 'Rule-Driven Inbox & Incident Triage',
    subtitle: 'Priority threshold triage with fail-safe hold on unreadable attachments',
    badge: 'GE + Rules',
    seedPrompt:
      "/inbox-triage Triage my unread messages from the last 48 hours into Critical Action, Today's Replies, and Routine FYI—applying a fail-safe hold on any unreadable attachments.",
  },
  'agy-update': {
    title: 'Fast Git & HTTPS Suite Updater',
    subtitle: 'Incrementally syncs latest skills, templates & sidecar UIs via SHA-256 diff',
    badge: 'Executable',
    seedPrompt:
      '/agy-update Check version-manifest.json and incrementally sync any updated skills or sidecars while preserving my saved settings.',
  },
  'wv-update': {
    title: 'Fast Git & HTTPS Suite Updater',
    subtitle: 'Incrementally syncs latest skills, templates & sidecar UIs via SHA-256 diff',
    badge: 'Executable',
    seedPrompt:
      '/wv-update Check version-manifest.json and incrementally sync any updated skills or sidecars while preserving my saved settings.',
  },

  // 2. Clawy Coordinator & Federated Connectors
  'agy-coordinator': {
    title: 'Clawy — Multi-Agent Voice & Sprint Coordinator',
    subtitle: '3D mascot perch, Gemini Live voice, Group -> Goal -> Task sprints & worker relay',
    badge: 'Left Panel + Voice',
    seedPrompt:
      '/agy-coordinator Summarize my active worker conversations, current Group -> Goal -> Task sprints, and open blockers.',
  },
  'connect-ge': {
    title: 'Gemini Enterprise (GE) Instance Wizard',
    subtitle: 'Default hub linking Entra-synced Google Identity to federated sources',
    badge: 'MCP Bridge',
    seedPrompt:
      '/connect-ge Check my current Gemini Enterprise configuration and walk me through connecting or testing my federated agency search instance.',
  },
  'connect-m365-workspace': {
    title: 'Outlook, SharePoint, OneDrive, Teams & Drive',
    subtitle: 'Chronological thread & citation retrieval across federated M365/Workspace',
    badge: 'GE Federated',
    seedPrompt:
      '/connect-m365-workspace Search across my federated SharePoint, OneDrive, and Outlook sources for recent program policy updates and summarize with exact document citations.',
  },
  'connect-github-bigquery': {
    title: 'GitHub & Cost-Capped BigQuery Setup',
    subtitle: 'Federated GitHub search + direct PR workflow & 1 GB BigQuery dry-run caps',
    badge: 'Cloud + Repo',
    seedPrompt:
      '/connect-github-bigquery Help me verify keyless BigQuery Application Default Credentials with a 1 GB maximumBytesBilled cost guardrail and run a safe read-only schema check.',
  },

  // 3. Design Studio
  'agy-dashboard': {
    title: 'Zero-Node Interactive Executive Dashboards',
    subtitle: 'Runs over file:// in Chrome/Edge or Side Pane with drag-and-drop Customize Layout',
    badge: 'Executable UI',
    seedPrompt:
      '/agy-dashboard Spin up an interactive executive KPI & program readiness dashboard with 4 KPI cards, regional breakdowns, and live visual Customize Layout.',
  },
  'wv-dashboard': {
    title: 'Zero-Node Interactive Executive Dashboards',
    subtitle: 'Runs over file:// in Chrome/Edge or Side Pane with drag-and-drop Customize Layout',
    badge: 'Executable UI',
    seedPrompt:
      '/wv-dashboard Spin up an interactive Public Sector executive KPI & grant readiness dashboard with 4 KPI cards, regional breakdowns, and live visual Customize Layout.',
  },
  slides: {
    title: '16:9 Executive Presentation Decks',
    subtitle: 'Responsive HTML/CSS slide decks with speaker notes & Save-to-PDF',
    badge: 'Visual Deck',
    seedPrompt:
      '/slides Create a crisp 6-slide executive briefing deck with speaker notes covering Q4 program milestones, risk mitigations, budget burn rate, and next-30-day decisions.',
  },
  'doc-design': {
    title: 'Branded Stakeholder Flyers & BLUF Memos',
    subtitle: 'Print-CSS fact sheets, 1-page decision memos & public notices',
    badge: 'Print-Ready',
    seedPrompt:
      '/doc-design Design a 1-page print-ready executive decision memo and stakeholder eligibility checklist with high-contrast callout boxes and clean print pagination.',
  },

  // 4. Public / WV State Workflows
  'foia-expert': {
    title: 'Public Records / FOIA Discovery, Redaction & Vaughn Index',
    subtitle:
      SUITE_VARIANT === 'wv'
        ? 'Google Vault + Purview KQL + W. Va. Code § 29B-1-4 & 5 U.S.C. § 552 segregability'
        : 'Google Vault + Purview KQL + 5 U.S.C. § 552 & State Open Records segregability',
    badge: 'Statutory SOP',
    seedPrompt:
      '/foia-expert Translate a public records request for "all Q3 vendor communications regarding cloud portal outages" into narrowed Google Vault and Purview KQL queries plus a sample Vaughn Index.',
  },
  'legal-procurement-review': {
    title: 'State Legal & Procurement Contract Review',
    subtitle: 'Audits sovereign immunity, fiscal non-appropriation & AI data terms (1:3:9)',
    badge: '1:3:9 Risk',
    seedPrompt:
      '/legal-procurement-review Walk me through a 1:3:9 public-sector risk audit checklist for a SaaS contract—checking sovereign immunity, fiscal non-appropriation, data ownership, and AI training bans.',
  },
  'policy-program-audit': {
    title: 'Legislative & Cross-Document Consistency Audit',
    subtitle: 'Catches conflicting caps, dates, or eligibility rules across program docs',
    badge: 'Audit Gate',
    seedPrompt:
      '/policy-program-audit Run a cross-document consistency audit template to catch conflicting dollar caps, submission deadlines, or match-waiver percentages across an RFP, FAQ, and public flyer.',
  },

  // 5. Government Services (public_sector)
  'document-intake-cleanup-and-validation': {
    title: 'Public Sector Document Intake & Validation',
    subtitle: 'Validates applicant paystubs, leases, residency proofs & monthly gross income math',
    badge: 'public_sector',
    seedPrompt:
      '/document-intake-cleanup-and-validation Simulate an intake validation check on two biweekly paystubs ($1,420.50 and $1,485.00 gross) and a residential lease, verifying prospective monthly gross income math and missing proofs.',
  },
  'expense-auditor': {
    title: 'Expense Auditor (2 CFR Part 200)',
    subtitle: 'Audits grant expenditure ledgers, receipts & vouchers against Uniform Guidance',
    badge: 'public_sector',
    seedPrompt:
      '/expense-auditor Audit a sample 5-line federal grant expenditure voucher against 2 CFR Part 200 Uniform Guidance—flagging unallowable entertainment/refreshment costs, missing itemized receipts, and undocumented T&M hours.',
  },
  'foia-request-processing': {
    title: 'FOIA Request Processing',
    subtitle: 'First-pass search & 3-table officer report across connected agency systems',
    badge: 'public_sector',
    seedPrompt:
      '/foia-request-processing Walk through a structured three-table first-pass FOIA officer report for a request seeking broadband grant scoring rubrics and correspondence from the last 90 days.',
  },
  'plain-language-notice-generator': {
    title: 'Plain Language Notice Generator',
    subtitle: 'Rewrites public advisories & notices into plain language with zero fact invention',
    badge: 'public_sector',
    seedPrompt:
      '/plain-language-notice-generator Rewrite a dense agency water-system maintenance advisory into clear Grade-7 plain language while preserving every exact date, phone number, and statutory notice block.',
  },
  'policy-and-statute-assistant': {
    title: 'Policy and Statute Assistant',
    subtitle: 'Pinpoint federal/CFR & state administrative code citations with authority hierarchy',
    badge: 'public_sector',
    seedPrompt:
      '/policy-and-statute-assistant Explain the authority hierarchy and pinpoint 2 CFR Part 200 citations governing emergency noncompetitive procurement vs. competitive sealed bids.',
  },
  'public-records-redaction': {
    title: 'Public Records Redaction',
    subtitle: 'Drafts federal & state FOIA redactions with pinpoint citations & officer flags',
    badge: 'public_sector',
    seedPrompt:
      '/public-records-redaction Demonstrate a first-pass segregability and redaction table on a sample incident intake memo containing constituent SSNs, personal cell numbers, and pre-decisional legal advice.',
  },
  'rfp-vendor-evaluation': {
    title: 'RFP Vendor Evaluation',
    subtitle: 'Cross-checks vendor bid packages against RFP rubrics with page-cited matrices',
    badge: 'public_sector',
    seedPrompt:
      '/rfp-vendor-evaluation Build a structured RFP vendor evaluation matrix template comparing 3 bidder proposals across Mandatory Pass/Fail Gates, Technical Approach, Security/Compliance, and Cost.',
  },

  // 6. Engineering
  'modernize-refactor': {
    title: 'Stage-Gated Legacy App Modernization',
    subtitle: 'Stage 0/1/2 Crucible + 6-section blueprint & A/B parity verification',
    badge: '3-Stage Crucible',
    seedPrompt:
      '/modernize-refactor Generate a Stage 1 6-section modernization blueprint for migrating a legacy monolithic forms service to a stateless, least-privilege Cloud Run API with A/B parity tests.',
  },
  'deploy-cloudrun': {
    title: 'Zero-Docker Cloud Run Source Deployment',
    subtitle: 'Remote Cloud Build deploy with dedicated SA, IAP & Secret Manager',
    badge: 'Cloud Run',
    seedPrompt:
      '/deploy-cloudrun Generate a hardened zero-Docker Cloud Run source deployment script in us-east4 using a dedicated least-privilege service account, --set-secrets, and .gcloudignore.',
  },
  'bigquery-architect': {
    title: 'BigQuery SQL Translator & Cost Optimizer',
    subtitle: 'Legacy T-SQL/Oracle/Postgres migration, partitioning & dry-run caps',
    badge: 'BigQuery SQL',
    seedPrompt:
      '/bigquery-architect Translate a legacy SQL Server date-windowed reporting query into partitioned, clustered BigQuery Standard SQL with parameterized @start_date filters and a dry-run byte check.',
  },
  'find-cloud-skill': {
    title: 'On-Demand Google Cloud Skill Loader',
    subtitle: 'Loads specialized GKE, AlloyDB, Apigee & Vertex AI skills on demand',
    badge: 'Live Catalog',
    seedPrompt:
      '/find-cloud-skill Search the Google Cloud skill catalog for Assured Workloads, VPC Service Controls, and Vertex AI IAM best practices and summarize what to load.',
  },

  // 7. Security
  'security-audit': {
    title: 'OWASP, Cloud WAF & Assured Workloads Audit',
    subtitle: 'Zero-install code & architecture security review (CJIS/HIPAA/FedRAMP)',
    badge: 'Security Gate',
    seedPrompt:
      '/security-audit Run a defense-in-depth OWASP Top 10 and Google Cloud WAF security review on the current workspace—checking DOM XSS sinks, path traversal, auth boundaries, and secret hygiene.',
  },
  'iam-secret-hygiene': {
    title: 'Least-Privilege IAM & Secret Manager Hygiene',
    subtitle: 'Audits overly broad roles, default compute SAs & plaintext env secrets',
    badge: 'IAM + Secrets',
    seedPrompt:
      '/iam-secret-hygiene Audit our deployment configs for Default Compute Service Account usage, primitive Editor/Owner bindings, or inline API keys, and output least-privilege gcloud replacements.',
  },

  // 8. Memory & Prep
  memory: {
    title: 'Personal Memory & Action Items Manager',
    subtitle: 'Queries & updates action_items.md, contacts.md (>21d), initiatives/ & topics/',
    badge: 'Memory + Actions',
    seedPrompt: `/memory Summarize my current workspace memory in ${MEM_PATH_HINT}—including open P0/P1 Action Items, active initiatives, and any >21d stale contacts.`,
  },
  'meeting-notes': {
    title: '4-Tier Meeting Notes Compactor & Action Extractor',
    subtitle: 'Compacts call notes (0-7d / 8-30d / 31-90d / 90d+) & updates Last_Touch_Date',
    badge: '4-Tier Memory',
    seedPrompt:
      "/meeting-notes Compact my latest meeting notes into my top active initiative's running_notes.md, extract any new to-dos into action_items.md, and update contacts.md.",
  },
  'meeting-prep': {
    title: '15-Minute Call Prep & Adversarial Minto SCQA Critic',
    subtitle: '1-card brief + Situation -> Complication -> Hard Question -> Counter-Move',
    badge: 'SCQA Red-Team',
    seedPrompt:
      '/meeting-prep Build a 1-page pre-meeting brief and an Adversarial Minto SCQA Critic ("Angle & Pushback to Watch For" + evidence-backed counter-moves) for my highest-priority active initiative.',
  },
  'followup-plan': {
    title: 'Sent-First Follow-Up Sweep & Draft Stager',
    subtitle: 'Verifies completed items first, updates Action Items & stages [Draft-Only] replies',
    badge: 'Follow-Up Sweep',
    seedPrompt: `/followup-plan Run a follow-up delta sweep across ${MEM_PATH_HINT}action_items.md and contacts.md, save followups/latest_action_plan.md, and stage [Draft-Only] check-ins for my top 2 open P0 items.`,
  },
  'swarm-prep': {
    title: '4-Subagent Parallel 360 Prep Swarm',
    subtitle: 'Fans out Memory Scout, SCQA Critic, Solution Architect & Outbound Auditor',
    badge: '4-Agent Swarm',
    seedPrompt:
      '/swarm-prep Run a 4-agent parallel 360 prep pack for my top active initiative—combining initiative status, an L100-L300 talk track with a Mermaid diagram, SCQA pushback, and a pre-scrubbed [Draft-Only] recap.',
  },
  'weekly-impact': {
    title: 'Friday 3-Altitude Weekly Impact Rollup',
    subtitle: 'Generates Executive Outcomes, Reusable Assets & Velocity + impact/ledger.json',
    badge: '3-Altitude ROI',
    seedPrompt:
      "/weekly-impact Generate this week's 3-Altitude accomplishment summary (Executive Outcomes, Cross-Team Reusable Assets, Workstream Velocity) into weekly/ and update impact/ledger.json.",
  },
  'no-ai-slop': {
    title: '17-Pattern Anti-AI-Slop Editor',
    subtitle: 'Strips LLM filler clichés, binary-contrast gimmicks & em-dash clusters',
    badge: 'Anti-Slop',
    seedPrompt:
      '/no-ai-slop Audit and rewrite this sample paragraph into crisp, natural prose: "First and foremost, in today\'s ever-evolving landscape, we want to delve into this paradigm-shifting portal rollout—it\'s not just an upgrade, it\'s a game changer for holistic synergy!"',
  },
  'outbound-scrub': {
    title: 'Deterministic Outbound Secret, PII & Placeholder Scanner',
    subtitle: 'Catches private keys, tokens, SSNs & unresolved [CONFIRM] / [TODO] tags',
    badge: 'Safety Gate',
    seedPrompt:
      '/outbound-scrub Scan my latest draft (or followups/latest_action_plan.md) for leaked API keys, SSNs, unresolved [CONFIRM: ...] / [TODO] placeholders, and AI-slop filler before I send anything externally.',
  },

  // 9. Scheduled Automations
  automations: {
    title: 'Scheduled Automations & Timezone Manager',
    subtitle: 'Configures IANA timezone for Morning Brief, Follow-Up, Compactor & Friday Impact',
    badge: 'Opt-In Cron',
    seedPrompt:
      '/automations Configure my scheduled automations to my local IANA timezone, run a quick readiness check, and give me the link to enable them in the Automations dashboard.',
  },

  // 10. Companion Skills
  'ttx-simulator': {
    title: 'HSEEP Multi-Role Tabletop & Crisis Simulator',
    subtitle: '6 Fog-of-War agency seats, ERG 2024 SVG plume map, 7-Essentials scorer & AAR/IP',
    badge: 'Offline HTML',
    seedPrompt:
      '/ttx-simulator Spin up Operation Winter Gorge (Ice Storm + UN1005 Anhydrous Ammonia leak + Water SCADA cyber intrusion), run --verify on all ERG 2024 distances, and open ttx-standalone.html in the Side Pane.',
  },
  'field-ops-kit': {
    title: 'Disaster Field Readiness & 6-Check Forensic Crosswalk Kit',
    subtitle: '7-Tab Disaster Binder, 25-Q County Self-Check, Debris Transit Slider & SEOC Matrix',
    badge: 'FEMA PA Audit',
    seedPrompt:
      '/field-ops-kit Launch the 7-Tab Disaster Timeline Binder, 25-Question County Readiness Self-Check, and 6-Check Forensic Debris Hauling Crosswalk in the Side Pane.',
  },
  dashboard: {
    title: 'Dashboard Studio — BigQuery & Visual Layout Editor',
    subtitle: 'Screenshot style emulation + read-only BigQuery/SQL + Customize Layout drawer',
    badge: 'BI Studio',
    seedPrompt:
      '/dashboard Create a new interactive executive dashboard—ask me if I have a reference screenshot to emulate or spin up a clean Public Sector KPI template.',
  },
};

function readHeaderSlice(filePath, maxBytes = 4096) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(maxBytes);
    const bytesRead = fs.readSync(fd, buf, 0, maxBytes, 0);
    return buf.slice(0, bytesRead).toString('utf-8');
  } catch {
    return '';
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
}

export function parseSkillFrontmatter(rawMarkdown) {
  const text = String(rawMarkdown || '').replace(/^\uFEFF/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: '', description: '' };
  const block = m[1];
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  let desc = '';
  const singleLineDesc = block.match(/^description:\s*([^>|][^\r\n]+)$/m);
  if (singleLineDesc) {
    desc = singleLineDesc[1].trim().replace(/^['"]|['"]$/g, '');
  } else {
    const multiMatch = block.match(/^description:\s*[>|]-?\r?\n((?:[ \t]+[^\r\n]+\r?\n?)+)/m);
    if (multiMatch) {
      desc = multiMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ');
    }
  }
  return {
    name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : '',
    description: desc,
  };
}

export function humanizeSkillId(skillId) {
  return String(skillId || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const SUITE_PLUGIN_SETS = {
  generic: new Set([
    'agy-onboarding',
    'agy-connectors',
    'agy-design-studio',
    'agy-public-workflows',
    'agy-engineering-cloud',
    'agy-security',
    'agy-second-brain',
    'agy-twin-automations',
    'wv-onboarding',
    'wv-connectors',
    'wv-design-studio',
    'wv-state-workflows',
    'wv-engineering-cloud',
    'wv-security',
    'wv-second-brain',
    'wv-automations',
    'emergency-readiness',
  ]),
  'twin-kit': new Set([
    'agy-twin-memory',
    'agy-twin-workflows',
    'agy-twin-voice',
    'agy-twin-automations',
    'wv-automations',
    'emergency-readiness',
  ]),
};

function scanUserSkillDirectory(rootDir, { isWorkspace = false, customSeedsMap = {}, suiteSkillIds, overriddenSkillIds, toggleLedger = null }) {
  const results = [];
  if (!rootDir || !fs.existsSync(rootDir)) return results;

  let rootStat;
  try {
    rootStat = fs.lstatSync(rootDir);
  } catch {
    return results;
  }
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) return results;

  let skillDirs = [];
  try {
    skillDirs = fs
      .readdirSync(rootDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.') && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(d.name))
      .map((d) => d.name)
      .sort()
      .slice(0, 200);
  } catch {
    return results;
  }

  for (const skillId of skillDirs) {
    const sDir = path.join(rootDir, skillId);
    const activeMd = path.join(sDir, 'SKILL.md');
    const disabledMd = path.join(sDir, 'SKILL.md.disabled');
    const hasActive = fs.existsSync(activeMd);
    const hasDisabled = !hasActive && fs.existsSync(disabledMd);
    if (!hasActive && !hasDisabled) continue;

    const mdPath = hasActive ? activeMd : disabledMd;
    let mdStat = null;
    try {
      mdStat = fs.lstatSync(mdPath);
    } catch {
      continue;
    }
    if (!mdStat || mdStat.isSymbolicLink() || !mdStat.isFile()) continue;

    const newMetaPath = path.join(sDir, '.agy-skill-meta.json');
    const legacyMetaPath = path.join(sDir, '.twin-skill-meta.json');
    const metaPath = fs.existsSync(newMetaPath) ? newMetaPath : legacyMetaPath;
    let meta = null;
    if (!isWorkspace && fs.existsSync(metaPath)) {
      try {
        const mStat = fs.lstatSync(metaPath);
        if (mStat && !mStat.isSymbolicLink() && mStat.isFile()) {
          meta = __parseJsonNoBom(fs.readFileSync(metaPath, 'utf-8'));
        }
      } catch {
        meta = null;
      }
    }

    const isSuiteOverride = !isWorkspace && suiteSkillIds.has(skillId);
    if (isSuiteOverride) {
      overriddenSkillIds.add(skillId);
    }

    const parsed = parseSkillFrontmatter(readHeaderSlice(mdPath, 4096));
    const baseCurated = (meta && meta.forkedFrom && CURATED_SKILL_SEEDS[meta.forkedFrom]) || CURATED_SKILL_SEEDS[skillId] || null;
    const seedEntry = customSeedsMap[skillId] || null;

    const cleanHumanTitle = humanizeSkillId(parsed.name || skillId);
    const shortHint = parsed.description
      ? parsed.description.replace(/\s+/g, ' ').trim().slice(0, 110)
      : `Run the ${cleanHumanTitle} workflow`;

    const defaultSeedPrompt =
      (meta && meta.seedPrompt) ||
      (baseCurated
        ? baseCurated.seedPrompt.replace(
            new RegExp(`^/${meta && meta.forkedFrom ? meta.forkedFrom : skillId}\\b`),
            `/${skillId}`
          )
        : `/${skillId} Help me apply the ${cleanHumanTitle} skill to my current task (${shortHint}${shortHint.length >= 110 ? '...' : ''}).`);

    const activeSeedPrompt = seedEntry && seedEntry.seedPrompt ? String(seedEntry.seedPrompt) : defaultSeedPrompt;

    const title =
      (seedEntry && seedEntry.title) ||
      (meta && meta.title) ||
      (parsed.name && parsed.name !== skillId ? parsed.name : '') ||
      (baseCurated && meta ? `${baseCurated.title} (My Copy)` : cleanHumanTitle);

    const subtitle =
      (seedEntry && seedEntry.subtitle) ||
      (meta && meta.subtitle) ||
      (parsed.description
        ? parsed.description.slice(0, 145) + (parsed.description.length > 145 ? '...' : '')
        : isWorkspace
          ? 'Workspace skill discovered in .gemini/skills/'
          : 'Personal skill stored in ~/.gemini/config/skills/ — update-proof & owned by you.');

    const personalKind = isWorkspace
      ? 'workspace'
      : meta && meta.mode === 'authored'
        ? 'created'
        : meta
          ? 'forked'
          : 'authored';

    const badge = isWorkspace
      ? 'Workspace Skill'
      : isSuiteOverride
        ? '★ My Override · Protected'
        : personalKind === 'forked'
          ? '★ My Copy · Protected'
          : '★ Personal Skill';

    const ledgerDisabled = Boolean(
      toggleLedger &&
        toggleLedger.disabledSkills &&
        toggleLedger.disabledSkills[`my-skills/${skillId}`]
    );

    results.push({
      id: skillId,
      plugin: isWorkspace ? 'workspace-skills' : 'my-skills',
      scope: 'my',
      isPersonalCopy: true,
      personalKind,
      deletableCopy: !isWorkspace && Boolean(meta),
      writable: !isWorkspace,
      forkedFrom: (meta && meta.forkedFrom) || (isSuiteOverride ? skillId : ''),
      forkMode: isSuiteOverride ? 'override' : personalKind === 'forked' ? 'copy' : 'personal',
      command: `/${skillId}`,
      title,
      subtitle,
      badge,
      enabled: hasActive && !ledgerDisabled,
      seedPrompt: activeSeedPrompt,
      defaultSeedPrompt,
      hasCustomSeed: Boolean(seedEntry && seedEntry.seedPrompt && seedEntry.seedPrompt !== defaultSeedPrompt),
      skillMdPath: mdPath,
    });
  }

  return results;
}

export function buildSkillsCatalog(pluginsSuiteRoot, options = {}) {
  const personalSkillsRoot = options.personalSkillsRoot || '';
  const workspaceSkillsRoot = options.workspaceSkillsRoot || '';
  const customSeedsMap = options.customSeedsMap && typeof options.customSeedsMap === 'object' ? options.customSeedsMap : {};
  const toggleLedger = options.toggleLedger || null;
  const lsDisabledMap = options.lsDisabledMap || {};
  const suiteMode = options.suiteMode === 'twin-kit' ? 'twin-kit' : 'generic';
  const allowedSuitePlugins = SUITE_PLUGIN_SETS[suiteMode];

  const buckets = new Map();
  const overriddenSkillIds = new Set();
  const suiteSkillIds = new Set(Object.keys(CURATED_SKILL_SEEDS));

  // 1. Always initialize ★ My Personal Skills bucket so users always see their personal category pill!
  const globalPersonal = scanUserSkillDirectory(personalSkillsRoot, {
    isWorkspace: false,
    customSeedsMap,
    suiteSkillIds,
    overriddenSkillIds,
    toggleLedger,
  });

  let workspacePersonal = [];
  if (
    workspaceSkillsRoot &&
    personalSkillsRoot &&
    path.resolve(workspaceSkillsRoot) !== path.resolve(personalSkillsRoot)
  ) {
    const seenPersonal = new Set(globalPersonal.map((s) => s.id));
    workspacePersonal = scanUserSkillDirectory(workspaceSkillsRoot, {
      isWorkspace: true,
      customSeedsMap,
      suiteSkillIds,
      overriddenSkillIds,
      toggleLedger,
    }).filter((s) => !seenPersonal.has(s.id));
  }

  const allPersonalSkills = [...globalPersonal, ...workspacePersonal];
  buckets.set('my-skills', {
    categoryId: 'my-skills',
    plugin: 'my-skills',
    scope: 'my',
    order: 1,
    categoryLabel: '★ My Personal Skills (~/.gemini/config/skills/ & Workspace)',
    chipLabel: '★ My Personal Skills',
    pluginEnabled: allPersonalSkills.length === 0 ? true : allPersonalSkills.some((s) => s.enabled),
    skills: allPersonalSkills,
  });

  // 2. Scan Installed Plugin Skills (~/.gemini/config/plugins/)
  if (pluginsSuiteRoot && fs.existsSync(pluginsSuiteRoot)) {
    let pluginDirs = [];
    try {
      pluginDirs = fs
        .readdirSync(pluginsSuiteRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))
        .map((d) => d.name)
        .sort();
    } catch {
      pluginDirs = [];
    }

    const expectedPrefix = SUITE_VARIANT === 'wv' ? 'wv-' : 'agy-';

    for (const pluginDirName of pluginDirs) {
      if (SUITE_VARIANT === 'generic' && RETIRED_AGY_PLUGINS.includes(pluginDirName)) continue;
      const pluginPath = path.join(pluginsSuiteRoot, pluginDirName);
      const skillsRoot = path.join(pluginPath, 'skills');
      if (!fs.existsSync(skillsRoot)) continue;

      let pluginManifest = {};
      const manifestPath = path.join(pluginPath, 'plugin.json');
      if (fs.existsSync(manifestPath)) {
        try {
          pluginManifest = __parseJsonNoBom(fs.readFileSync(manifestPath, 'utf-8'));
        } catch {
          pluginManifest = {};
        }
      }
      const pluginId = String(pluginManifest.name || pluginDirName);
      const pluginDefaultDisabled = Boolean(pluginManifest.disabled);
      const pluginDisabled =
        lsDisabledMap[pluginId] !== undefined
          ? Boolean(lsDisabledMap[pluginId])
          : toggleLedger && toggleLedger.disabledPlugins && toggleLedger.disabledPlugins[pluginId] !== undefined
            ? Boolean(toggleLedger.disabledPlugins[pluginId])
            : pluginDefaultDisabled;

      // Keep WV suite plugins as 'suite' in WV mode, and Generic AGY plugins as 'suite' in Generic mode
      const matchesOwnSuite =
        pluginId.startsWith(expectedPrefix) ||
        pluginDirName.startsWith(expectedPrefix) ||
        pluginId === 'emergency-readiness';
      const isSuitePlugin = matchesOwnSuite && (allowedSuitePlugins.has(pluginId) || allowedSuitePlugins.has(pluginDirName));
      const catScope = isSuitePlugin ? 'suite' : 'other';

      let skillDirs = [];
      try {
        skillDirs = fs
          .readdirSync(skillsRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.isSymbolicLink() && !d.name.startsWith('.'))
          .map((d) => d.name)
          .sort();
      } catch {
        continue;
      }

      for (const skillId of skillDirs) {
        const sDir = path.join(skillsRoot, skillId);
        const activeMd = path.join(sDir, 'SKILL.md');
        const disabledMd = path.join(sDir, 'SKILL.md.disabled');
        const hasActive = fs.existsSync(activeMd);
        const hasDisabled = !hasActive && fs.existsSync(disabledMd);
        if (!hasActive && !hasDisabled) continue;

        const mdPath = hasActive ? activeMd : disabledMd;
        let mdStat = null;
        try {
          mdStat = fs.lstatSync(mdPath);
        } catch {
          continue;
        }
        if (!mdStat || mdStat.isSymbolicLink() || !mdStat.isFile()) continue;

        const curated = CURATED_SKILL_SEEDS[skillId] || null;
        let parsed = { name: '', description: '' };
        if (!curated) {
          parsed = parseSkillFrontmatter(readHeaderSlice(mdPath, 4096));
        }

        const categoryKey = isSuitePlugin && PUBLIC_SECTOR_GOV_SKILLS.has(skillId) ? 'public_sector' : pluginId;
        const catDef = CATEGORY_DEFINITIONS[categoryKey] || {
          order: isSuitePlugin ? 88 : 200,
          categoryLabel: String(pluginManifest.displayName || humanizeSkillId(pluginId)),
          chipLabel: humanizeSkillId(pluginId),
        };

        if (!buckets.has(categoryKey)) {
          buckets.set(categoryKey, {
            categoryId: categoryKey,
            plugin: pluginId,
            scope: catScope,
            order: catDef.order,
            categoryLabel: catDef.categoryLabel,
            chipLabel: catDef.chipLabel,
            pluginEnabled: !pluginDisabled,
            skills: [],
          });
        }

        const title = curated ? curated.title : humanizeSkillId(parsed.name || skillId);
        const subtitle = curated
          ? curated.subtitle
          : parsed.description
            ? parsed.description.slice(0, 140) + (parsed.description.length > 140 ? '...' : '')
            : `Run /${skillId} workflow in Antigravity chat.`;
        const defaultSeedPrompt = curated
          ? curated.seedPrompt
          : `/${skillId} Walk me through the ${title} workflow and run a realistic starter example.`;
        const seedOverride = customSeedsMap[skillId] && !overriddenSkillIds.has(skillId) ? customSeedsMap[skillId] : null;
        const activeSeedPrompt = seedOverride && seedOverride.seedPrompt ? String(seedOverride.seedPrompt) : defaultSeedPrompt;

        const ledgerKey = `${pluginId}/${skillId}`;
        const ledgerSkillDisabled = Boolean(
          toggleLedger && toggleLedger.disabledSkills && toggleLedger.disabledSkills[ledgerKey]
        );

        buckets.get(categoryKey).skills.push({
          id: skillId,
          plugin: pluginId,
          scope: catScope,
          isPersonalCopy: false,
          writable: false,
          overriddenByPersonal: overriddenSkillIds.has(skillId),
          command: `/${skillId}`,
          title,
          subtitle,
          badge: overriddenSkillIds.has(skillId)
            ? 'Overridden by ★ My Skills'
            : curated
              ? curated.badge
              : pluginDefaultDisabled
                ? 'Opt-In'
                : 'Skill',
          enabled: hasActive && !pluginDisabled && !ledgerSkillDisabled,
          seedPrompt: activeSeedPrompt,
          defaultSeedPrompt,
          hasCustomSeed: Boolean(seedOverride && seedOverride.seedPrompt && seedOverride.seedPrompt !== defaultSeedPrompt),
          skillMdPath: mdPath,
        });
      }
    }
  }

  const orderedIds = Object.keys(CURATED_SKILL_SEEDS);
  const categories = Array.from(buckets.values()).sort(
    (a, b) => a.order - b.order || a.categoryLabel.localeCompare(b.categoryLabel)
  );
  for (const cat of categories) {
    if (cat.categoryId !== 'my-skills') {
      cat.pluginEnabled = cat.skills.some((s) => s.enabled);
    }
    cat.skills.sort((a, b) => {
      const ia = orderedIds.indexOf(a.id);
      const ib = orderedIds.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.command.localeCompare(b.command);
    });
  }

  return categories;
}
