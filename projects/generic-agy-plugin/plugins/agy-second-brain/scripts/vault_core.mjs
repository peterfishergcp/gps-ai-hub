#!/usr/bin/env node
/**
 * Shared Zero-Dependency Personal Workspace Memory Engine for Google Antigravity.
 *
 * Powers both `vault_cli.mjs` and the `My Antigravity` Sidecar UI (`sidecars/twin-vault-ui/main.mjs`).
 * Uses only built-in Node.js standard library modules so it runs out of the box on Windows,
 * macOS, and Linux inside Antigravity Desktop with zero npm or Python dependencies.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'dist']);
const SKIP_EXTS = new Set(['.pyc', '.pyo', '.exe', '.dll', '.so', '.dylib', '.zip']);

function copyDirSafeOnce(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (ent.isSymbolicLink()) continue;
    const sp = path.join(srcDir, ent.name);
    const dp = path.join(dstDir, ent.name === 'gtd_board.md' ? 'action_items.md' : ent.name);
    const st = fs.lstatSync(sp);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      copyDirSafeOnce(sp, dp);
    } else if (st.isFile() && !fs.existsSync(dp)) {
      fs.copyFileSync(sp, dp);
    }
  }
}

export function getVaultRoot(overrideDir = '') {
  const explicit = overrideDir || process.env.AGY_MEMORY_DIR || process.env.AGY_TWIN_VAULT_DIR || '';
  if (explicit) {
    return path.resolve(explicit);
  }
  // Zero-Footprint Standard: 100% self-contained inside ~/.gemini/config/plugin_data/my-antigravity/memory
  const preferred = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'my-antigravity', 'memory');
  const legacyMy = path.join(os.homedir(), ['my', 'antigravity'].join('-'), 'memory');
  const legacyTwin = path.join(os.homedir(), 'antigravity-twin', 'memory');
  if (!fs.existsSync(preferred)) {
    const legacySrc = fs.existsSync(legacyMy) ? legacyMy : fs.existsSync(legacyTwin) ? legacyTwin : '';
    if (legacySrc) {
      try {
        copyDirSafeOnce(legacySrc, preferred);
      } catch {
        // Ignore read-only legacy folder errors; always return the Zero-Footprint preferred path
      }
    }
  }
  return path.resolve(preferred);
}

export function resolveActionItemsPath(vaultRoot) {
  const preferred = path.join(vaultRoot, 'action_items.md');
  const legacy = path.join(vaultRoot, 'gtd_board.md');
  if (!fs.existsSync(preferred) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, preferred);
    } catch {
      return legacy;
    }
  }
  return preferred;
}

export function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const dt = new Date(Date.now() - days * 86400 * 1000);
  return dt.toISOString().slice(0, 10);
}

export function slugify(input) {
  const s = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return s || 'general-initiative';
}

export function isWithinRoot(targetPath, rootPath) {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  if (resolvedTarget === resolvedRoot) return true;
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  return resolvedTarget.startsWith(rootWithSep);
}

export const ROLE_PRESETS = {
  'pm': {
    id: 'pm',
    label: 'Program / Project Manager',
    defaultRoleTitle: 'Senior Technical Program Manager',
    defaultOrg: 'Enterprise Delivery & Operations',
    lanes: [
      'Cross-functional milestone tracking, RAID log management, and executive status readouts',
      'Vendor and stakeholder alignment across engineering, security, legal, and finance',
      'Scope trade-off memos, launch readiness checklists, and quarterly roadmap planning',
    ],
    initiatives: [
      {
        slug: 'portal-modernization',
        title: 'Unified Service Portal Modernization',
        rag: 'GREEN',
        milestone: 'Phase 2 Accessibility & SSO Sign-Off (Next Thursday)',
        summary: 'Consolidating three legacy self-service portals behind one WCAG 2.1 AA web experience.',
        decisions: [
          'Selected federated OIDC single sign-on with step-up MFA for administrative actions.',
          'Capped Phase 2 scope to top 5 constituent workflows so Q2 launch stays on schedule.',
        ],
        stakeholders: [
          { name: 'Dana Morales', email: 'dmorales@example.org', role: 'Executive Sponsor', priority: 'On-time Q2 cutover & adoption KPIs', daysSinceTouch: 4 },
          { name: 'Marcus Chen', email: 'mchen@example.org', role: 'Lead Platform Architect', priority: 'OIDC token session timeout & load test', daysSinceTouch: 26 },
        ],
        notes: [
          '- Agreed to freeze UI schema changes this Friday at 5:00 PM local time.',
          '- Marcus flagged that legacy CSV exports peak at 140 MB; moving exports to async background jobs.',
        ],
      },
      {
        slug: 'vendor-sla-renewal',
        title: 'Core Data Vendor SLA & Contract Renewal',
        rag: 'AMBER',
        milestone: 'Redline Review with Legal & Procurement (Tuesday)',
        summary: 'Re-baselining uptime penalties, exit data portability, and AI training exclusions before Q3 renewal.',
        decisions: [
          'Require 99.9% monthly uptime SLA with service credits starting at 99.5%.',
          'Explicitly prohibit vendor model training on organization uploads.',
        ],
        stakeholders: [
          { name: 'Priya Nair', email: 'pnair@example.org', role: 'Procurement Counsel', priority: 'Data ownership & termination-for-convenience clause', daysSinceTouch: 29 },
        ],
        notes: [
          '- Vendor returned draft v2 without the 30-day data export commitment; legal redline needed before Tuesday call.',
        ],
      },
    ],
    tasks: [
      { priority: 'P0', initiative: 'vendor-sla-renewal', task: 'Send redlined Section 9 data portability & AI exclusion language to Priya Nair before Tuesday review' },
      { priority: 'P0', initiative: 'portal-modernization', task: 'Confirm async CSV export load-test sign-off with Marcus Chen' },
      { priority: 'P1', initiative: 'portal-modernization', task: 'Publish Friday Steering Committee 1-page RAG brief and updated milestone tracker' },
      { priority: 'P2', initiative: 'General', task: 'Archive completed Q1 launch retrospective action items into topics/lessons-learned.md' },
    ],
  },
  'developer': {
    id: 'developer',
    label: 'Software / Cloud / Data Engineer',
    defaultRoleTitle: 'Staff Software & Cloud Data Engineer',
    defaultOrg: 'Platform & Data Engineering',
    lanes: [
      'Service architecture, API reliability, cloud deployment hardening, and code modernization',
      'Warehouse SQL optimization, CDC replication pipelines, and query cost guardrails',
      'Incident root-cause write-ups, ADRs (Architecture Decision Records), and PR reviews',
    ],
    initiatives: [
      {
        slug: 'claims-ingest-pipeline',
        title: 'Event-Driven Claims & Ledger Ingest Pipeline',
        rag: 'GREEN',
        milestone: 'Production Cutover & Replay Benchmark (Wednesday)',
        summary: 'Replacing nightly batch SFTP scripts with incremental CDC streaming and partitioned analytical tables.',
        decisions: [
          'Partition warehouse tables by event_date and cluster by account_id with a 1 GB interactive query scan guardrail.',
          'Run Cloud Run workers under a dedicated least-privilege service account with secrets mounted from Secret Manager.',
        ],
        stakeholders: [
          { name: 'Elena Rostova', email: 'erostova@example.org', role: 'Principal Data Architect', priority: 'Idempotent replay & schema evolution checks', daysSinceTouch: 3 },
          { name: 'Devon Brooks', email: 'dbrooks@example.org', role: 'Security Engineering Lead', priority: 'VPC egress controls & IAM audit sign-off', daysSinceTouch: 24 },
        ],
        notes: [
          '- 150k-row staging replay finished in 54.2s end-to-end with zero duplicate primary keys.',
          '- Need final confirmation from Devon on egress firewall rule logging window before Wednesday cutover.',
        ],
      },
      {
        slug: 'auth-service-refactor',
        title: 'Legacy Python Token Service Refactor',
        rag: 'AMBER',
        milestone: 'Canary 10% Traffic Ramp (Friday)',
        summary: 'Eliminating mutable default state bugs, adding structured OpenTelemetry traces, and containerless source deploy.',
        decisions: [
          'Enforce parameterized SQL queries across all lookup endpoints and remove raw string interpolation.',
        ],
        stakeholders: [
          { name: 'Samir Patel', email: 'spatel@example.org', role: 'SRE Tech Lead', priority: 'p99 latency < 85ms & rollback runbook', daysSinceTouch: 6 },
        ],
        notes: [
          '- Caught and fixed boundary bug on exact tier threshold values during parity unit tests.',
        ],
      },
    ],
    tasks: [
      { priority: 'P0', initiative: 'claims-ingest-pipeline', task: 'Check in with Devon Brooks on VPC egress audit logs ahead of Wednesday production cutover' },
      { priority: 'P0', initiative: 'auth-service-refactor', task: 'Add p99 latency alert threshold and canary rollback command to ADR-014' },
      { priority: 'P1', initiative: 'claims-ingest-pipeline', task: 'Document parameterized BigQuery backfill runbook with dry-run byte caps' },
      { priority: 'P2', initiative: 'General', task: 'Capture OpenTelemetry memory-trim tuning flags in topics/lessons-learned.md' },
    ],
  },
  'public-sector': {
    id: 'public-sector',
    label: 'Public Sector / State Agency Knowledge Worker',
    defaultRoleTitle: 'Program Operations & Policy Analyst',
    defaultOrg: 'State Agency Operations & Constituent Services',
    lanes: [
      'Grant & benefit program operations, policy consistency checks, and constituent plain-language notices',
      'Public records / FOIA coordination, interagency memo drafting, and vendor deliverable tracking',
      'Compliance documentation across state administrative code and federal grant rules (2 CFR Part 200)',
    ],
    initiatives: [
      {
        slug: 'broadband-grant-round-3',
        title: 'Regional Broadband & Infrastructure Grant Round 3',
        rag: 'GREEN',
        milestone: 'Applicant FAQ & Scoring Rubric Publication (Thursday)',
        summary: 'Coordinating county grant intake packets, eligibility verification checklists, and public FAQ notices.',
        decisions: [
          'Standardized plain-language eligibility checklist so rural applicants see required attachments upfront.',
          'Aligned press release cap ($15M) and closing date (Dec 31) with published administrative program rules.',
        ],
        stakeholders: [
          { name: ' Carla Jennings', email: 'cjennings@agency.example.gov', role: 'Deputy Bureau Director', priority: 'Zero variance between FAQ, flyer, and statutory cap', daysSinceTouch: 2 },
          { name: 'Robert Vance', email: 'rvance@county.example.gov', role: 'County Grants Coordinator', priority: 'Clear match-waiver documentation instructions', daysSinceTouch: 27 },
        ],
        notes: [
          '- Caught draft web banner listing $18M instead of $15M; corrected prior to public posting.',
          '- Need to send updated match-waiver intake template to county coordinators.',
        ],
      },
      {
        slug: 'records-modernization-pilot',
        title: 'Public Records & FOIA Intake Workflow Pilot',
        rag: 'AMBER',
        milestone: 'Counsel Segregability Rubric Sign-Off (Monday)',
        summary: 'Streamlining search query generation, Vaughn index tracking, and officer human-in-the-loop review.',
        decisions: [
          'All PII and deliberative-process redactions require explicit human records-officer sign-off prior to release.',
        ],
        stakeholders: [
          { name: 'Hannah Kim', email: 'hkim@agency.example.gov', role: 'Senior Assistant General Counsel', priority: 'Line-by-line exemption citations & gaps log', daysSinceTouch: 23 },
        ],
        notes: [
          '- Added unconnected legacy SMS archive flag to the standard Gaps table so officers track manual checks.',
        ],
      },
    ],
    tasks: [
      { priority: 'P0', initiative: 'records-modernization-pilot', task: 'Follow up with Hannah Kim on final FOIA segregability checklist before Monday pilot kickoff' },
      { priority: 'P0', initiative: 'broadband-grant-round-3', task: 'Draft plain-language Round 3 FAQ update and county coordinator email for Carla Jennings review' },
      { priority: 'P1', initiative: 'broadband-grant-round-3', task: 'Send match-waiver checklist update to Robert Vance and county grant leads' },
      { priority: 'P2', initiative: 'General', task: 'Log 2 CFR Part 200 documentation reminders into topics/lessons-learned.md' },
    ],
  },
  'leader': {
    id: 'leader',
    label: 'Executive / Team Lead / Director',
    defaultRoleTitle: 'Director of Strategy & Operations',
    defaultOrg: 'Executive Leadership Office',
    lanes: [
      'Portfolio health reviews, budget & headcount prioritization, and cross-department escalation resolution',
      'Direct-report coaching, 1:1 follow-through, and quarterly board / leadership briefings',
      'Strategic vendor partnerships, risk governance, and organizational enablement',
    ],
    initiatives: [
      {
        slug: 'fy27-operating-plan',
        title: 'FY27 Annual Operating Plan & AI Enablement Rollout',
        rag: 'GREEN',
        milestone: 'Executive Steering Readout (Friday 1:00 PM)',
        summary: 'Sequencing high-ROI workflow pilots across 4 departments with clear security guardrails and measurable time savings.',
        decisions: [
          'Start Cohort 1 with 50 power users across Program Ops, Finance, Legal, and IT using standardized Antigravity plugins.',
        ],
        stakeholders: [
          { name: 'Jordan Alvarez', email: 'jalvarez@example.org', role: 'Chief Information Security Officer', priority: 'Default human-in-the-loop review policy & audit trail', daysSinceTouch: 5 },
          { name: 'Claire Bennett', email: 'cbennett@example.org', role: 'VP of Finance', priority: 'License utilization & quarterly ROI benchmarks', daysSinceTouch: 25 },
        ],
        notes: [
          '- Pilot users cut weekly status and meeting-prep time from 45 minutes to under 5 minutes per session.',
        ],
      },
    ],
    tasks: [
      { priority: 'P0', initiative: 'fy27-operating-plan', task: 'Share Cohort 1 ROI metrics and license utilization brief with Claire Bennett ahead of Friday readout' },
      { priority: 'P1', initiative: 'fy27-operating-plan', task: 'Finalize 3-Altitude weekly leadership summary for Friday 1:00 PM Steering Committee' },
      { priority: 'P2', initiative: 'General', task: 'Review quarterly recognition notes and 1:1 growth goals in impact/ledger.json' },
    ],
  },
};

export function buildProfileFiles({ name, roleTitle, org, timezone, preset }) {
  const safeName = (name || 'Workspace User').trim();
  const safeRole = (roleTitle || preset.defaultRoleTitle).trim();
  const safeOrg = (org || preset.defaultOrg).trim();
  const safeTz = (timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York').trim();
  const today = isoToday();

  const identityMd = `# Identity & Standing Context

- **Name:** ${safeName}
- **Role:** ${safeRole}
- **Organization / Team:** ${safeOrg}
- **Primary Time Zone:** \`${safeTz}\` (always anchor daily briefs, calendars, and deadlines in \`${safeTz}\` first)
- **Persona Track:** ${preset.label} (\`${preset.id}\`)
- **Memory Path:** \`~/.gemini/config/plugin_data/my-antigravity/memory/\`
- **Last Updated:** \`${today}\`

## Core Operational Lanes
${preset.lanes.map((lane, i) => `${i + 1}. ${lane}`).join('\n')}
`;

  const portfolioMd = `# Active Portfolio & Workstreams

Track primary programs, technical systems, or operational workstreams here. Detailed per-initiative context lives under \`initiatives/<slug>/\`.

| Initiative Slug | Title | Target Milestone | Memory Path |
| :--- | :--- | :--- | :--- |
${preset.initiatives
  .map(
    (init) =>
      `| \`${init.slug}\` | ${init.title} | ${init.milestone} | \`initiatives/${init.slug}/\` |`
  )
  .join('\n')}
`;

  const playbooksMd = `# Standing Operational Playbooks

1. **Morning Kickoff (\`/daily-brief\`):** Check \`action_items.md\` (\`P0\` and \`P1\`), \`contacts.md\` (\`>21d\` stale stakeholders), and \`initiatives/*/status.md\` first. Combine with connected calendar/inbox MCP context when available, and return the Top 3 concrete actions for today.
2. **Post-Meeting Compaction (\`/meeting-notes\`):** Strip base64/HTML noise, log fresh decisions in \`initiatives/<slug>/running_notes.md\` (4-Tier Recency Compaction), extract every action item into \`action_items.md\` with Zero Decay, and update \`Last_Touch_Date\` in \`contacts.md\`.
3. **Pre-Meeting SCQA Prep (\`/meeting-prep\`):** Produce a 1-page brief with Where We Left Off, open commitments, and an Adversarial Minto Pyramid (SCQA) Critic (*Situation -> Complication -> Hard Question -> Counter-Move*).
4. **Twice-Daily Follow-Up Sweep (\`/followup-plan\`):** Verify already-sent replies first to avoid duplicate nudges, group open items into \`P0\` / \`P1\` / \`P2\`, and stage \`[Draft-Only]\` messages without auto-sending.
5. **Friday 3-Altitude Closeout (\`/weekly-impact\`):** Summarize weekly outcomes across Altitude 1 (Executive / Leadership Outcomes), Altitude 2 (Cross-Team Reusable Assets), and Altitude 3 (Workstream Velocity).
`;

  const voiceMd = `# Authentic Communication Voice & Anti-Slop Rules

Write like a clear, direct, experienced ${safeRole} talking to a respected colleague or stakeholder.

## Voice Principles
- **Lead with the answer (BLUF):** Open with the decision, status, or concrete ask in the first 1-2 sentences.
- **Protect concrete facts:** Keep exact dates, owners, dollar figures, configuration flags, and document citations intact; cut abstract commentary around them.
- **Scannable structure:** For follow-up emails and recaps, use a short 1-2 sentence opening, 2-4 crisp bullets explaining *why* each item matters plus source links, and a 1-sentence next step.
- **Punctuation restraint:** Use spaced hyphens (\` - \`), commas, or parentheses instead of em-dash clusters. Avoid decorative emojis or bolding every third word in prose.
- **Banned AI Clichés:** Never use \`delve\`, \`leverage\`, \`utilize\`, \`streamline\`, \`robust\`, \`cutting-edge\`, \`game changer\`, \`paradigm shift\`, \`synergy\`, \`holistic\`, \`seamless\`, \`tapestry\`, \`first and foremost\`, or \`it's worth noting\`. Never use binary contrast gimmicks (*"It's not X. It's Y."*).
- **Strict Draft-Only Label:** Prefix every outbound draft with \`[Draft: Email -> Recipient | Subject: ...]\` or \`[Draft: Chat/Teams -> Recipient]\` and wait for explicit approval before sending.
`;

  const sharedAgyProfileMd = `# My Antigravity Personal Profile

- **Name:** ${safeName}
- **Role:** ${safeRole}
- **Organization:** ${safeOrg}
- **Time Zone:** ${safeTz}
- **Memory Directory:** ~/.gemini/config/plugin_data/my-antigravity/memory/
- **Style:** Direct, BLUF-first, concrete facts over buzzwords, spaced hyphens (\` - \`), strict \`[Draft-Only]\` outbound safety.
`;

  return { identityMd, portfolioMd, playbooksMd, voiceMd, sharedAgyProfileMd };
}

