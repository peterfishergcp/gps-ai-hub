/**
 * WV Antigravity Onboarding & Skills Hub — Interactive Controller
 * Strictly uses createElement + textContent (zero innerHTML / localStorage).
 */
(function () {
  'use strict';

  var OS_MODES = {
    windows: {
      label: 'Windows Corporate Laptop (<2s, No Git Required)',
      buildCmd: function (ge) {
        var base = 'powershell -ExecutionPolicy Bypass -File .\\scripts\\install-wv-suite.ps1';
        return ge ? base + ' `\n  -GeInstance "' + ge + '"' : base;
      }
    },
    agy: {
      label: 'Antigravity CLI 1-Command Bulk Install',
      buildCmd: function () {
        return 'agy plugin install https://github.com/cloud-gtm/gps-ai-hub/tree/main/projects/wv-antigravity-suite';
      }
    },
    mac: {
      label: 'macOS / Linux Fast Sparse Git or Shell (<2s)',
      buildCmd: function (ge) {
        var base = 'bash ./scripts/install-wv-suite.sh';
        return ge ? base + ' \\\n  --ge-instance "' + ge + '"' : base;
      }
    }
  };

  var PERSONAS = [
    {
      id: 'all-staff',
      label: 'All Staff & Leadership',
      skills: [
        {
          cmd: '/wv-onboard',
          plugin: 'wv-onboarding',
          desc: '60-second setup for your agency role, Digital Twin communication preferences, 30-60-90 onboarding plans, and SOP builders.',
          prompt: '/wv-onboard Help me set up my West Virginia agency role, Digital Twin tone, and Gemini Enterprise connection.'
        },
        {
          cmd: '/connect-ge',
          plugin: 'wv-connectors',
          desc: 'Links your Gemini Enterprise instance once so Antigravity can query your federated Outlook, SharePoint, OneDrive, Teams, Drive, and GitHub connectors.',
          prompt: '/connect-ge Configure and test my West Virginia Gemini Enterprise instance and federated connectors.'
        },
        {
          cmd: '/daily-brief',
          plugin: 'wv-onboarding',
          desc: 'Synthesizes today\'s top 3 priorities, meeting prep briefs, and open action items across your federated calendar, email, and Teams/SharePoint docs.',
          prompt: '/daily-brief Summarize my top priorities today, upcoming meeting prep, and open action items.'
        },
        {
          cmd: '/inbox-triage',
          plugin: 'wv-onboarding',
          desc: 'Applies explicit threshold rules to unread emails or field incident reports—separating immediate leadership escalations from routine items with a fail-safe hold on unreadable attachments.',
          prompt: '/inbox-triage Triage my unread emails from the last 48 hours and flag any urgent leadership escalations.'
        },
        {
          cmd: '/digital-twin',
          plugin: 'wv-onboarding',
          desc: 'Drafts voice-matched replies, formal letters to officials, and plain-language constituent responses (strictly Draft-Only; never auto-sends).',
          prompt: '/digital-twin Draft a clear, concise reply in my voice to the thread below.'
        },
        {
          cmd: '/wv-update',
          plugin: 'wv-onboarding',
          desc: 'Pulls newly published West Virginia skills, templates, and fixes from Git in under 2 seconds while preserving your personal settings.',
          prompt: '/wv-update Check if newer West Virginia Antigravity skills or templates are available.'
        }
      ]
    },
    {
      id: 'foia-legal',
      label: 'FOIA, Legal & Procurement',
      skills: [
        {
          cmd: '/foia-expert',
          plugin: 'wv-state-workflows',
          desc: 'Generates compliant Google Vault (MAIL/DRIVE/CHAT) and Microsoft Purview KQL discovery queries, applies W. Va. Code § 29B-1-4 & 5 U.S.C. § 552 redactions, and builds a Vaughn Index + sanitized deliverable.',
          prompt: '/foia-expert Formulate Google Vault and Microsoft Purview discovery queries for this FOIA request and prepare a Vaughn Index redaction report.'
        },
        {
          cmd: '/legal-procurement-review',
          plugin: 'wv-state-workflows',
          desc: 'Audits vendor SaaS/AI contracts and SOWs for West Virginia sovereign immunity, fiscal-year non-appropriation, vendor indemnity, FOIA openness, and AI training opt-outs (1:3:9 risk table).',
          prompt: '/legal-procurement-review Review this vendor contract against West Virginia sovereign immunity, non-appropriation, and data ownership rules.'
        },
        {
          cmd: '/policy-program-audit',
          plugin: 'wv-state-workflows',
          desc: 'Runs bill/rule impact briefs, cross-state policy comparisons, and cross-document consistency checks catching conflicting numbers or dates before launch.',
          prompt: '/policy-program-audit Audit our program framework doc, flyer, and web copy for any conflicting funding caps, tiers, or dates.'
        }
      ]
    },
    {
      id: 'design-analysts',
      label: 'Analysts, Comms & Dashboards',
      skills: [
        {
          cmd: '/wv-dashboard',
          plugin: 'wv-design-studio',
          desc: 'Spins up clean dynamic dashboards in Zero-Node Browser Mode (opens directly over file:// in Chrome/Edge with drag-and-drop Customize Layout saving) or live BigQuery mode.',
          prompt: '/wv-dashboard Build a West Virginia branded executive dashboard from our grant readiness metrics that I can customize visually in Chrome or Edge.'
        },
        {
          cmd: '/slides',
          plugin: 'wv-design-studio',
          desc: 'Creates responsive 16:9 HTML/CSS leadership presentation decks with speaker notes, WV Navy/Rust/Gold styling, and crisp Print-to-PDF export—zero libraries needed.',
          prompt: '/slides Create an 8-slide West Virginia leadership briefing deck with speaker notes from this program memo.'
        },
        {
          cmd: '/doc-design',
          plugin: 'wv-design-studio',
          desc: 'Builds 1-2 page print-ready stakeholder flyers, Bottom-Line-Up-Front decision memos, executive summaries, and plain-language public notices.',
          prompt: '/doc-design Design a 2-page print-ready West Virginia stakeholder fact sheet and eligibility checklist.'
        },
        {
          cmd: '/connect-m365-workspace',
          plugin: 'wv-connectors',
          desc: 'Pulls authoritative metrics and chronological email/Teams threads from federated SharePoint, OneDrive, Outlook, and Google Drive via Gemini Enterprise.',
          prompt: '/connect-m365-workspace Search SharePoint and OneDrive via my Gemini Enterprise instance for the latest quarterly program spreadsheet.'
        }
      ]
    },
    {
      id: 'engineers',
      label: 'Application, Data & Cloud Engineers',
      skills: [
        {
          cmd: '/modernize-refactor',
          plugin: 'wv-engineering-cloud',
          desc: 'Applies Google\'s 3-stage Crucible (Stage 0 Safety Gate -> Stage 1 6-Section Blueprint & Bug Audit -> Stage 2 Self-Healing Build + A/B Parity + HTML Report) across Python, TS, Go, Java, or Safe Rust.',
          prompt: '/modernize-refactor Inspect this legacy application and generate a Stage 1 6-section modernization blueprint and latent bug audit.'
        },
        {
          cmd: '/deploy-cloudrun',
          plugin: 'wv-engineering-cloud',
          desc: 'Deploys from source via gcloud run deploy --source . (remote Cloud Build—no local Docker required) with non-root containers, least-privilege SA, and Secret Manager.',
          prompt: '/deploy-cloudrun Prepare this service for a hardened, zero-Docker Cloud Run source deployment in us-east4.'
        },
        {
          cmd: '/bigquery-architect',
          plugin: 'wv-engineering-cloud',
          desc: 'Translates SQL Server/Oracle/Postgres queries to BigQuery Standard SQL with dry-run scan estimates, maximumBytesBilled caps, partitioning, and @param bindings.',
          prompt: '/bigquery-architect Translate this legacy SQL query to BigQuery Standard SQL with partitioning recommendations and a 1 GB scan cap.'
        },
        {
          cmd: '/security-audit',
          plugin: 'wv-security',
          desc: 'Zero-install OWASP Top 10, Google Cloud WAF, and Assured Workloads (CJIS/HIPAA/FedRAMP) code & architecture audit with drop-in fix patches.',
          prompt: '/security-audit Audit this codebase for OWASP vulnerabilities, secret leaks, and Cloud Run / Assured Workloads hardening.'
        },
        {
          cmd: '/iam-secret-hygiene',
          plugin: 'wv-security',
          desc: 'Replaces primitive IAM roles, default compute service accounts, and env-var secrets with Entra-synced Google Identity group bindings and Secret Manager.',
          prompt: '/iam-secret-hygiene Audit our IAM bindings and environment variables for least-privilege group access and Secret Manager.'
        }
      ]
    }
  ];

  var activeOs = 'windows';
  var activePersona = 'all-staff';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function copyText(text, btn, defaultLabel) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = 'Copied!';
        setTimeout(function () {
          btn.textContent = defaultLabel;
        }, 1600);
      });
    }
  }

  function renderInstallCode() {
    var geInput = document.getElementById('geInstanceInput');
    var rawGe = geInput ? geInput.value.trim().replace(/["`$\\]/g, '') : '';
    var codeTarget = document.getElementById('installCmdText');
    if (codeTarget) {
      codeTarget.textContent = OS_MODES[activeOs].buildCmd(rawGe);
    }
    document.querySelectorAll('[data-os]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-os') === activeOs);
    });
  }

  function renderPersonaSkills() {
    var grid = document.getElementById('personaSkillsGrid');
    var tabs = document.getElementById('personaTabs');
    if (!grid || !tabs) return;

    tabs.replaceChildren();
    PERSONAS.forEach(function (p) {
      var btn = el('button', 'tab-btn' + (p.id === activePersona ? ' active' : ''), p.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        activePersona = p.id;
        renderPersonaSkills();
      });
      tabs.appendChild(btn);
    });

    grid.replaceChildren();
    var chosen = PERSONAS.find(function (p) { return p.id === activePersona; }) || PERSONAS[0];
    chosen.skills.forEach(function (s) {
      var card = el('article', 'skill-card');
      var top = el('div');
      var headRow = el('div', 'step-header');
      headRow.appendChild(el('span', 'skill-cmd', s.cmd));
      headRow.appendChild(el('span', 'skill-plugin-tag', s.plugin));
      top.appendChild(headRow);
      top.appendChild(el('p', 'skill-desc', s.desc));

      var pBox = el('div', 'prompt-box');
      pBox.appendChild(el('span', '', s.prompt));
      var cBtn = el('button', 'prompt-copy', 'Copy Prompt');
      cBtn.type = 'button';
      cBtn.addEventListener('click', function () {
        copyText(s.prompt, cBtn, 'Copy Prompt');
      });
      pBox.appendChild(cBtn);

      card.appendChild(top);
      card.appendChild(pBox);
      grid.appendChild(card);
    });
  }

  function init() {
    document.querySelectorAll('[data-os]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeOs = btn.getAttribute('data-os') || 'windows';
        renderInstallCode();
      });
    });

    var geInput = document.getElementById('geInstanceInput');
    if (geInput) {
      geInput.addEventListener('input', renderInstallCode);
    }

    var copyInstallBtn = document.getElementById('copyInstallBtn');
    if (copyInstallBtn) {
      copyInstallBtn.addEventListener('click', function () {
        var codeTarget = document.getElementById('installCmdText');
        if (codeTarget) copyText(codeTarget.textContent, copyInstallBtn, 'Copy Command');
      });
    }

    var params = new URLSearchParams(window.location.search);
    var facBanner = document.getElementById('facilitatorBanner');
    var facToggle = document.getElementById('toggleFacilitatorBtn');
    if (params.has('review') && facBanner) {
      facBanner.hidden = false;
    }
    if (facToggle && facBanner) {
      facToggle.addEventListener('click', function () {
        facBanner.hidden = !facBanner.hidden;
      });
    }

    renderInstallCode();
    renderPersonaSkills();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
