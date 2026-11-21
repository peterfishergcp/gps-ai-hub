/**
 * Generic AGY Plugin — Public Sector Antigravity Launchpad & Skill Registry
 * AM3 Light/Dark Portal Controller (Zero innerHTML / localStorage)
 */
(function () {
  'use strict';

  var STEP2_INSTALL_PROMPT = 'agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/generic-agy-plugin';

  var SKILLS = [
    { id: '/agy-onboard', title: 'Agency Role, Personal Memory & GE Quickstart', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: '60-second setup for agency role, personal voice tone, 1-step Personal Memory initialization, 30-60-90 plans, and SOP builders.', prompt: '/agy-onboard Help me set up my agency role, Personal Memory, and Gemini Enterprise connection.' },
    { id: '/model-guide', title: 'Using Claude & Gemini Models in AGY', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Switch between Anthropic Claude (Sonnet/Opus), Orchestrator, and Google Gemini in Desktop & CLI, run Dual-Model Cross-Reviews, and configure Vertex AI Model Garden.', prompt: '/model-guide Show me how to use Anthropic Claude alongside Google Gemini and Orchestrator in Antigravity, when to pick each model, and our agency quota & compliance guardrails.' },
    { id: '/orchestrator-guide', title: 'Mastering Orchestrator (Planner + Hydrogen)', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Pair Gemini 4 Neon/Argon/Carbon planning with fast Gemini 4 Hydrogen execution and auto-recovery across App and CLI.', prompt: '/orchestrator-guide Show me how best to select and prompt Orchestrator (Neon, Argon, Carbon) for faster execution and lower quota burn.' },
    { id: '/token-usage', title: 'Token & Quota Consumption Analyzer', category: 'Onboarding & Triage', type: 'Executable Skill', desc: 'Retrieves exact 5-hour, 24-hour, and 7-day local token telemetry, cache hit %, and renders an interactive Token Consumption report.', prompt: '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive report.' },
    { id: '/daily-brief', title: 'Daily Executive Kickoff Brief', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Unified morning priorities, calendar prep, P0/P1 Action Items, and >21d stale stakeholder check-ins grounded in Federated GE.', prompt: '/daily-brief Summarize my top priorities today, upcoming meetings, open Action Items, and stale stakeholder check-ins.' },
    { id: '/my-voice', title: 'My Voice & Correspondence Drafter', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Drafts voice-matched emails, memos, official letters, and constituent replies calibrated to voice.md (strictly Draft-Only).', prompt: '/my-voice Draft a clear, concise reply in my voice to the thread below.' },
    { id: '/inbox-triage', title: 'Rule-Driven Inbox & Incident Triage', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Separates immediate director escalations from routine items with a fail-safe hold on unreadable files.', prompt: '/inbox-triage Triage my unread emails from the last 48 hours and flag urgent leadership escalations.' },
    { id: '/agy-update', title: '1-Second Incremental Git & HTTPS Updater', category: 'Onboarding & Triage', type: 'Executable Skill', desc: 'SHA-256 incremental updater syncing changed skills over HTTPS 443 while preserving user toggles and GE settings.', prompt: '/agy-update Check if newer Generic AGY Plugin skills or templates are available.' },

    { id: '/chatski', title: 'Chatski — Google Chat & GE Connector Panel', category: 'Federated Connectors', tags: 'chat chatski google_chat spaces dm', type: 'Executable Skill', desc: 'Left-sidebar Google Chat workspace powered out-of-the-box by your Gemini Enterprise Chat Connector (with Drafts, ✨ Draft reply, and human-confirmed Send).', prompt: '/chatski Summarize my unread Google Chat spaces and direct messages via my Gemini Enterprise Chat Connector and stage Draft-Only replies in Chatski.' },
    { id: '/connect-ge', title: 'Federated Gemini Enterprise Wizard', category: 'Federated Connectors', type: 'Executable Skill', desc: 'Default hub connecting Entra-synced Google Identity to Outlook, SharePoint, OneDrive, Teams, Drive & GitHub via StreamAssist.', prompt: '/connect-ge Configure and test my Gemini Enterprise instance and federated connectors.' },
    { id: '/connect-m365-workspace', title: 'M365 & Workspace Grounded Search', category: 'Federated Connectors', type: 'SOP Playbook', desc: 'Chronological email/Teams reconstruction and SharePoint/OneDrive citation rules through Federated GE.', prompt: '/connect-m365-workspace Search SharePoint and OneDrive via my GE instance for the latest program tracker.' },
    { id: '/connect-github-bigquery', title: 'GitHub & Cost-Capped BigQuery', category: 'Federated Connectors', type: 'SOP Playbook', desc: 'Bridges federated GitHub search with direct PR workflows and 1 GB cost-capped read-only BigQuery.', prompt: '/connect-github-bigquery Configure read-only BigQuery access with a 1 GB scan cap.' },

    { id: '/agy-dashboard', title: 'Zero-Node Executive Dashboard Studio', category: 'Design Studio', type: 'Executable Skill', desc: 'Builds interactive dashboards with automatic Side-Pane visual rendering, 1-click HTML download, and drag-and-drop Customize Layout.', prompt: '/agy-dashboard Build an agency executive dashboard I can customize visually in Chrome or Edge.' },
    { id: '/slides', title: '16:9 HTML/PDF Presentation Decks', category: 'Design Studio', type: 'SOP Playbook', desc: 'Responsive 16:9 decks with Side-Pane visual preview, keyboard navigation, speaker notes drawer, and crisp Landscape PDF export.', prompt: '/slides Create an 8-slide public sector leadership presentation deck with speaker notes.' },
    { id: '/doc-design', title: 'Stakeholder Flyers & BLUF Memos', category: 'Design Studio', type: 'SOP Playbook', desc: 'Print-CSS 2-page fact sheets, 1-page BLUF decision memos, press releases, and plain-language public notices.', prompt: '/doc-design Design a 2-page print-ready stakeholder flyer and eligibility checklist.' },

    { id: '/foia-expert', title: 'FOIA Discovery & Vaughn Index', category: 'Public Workflows', type: 'SOP Playbook', desc: 'Google Vault + Microsoft Purview KQL queries, 5 U.S.C. § 552 & state public records redaction, and Vaughn Index report.', prompt: '/foia-expert Formulate Google Vault and Purview KQL discovery queries for this FOIA request and build a Vaughn Index report.' },
    { id: '/legal-procurement-review', title: 'Public Legal & Procurement Review', category: 'Public Workflows', type: 'SOP Playbook', desc: 'Audits contracts/SOWs for sovereign immunity, fiscal non-appropriation, indemnity, and AI terms (1:3:9 risk).', prompt: '/legal-procurement-review Review this vendor contract against public-sector sovereign immunity and non-appropriation rules.' },
    { id: '/policy-program-audit', title: 'Policy & Cross-Doc Consistency Audit', category: 'Public Workflows', type: 'SOP Playbook', desc: 'Bill/rule impact briefs and cross-document launch checks catching conflicting caps, tiers, or dates.', prompt: '/policy-program-audit Audit our program rules, stakeholder flyer, and web copy for conflicting numbers or dates.' },

    { id: '/document-intake-cleanup-and-validation', title: 'Public Sector Document Intake & Validation', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Screens uploaded citizen paystubs, leases, and residency proofs for defects and calculates prospective monthly gross income.', prompt: '/document-intake-cleanup-and-validation Validate these citizen proof documents and compute prospective monthly gross income.' },
    { id: '/expense-auditor', title: 'Grant Expense Auditor (2 CFR Part 200)', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Audits subrecipient grant expenditure ledgers and receipts against 2 CFR Part 200 Uniform Guidance and award terms.', prompt: '/expense-auditor Audit this quarterly subrecipient grant expenditure ledger against 2 CFR Part 200 and flag questioned costs.' },
    { id: '/foia-request-processing', title: 'FOIA Request Processing (3-Table Report)', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'First-pass public records scoping across connected systems with Matched Documents, Review Items, and Gaps tables.', prompt: '/foia-request-processing Review this FOIA request, confirm the governing law, evaluate search hits, and generate the 3-table officer report.' },
    { id: '/plain-language-notice-generator', title: 'Plain Language Notice Generator', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Rewrites dense regulatory notices into accessible plain language with zero fact invention and 100% citation preservation.', prompt: '/plain-language-notice-generator Rewrite this municipal utility advisory into plain language while preserving all dates, contacts, and regulatory blocks.' },
    { id: '/policy-and-statute-assistant', title: 'Policy & Statute Assistant', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Pinpoint federal CFR vs. state administrative code hierarchy analysis with a strict anti-hallucination retrieval gate.', prompt: '/policy-and-statute-assistant Research the controlling federal regulation and state administrative hierarchy for this SNAP eligibility question.' },
    { id: '/public-records-redaction', title: 'Public Records Redaction (50-State & Federal)', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Line-by-line first-pass redactions with pinpoint statutory citations, plain-English justifications, and officer flags.', prompt: '/public-records-redaction Draft first-pass public records redactions on this inspection memo with statutory citations and officer review flags.' },
    { id: '/rfp-vendor-evaluation', title: 'RFP Vendor Evaluation Matrix', category: 'Government Services', tags: 'public_sector', type: 'SOP Playbook', desc: 'Compiles page-cited Mandatory Pass/Fail matrices, cross-section contradiction flags, and scored evidence without auto-ranking.', prompt: '/rfp-vendor-evaluation Evaluate these vendor bid packages against our RFP mandatory requirements and flag any cross-section contradictions.' },

    { id: '/modernize-refactor', title: '3-Stage Legacy App Modernization', category: 'Engineering & Cloud', type: 'Executable Skill', desc: 'Stage 0 Safety Gate -> Stage 1 6-Section Blueprint & Bug Audit -> Stage 2 Crucible + A/B Parity + HTML Report.', prompt: '/modernize-refactor Inspect this legacy app and generate a Stage 1 6-section modernization blueprint.' },
    { id: '/deploy-cloudrun', title: 'Zero-Docker Cloud Run Deploy', category: 'Engineering & Cloud', type: 'SOP Playbook', desc: 'Deploys from source via remote Cloud Build with non-root containers, dedicated service account, and Secret Manager.', prompt: '/deploy-cloudrun Prepare this service for a hardened zero-Docker Cloud Run deployment in us-east4.' },
    { id: '/bigquery-architect', title: 'BigQuery SQL Migration & Tuning', category: 'Engineering & Cloud', type: 'SOP Playbook', desc: 'Translates T-SQL/Oracle/Postgres to BigQuery Standard SQL with partitioning, dry-run scan estimates, and @param safety.', prompt: '/bigquery-architect Translate this legacy SQL query to BigQuery Standard SQL with partitioning and a 1 GB cap.' },
    { id: '/find-cloud-skill', title: 'Live Google Cloud Skill Loader', category: 'Engineering & Cloud', type: 'Executable Skill', desc: 'Fetches specialized official GKE, AlloyDB, Apigee, and Vertex AI skills on demand over HTTPS 443.', prompt: '/find-cloud-skill Load the official Google Cloud skill for Assured Workloads.' },

    { id: '/security-audit', title: 'OWASP, Cloud WAF & Assured Workloads', category: 'Security & IAM', type: 'SOP Playbook', desc: 'Zero-install code and architecture audit aligned with OWASP Top 10, Cloud WAF, and FedRAMP/CJIS/HIPAA.', prompt: '/security-audit Run an OWASP and Google Cloud WAF security audit on this codebase.' },
    { id: '/iam-secret-hygiene', title: 'Least-Privilege IAM & Secret Hygiene', category: 'Security & IAM', type: 'SOP Playbook', desc: 'Replaces primitive roles, default compute SAs, and env secrets with Entra-synced Google groups and Secret Manager.', prompt: '/iam-secret-hygiene Audit our IAM bindings and replace env-var secrets with Secret Manager.' },

    { id: '/memory', title: 'Personal Memory & Action Items Initializer', category: 'Memory & Prep', tags: 'memory action_items initiatives', type: 'Executable Skill', desc: 'Initializes and manages ~/my-antigravity/memory/ (public-sector/pm/dev/leader presets, AI Inbox Action Items, >21d contacts & My Antigravity UI).', prompt: '/memory Initialize my Personal Memory using the public-sector preset and summarize my active Action Items and initiatives.' },
    { id: '/meeting-notes', title: 'Meeting Notes Harvester & 4-Tier Compactor', category: 'Memory & Prep', tags: 'memory notes compaction', type: 'Executable Skill', desc: 'Strips base64 bloat, applies 4-Tier Recency Compaction (0-7d to 90d+) to running_notes.md, extracts Action Items, and updates contacts.md.', prompt: '/meeting-notes Ingest and compact these call notes into my initiative memory, extract open action items to action_items.md, and update contacts.md.' },
    { id: '/meeting-prep', title: 'T-15m Pre-Meeting Brief & SCQA Coach', category: 'Memory & Prep', tags: 'memory scqa prep', type: 'SOP Playbook', desc: 'Builds a 1-card pre-meeting brief plus an Adversarial Minto Pyramid (SCQA) Critic for tough stakeholder pushback.', prompt: '/meeting-prep Build a 1-page pre-meeting brief and Adversarial Minto SCQA Critic for my top active initiative.' },
    { id: '/followup-plan', title: 'Follow-Up & Action Plan Sweep', category: 'Memory & Prep', tags: 'memory followup action_items', type: 'SOP Playbook', desc: 'Audits already-sent replies first, writes followups/latest_action_plan.md, syncs action_items.md, and stages [Draft-Only] replies.', prompt: '/followup-plan Run a follow-up sweep across my Personal Memory and stage [Draft-Only] replies for open P0 and P1 commitments.' },
    { id: '/swarm-prep', title: '4-Agent Parallel Swarm Orchestrator', category: 'Memory & Prep', tags: 'memory swarm subagents', type: 'Executable Skill', desc: 'Fans out 4 specialized subagents concurrently (Memory Scout, SCQA Critic, Solution Architect, Safety Auditor) for ~60s 360 prep.', prompt: '/swarm-prep Run a 4-agent parallel 360 prep pack for my highest-priority initiative.' },
    { id: '/weekly-impact', title: 'Friday Closeout & 3-Altitude Impact Ledger', category: 'Memory & Prep', tags: 'memory impact weekly', type: 'SOP Playbook', desc: 'Summarizes weekly Executive Outcomes, Cross-Team Reusable Assets, and Workstream Velocity into weekly/YYYY-WXX.md and impact/ledger.json.', prompt: '/weekly-impact Generate my Friday 3-Altitude weekly impact summary from my Personal Memory.' },
    { id: '/no-ai-slop', title: 'Hardlined Anti-AI-Slop Editor', category: 'Memory & Prep', tags: 'anti_slop voice writing', type: 'SOP Playbook', desc: 'Strips 17 common LLM filler clichés, binary-contrast gimmicks, and em-dash clusters while protecting exact figures and citations.', prompt: '/no-ai-slop Tighten the draft below and strip all AI-slop clichés while keeping concrete numbers and citations intact.' },
    { id: '/outbound-scrub', title: 'Deterministic Outbound Safety & PII Scrubber', category: 'Memory & Prep', tags: 'scrub safety secrets pii', type: 'Executable Skill', desc: 'Scans external emails, memos, and snippets for leaked keys, SSNs, unresolved [CONFIRM] markers, and slop (Node CLI + zero-Node regex fallback).', prompt: '/outbound-scrub Run a deterministic outbound safety, PII/secret, and placeholder check on the deliverable below before sharing.' },

    { id: '/automations', title: 'Opt-In Scheduled Briefings & Memory Compactor', category: 'Automations', tags: 'schedule cron automations', type: 'Executable Skill', desc: 'Configures IANA timezone via native file edits and guides enabling the 4 opt-in weekday briefings & compactors in Automations.', prompt: '/automations Set my IANA timezone across my scheduled automations and show me how to enable them in the Automations dashboard.' }
  ];

  var CATEGORIES = [
    'All',
    'Onboarding & Triage',
    'Federated Connectors',
    'Design Studio',
    'Public Workflows',
    'Government Services',
    'Engineering & Cloud',
    'Security & IAM',
    'Memory & Prep',
    'Automations'
  ];

  var activeType = 'All';
  var activeCategory = 'All';
  var searchQuery = '';

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }

  function copyWithFeedback(text, btn, label) {
    var done = function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = label; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function renderRegistry() {
    var typeBar = document.getElementById('typeFilterBar');
    var catBar = document.getElementById('catFilterBar');
    var grid = document.getElementById('skillsGrid');
    if (!typeBar || !catBar || !grid) return;

    var execCount = SKILLS.filter(function (s) { return s.type === 'Executable Skill'; }).length;
    var sopCount = SKILLS.length - execCount;

    typeBar.replaceChildren();
    [
      { id: 'All', label: 'All Skills (' + SKILLS.length + ')' },
      { id: 'Executable Skill', label: 'Executable & UI/MCP (' + execCount + ')' },
      { id: 'SOP Playbook', label: 'Domain Playbooks (' + sopCount + ')' }
    ].forEach(function (t) {
      var b = el('button', 'type-pill' + (activeType === t.id ? ' active' : ''), t.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        activeType = t.id;
        renderRegistry();
      });
      typeBar.appendChild(b);
    });

    catBar.replaceChildren();
    CATEGORIES.forEach(function (cat) {
      var count = cat === 'All' ? SKILLS.length : SKILLS.filter(function (s) { return s.category === cat; }).length;
      var b = el('button', 'seg-btn' + (activeCategory === cat ? ' active' : ''), cat + ' (' + count + ')');
      b.type = 'button';
      b.addEventListener('click', function () {
        activeCategory = cat;
        renderRegistry();
      });
      catBar.appendChild(b);
    });

    var q = searchQuery.trim().toLowerCase();
    var filtered = SKILLS.filter(function (s) {
      if (activeType !== 'All' && s.type !== activeType) return false;
      if (activeCategory !== 'All' && s.category !== activeCategory) return false;
      if (!q) return true;
      return (
        s.id.toLowerCase().includes(q) ||
        s.title.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.tags && s.tags.toLowerCase().includes(q))
      );
    });

    grid.replaceChildren();
    if (filtered.length === 0) {
      grid.appendChild(el('p', 'empty-state', 'No skills match your filter. Clear the search box to see all 39 skills.'));
      return;
    }

    filtered.forEach(function (s) {
      var card = el('article', 'm3-skill-card');
      var top = el('div', 'card-meta-top');
      var isExec = s.type === 'Executable Skill';
      top.appendChild(el('span', 'skill-type-badge ' + (isExec ? 'exec' : 'sop'), isExec ? 'Executable' : 'Playbook'));
      top.appendChild(el('span', 'skill-slash-id', s.id));
      card.appendChild(top);
      card.appendChild(el('h3', '', s.title));
      card.appendChild(el('p', '', s.desc));
      var foot = el('div', 'card-footer');
      foot.appendChild(el('span', 'cat-label', s.category));
      var copyBtn = el('button', 'copy-prompt-btn', 'Copy Prompt');
      copyBtn.type = 'button';
      copyBtn.addEventListener('click', function () {
        copyWithFeedback(s.prompt, copyBtn, 'Copy Prompt');
      });
      foot.appendChild(copyBtn);
      card.appendChild(foot);
      grid.appendChild(card);
    });
  }

  function initTheme() {
    var btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        btn.textContent = '☾';
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        btn.textContent = '☀';
      }
    });
  }

  function init() {
    initTheme();
    renderRegistry();

    var search = document.getElementById('skillSearchInput');
    if (search) {
      search.addEventListener('input', function () {
        searchQuery = search.value || '';
        renderRegistry();
      });
    }

    var copyStep2 = document.getElementById('copyStep2PromptBtn');
    if (copyStep2) {
      copyStep2.addEventListener('click', function () {
        copyWithFeedback(STEP2_INSTALL_PROMPT, copyStep2, 'Copy Install Command');
      });
    }

    var copyStep2Top = document.getElementById('copyStep2TopBtn');
    if (copyStep2Top) {
      copyStep2Top.addEventListener('click', function () {
        copyWithFeedback(STEP2_INSTALL_PROMPT, copyStep2Top, 'Copy');
      });
    }

    var showcaseTabs = document.querySelectorAll('.showcase-tab');
    var showcaseImg = document.getElementById('showcaseMainImg');
    var showcaseCap = document.getElementById('showcaseCaption');
    if (showcaseTabs.length && showcaseImg && showcaseCap) {
      showcaseTabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
          showcaseTabs.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var nextSrc = btn.getAttribute('data-shot');
          var nextCap = btn.getAttribute('data-caption');
          if (nextSrc) showcaseImg.src = nextSrc;
          if (nextCap) showcaseCap.textContent = nextCap;
        });
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