export function initializeVault({
  vaultDir = '',
  role = 'pm',
  name = '',
  roleTitle = '',
  org = '',
  timezone = '',
  seedDemo = true,
  force = false,
  syncHomeProfile = true,
} = {}) {
  const root = getVaultRoot(vaultDir);
  const preset = ROLE_PRESETS[role] || ROLE_PRESETS['pm'];
  const safeOwner = (name || 'Me').trim();
  const today = isoToday();

  const dirs = [
    root,
    path.join(root, 'profile'),
    path.join(root, 'initiatives'),
    path.join(root, 'followups'),
    path.join(root, 'weekly'),
    path.join(root, 'topics'),
    path.join(root, 'impact'),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  const { identityMd, portfolioMd, playbooksMd, voiceMd, sharedAgyProfileMd } = buildProfileFiles({
    name: safeOwner,
    roleTitle,
    org,
    timezone,
    preset,
  });

  const writeIfAllowed = (filePath, content) => {
    if (force || !fs.existsSync(filePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return true;
    }
    return false;
  };

  writeIfAllowed(path.join(root, 'profile', 'identity.md'), identityMd);
  writeIfAllowed(path.join(root, 'profile', 'portfolio.md'), portfolioMd);
  writeIfAllowed(path.join(root, 'profile', 'playbooks.md'), playbooksMd);
  writeIfAllowed(path.join(root, 'profile', 'voice.md'), voiceMd);

  if (syncHomeProfile) {
    try {
      const profileDir = path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'my-antigravity');
      fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
      const profileTarget = path.join(profileDir, 'agy-profile.md');
      if (force || !fs.existsSync(profileTarget)) {
        fs.writeFileSync(profileTarget, sharedAgyProfileMd, 'utf-8');
      }
    } catch {
      // Ignore if home directory is read-only in restricted test sandboxes
    }
  }

  // Build Action Items Board
  const p0Lines = [];
  const p1Lines = [];
  const p2Lines = [];
  if (seedDemo) {
    for (const t of preset.tasks) {
      const line = `- [ ] [${t.initiative}] ${t.task} [Owner: ${safeOwner}] (Added: ${today})`;
      if (t.priority === 'P0') p0Lines.push(line);
      else if (t.priority === 'P1') p1Lines.push(line);
      else p2Lines.push(line);
    }
  }

  const gtdMd = `# Action Items & Suggested To-Dos

Items on this list never auto-expire. Only mark an item \`[x]\` when confirmed completed or \`[-]\` when explicitly dropped.

## P0 - Immediate / Today
${p0Lines.length ? p0Lines.join('\n') : ''}

## P1 - This Week
${p1Lines.length ? p1Lines.join('\n') : ''}

## P2 - Scheduled / Backlog
${p2Lines.length ? p2Lines.join('\n') : ''}

## P3 - Someday / Watchlist

## Completed Archive
- [x] [Onboarding] Initialize My Antigravity Personal Memory [Owner: ${safeOwner}] (Added: ${today})
`;
  writeIfAllowed(resolveActionItemsPath(root), gtdMd);

  // Build Contacts CRM
  const contactRows = [];
  if (seedDemo) {
    for (const init of preset.initiatives) {
      for (const c of init.stakeholders) {
        const touchDate = daysAgoIso(c.daysSinceTouch);
        const statusLabel = c.daysSinceTouch > 21 ? 'STALE (>21d)' : 'Active';
        contactRows.push(
          `| ${c.name.trim()} | ${c.email} | ${c.role} | ${init.slug} | ${c.priority} | ${touchDate} | ${statusLabel} |`
        );
      }
    }
  }

  const contactsMd = `# Stakeholder & Relationship Pulse

Any key stakeholder with \`Last_Touch_Date\` older than 21 days is flagged \`STALE (>21d)\` during \`/daily-brief\` and \`/meeting-prep\`.

## Key Stakeholders & Collaborators

| Name | Email | Role | Initiative | Key Priorities | Last_Touch_Date | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${contactRows.join('\n')}
`;
  writeIfAllowed(path.join(root, 'contacts.md'), contactsMd);

  // Build 4-file isolated initiatives
  if (seedDemo) {
    for (const init of preset.initiatives) {
      createOrUpdateInitiative(root, {
        slug: init.slug,
        title: init.title,
        rag: init.rag,
        milestone: init.milestone,
        summary: init.summary,
        decisions: init.decisions,
        stakeholders: init.stakeholders,
        notes: init.notes,
        force,
      });
    }
  }

  writeIfAllowed(
    path.join(root, 'topics', 'lessons-learned.md'),
    `# Reusable Patterns & Lessons Learned\n\n- **${today}:** Initialized My Antigravity Personal Memory (\`${preset.label}\` preset). Store reusable checklists, query patterns, and policy notes in \`topics/\` so future sessions stay grounded.\n`
  );

  writeIfAllowed(
    path.join(root, 'followups', 'latest_action_plan.md'),
    `# Latest Follow-Up & Action Plan\n\n- **Last Sweep:** \`${today}\`\n- Run \`/followup-plan\` anytime to audit recent threads, update \`action_items.md\`, and generate \`[Draft-Only]\` follow-up messages.\n`
  );

  writeIfAllowed(
    path.join(root, 'impact', 'ledger.json'),
    JSON.stringify(
      {
        owner: safeOwner,
        role: (roleTitle || preset.defaultRoleTitle).trim(),
        organization: (org || preset.defaultOrg).trim(),
        updatedAt: new Date().toISOString(),
        entries: [
          {
            date: today,
            initiative: seedDemo && preset.initiatives[0] ? preset.initiatives[0].slug : 'onboarding',
            altitude1ExecutiveOutcome: 'Configured persistent My Antigravity workspace memory for repeatable daily execution.',
            altitude2ReusableAsset: 'Standardized 4-file initiative memory isolation and Action Items tracking.',
            altitude3WorkstreamVelocity: 'Seeded baseline action items, stakeholder staleness tracking, and voice guardrails.',
          },
        ],
      },
      null,
      2
    ) + '\n'
  );

  return {
    ok: true,
    vaultRoot: root,
    role: preset.id,
    roleLabel: preset.label,
    summary: getVaultState(root),
  };
}

export function createOrUpdateInitiative(
  vaultRoot,
  {
    slug,
    title,
    rag = 'GREEN',
    milestone = 'TBD',
    summary = '',
    decisions = [],
    stakeholders = [],
    notes = [],
    force = false,
  }
) {
  const cleanSlug = slugify(slug || title);
  const initDir = path.join(vaultRoot, 'initiatives', cleanSlug);
  fs.mkdirSync(initDir, { recursive: true });
  const today = isoToday();
  const normRag = ['GREEN', 'AMBER', 'RED'].includes(String(rag).toUpperCase())
    ? String(rag).toUpperCase()
    : 'GREEN';

  const writeIf = (fname, content) => {
    const p = path.join(initDir, fname);
    if (force || !fs.existsSync(p)) {
      fs.writeFileSync(p, content, 'utf-8');
    }
  };

  writeIf(
    'status.md',
    `# ${title} - Rolling RAG Status

- **Last Updated:** \`${today}\`
- **RAG Status:** ${normRag}
- **Next Milestone:** ${milestone}
- **Summary:** ${summary || 'Active workstream tracked in Second Brain vault.'}
`
  );

  writeIf(
    'context_and_decisions.md',
    `# ${title} - Architecture, Policy & Key Decisions

## Core Context & Scope
${summary || 'Document core constraints, architecture choices, budget caps, or governing statutes here.'}

## Recorded Decisions
${decisions.length ? decisions.map((d) => `- **${today}:** ${d}`).join('\n') : `- **${today}:** Workspace created.`}
`
  );

  writeIf(
    'stakeholders.md',
    `# ${title} - Stakeholders & Roles

| Name | Email | Role | Priorities |
| :--- | :--- | :--- | :--- |
${
  stakeholders.length
    ? stakeholders
        .map((s) => `| ${s.name.trim()} | ${s.email || '-'} | ${s.role || '-'} | ${s.priority || '-'} |`)
        .join('\n')
    : '| TBD | - | Sponsor / Lead | Define success criteria |'
}
`
  );

  writeIf(
    'running_notes.md',
    `# ${title} - Running Notes (4-Tier Recency Compaction)

## Tier 1 (0-7 Days - Detailed Session Notes & Verbatim Decisions)
### ${today} - Initial Baseline
${notes.length ? notes.join('\n') : '- Initialized 4-file initiative workspace.'}

## Tier 2 (8-30 Days - Tactical 3-5 Bullet Summaries)
- *(Older Tier 1 notes compact here automatically during \`/meeting-notes\`.)*

## Tier 3 (31-90 Days - Dated Milestone Rollup)
- *(31-90 day tactical summaries roll into dated milestones here.)*

## Tier 4 (90+ Days - Evergreen Baseline)
- *(Durable historical context stays distilled here.)*
`
  );

  return { slug: cleanSlug, path: initDir };
}

export function parseGtdBoard(vaultRoot) {
  const gtdPath = resolveActionItemsPath(vaultRoot);
  if (!fs.existsSync(gtdPath)) {
    return {
      path: gtdPath,
      buckets: [],
      items: [],
      counts: { open: 0, completed: 0, total: 0, p0Open: 0, p1Open: 0, p2Open: 0, p3Open: 0 },
    };
  }

  const lines = fs.readFileSync(gtdPath, 'utf-8').split(/\r?\n/);
  let currentBucket = 'P0';
  let currentTitle = 'P0 - Immediate / Today';
  const bucketsMap = new Map();
  const items = [];
  const taskRe = /^(\s*-\s*\[([ xX\-])\]\s*)(?:\[([^\]]+)\]\s*)?(.*?)(?:\s*\[(?:Owner:\s*)?([^\]]+)\])?(?:\s*\((Added:[^)]+)\))?\s*$/;

  const ensureBucket = (id, title) => {
    if (!bucketsMap.has(id)) {
      bucketsMap.set(id, { id, title, items: [] });
    }
    return bucketsMap.get(id);
  };

  lines.forEach((rawLine, idx) => {
    const stripped = rawLine.trim();
    if (stripped.startsWith('## ')) {
      const heading = stripped.slice(3).trim();
      const upper = heading.toUpperCase();
      if (upper.startsWith('P0')) currentBucket = 'P0';
      else if (upper.startsWith('P1')) currentBucket = 'P1';
      else if (upper.startsWith('P2')) currentBucket = 'P2';
      else if (upper.startsWith('P3')) currentBucket = 'P3';
      else if (upper.includes('COMPLETED')) currentBucket = 'Completed';
      else currentBucket = heading.split(/\s+/)[0] || 'Other';
      currentTitle = heading;
      ensureBucket(currentBucket, currentTitle);
      return;
    }

    const m = rawLine.match(taskRe);
    if (m) {
      const stateChar = m[2].toLowerCase();
      const checked = stateChar === 'x' || stateChar === '-';
      const initiative = (m[3] || 'General').trim();
      const task = (m[4] || '').trim();
      const owner = (m[5] || 'Me').trim();
      const dateMeta = (m[6] || '').trim();
      const item = {
        lineNumber: idx + 1,
        rawLine,
        checked,
        state: stateChar,
        bucket: currentBucket,
        bucketTitle: currentTitle,
        initiative,
        task,
        owner,
        dateMeta,
      };
      ensureBucket(currentBucket, currentTitle).items.push(item);
      items.push(item);
    }
  });

  const openItems = items.filter((i) => !i.checked);
  const completedItems = items.filter((i) => i.checked);
  return {
    path: gtdPath,
    buckets: Array.from(bucketsMap.values()),
    items,
    counts: {
      open: openItems.length,
      completed: completedItems.length,
      total: items.length,
      p0Open: openItems.filter((i) => i.bucket === 'P0').length,
      p1Open: openItems.filter((i) => i.bucket === 'P1').length,
      p2Open: openItems.filter((i) => i.bucket === 'P2').length,
      p3Open: openItems.filter((i) => i.bucket === 'P3').length,
    },
  };
}

