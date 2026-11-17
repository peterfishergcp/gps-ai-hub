/**
 * State of West Virginia — Gemini & Antigravity Hub
 * AM3 Light/Dark Portal Controller (Zero innerHTML / localStorage)
 */
(function () {
  'use strict';

  var OS_MODES = {
    windows: {
      buildCmd: function (ge) {
        var base = 'powershell -ExecutionPolicy Bypass -File .\\scripts\\install-wv-suite.ps1';
        return ge ? base + ' `\n  -GeInstance "' + ge + '"' : base;
      }
    },
    agy: {
      buildCmd: function () {
        return 'agy plugin install https://github.com/cloud-gtm/gps-ai-hub/tree/main/projects/wv-antigravity-suite';
      }
    },
    mac: {
      buildCmd: function (ge) {
        var base = 'bash ./scripts/install-wv-suite.sh';
        return ge ? base + ' \\\n  --ge-instance "' + ge + '"' : base;
      }
    }
  };

  var SKILLS = [
    { id: '/wv-onboard', title: 'Agency Role & Digital Twin Quickstart', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: '60-second setup for agency role, Digital Twin tone, 30-60-90 plans, and SOP builders.', prompt: '/wv-onboard Help me set up my West Virginia agency role, Digital Twin tone, and Gemini Enterprise connection.' },
    { id: '/model-guide', title: 'Using Claude & Gemini Models in AGY', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Switch between Anthropic Claude (Sonnet/Opus) and Google Gemini in Desktop & CLI, run Dual-Model Cross-Reviews, and configure Vertex AI Model Garden.', prompt: '/model-guide Show me how to use Anthropic Claude alongside Google Gemini in Antigravity, when to pick each model, and our West Virginia quota & compliance guardrails.' },
    { id: '/daily-brief', title: 'Daily Executive Brief & Meeting Prep', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Morning priorities, meeting prep briefs, and open action items grounded in Federated GE.', prompt: '/daily-brief Summarize my top priorities today, upcoming meetings, and open action items.' },
    { id: '/digital-twin', title: 'Digital Twin Correspondence Drafter', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Drafts voice-matched emails, official letters, and constituent replies (strictly Draft-Only).', prompt: '/digital-twin Draft a clear, concise reply in my voice to the thread below.' },
    { id: '/inbox-triage', title: 'Rule-Driven Inbox & Incident Triage', category: 'Onboarding & Triage', type: 'SOP Playbook', desc: 'Separates immediate director escalations from routine items with a fail-safe hold on unreadable files.', prompt: '/inbox-triage Triage my unread emails from the last 48 hours and flag urgent leadership escalations.' },
    { id: '/wv-update', title: '2-Second Git & HTTPS Suite Updater', category: 'Onboarding & Triage', type: 'Executable Skill', desc: 'Self-contained PowerShell & Bash updater syncing new West Virginia skills while preserving user settings.', prompt: '/wv-update Check if newer West Virginia Antigravity skills or templates are available.' },

    { id: '/connect-ge', title: 'Federated Gemini Enterprise Wizard', category: 'Federated Connectors', type: 'Executable Skill', desc: 'Default hub connecting Entra-synced Google Identity to Outlook, SharePoint, OneDrive, Teams, Drive & GitHub via StreamAssist.', prompt: '/connect-ge Configure and test my West Virginia Gemini Enterprise instance and federated connectors.' },
    { id: '/connect-m365-workspace', title: 'M365 & Workspace Grounded Search', category: 'Federated Connectors', type: 'SOP Playbook', desc: 'Chronological email/Teams reconstruction and SharePoint/OneDrive citation rules through Federated GE.', prompt: '/connect-m365-workspace Search SharePoint and OneDrive via my GE instance for the latest program tracker.' },
    { id: '/connect-github-bigquery', title: 'GitHub & Cost-Capped BigQuery', category: 'Federated Connectors', type: 'SOP Playbook', desc: 'Bridges federated GitHub search with direct PR workflows and 1 GB cost-capped read-only BigQuery.', prompt: '/connect-github-bigquery Configure read-only BigQuery access with a 1 GB scan cap.' },

    { id: '/wv-dashboard', title: 'Zero-Node Executive Dashboard Studio', category: 'Design Studio', type: 'Executable Skill', desc: 'Builds interactive dashboards in Zero-Node file:// Browser Mode (drag-and-drop Customize Layout) or live BigQuery mode.', prompt: '/wv-dashboard Build a West Virginia branded executive dashboard I can customize visually in Chrome or Edge.' },
    { id: '/slides', title: '16:9 HTML/PDF Presentation Decks', category: 'Design Studio', type: 'SOP Playbook', desc: 'Responsive 16:9 decks with keyboard navigation, speaker notes drawer, and crisp Landscape PDF export.', prompt: '/slides Create an 8-slide West Virginia leadership presentation deck with speaker notes.' },
    { id: '/doc-design', title: 'Stakeholder Flyers & BLUF Memos', category: 'Design Studio', type: 'SOP Playbook', desc: 'Print-CSS 2-page fact sheets, 1-page BLUF decision memos, press releases, and plain-language public notices.', prompt: '/doc-design Design a 2-page print-ready stakeholder flyer and eligibility checklist.' },

    { id: '/foia-expert', title: 'WV FOIA Discovery & Vaughn Index', category: 'State & FOIA Workflows', type: 'SOP Playbook', desc: 'Google Vault + Microsoft Purview KQL queries, W. Va. Code § 29B-1-4 & 5 U.S.C. § 552 redaction, and Vaughn Index report.', prompt: '/foia-expert Formulate Google Vault and Purview KQL discovery queries for this FOIA request and build a Vaughn Index report.' },
    { id: '/legal-procurement-review', title: 'State Legal & Procurement Review', category: 'State & FOIA Workflows', type: 'SOP Playbook', desc: 'Audits contracts/SOWs for West Virginia sovereign immunity, fiscal non-appropriation, indemnity, and AI terms (1:3:9 risk).', prompt: '/legal-procurement-review Review this vendor contract against West Virginia sovereign immunity and non-appropriation rules.' },
    { id: '/policy-program-audit', title: 'Policy & Cross-Doc Consistency Audit', category: 'State & FOIA Workflows', type: 'SOP Playbook', desc: 'Bill/rule impact briefs and cross-document launch checks catching conflicting caps, tiers, or dates.', prompt: '/policy-program-audit Audit our program rules, stakeholder flyer, and web copy for conflicting numbers or dates.' },

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
    'State & FOIA Workflows',
    'Engineering & Cloud',
    'Security & IAM'
  ];

  var activeOs = 'windows';
  var activeType = 'All';
  var activeCategory = 'All';
  var searchQuery = '';

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function copyWithFeedback(text, btn, label) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = label; }, 1600);
      });
    }
  }

  function renderInstallCmd() {
    var input = document.getElementById('geInstanceInput');
    var cleanGe = input ? input.value.trim().replace(/["`$\\]/g, '') : '';
    var target = document.getElementById('installCmdText');
    if (target) target.textContent = OS_MODES[activeOs].buildCmd(cleanGe);
    document.querySelectorAll('[data-os]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-os') === activeOs);
    });
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
      { id: 'Prompt Playbook', label: 'Domain Playbooks (' + sopCount + ')' }
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
    CATEGORIES.forEach(function (c) {
      var count = c === 'All' ? SKILLS.length : SKILLS.filter(function (s) { return s.category === c; }).length;
      var b = el('button', 'seg-btn' + (activeCategory === c ? ' active' : ''), c + ' (' + count + ')');
      b.type = 'button';
      b.addEventListener('click', function () {
        activeCategory = c;
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
        s.title.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.desc.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      );
    });

    grid.replaceChildren();
    filtered.forEach(function (s) {
      var card = el('article', 'm3-skill-card');
      var top = el('div', 'card-meta-top');
      var isExec = s.type === 'Executable Skill';
      top.appendChild(el('span', 'skill-type-badge ' + (isExec ? 'exec' : 'sop'), isExec ? 'Executable' : 'SOP Playbook'));
      top.appendChild(el('span', 'skill-slash-id', s.id));
      card.appendChild(top);

      card.appendChild(el('h3', '', s.title));
      card.appendChild(el('p', '', s.desc));

      var foot = el('div', 'card-footer');
      foot.appendChild(el('span', 'cat-label', s.category));
      var cBtn = el('button', 'copy-prompt-btn', 'Copy Prompt');
      cBtn.type = 'button';
      cBtn.addEventListener('click', function () {
        copyWithFeedback(s.prompt, cBtn, 'Copy Prompt');
      });
      foot.appendChild(cBtn);
      card.appendChild(foot);
      grid.appendChild(card);
    });
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('theme') === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    var themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          document.documentElement.removeAttribute('data-theme');
          themeBtn.textContent = '☾';
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
          themeBtn.textContent = '☀';
        }
      });
    }

    document.querySelectorAll('[data-os]').forEach(function (b) {
      b.addEventListener('click', function () {
        activeOs = b.getAttribute('data-os') || 'windows';
        renderInstallCmd();
      });
    });

    var geIn = document.getElementById('geInstanceInput');
    if (geIn) geIn.addEventListener('input', renderInstallCmd);

    var copyCmdBtn = document.getElementById('copyInstallBtn');
    if (copyCmdBtn) {
      copyCmdBtn.addEventListener('click', function () {
        var t = document.getElementById('installCmdText');
        if (t) copyWithFeedback(t.textContent, copyCmdBtn, 'Copy Command');
      });
    }

    var searchIn = document.getElementById('skillSearchInput');
    if (searchIn) {
      searchIn.addEventListener('input', function () {
        searchQuery = searchIn.value || '';
        renderRegistry();
      });
    }

    var facBox = document.getElementById('facilitatorBox');
    var facBtn = document.getElementById('facilitatorNavBtn');
    if (params.has('review') && facBox) facBox.hidden = false;
    if (facBtn && facBox) {
      facBtn.addEventListener('click', function () {
        facBox.hidden = !facBox.hidden;
        if (!facBox.hidden) facBox.scrollIntoView({ behavior: 'smooth' });
      });
    }

    renderInstallCmd();
    renderRegistry();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
