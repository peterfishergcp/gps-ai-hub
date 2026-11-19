/**
 * Generic AGY Plugin — Public Sector Antigravity Launchpad & Skill Registry
 * AM3 Light/Dark Portal Controller (Zero innerHTML / localStorage)
 */
(function () {
  'use strict';

  var STEP2_INSTALL_PROMPT = 'agy plugin install https://github.com/peterfishergcp/gps-ai-hub/tree/main/projects/generic-agy-plugin';

  var SKILLS = [
    { id: '/agy-onboard', title: 'Agency Role & Digital Twin Quickstart', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: '60-second setup for agency role, Digital Twin tone, 30-60-90 plans, and SOP builders.', prompt: '/agy-onboard Help me set up my agency role, Digital Twin tone, and Gemini Enterprise connection.' },
    { id: '/model-guide', title: 'Using Claude & Gemini Models in AGY', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Switch between Anthropic Claude (Sonnet/Opus) and Google Gemini in Desktop & CLI, run Dual-Model Cross-Reviews, and configure Vertex AI Model Garden.', prompt: '/model-guide Show me how to use Anthropic Claude alongside Google Gemini in Antigravity, when to pick each model, and our agency quota & compliance guardrails.' },
    { id: '/daily-brief', title: 'Daily Executive Brief & Meeting Prep', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Morning priorities, meeting prep briefs, and open action items grounded in Federated GE.', prompt: '/daily-brief Summarize my top priorities today, upcoming meetings, and open action items.' },
    { id: '/digital-twin', title: 'Digital Twin Correspondence Drafter', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Drafts voice-matched emails, official letters, and constituent replies (strictly Draft-Only).', prompt: '/digital-twin Draft a clear, concise reply in my voice to the thread below.' },
    { id: '/inbox-triage', title: 'Rule-Driven Inbox & Incident Triage', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Separates immediate director escalations from routine items with a fail-safe hold on unreadable files.', prompt: '/inbox-triage Triage my unread emails from the last 48 hours and flag urgent leadership escalations.' },
    { id: '/agy-update', title: '1-Second Incremental Git & HTTPS Updater', category: 'Onboarding & Triage', type: 'Executable Skill', desc: 'SHA-256 incremental updater syncing changed skills over HTTPS 443 while preserving user toggles and GE settings.', prompt: '/agy-update Check if newer Generic AGY Plugin skills or templates are available.' },

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
    { id: '/iam-secret-hygiene', title: 'Least-Privilege IAM & Secret Hygiene', category: 'Security & IAM', type: 'SOP Playbook', desc: 'Replaces primitive roles, default compute SAs, and env secrets with Entra-synced Google groups and Secret Manager.', prompt: '/iam-secret-hygiene Audit our IAM bindings and replace env-var secrets with Secret Manager.' }
  ];

  var CATEGORIES = [
    'All',
    'Onboarding & Triage',
    'Federated Connectors',
    'Design Studio',
    'Public Workflows',
    'Government Services',
    'Engineering & Cloud',
    'Security & IAM'
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
      grid.appendChild(el('p', 'empty-state', 'No skills match your filter. Clear the search box to see all 28 skills.'));
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
        copyWithFeedback(STEP2_INSTALL_PROMPT, copyStep2, 'Copy Install Prompt');
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