export function toggleGtdTask(vaultRoot, { lineNumber, rawMatch } = {}) {
  const gtdPath = resolveActionItemsPath(vaultRoot);
  if (!fs.existsSync(gtdPath)) {
    throw new Error(`action_items.md not found at ${gtdPath}`);
  }
  const lines = fs.readFileSync(gtdPath, 'utf-8').split(/\r?\n/);
  let targetIdx = -1;

  if (Number.isInteger(lineNumber) && lineNumber >= 1 && lineNumber <= lines.length) {
    if (/^\s*-\s*\[[ xX\-]\]/.test(lines[lineNumber - 1])) {
      targetIdx = lineNumber - 1;
    }
  }
  if (targetIdx === -1 && rawMatch) {
    const needle = String(rawMatch).trim();
    targetIdx = lines.findIndex(
      (l) => /^\s*-\s*\[[ xX\-]\]/.test(l) && (l.trim() === needle || (needle.length > 10 && l.includes(needle)))
    );
  }
  if (targetIdx === -1) {
    throw new Error('Matching action item line not found');
  }

  const orig = lines[targetIdx];
  let checked = false;
  let updated;
  if (/^\s*-\s*\[\s\]/.test(orig)) {
    updated = orig.replace(/^(\s*-\s*)\[\s\]/, '$1[x]');
    checked = true;
  } else {
    updated = orig.replace(/^(\s*-\s*)\[[xX\-]\]/, '$1[ ]');
    checked = false;
  }
  lines[targetIdx] = updated;
  fs.writeFileSync(gtdPath, lines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
  return {
    ok: true,
    lineNumber: targetIdx + 1,
    checked,
    updatedLine: updated,
    gtd: parseGtdBoard(vaultRoot),
  };
}

export function addGtdTask(
  vaultRoot,
  { initiative = 'General', task = '', priority = 'P0', owner = 'Me', addedDate = '' } = {}
) {
  const cleanTask = String(task || '').trim();
  if (!cleanTask) {
    throw new Error('Task text is required');
  }
  const gtdPath = resolveActionItemsPath(vaultRoot);
  if (!fs.existsSync(gtdPath)) {
    initializeVault({ vaultDir: vaultRoot, seedDemo: false });
  }

  const cleanInit = String(initiative || 'General').trim().replace(/^\[|\]$/g, '');
  const cleanOwner = String(owner || 'Me').trim().replace(/^\[|\]$/g, '');
  const normPrio = ['P0', 'P1', 'P2', 'P3'].includes(String(priority).toUpperCase())
    ? String(priority).toUpperCase()
    : 'P0';
  const dateStr = addedDate || isoToday();
  const newLine = `- [ ] [${cleanInit}] ${cleanTask} [Owner: ${cleanOwner}] (Added: ${dateStr})`;

  const lines = fs.readFileSync(gtdPath, 'utf-8').split(/\r?\n/);
  let insertIdx = -1;
  let inSection = false;
  for (let i = 0; i < lines.length; i += 1) {
    const stripped = lines[i].trim();
    if (stripped.startsWith('## ')) {
      const upper = stripped.slice(3).trim().toUpperCase();
      if (upper.startsWith(normPrio)) {
        inSection = true;
        insertIdx = i + 1;
        continue;
      } else if (inSection) {
        break;
      }
    }
    if (inSection && stripped.startsWith('- [')) {
      insertIdx = i;
      break;
    }
  }

  if (insertIdx === -1) {
    lines.push('', `## ${normPrio}`, newLine);
  } else {
    if (insertIdx < lines.length && lines[insertIdx].trim() === '') {
      insertIdx += 1;
    }
    lines.splice(insertIdx, 0, newLine);
  }

  fs.writeFileSync(gtdPath, lines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
  return {
    ok: true,
    addedLine: newLine,
    priority: normPrio,
    gtd: parseGtdBoard(vaultRoot),
  };
}

export function parseInitiatives(vaultRoot) {
  const initRoot = path.join(vaultRoot, 'initiatives');
  if (!fs.existsSync(initRoot)) return [];
  const entries = fs
    .readdirSync(initRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));

  return entries.map((dir) => {
    const slug = dir.name;
    const dirPath = path.join(initRoot, slug);
    const statusPath = path.join(dirPath, 'status.md');
    let title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    let rag = 'GREEN';
    let nextMilestone = '';
    let summary = '';
    let lastUpdated = '';

    if (fs.existsSync(statusPath)) {
      const txt = fs.readFileSync(statusPath, 'utf-8');
      const firstLine = txt.split(/\r?\n/)[0] || '';
      if (firstLine.startsWith('# ')) {
        title = firstLine.slice(2).split(/\s+-\s+Rolling RAG/i)[0].trim();
      }
      const mUpd = txt.match(/\*\*Last Updated:\*\*\s*`?([^`\n]+)`?/i);
      if (mUpd) lastUpdated = mUpd[1].trim();
      const mRag = txt.match(/\*\*RAG Status:\*\*\s*([^\n]+)/i);
      if (mRag) {
        const rawRag = mRag[1].toUpperCase();
        if (rawRag.includes('RED')) rag = 'RED';
        else if (rawRag.includes('AMBER') || rawRag.includes('YELLOW')) rag = 'AMBER';
        else rag = 'GREEN';
      }
      const mMs = txt.match(/\*\*Next Milestone:\*\*\s*([^\n]+)/i);
      if (mMs) nextMilestone = mMs[1].trim();
      const mSum = txt.match(/\*\*Summary:\*\*\s*([^\n]+)/i);
      if (mSum) summary = mSum[1].trim();
    }

    const fileNames = ['status.md', 'running_notes.md', 'context_and_decisions.md', 'stakeholders.md'];
    const files = {};
    for (const fn of fileNames) {
      const fp = path.join(dirPath, fn);
      const exists = fs.existsSync(fp);
      files[fn] = {
        name: fn,
        path: fp,
        exists,
        size: exists ? fs.statSync(fp).size : 0,
      };
    }

    return {
      slug,
      title,
      path: dirPath,
      rag,
      nextMilestone,
      summary,
      lastUpdated,
      files,
    };
  });
}

export function parseContacts(vaultRoot) {
  const contactsPath = path.join(vaultRoot, 'contacts.md');
  if (!fs.existsSync(contactsPath)) {
    return { path: contactsPath, contacts: [], counts: { total: 0, stale: 0, active: 0 } };
  }
  const lines = fs.readFileSync(contactsPath, 'utf-8').split(/\r?\n/);
  const contacts = [];
  const nowMs = Date.now();

  lines.forEach((rawLine, idx) => {
    const stripped = rawLine.trim();
    if (!stripped.startsWith('|') || !stripped.endsWith('|')) return;
    const cells = stripped
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 6) return;
    const firstLower = cells[0].toLowerCase();
    if (firstLower === 'name' || firstLower.startsWith(':---') || firstLower.startsWith('---')) return;

    const name = cells[0].replace(/\*\*|`/g, '').trim();
    const email = cells[1].replace(/\*\*|`/g, '').trim();
    const role = cells[2].replace(/\*\*|`/g, '').trim();
    const initiative = cells[3].replace(/\*\*|`/g, '').trim();
    const priorities = cells[4].trim();
    const lastTouch = cells[5].replace(/\*\*|`/g, '').trim();
    const rawStatus = (cells[6] || 'Active').replace(/\*\*/g, '').trim();

    let daysAgo = null;
    if (/^\d{4}-\d{2}-\d{2}/.test(lastTouch)) {
      const parsedMs = Date.parse(lastTouch.slice(0, 10) + 'T00:00:00Z');
      if (!Number.isNaN(parsedMs)) {
        daysAgo = Math.max(0, Math.floor((nowMs - parsedMs) / (86400 * 1000)));
      }
    }
    const isStale = (daysAgo !== null && daysAgo > 21) || /STALE/i.test(rawStatus);
    contacts.push({
      lineNumber: idx + 1,
      name,
      email,
      role,
      initiative,
      priorities,
      lastTouch,
      daysAgo,
      status: isStale ? 'STALE (>21d)' : 'Active',
      isStale,
    });
  });

  const staleCount = contacts.filter((c) => c.isStale).length;
  return {
    path: contactsPath,
    contacts,
    counts: {
      total: contacts.length,
      stale: staleCount,
      active: contacts.length - staleCount,
    },
  };
}

export function touchContact(vaultRoot, { name, date = '' } = {}) {
  const contactsPath = path.join(vaultRoot, 'contacts.md');
  if (!fs.existsSync(contactsPath)) {
    throw new Error(`contacts.md not found at ${contactsPath}`);
  }
  const needle = String(name || '').trim().toLowerCase();
  if (!needle) throw new Error('Contact name is required');
  const touchDate = date || isoToday();

  const lines = fs.readFileSync(contactsPath, 'utf-8').split(/\r?\n/);
  let updatedCount = 0;
  const nextLines = lines.map((line) => {
    const stripped = line.trim();
    if (!stripped.startsWith('|') || !stripped.endsWith('|')) return line;
    const cells = stripped
      .slice(1, -1)
      .split('|')
      .map((c) => c.trim());
    if (cells.length < 6) return line;
    if (cells[0].toLowerCase().includes(needle)) {
      cells[5] = touchDate;
      if (cells.length >= 7) cells[6] = 'Active';
      else cells.push('Active');
      updatedCount += 1;
      return `| ${cells.join(' | ')} |`;
    }
    return line;
  });

  if (updatedCount === 0) {
    throw new Error(`Contact matching "${name}" not found in contacts.md`);
  }
  fs.writeFileSync(contactsPath, nextLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
  return { ok: true, updatedCount, date: touchDate, contacts: parseContacts(vaultRoot) };
}

export function stripEmbeddedBlobs(markdownText) {
  return String(markdownText || '')
    .replace(/!\[[^\]]*\]\(data:image\/[^)]+\)/gi, '[embedded-image-stripped]')
    .replace(/data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{120,}/gi, '[base64-blob-stripped]');
}

export function ingestMeetingNotes(
  vaultRoot,
  { slug, title = 'Meeting Sync', rawNotes = '', date = '', owner = 'Me' } = {}
) {
  const cleanSlug = slugify(slug || title);
  const initDir = path.join(vaultRoot, 'initiatives', cleanSlug);
  if (!fs.existsSync(initDir)) {
    createOrUpdateInitiative(vaultRoot, { slug: cleanSlug, title: title || cleanSlug });
  }
  const notesPath = path.join(initDir, 'running_notes.md');
  const cleaned = stripEmbeddedBlobs(rawNotes).trim();
  const dateStr = date || isoToday();

  // Extract explicit markdown action items `- [ ] ...` and append to GTD board
  const extractedTasks = [];
  for (const line of cleaned.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[\s\]\s+(.+)$/);
    if (m && m[1].trim()) {
      const taskText = m[1].trim();
      addGtdTask(vaultRoot, {
        initiative: cleanSlug,
        task: taskText,
        priority: 'P1',
        owner,
        addedDate: dateStr,
      });
      extractedTasks.push(taskText);
    }
  }

  const existing = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf-8') : '';
  const tier1Header = '## Tier 1 (0-7 Days - Detailed Session Notes & Verbatim Decisions)';
  const entryBlock = `### ${dateStr} - ${title}\n${cleaned}\n`;

  let updatedNotes;
  if (existing.includes(tier1Header)) {
    updatedNotes = existing.replace(tier1Header, `${tier1Header}\n${entryBlock}`);
  } else {
    updatedNotes = `# ${cleanSlug} - Running Notes\n\n${tier1Header}\n${entryBlock}\n${existing}`;
  }
  fs.writeFileSync(notesPath, updatedNotes, 'utf-8');

  // Update status.md Last Updated
  const statusPath = path.join(initDir, 'status.md');
  if (fs.existsSync(statusPath)) {
    const st = fs.readFileSync(statusPath, 'utf-8');
    fs.writeFileSync(
      statusPath,
      st.replace(/\*\*Last Updated:\*\*\s*`?[^`\n]+`?/, `**Last Updated:** \`${dateStr}\``),
      'utf-8'
    );
  }

  return {
    ok: true,
    slug: cleanSlug,
    notesPath,
    extractedTasksCount: extractedTasks.length,
    extractedTasks,
  };
}

export function buildDirectoryTree(dirPath, rootPath = dirPath, depth = 0) {
  if (depth > 5 || !fs.existsSync(dirPath)) return null;
  const name = path.basename(dirPath);
  if (depth > 0 && name.startsWith('.')) return null;

  let stat;
  try {
    stat = fs.lstatSync(dirPath);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) return null;

  if (stat.isDirectory()) {
    if (SKIP_DIRS.has(name)) return null;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true }).sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      entries = [];
    }
    const children = [];
    let fileCount = 0;
    for (const ent of entries) {
      const childNode = buildDirectoryTree(path.join(dirPath, ent.name), rootPath, depth + 1);
      if (childNode) {
        children.push(childNode);
        fileCount += childNode.type === 'file' ? 1 : childNode.fileCount || 0;
      }
    }
    return {
      name,
      path: dirPath,
      relPath: dirPath === rootPath ? '' : path.relative(rootPath, dirPath).replace(/\\/g, '/'),
      type: 'directory',
      modifiedIso: stat.mtime.toISOString(),
      fileCount,
      children,
    };
  }

  const ext = path.extname(name).toLowerCase();
  if (SKIP_EXTS.has(ext)) return null;
  return {
    name,
    path: dirPath,
    relPath: path.relative(rootPath, dirPath).replace(/\\/g, '/'),
    type: 'file',
    ext,
    size: stat.size,
    modifiedIso: stat.mtime.toISOString(),
  };
}

export function getVaultState(vaultRoot) {
  const resolved = getVaultRoot(vaultRoot);
  const initialized = fs.existsSync(path.join(resolved, 'profile', 'identity.md'));
  const identityPath = path.join(resolved, 'profile', 'identity.md');
  const identityText = initialized ? fs.readFileSync(identityPath, 'utf-8') : '';

  const pickField = (label) => {
    const m = identityText.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*\`?([^\\n\`]+)\`?`, 'i'));
    return m ? m[1].trim() : '';
  };

  const gtd = parseGtdBoard(resolved);
  const initiatives = parseInitiatives(resolved);
  const contacts = parseContacts(resolved);
  const tree = fs.existsSync(resolved) ? buildDirectoryTree(resolved, resolved) : null;

  return {
    initialized,
    vaultRoot: resolved,
    profile: {
      name: pickField('Name') || 'Workspace User',
      role: pickField('Role') || 'Not configured yet',
      organization: pickField('Organization / Team') || '',
      timezone: pickField('Primary Time Zone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
      personaTrack: pickField('Persona Track') || '',
    },
    gtd,
    initiatives,
    contacts,
    vaultFileCount: tree ? tree.fileCount : 0,
    tree,
  };
}
