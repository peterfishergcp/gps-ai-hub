(function () {
  let appState = null;
  const VALID_TABS = new Set(['overview', 'actions', 'initiatives', 'contacts', 'tokens', 'customize']);
  let orchestratorOptimizeMode = false;
  const initialTabParam =
    typeof window !== 'undefined' && window.location && window.location.search
      ? new URLSearchParams(window.location.search).get('tab')
      : null;
  let activeTab = initialTabParam && VALID_TABS.has(initialTabParam) ? initialTabParam : 'overview';
  let showAllTodos = false;
  let showCompletedTodos = false;
  let showAddTodoBar = false;
  let showNewInitBar = false;
  let skillsCategory = 'all';
  let skillsSearch = '';
  let showOtherPlugins = false;
  let activeForkCardKey = null;
  let activeSeedCardKey = null;
  let confirmDeleteSlug = null;
  let selectedFile = null;
  let editorMode = 'preview';
  let showRoleDrawer = false;
  let toastTimer = null;

  const viewRoot = document.getElementById('view-root');
  const headerTitle = document.getElementById('header-title');
  const headerSub = document.getElementById('header-sub');
  const toastEl = document.getElementById('toast');

  const QUICK_WORKFLOWS = [
    {
      cmd: '/wv-coordinator',
      desc: 'Open WV Clawy 🐻: Multi-Agent Command Center, Kore Voice & Sprints',
      prompt: '/wv-coordinator Help me set up WV Clawy, verify my GCP Project & Kore Gemini Live voice connection, and summarize my active agent conversations.',
    },
    {
      cmd: '/daily-brief',
      desc: 'Morning kickoff: top action items, calendar & >21d check-ins',
      prompt: '/daily-brief Give me my workday kickoff brief, top 3 actions, and any stale stakeholder check-ins.',
    },
    {
      cmd: '/followup-plan',
      desc: 'Sweep open action items and stage [Draft-Only] replies',
      prompt: '/followup-plan Run a follow-up sweep across my workspace memory and stage [Draft-Only] replies for P0 and P1 items.',
    },
    {
      cmd: '/meeting-prep',
      desc: '15-minute pre-meeting brief + Adversarial SCQA Critic',
      prompt: '/meeting-prep Build a 1-page pre-meeting brief and Adversarial SCQA Critic for my top active initiative.',
    },
    {
      cmd: '/meeting-notes',
      desc: 'Compact call notes into 4-tier memory & extract to-dos',
      prompt: '/meeting-notes Help me ingest and compact meeting notes into my initiative folder and update action_items.md.',
    },
    {
      cmd: '/swarm-prep',
      desc: 'Run 4 parallel subagents for 360-degree milestone prep',
      prompt: '/swarm-prep Run a 4-agent parallel prep pack for my highest-priority initiative.',
    },
    {
      cmd: '/weekly-impact',
      desc: 'Friday 3-Altitude executive, peer & sprint readout',
      prompt: '/weekly-impact Generate my Friday 3-Altitude weekly impact summary from my workspace memory.',
    },
    {
      cmd: '/orchestrator-guide',
      desc: 'Master Orchestrator (Gemini 4 Planner + Hydrogen Executor)',
      prompt: '/orchestrator-guide Show me how to select and prompt Orchestrator (Neon, Argon, Carbon) for maximum speed and lower quota burn.',
    },
    {
      cmd: '/token-usage',
      desc: 'Retrieve my 5h, 24h & 7d token consumption + quota dashboard',
      prompt: '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.',
    },
  ];

  function el(tag, opts, children) {
    const node = document.createElement(tag);
    if (opts) {
      if (opts.className) node.className = opts.className;
      if (opts.id) node.id = opts.id;
      if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
      if (opts.type) node.type = opts.type;
      if (opts.placeholder !== undefined) node.placeholder = String(opts.placeholder);
      if (opts.value !== undefined) node.value = String(opts.value);
      if (opts.title !== undefined) node.title = String(opts.title);
      if (opts.src !== undefined) node.src = String(opts.src);
      if (opts.alt !== undefined) node.alt = String(opts.alt);
      if (opts.href !== undefined) node.href = String(opts.href);
      if (opts.target !== undefined) node.target = String(opts.target);
      if (opts.rel !== undefined) node.rel = String(opts.rel);
      if (opts.checked !== undefined) node.checked = Boolean(opts.checked);
      if (opts.readOnly !== undefined) node.readOnly = Boolean(opts.readOnly);
      if (opts.style) {
        if (typeof opts.style === 'string') {
          node.setAttribute('style', opts.style);
        } else {
          Object.entries(opts.style).forEach(([k, v]) => {
            node.style[k] = v;
          });
        }
      }
      if (opts.dataset) {
        Object.entries(opts.dataset).forEach(([k, v]) => {
          if (v !== undefined && v !== null) {
            node.dataset[k] = String(v);
          }
        });
      }
      if (typeof opts.onClick === 'function') {
        node.addEventListener('click', opts.onClick);
      }
      if (typeof opts.onChange === 'function') {
        node.addEventListener('change', opts.onChange);
      }
    }
    if (Array.isArray(children)) {
      children.forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        if (child instanceof Node) {
          node.appendChild(child);
        } else {
          node.appendChild(document.createTextNode(String(child)));
        }
      });
    }
    return node;
  }

  function showToast(msg) {
    toastEl.textContent = String(msg || '');
    toastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2400);
  }

  function openDedicatedSkillsHub() {
    try {
      if (window.sidecar && window.sidecar.ui) {
        if (typeof window.sidecar.ui.toggleAuxPane === 'function') {
          window.sidecar.ui.toggleAuxPane({
            tabType: 'sidecarView',
            uri: 'sidecar://wv-onboarding/wv-skill-manager/',
          });
          return;
        }
        if (typeof window.sidecar.ui.openSidecar === 'function') {
          window.sidecar.ui.openSidecar('wv-onboarding', 'wv-skill-manager');
          return;
        }
        if (typeof window.sidecar.ui.toggleSidecar === 'function') {
          window.sidecar.ui.toggleSidecar('wv-onboarding', 'wv-skill-manager');
          return;
        }
      }
    } catch {}
    showToast('Click "WV Skills" (Sparkles icon) in the left Extensions sidebar to browse all skills & Personal Skills!');
  }

  function openClawyCoordinator() {
    try {
      if (window.sidecar && window.sidecar.ui) {
        if (typeof window.sidecar.ui.toggleAuxPane === 'function') {
          window.sidecar.ui.toggleAuxPane({
            tabType: 'sidecarView',
            uri: 'sidecar://wv-coordinator/wv-coordinator-ui/',
          });
          showToast('Opened WV Clawy 🐻 in Auxiliary Pane');
          return;
        }
        if (typeof window.sidecar.ui.openSidecar === 'function') {
          window.sidecar.ui.openSidecar('wv-coordinator', 'wv-coordinator-ui');
          return;
        }
        if (typeof window.sidecar.ui.toggleSidecar === 'function') {
          window.sidecar.ui.toggleSidecar('wv-coordinator', 'wv-coordinator-ui');
          return;
        }
      }
    } catch {}
    showToast('Click "WV Clawy" (Brown Bear icon) in the left Extensions sidebar to open your Multi-Agent Command Center & Kore Voice!');
  }

  function markMasteryStep(stepId) {
    apiPost('/api/updates/prefs', { completeStep: stepId }).catch(() => {});
  }

  function getUiBridgeContext() {
    return {
      el,
      appState,
      isWv: true,
      makeAnimatedEmoji,
      makeWaveSvg,
      showToast,
      apiPost,
      dispatchPrompt,
      openSkillsExtension: openDedicatedSkillsHub,
      openClawyExtension: openClawyCoordinator,
      markMasteryStep,
      reloadState: loadState,
      rerender: render,
      switchTab: (nextTab) => {
        activeTab = nextTab;
        syncTabButtons();
        render();
      },
    };
  }

  async function apiGet(url) {
    const fn = window.sidecar && window.sidecar.fetch ? window.sidecar.fetch : window.fetch;
    const res = await fn(url, { method: 'GET' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function apiPost(url, bodyObj) {
    const fn = window.sidecar && window.sidecar.fetch ? window.sidecar.fetch : window.fetch;
    const res = await fn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj || {}),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function copyTextSafe(text) {
    const str = String(text || '');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(str);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.setAttribute('readonly', 'readonly');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Boolean(ok);
    } catch {
      return false;
    }
  }

  async function dispatchPrompt(promptText, title) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(promptText);
          showToast('Sent prompt to active conversation');
        } else {
          const created = await window.sidecar.agent.startConversation(promptText, title || 'WV Antigravity');
          if (created && created.conversationId && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Started new conversation');
        }
        return;
      }
      if (await copyTextSafe(promptText)) {
        showToast('Copied prompt to clipboard');
      }
    } catch (err) {
      showToast('Error sending prompt: ' + err.message);
    }
  }

  function appendInlineMarkdown(parent, rawText) {
    const str = String(rawText || '');
    const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
    let lastIndex = 0;
    let match;
    while ((match = tokenRe.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(str.slice(lastIndex, match.index)));
      }
      const token = match[0];
      if (token.startsWith('**') && token.endsWith('**')) {
        parent.appendChild(el('strong', { text: token.slice(2, -2) }));
      } else if (token.startsWith('`') && token.endsWith('`')) {
        parent.appendChild(el('code', { text: token.slice(1, -1) }));
      } else if (token.startsWith('[')) {
        const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (m) {
          parent.appendChild(el('code', { text: m[1] + ' (' + m[2] + ')' }));
        } else {
          parent.appendChild(document.createTextNode(token));
        }
      } else {
        parent.appendChild(document.createTextNode(token));
      }
      lastIndex = tokenRe.lastIndex;
    }
    if (lastIndex < str.length) {
      parent.appendChild(document.createTextNode(str.slice(lastIndex)));
    }
  }

  function parseTableCells(line) {
    return line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  }

  function buildSimpleMarkdownPreview(md, fileName) {
    const container = el('div', { className: 'md-preview' });
    const rawStr = String(md || '');

    // Pretty-print JSON files (e.g. ledger.json, plugin.json, custom_seeds.json)
    if (fileName && String(fileName).toLowerCase().endsWith('.json')) {
      let pretty = rawStr;
      try {
        pretty = JSON.stringify(JSON.parse(rawStr), null, 2);
      } catch {}
      container.appendChild(el('pre', null, [el('code', { text: pretty })]));
      return container;
    }

    let bodyStr = rawStr;
    // Render YAML frontmatter (--- ... ---) cleanly at top of SKILL.md / rule files
    const fmMatch = rawStr.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fmMatch) {
      bodyStr = rawStr.slice(fmMatch[0].length);
      const fmLines = fmMatch[1].split(/\r?\n/).filter((l) => l.trim() !== '');
      const fmRows = [];
      fmLines.forEach((l) => {
        const idx = l.indexOf(':');
        if (idx > 0 && !/^\s/.test(l)) {
          fmRows.push({ k: l.slice(0, idx).trim(), v: l.slice(idx + 1).trim() });
        } else if (fmRows.length > 0) {
          fmRows[fmRows.length - 1].v = (fmRows[fmRows.length - 1].v + ' ' + l.trim()).trim();
        }
      });
      if (fmRows.length > 0) {
        container.appendChild(
          el(
            'div',
            { className: 'md-frontmatter' },
            fmRows.map((r) =>
              el('div', { className: 'md-fm-row' }, [
                el('span', { className: 'md-fm-key', text: r.k }),
                el('span', { className: 'md-fm-val', text: r.v.replace(/^>-\s*/, '') }),
              ])
            )
          )
        );
      }
    }

    const lines = bodyStr.split(/\r?\n/);
    let inCode = false;
    let codeBuffer = [];
    let tableBuffer = [];

    const flushCodeBlock = () => {
      const codeNode = el('code', { text: codeBuffer.join('\n') });
      container.appendChild(el('pre', null, [codeNode]));
      codeBuffer = [];
    };

    const flushTable = () => {
      if (tableBuffer.length === 0) return;
      if (tableBuffer.length >= 2 && /^\|?[\s:-]+\|/.test(tableBuffer[1])) {
        const headers = parseTableCells(tableBuffer[0]);
        const bodyLines = tableBuffer.slice(2);
        const thead = el('thead', null, [
          el(
            'tr',
            null,
            headers.map((h) => {
              const th = el('th');
              appendInlineMarkdown(th, h);
              return th;
            })
          ),
        ]);
        const tbody = el(
          'tbody',
          null,
          bodyLines.map((bl) =>
            el(
              'tr',
              null,
              parseTableCells(bl).map((cell) => {
                const td = el('td');
                appendInlineMarkdown(td, cell);
                return td;
              })
            )
          )
        );
        container.appendChild(el('div', { className: 'table-wrap', style: { margin: '8px 0' } }, [el('table', null, [thead, tbody])]));
      } else {
        tableBuffer.forEach((tl) => {
          const lineDiv = el('div');
          appendInlineMarkdown(lineDiv, tl);
          container.appendChild(lineDiv);
        });
      }
      tableBuffer = [];
    };

    for (const raw of lines) {
      if (raw.trim().startsWith('```')) {
        flushTable();
        if (!inCode) {
          inCode = true;
          codeBuffer = [];
        } else {
          flushCodeBlock();
          inCode = false;
        }
        continue;
      }
      if (inCode) {
        codeBuffer.push(raw);
        continue;
      }
      if (raw.trim().startsWith('|') && raw.trim().endsWith('|')) {
        tableBuffer.push(raw);
        continue;
      }
      flushTable();

      if (/^---+$/.test(raw.trim())) {
        container.appendChild(el('hr', { className: 'md-hr' }));
      } else if (raw.startsWith('#### ')) {
        const h4 = el('h4');
        appendInlineMarkdown(h4, raw.slice(5));
        container.appendChild(h4);
      } else if (raw.startsWith('### ')) {
        const h3 = el('h3');
        appendInlineMarkdown(h3, raw.slice(4));
        container.appendChild(h3);
      } else if (raw.startsWith('## ')) {
        const h2 = el('h2');
        appendInlineMarkdown(h2, raw.slice(3));
        container.appendChild(h2);
      } else if (raw.startsWith('# ')) {
        const h1 = el('h1');
        appendInlineMarkdown(h1, raw.slice(2));
        container.appendChild(h1);
      } else if (raw.startsWith('> ')) {
        const bq = el('blockquote', { className: 'md-quote' });
        appendInlineMarkdown(bq, raw.slice(2));
        container.appendChild(bq);
      } else if (/^\s*-\s+\[([ xX-])\]\s+/.test(raw)) {
        const m = raw.match(/^\s*-\s+\[([ xX-])\]\s+(.*)$/);
        const checked = m[1].toLowerCase() === 'x';
        const row = el('div', { className: 'md-list-row' }, [checked ? '\u2611 ' : '\u2610 ']);
        appendInlineMarkdown(row, m[2]);
        container.appendChild(row);
      } else if (/^\s*-\s+/.test(raw)) {
        const row = el('div', { className: 'md-list-row' }, ['\u2022 ']);
        appendInlineMarkdown(row, raw.replace(/^\s*-\s+/, ''));
        container.appendChild(row);
      } else if (/^\s*\d+\.\s+/.test(raw)) {
        const m = raw.match(/^(\s*\d+\.)\s+(.*)$/);
        const row = el('div', { className: 'md-list-row' }, [el('strong', { text: m[1].trim() + ' ' })]);
        appendInlineMarkdown(row, m[2]);
        container.appendChild(row);
      } else if (raw.trim() === '') {
        container.appendChild(el('div', { style: { height: '6px' } }));
      } else {
        const lineDiv = el('div', { className: 'md-para' });
        appendInlineMarkdown(lineDiv, raw);
        container.appendChild(lineDiv);
      }
    }
    flushTable();
    if (inCode) {
      flushCodeBlock();
    }
    return container;
  }

  async function loadState() {
    appState = await apiGet('/api/state');
    const p = appState.profile || {};
    headerTitle.textContent = 'WV Antigravity';
    headerSub.textContent = p.role && p.role !== 'Ready' ? p.role : '';
    render();
  }

  async function openFileInExplorer(filePath, startInEditMode) {
    try {
      const data = await apiGet('/api/file?path=' + encodeURIComponent(filePath));
      data.savedContent = data.content || '';
      selectedFile = data;
      editorMode = startInEditMode && data.writable ? 'edit' : 'preview';
      activeTab = 'customize';
      syncTabButtons();
      render();
    } catch (err) {
      showToast('Unable to open file: ' + err.message);
    }
  }

  function openRelativeVaultFile(relPath, startInEditMode) {
    if (!appState || !appState.vaultRoot) return;
    const full = appState.vaultRoot.replace(/[\\/]+$/, '') + '/' + relPath;
    openFileInExplorer(full, startInEditMode);
  }

  function syncTabButtons() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
    const custBtn = document.getElementById('btn-customize');
    if (custBtn) {
      custBtn.classList.toggle('active', activeTab === 'customize');
    }
  }

  function buildRoleSetupCard(forceVisible) {
    if ((!showRoleDrawer && !forceVisible) || !appState) return null;
    const presets = appState.presets || [];
    const cur = appState.profile || {};

    const roleSelect = el(
      'select',
      { id: 'role-select' },
      presets.map((pr) => el('option', { value: pr.id, text: pr.label }))
    );
    const roleName = el('input', {
      type: 'text',
      id: 'role-name',
      placeholder: 'Your Name',
      value: cur.name === 'Workspace User' || cur.name === 'Me' ? '' : cur.name || '',
    });
    const roleTitle = el('input', {
      type: 'text',
      id: 'role-title',
      placeholder: 'Job Title (optional)',
      value: cur.role === 'Not configured yet' ? '' : cur.role || '',
    });
    const roleOrg = el('input', {
      type: 'text',
      id: 'role-org',
      placeholder: 'Team / Agency (optional)',
      value: cur.organization || '',
    });

    const applyBtn = el('button', {
      className: 'btn btn-sm',
      id: 'btn-apply-role',
      text: 'Save Role & Profile',
      onClick: async () => {
        try {
          const role = roleSelect.value;
          const name = roleName.value;
          const titleVal = roleTitle.value;
          const org = roleOrg.value;
          await apiPost('/api/vault/init', { role, name, roleTitle: titleVal, org, seedDemo: true });
          showRoleDrawer = false;
          selectedFile = null;
          await loadState();
          showToast('Saved ' + role + ' profile & workspace memory');
        } catch (err) {
          showToast('Error applying preset: ' + err.message);
        }
      },
    });

    return el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Role, Name & Personal Profile' }),
        !forceVisible
          ? el('button', {
              className: 'btn btn-secondary btn-sm',
              id: 'btn-close-role',
              text: 'Close',
              onClick: () => {
                showRoleDrawer = false;
                render();
              },
            })
          : el('span', { className: 'muted', text: cur.timezone || '' }),
      ]),
      el('div', { className: 'form-row' }, [roleSelect, roleName, roleTitle, roleOrg, applyBtn]),
    ]);
  }

  function collectTreeFiles(node, out) {
    if (!node) return out;
    if (node.type === 'file' && node.path) {
      out.push({ name: node.name || node.path.split('/').pop(), path: node.path });
    } else if (Array.isArray(node.children)) {
      node.children.forEach((c) => collectTreeFiles(c, out));
    }
    return out;
  }

  function getUserFirstName() {
    const rawName = (appState && appState.profile && appState.profile.name) || '';
    return !rawName || rawName === 'Me' || rawName === 'Workspace User' ? 'there' : rawName.trim().split(/\s+/)[0];
  }

  function makeAnimatedEmoji(code, fallbackGlyph, altText) {
    const img = el('img', {
      className: 'ai-noto-emoji',
      alt: altText || fallbackGlyph || '',
      src: 'https://fonts.gstatic.com/s/e/notoemoji/latest/' + code + '/512.webp',
    });
    let triedLocalPng = false;
    img.addEventListener('error', () => {
      if (!triedLocalPng) {
        triedLocalPng = true;
        img.classList.add('fallback-pulse');
        img.src = '/api/emoji-png?code=' + encodeURIComponent(code);
        return;
      }
      if (img.parentNode) {
        img.parentNode.insertBefore(document.createTextNode(fallbackGlyph || ''), img);
        img.parentNode.removeChild(img);
      }
    });
    return img;
  }

  function buildOverviewNodes() {
    const openItems = ((appState && appState.gtd && appState.gtd.items) || []).filter((it) => !it.checked);
    const inits = (appState && appState.initiatives) || [];
    const initBySlug = {};
    inits.forEach((ini) => {
      initBySlug[ini.slug] = ini;
    });

    const askInput = el('input', {
      type: 'search',
      className: 'hero-ask-input',
      id: 'hero-ask-input',
      placeholder: 'Ask anything, run a /command, or search workflows, skills & notes...',
    });

    const resultsBox = el('div', { className: 'hero-results', id: 'hero-results' });

    function submitHeroPrompt() {
      const q = (askInput.value || '').trim();
      if (!q) {
        askInput.focus();
        return;
      }
      const finalPrompt =
        orchestratorOptimizeMode && window.AGYTokenAndUpdatesUI
          ? window.AGYTokenAndUpdatesUI.wrapPromptForOrchestrator(q)
          : q;
      dispatchPrompt(finalPrompt, orchestratorOptimizeMode ? 'Orchestrator Task' : 'WV Antigravity');
    }

    function updateHeroSearch() {
      resultsBox.replaceChildren();
      const q = (askInput.value || '').trim().toLowerCase();
      if (!q) return;

      const matches = [];

      // 1. Match installed suite & personal skills
      ((appState && appState.skillsCatalog) || []).forEach((cat) => {
        if (cat.scope === 'other') return;
        (cat.skills || []).forEach((s) => {
          if (
            String(s.command || '').toLowerCase().includes(q) ||
            String(s.title || '').toLowerCase().includes(q) ||
            String(s.subtitle || '').toLowerCase().includes(q)
          ) {
            matches.push({
              kind: 'Skill',
              title: s.title,
              sub: s.command,
              actionLabel: 'Run \u2192',
              onSelect: () => dispatchPrompt(s.seedPrompt, s.command),
            });
          }
        });
      });

      // 2. Match vault & personal Markdown files
      const files = [];
      ((appState && appState.roots) || []).forEach((r) => {
        if (r.id === 'vault' || r.id === 'my-skills') {
          collectTreeFiles(r.tree, files);
        }
      });
      files.forEach((f) => {
        if (f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) {
          matches.push({
            kind: 'File',
            title: f.name,
            sub: f.path.split('/').slice(-2).join('/'),
            actionLabel: 'Open',
            onSelect: () => openFileInExplorer(f.path),
          });
        }
      });

      matches.slice(0, 6).forEach((m) => {
        resultsBox.appendChild(
          el(
            'button',
            {
              type: 'button',
              className: 'hero-result-item',
              onClick: m.onSelect,
            },
            [
              el('div', {}, [
                el('strong', { text: m.title }),
                ' ',
                el('span', { className: 'muted', text: '\u00B7 ' + m.sub }),
              ]),
              el('span', { className: 'ai-sky-pill', text: m.actionLabel }),
            ]
          )
        );
      });
    }

    askInput.addEventListener('input', updateHeroSearch);
    askInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitHeroPrompt();
      }
    });

    const firstName = getUserFirstName();
    const headRow = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Hi ' + firstName + ' ',
        makeAnimatedEmoji('1f60e', '\uD83D\uDE0E', 'Sunglasses'),
        ' How can I help? You have ',
        el('span', {
          className: 'ai-blue-count',
          text: openItems.length + (openItems.length === 1 ? ' to-do' : ' to-dos'),
        }),
        ' and ',
        el('span', {
          className: 'ai-blue-count',
          text: ((appState && appState.updates && appState.updates.items && appState.updates.items.length) || 10) + ' updates & guides',
        }),
        ' ready.',
      ]),
      el('div', { className: 'ai-inbox-meta-actions' }, [
        el('button', {
          type: 'button',
          className: 'ai-updated-pill',
          text: 'Updated just now \u21BB',
          onClick: () => loadState().then(() => showToast('Refreshed workspace')),
        }),
      ]),
    ]);

    const orchToggleBtn = el('button', {
      type: 'button',
      className: 'orch-toggle-pill' + (orchestratorOptimizeMode ? ' active' : ''),
      id: 'btn-orch-optimize',
      title: 'Wrap multi-step prompts with Orchestrator (Planner + Hydrogen) execution instructions',
      text: orchestratorOptimizeMode ? '\u26A1 Orchestrator ON' : '\u26A1 Orchestrator',
      onClick: () => {
        orchestratorOptimizeMode = !orchestratorOptimizeMode;
        render();
        showToast(
          orchestratorOptimizeMode
            ? 'Orchestrator Prompt Optimizer ON — prompts will structure Planner + Hydrogen delegation'
            : 'Standard prompt mode'
        );
      },
    });

    const searchSection = el('div', { style: { marginBottom: '18px' } }, [
      el('div', { className: 'ai-search-bar' }, [
        el('span', { className: 'muted', style: { fontSize: '15px', fontWeight: '700' }, text: '\u2315' }),
        askInput,
        orchToggleBtn,
        el('button', {
          type: 'button',
          className: 'ai-sky-pill',
          id: 'btn-hero-ask',
          text: 'Ask \u2192',
          onClick: submitHeroPrompt,
        }),
      ]),
      resultsBox,
    ]);

    const topTodosStack = el('div', { className: 'ai-todos-stack' });
    if (openItems.length === 0) {
      topTodosStack.appendChild(
        el('div', { className: 'ai-todo-row' }, [
          el('div', { className: 'ai-todo-main' }, [
            el('p', { className: 'ai-todo-title', text: 'Zero open to-dos right now' }),
            el('p', {
              className: 'ai-todo-desc',
              text: 'Launch a 1-click workflow below or open Action Items to add a new follow-up.',
            }),
          ]),
          el('button', {
            type: 'button',
            className: 'ai-sky-pill',
            text: 'Action Items \u2192',
            onClick: () => {
              activeTab = 'actions';
              syncTabButtons();
              render();
            },
          }),
        ])
      );
    } else {
      openItems.slice(0, 3).forEach((it) => {
        const linked = initBySlug[it.initiative] || null;
        const topicTitle = linked ? linked.title : it.initiative;
        const replyMode = isReplyStyleTask(it.task);
        const promptForTodo = replyMode
          ? '/my-voice Draft a clear, concise [Draft-Only] message in my voice to complete this action item: [' +
            topicTitle +
            '] ' +
            it.task
          : 'Help me complete this action item step-by-step using our workspace context: [' +
            topicTitle +
            '] ' +
            it.task;

        topTodosStack.appendChild(
          el('div', { className: 'ai-todo-row' }, [
            el('div', { className: 'ai-todo-main' }, [
              el('p', { className: 'ai-todo-title', text: it.task }),
              el('p', {
                className: 'ai-todo-desc',
                text: linked && linked.nextMilestone ? topicTitle + ' \u2014 ' + linked.nextMilestone : 'Topic: ' + topicTitle,
              }),
            ]),
            el('div', { className: 'ai-todo-actions' }, [
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                text: replyMode ? '\u270E Reply' : '\u2197 Open',
                onClick: () => dispatchPrompt(promptForTodo, replyMode ? 'Draft Reply' : 'Action Item'),
              }),
            ]),
          ])
        );
      });
    }

    const overviewFoot = el('div', { className: 'ai-todos-foot' }, [
      el('button', {
        type: 'button',
        className: 'ai-show-more-btn',
        text: 'Open all Action Items (' + openItems.length + ') \u2192',
        onClick: () => {
          activeTab = 'actions';
          syncTabButtons();
          render();
        },
      }),
      el('span'),
    ]);

    const wfIcons = ['\u2600\uFE0F', '\uD83D\uDCEC', '\uD83C\uDFAF', '\uD83D\uDCDD', '\uD83D\uDE80', '\uD83D\uDCCA', '\uD83E\uDDE0', '\u26A1'];
    const workflowsSection = el('div', { className: 'ai-topics-section' }, [
      el('p', { className: 'ai-section-label', text: '1-Click Workflows' }),
      el(
        'div',
        { className: 'ai-topics-grid' },
        QUICK_WORKFLOWS.map((q, idx) =>
          el('div', { className: 'ai-topic-card', dataset: { quickIdx: idx } }, [
            el('div', { className: 'ai-topic-top' }, [
              el('span', { className: 'ai-topic-icon', text: wfIcons[idx % wfIcons.length] }),
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                text: 'Run \u2192',
                onClick: () => dispatchPrompt(q.prompt, q.cmd),
              }),
            ]),
            el('h4', { className: 'ai-topic-title', text: q.cmd }),
            el('p', { className: 'ai-topic-body', text: q.desc }),
          ])
        )
      ),
    ]);

    const uiCtx = getUiBridgeContext();
    const masteryNode = window.AGYTokenAndUpdatesUI ? window.AGYTokenAndUpdatesUI.buildMasteryOnboardingBar(uiCtx) : null;
    const spendStripNode = window.AGYTokenAndUpdatesUI ? window.AGYTokenAndUpdatesUI.buildOverviewSpendMiniStrip(uiCtx) : null;
    const updatesHubNode = window.AGYTokenAndUpdatesUI ? window.AGYTokenAndUpdatesUI.buildUpdatesAndSubscribeSection(uiCtx) : workflowsSection;

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        buildRoleSetupCard(),
        headRow,
        searchSection,
        masteryNode,
        el('p', { className: 'ai-section-label', text: 'Up next for you' }),
        topTodosStack,
        overviewFoot,
        spendStripNode,
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        updatesHubNode,
      ]),
    ];
  }

  function makeWaveSvg() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 1200 24');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '18');
    svg.style.display = 'block';
    const pathEl = document.createElementNS(SVG_NS, 'path');
    let d = 'M0,12 ';
    for (let x = 0; x < 1200; x += 40) {
      d += 'Q' + (x + 10) + ',2 ' + (x + 20) + ',12 T' + (x + 40) + ',12 ';
    }
    d += 'L1200,24 L0,24 Z';
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'currentColor');
    svg.appendChild(pathEl);
    return svg;
  }

  function isReplyStyleTask(text) {
    return /\b(reply|follow\s*up|send|email|share|draft|check\s*in|sync\s*with|message|respond|notify)\b/i.test(
      String(text || '')
    );
  }

  function buildActionItemsNodes() {
    const items = (appState.gtd && appState.gtd.items) || [];
    const openItems = items.filter((it) => !it.checked);
    const doneItems = items.filter((it) => it.checked);
    const inits = appState.initiatives || [];
    const initBySlug = {};
    inits.forEach((ini) => {
      initBySlug[ini.slug] = ini;
    });

    const staleContacts = ((appState.contacts && appState.contacts.contacts) || []).filter((c) => c.isStale);
    const topics = [];
    const topicIcons = ['\uD83D\uDE80', '\uD83D\uDD12', '\uD83D\uDCCB', '\uD83C\uDFDB\uFE0F'];

    inits.forEach((ini, idx) => {
      const openCount = openItems.filter((t) => t.initiative === ini.slug).length;
      const fileCount = ini.files ? Object.keys(ini.files).length : 4;
      const bodyParts = [];
      if (ini.summary) bodyParts.push(ini.summary);
      if (ini.nextMilestone) bodyParts.push('Next milestone: ' + ini.nextMilestone + '.');
      if (openCount > 0) bodyParts.push(openCount + (openCount === 1 ? ' open to-do.' : ' open to-dos.'));
      topics.push({
        kind: 'initiative',
        icon: topicIcons[idx % topicIcons.length],
        title: ini.title,
        body: bodyParts.join(' '),
        attachCount: fileCount,
        rag: ini.rag,
        onAction: () =>
          dispatchPrompt(
            '/meeting-prep Build a 1-page catch-up brief and Adversarial Minto SCQA Critic for "' +
              ini.title +
              '" (initiatives/' +
              ini.slug +
              '/).',
            'Catch Up: ' + ini.title
          ),
        onOpenFiles: () => {
          if (ini.files && ini.files['status.md']) {
            openFileInExplorer(ini.files['status.md'].path, false);
          }
        },
        actionLabel: 'Catch up',
      });
    });

    staleContacts.forEach((c) => {
      topics.push({
        kind: 'contact',
        icon: '\uD83E\uDD1D',
        title: 'Sync with ' + c.name + (c.role ? ' \u00B7 ' + c.role : ''),
        body:
          (c.daysAgo ? c.daysAgo + ' days since last check-in. ' : 'Overdue for a check-in. ') +
          (c.priorities ? 'Focus: ' + c.priorities + '.' : ''),
        attachCount: 1,
        rag: 'AMBER',
        onAction: () =>
          dispatchPrompt(
            '/my-voice Draft a short, warm [Draft-Only] check-in note to ' +
              c.name +
              ' regarding "' +
              c.initiative +
              '" using our latest workspace status.',
            'Check-In: ' + c.name
          ),
        onOpenFiles: () => openRelativeVaultFile('contacts.md', false),
        actionLabel: 'Reply',
      });
    });

    const firstName = getUserFirstName();

    const greetingEl = el('h2', { className: 'ai-inbox-greeting' }, [
      'Hi ' + firstName + ' ',
      makeAnimatedEmoji('1f36a', '\uD83C\uDF6A', 'Cookie'),
      ' You have ',
      el('span', {
        className: 'ai-blue-count',
        text: openItems.length + (openItems.length === 1 ? ' to-do' : ' to-dos'),
      }),
      ' and ',
      el('span', {
        className: 'ai-blue-count',
        text: topics.length + (topics.length === 1 ? ' topic' : ' topics'),
      }),
      ' to catch up on.',
    ]);

    const headRow = el('div', { className: 'ai-inbox-head' }, [
      greetingEl,
      el('div', { className: 'ai-inbox-meta-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          id: 'btn-toggle-add-todo',
          text: showAddTodoBar ? 'Close' : '+ Add to-do',
          onClick: () => {
            showAddTodoBar = !showAddTodoBar;
            render();
          },
        }),
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          title: 'Sweep connected inbox/calendar & refresh suggested to-dos',
          text: 'Sync Inbox',
          onClick: () =>
            dispatchPrompt(
              '/followup-plan Sweep my workspace memory and any connected mail/chat sources to update action_items.md and stage [Draft-Only] replies.',
              'Sync Action Items'
            ),
        }),
        el('button', {
          type: 'button',
          className: 'ai-updated-pill',
          title: 'Reload action items and topics from local disk',
          text: 'Updated just now \u21BB',
          onClick: () =>
            loadState().then(() => showToast('Refreshed Action Items & Topics')),
        }),
      ]),
    ]);

    let addBarNode = null;
    if (showAddTodoBar) {
      const prioSelect = el('select', { id: 'gtd-prio' }, [
        el('option', { value: 'P0', text: 'P0 - Today' }),
        el('option', { value: 'P1', text: 'P1 - This Week' }),
        el('option', { value: 'P2', text: 'P2 - Later' }),
      ]);
      const initInput = el('input', {
        type: 'text',
        id: 'gtd-init',
        placeholder: 'Topic / Initiative (optional)',
        style: { width: '175px' },
      });
      const taskInput = el('input', {
        type: 'text',
        id: 'gtd-task',
        placeholder: 'Add a concrete to-do (e.g. Send updated Round 3 rubric to Carla)...',
        style: { flex: '1', minWidth: '210px' },
      });
      const saveTodoBtn = el('button', {
        type: 'button',
        className: 'btn btn-sm',
        id: 'btn-add-gtd',
        text: 'Add to-do',
        onClick: async () => {
          const priority = prioSelect.value;
          const initiative = initInput.value || 'General';
          const task = taskInput.value;
          if (!task.trim()) return;
          try {
            await apiPost('/api/gtd/add', {
              priority,
              initiative,
              task,
              owner: (appState.profile && appState.profile.name) || 'Me',
            });
            showAddTodoBar = false;
            await loadState();
            showToast('Added to-do');
          } catch (err) {
            showToast('Error adding to-do: ' + err.message);
          }
        },
      });
      addBarNode = el('div', { className: 'card', style: { marginBottom: '14px' } }, [
        el('div', { className: 'form-row' }, [prioSelect, initInput, taskInput, saveTodoBtn]),
      ]);
    }

    const visibleOpen = showAllTodos ? openItems : openItems.slice(0, 3);
    const todosStack = el('div', { className: 'ai-todos-stack' });

    if (openItems.length === 0) {
      todosStack.appendChild(
        el('div', { className: 'ai-todo-row' }, [
          el('div', { className: 'ai-todo-main' }, [
            el('p', { className: 'ai-todo-title', text: 'All caught up on your to-dos!' }),
            el('p', {
              className: 'ai-todo-desc',
              text: 'Click "+ Add to-do" above or "Sync Inbox" to surface new follow-ups.',
            }),
          ]),
        ])
      );
    } else {
      visibleOpen.forEach((it) => {
        const linkedInit = initBySlug[it.initiative] || null;
        const topicTitle = linkedInit ? linkedInit.title : it.initiative;
        const replyMode = isReplyStyleTask(it.task);
        const contextSentence = linkedInit
          ? topicTitle +
            (linkedInit.nextMilestone ? ' \u2014 Next milestone: ' + linkedInit.nextMilestone + '.' : '') +
            (it.dateMeta ? ' (' + it.dateMeta + ')' : '')
          : 'Topic: ' + topicTitle + (it.dateMeta ? ' \u00B7 ' + it.dateMeta : '');

        const descP = el('p', { className: 'ai-todo-desc' }, [contextSentence]);
        descP.appendChild(
          el('button', {
            type: 'button',
            className: 'ai-attach-chip',
            title: 'Inspect source notes in Customize',
            text: '\uD83D\uDCCE 1',
            onClick: () => {
              if (linkedInit && linkedInit.files && linkedInit.files['status.md']) {
                openFileInExplorer(linkedInit.files['status.md'].path, false);
              } else {
                openRelativeVaultFile('action_items.md', false);
              }
            },
          })
        );

        const actionLabel = replyMode ? '\u270E Reply' : '\u2197 Open';
        const promptForTodo = replyMode
          ? '/my-voice Draft a clear, concise [Draft-Only] message in my voice to complete this action item: [' +
            topicTitle +
            '] ' +
            it.task
          : 'Help me complete this action item step-by-step using our workspace context: [' +
            topicTitle +
            '] ' +
            it.task;

        todosStack.appendChild(
          el('div', { className: 'ai-todo-row' }, [
            el('div', { className: 'ai-todo-main' }, [
              el('p', { className: 'ai-todo-title', text: it.task }),
              descP,
            ]),
            el('div', { className: 'ai-todo-actions' }, [
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                dataset: { draftTask: it.task },
                text: actionLabel,
                onClick: () => dispatchPrompt(promptForTodo, replyMode ? 'Draft Reply' : 'Action Item'),
              }),
              el('span', {
                className: 'ai-prio-tag' + (it.bucket === 'P0' ? ' p0' : ''),
                title: 'Priority ' + it.bucket,
                text: it.bucket,
              }),
              el('button', {
                type: 'button',
                className: 'ai-circle-btn',
                title: 'Mark done',
                dataset: { toggleLine: it.lineNumber },
                text: '\u2713',
                onClick: async () => {
                  try {
                    await apiPost('/api/gtd/toggle', { lineNumber: Number(it.lineNumber) });
                    await loadState();
                    showToast('Marked to-do complete');
                  } catch (err) {
                    showToast('Error updating item: ' + err.message);
                  }
                },
              }),
            ]),
          ])
        );
      });
    }

    const footLeft =
      openItems.length > 3
        ? el('button', {
            type: 'button',
            className: 'ai-show-more-btn',
            id: 'btn-show-more-todos',
            text: showAllTodos
              ? '\u2303 Show fewer'
              : '\u2304 Show ' + (openItems.length - 3) + ' more',
            onClick: () => {
              showAllTodos = !showAllTodos;
              render();
            },
          })
        : el('span');

    const footRight =
      doneItems.length > 0
        ? el('button', {
            type: 'button',
            className: 'ai-show-more-btn',
            id: 'btn-toggle-completed-todos',
            text: (showCompletedTodos ? 'Hide completed' : 'Completed') + ' (' + doneItems.length + ')',
            onClick: () => {
              showCompletedTodos = !showCompletedTodos;
              render();
            },
          })
        : null;

    let completedNode = null;
    if (showCompletedTodos && doneItems.length > 0) {
      completedNode = el(
        'div',
        { className: 'ai-todos-stack', style: { marginTop: '10px', opacity: '0.78' } },
        doneItems.map((it) =>
          el('div', { className: 'ai-todo-row' }, [
            el('div', { className: 'ai-todo-main' }, [
              el('p', { className: 'ai-todo-title done', text: it.task }),
              el('p', { className: 'ai-todo-desc', text: it.initiative }),
            ]),
            el('button', {
              type: 'button',
              className: 'btn btn-secondary btn-sm',
              dataset: { toggleLine: it.lineNumber },
              text: 'Undo',
              onClick: async () => {
                await apiPost('/api/gtd/toggle', { lineNumber: Number(it.lineNumber) });
                await loadState();
                showToast('Reopened to-do');
              },
            }),
          ])
        )
      );
    }

    const waveDiv = el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]);

    const topicsGrid = el(
      'div',
      { className: 'ai-topics-grid' },
      topics.map((tp) =>
        el('div', { className: 'ai-topic-card' }, [
          el('div', { className: 'ai-topic-top' }, [
            el('span', { className: 'ai-topic-icon', text: tp.icon }),
            el('button', {
              type: 'button',
              className: 'btn btn-secondary btn-sm',
              text: tp.actionLabel,
              onClick: tp.onAction,
            }),
          ]),
          el('h4', { className: 'ai-topic-title', text: tp.title }),
          el('p', { className: 'ai-topic-body', text: tp.body }),
          el('div', { className: 'ai-topic-foot' }, [
            el('button', {
              type: 'button',
              className: 'ai-attach-chip',
              style: { marginLeft: '0' },
              title: 'Inspect topic files in Customize',
              text: '\uD83D\uDCCE ' + tp.attachCount,
              onClick: tp.onOpenFiles,
            }),
            tp.rag === 'AMBER' || tp.rag === 'RED'
              ? el('span', { className: 'badge badge-amber', text: tp.rag === 'RED' ? 'Needs attention' : 'Watch' })
              : el('span', { className: 'muted', style: { fontSize: '11px' }, text: 'On track' }),
          ]),
        ])
      )
    );

    const topicsSection = el('div', { className: 'ai-topics-section' }, [
      el('p', { className: 'ai-section-label', text: 'Topics to catch up on' }),
      topicsGrid,
    ]);

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        headRow,
        addBarNode,
        el('p', { className: 'ai-section-label', text: 'Suggested to-dos' }),
        todosStack,
        el('div', { className: 'ai-todos-foot' }, [footLeft, footRight]),
        completedNode,
        waveDiv,
        topicsSection,
      ]),
    ];
  }

  function buildInitiativesNodes() {
    const inits = appState.initiatives || [];
    const onTrackCount = inits.filter((i) => i.rag === 'GREEN').length;
    const watchCount = inits.length - onTrackCount;

    const headRow = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Tracking ',
        el('span', {
          className: 'ai-blue-count',
          text: inits.length + (inits.length === 1 ? ' initiative' : ' initiatives'),
        }),
        ' ',
        makeAnimatedEmoji('1f6a6', '\uD83D\uDEA6', 'Traffic Light'),
        ' \u2014 ',
        el('span', { className: 'ai-blue-count', text: onTrackCount + ' on track' }),
        ' and ',
        el('span', { className: 'ai-blue-count', text: watchCount + ' to watch' }),
        '.',
      ]),
      el('div', { className: 'ai-inbox-meta-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          id: 'btn-toggle-new-init',
          text: showNewInitBar ? 'Close' : '+ New initiative',
          onClick: () => {
            showNewInitBar = !showNewInitBar;
            render();
          },
        }),
        el('button', {
          type: 'button',
          className: 'ai-updated-pill',
          text: 'Updated just now \u21BB',
          onClick: () => loadState().then(() => showToast('Refreshed initiatives')),
        }),
      ]),
    ]);

    let createBarNode = null;
    if (showNewInitBar) {
      const titleInput = el('input', {
        type: 'text',
        id: 'init-title',
        placeholder: 'Initiative / Project Title',
        style: { flex: '1', minWidth: '170px' },
      });
      const milestoneInput = el('input', {
        type: 'text',
        id: 'init-milestone',
        placeholder: 'Next Milestone',
        style: { flex: '1', minWidth: '150px' },
      });
      const ragSelect = el('select', { id: 'init-rag' }, [
        el('option', { value: 'GREEN', text: 'GREEN (On Track)' }),
        el('option', { value: 'AMBER', text: 'AMBER (Watch)' }),
        el('option', { value: 'RED', text: 'RED (Needs Attention)' }),
      ]);
      const createBtn = el('button', {
        type: 'button',
        className: 'ai-sky-pill',
        id: 'btn-create-init',
        text: '+ Create',
        onClick: async () => {
          const title = titleInput.value;
          const milestone = milestoneInput.value || 'TBD';
          const rag = ragSelect.value;
          if (!title.trim()) return;
          try {
            await apiPost('/api/initiatives/create', { title, milestone, rag });
            showNewInitBar = false;
            await loadState();
            showToast('Created 4-file initiative folder');
          } catch (err) {
            showToast('Error creating initiative: ' + err.message);
          }
        },
      });
      createBarNode = el('div', { className: 'card', style: { marginBottom: '16px' } }, [
        el('div', { className: 'form-row', style: { marginBottom: '0' } }, [titleInput, milestoneInput, ragSelect, createBtn]),
      ]);
    }

    const milestonesStack = el('div', { className: 'ai-todos-stack' });
    if (inits.length === 0) {
      milestonesStack.appendChild(
        el('div', { className: 'ai-todo-row' }, [
          el('div', { className: 'ai-todo-main' }, [
            el('p', { className: 'ai-todo-title', text: 'No initiatives tracked yet' }),
            el('p', { className: 'ai-todo-desc', text: 'Click "+ New initiative" above to scaffold a 4-file project workspace.' }),
          ]),
        ])
      );
    } else {
      inits.forEach((init) => {
        const ragDot = init.rag === 'RED' ? '\uD83D\uDD34' : init.rag === 'AMBER' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';
        const filesCount = init.files ? Object.keys(init.files).length : 4;
        const descP = el('p', { className: 'ai-todo-desc' }, [
          'Next milestone: ' + (init.nextMilestone || 'TBD') + (init.summary ? ' \u2014 ' + init.summary : ''),
        ]);
        descP.appendChild(
          el('button', {
            type: 'button',
            className: 'ai-attach-chip',
            text: '\uD83D\uDCCE ' + filesCount,
            onClick: () => {
              if (init.files && init.files['status.md']) {
                openFileInExplorer(init.files['status.md'].path, false);
              }
            },
          })
        );

        milestonesStack.appendChild(
          el('div', { className: 'ai-todo-row' }, [
            el('div', { className: 'ai-todo-main' }, [
              el('p', { className: 'ai-todo-title', text: ragDot + ' ' + init.title }),
              descP,
            ]),
            el('div', { className: 'ai-todo-actions' }, [
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                dataset: { scqaSlug: init.slug, scqaTitle: init.title },
                text: '\u2728 Prep',
                onClick: () =>
                  dispatchPrompt(
                    '/meeting-prep Build a 1-page pre-meeting brief and Adversarial Minto SCQA Critic for initiative "' +
                      init.title +
                      '" (initiatives/' +
                      init.slug +
                      '/).',
                    'Pre-Meeting Prep'
                  ),
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: '4-Agent Swarm',
                onClick: () =>
                  dispatchPrompt(
                    '/swarm-prep Run a 4-agent parallel 360 prep pack for "' +
                      init.title +
                      '" (initiatives/' +
                      init.slug +
                      '/).',
                    'Swarm Prep'
                  ),
              }),
            ]),
          ])
        );
      });
    }

    const cardsSection = el('div', { className: 'ai-topics-section' }, [
      el('p', { className: 'ai-section-label', text: 'Initiative workspaces & files' }),
      el(
        'div',
        { className: 'ai-topics-grid' },
        inits.map((init) => {
          const badgeCls =
            init.rag === 'RED' ? 'badge-red' : init.rag === 'AMBER' ? 'badge-amber' : 'badge-green';
          const filesList = init.files ? Object.values(init.files) : [];
          return el('div', { className: 'ai-topic-card' }, [
            el('div', { className: 'ai-topic-top' }, [
              el('span', { className: 'badge ' + badgeCls, text: init.rag }),
              el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: 'Ingest Notes',
                onClick: () =>
                  dispatchPrompt(
                    '/meeting-notes Help me ingest and compact new meeting notes into initiatives/' +
                      init.slug +
                      '/ and extract open to-dos to action_items.md.',
                    'Ingest Notes: ' + init.title
                  ),
              }),
            ]),
            el('h4', { className: 'ai-topic-title', text: init.title }),
            el('p', { className: 'ai-topic-body', text: init.summary || 'Next milestone: ' + (init.nextMilestone || 'TBD') }),
            el(
              'div',
              { className: 'pill-row', style: { marginTop: '4px' } },
              filesList.map((f) =>
                el('button', {
                  type: 'button',
                  className: 'ai-attach-chip',
                  style: { marginLeft: '0', padding: '3px 9px' },
                  dataset: { openAbs: f.path },
                  text: '\uD83D\uDCC4 ' + f.name,
                  onClick: () => openFileInExplorer(f.path),
                })
              )
            ),
          ]);
        })
      ),
    ]);

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        headRow,
        createBarNode,
        el('p', { className: 'ai-section-label', text: 'Upcoming milestones & status' }),
        milestonesStack,
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        cardsSection,
      ]),
    ];
  }

  function buildContactsNodes() {
    const contacts = (appState.contacts && appState.contacts.contacts) || [];
    const staleContacts = contacts.filter((c) => c.isStale);
    const suggestedList = staleContacts.length > 0 ? staleContacts : contacts.slice(0, 3);

    const headRow = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Send a wave ',
        makeAnimatedEmoji('1f30a', '\uD83C\uDF0A', 'Wave'),
        ' across ',
        el('span', {
          className: 'ai-blue-count',
          text: contacts.length + (contacts.length === 1 ? ' stakeholder' : ' stakeholders'),
        }),
        ' \u2014 ',
        el('span', {
          className: 'ai-blue-count',
          text: staleContacts.length + ' due for a check-in',
        }),
        '.',
      ]),
      el('div', { className: 'ai-inbox-meta-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          dataset: { openRel: 'contacts.md' },
          text: 'Edit Roster',
          onClick: () => openRelativeVaultFile('contacts.md', true),
        }),
        el('button', {
          type: 'button',
          className: 'ai-updated-pill',
          text: 'Updated just now \u21BB',
          onClick: () => loadState().then(() => showToast('Refreshed stakeholders')),
        }),
      ]),
    ]);

    const checkinsStack = el('div', { className: 'ai-todos-stack' });
    if (suggestedList.length === 0) {
      checkinsStack.appendChild(
        el('div', { className: 'ai-todo-row' }, [
          el('div', { className: 'ai-todo-main' }, [
            el('p', { className: 'ai-todo-title', text: 'No stakeholders added yet' }),
            el('p', { className: 'ai-todo-desc', text: 'Click "Edit Roster" to add key teammates, counsel, or agency partners.' }),
          ]),
        ])
      );
    } else {
      suggestedList.forEach((c) => {
        const touchInfo =
          c.daysAgo !== null && c.daysAgo !== undefined
            ? c.daysAgo + ' days since last touch (' + (c.lastTouch || '') + ')'
            : 'Last touch: ' + (c.lastTouch || 'N/A');

        checkinsStack.appendChild(
          el('div', { className: 'ai-todo-row' }, [
            el('div', { className: 'ai-todo-main' }, [
              el('p', {
                className: 'ai-todo-title',
                text: c.name + (c.role ? ' \u00B7 ' + c.role : ''),
              }),
              el('p', {
                className: 'ai-todo-desc',
                text: touchInfo + (c.priorities ? ' \u2014 Focus: ' + c.priorities : ''),
              }),
            ]),
            el('div', { className: 'ai-todo-actions' }, [
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                dataset: { checkinName: c.name, checkinInit: c.initiative },
                text: '\u270E Check in',
                onClick: () =>
                  dispatchPrompt(
                    '/my-voice Draft a short, warm [Draft-Only] check-in note to ' +
                      c.name +
                      ' regarding "' +
                      c.initiative +
                      '" using our latest workspace status.',
                    'Stakeholder Check-In'
                  ),
              }),
              el('button', {
                type: 'button',
                className: 'ai-circle-btn',
                title: 'Mark touched today',
                dataset: { touchName: c.name },
                text: '\u2713',
                onClick: async () => {
                  try {
                    await apiPost('/api/contacts/touch', { name: c.name });
                    await loadState();
                    showToast('Marked ' + c.name + ' touched today');
                  } catch (err) {
                    showToast('Error updating contact: ' + err.message);
                  }
                },
              }),
            ]),
          ])
        );
      });
    }

    const allContactsSection = el('div', { className: 'ai-topics-section' }, [
      el('p', { className: 'ai-section-label', text: 'All relationships' }),
      el(
        'div',
        { className: 'ai-topics-grid' },
        contacts.map((c) =>
          el('div', { className: 'ai-topic-card' }, [
            el('div', { className: 'ai-topic-top' }, [
              el('span', {
                className: 'badge ' + (c.isStale ? 'badge-amber' : 'badge-green'),
                text: c.isStale ? 'Due (>21d)' : 'Active',
              }),
              el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: 'Log Touch',
                onClick: async () => {
                  await apiPost('/api/contacts/touch', { name: c.name });
                  await loadState();
                  showToast('Marked ' + c.name + ' touched today');
                },
              }),
            ]),
            el('h4', { className: 'ai-topic-title', text: c.name }),
            el('p', {
              className: 'ai-topic-body',
              text:
                (c.role ? c.role + ' \u00B7 ' : '') +
                (c.priorities || '') +
                (c.lastTouch ? ' (Last touch: ' + c.lastTouch + ')' : ''),
            }),
            el('div', { className: 'ai-topic-foot' }, [
              el('span', { className: 'ai-attach-chip', style: { marginLeft: '0' }, text: c.initiative || 'General' }),
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                text: '\u270E Reply',
                onClick: () =>
                  dispatchPrompt(
                    '/my-voice Draft a short, warm [Draft-Only] note to ' +
                      c.name +
                      ' regarding "' +
                      c.initiative +
                      '".',
                    'Note to ' + c.name
                  ),
              }),
            ]),
          ])
        )
      ),
    ]);

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        headRow,
        el('p', {
          className: 'ai-section-label',
          text: staleContacts.length > 0 ? 'Suggested check-ins (>21 days)' : 'Recent contacts',
        }),
        checkinsStack,
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        allContactsSection,
      ]),
    ];
  }

  function appendTreeNodes(parent, node, depth) {
    if (!node) return;
    const pad = depth * 12;
    if (node.type === 'directory') {
      if (depth > 0) {
        parent.appendChild(
          el('div', {
            className: 'muted',
            style: { padding: '4px 6px 2px ' + pad + 'px', fontWeight: '600' },
            text: node.name + '/',
          })
        );
      }
      (node.children || []).forEach((ch) => appendTreeNodes(parent, ch, depth + 1));
      return;
    }
    const isActive = Boolean(selectedFile && selectedFile.path === node.path);
    parent.appendChild(
      el('button', {
        className: 'tree-node' + (isActive ? ' active' : ''),
        style: { paddingLeft: pad + 6 + 'px' },
        dataset: { openAbs: node.path },
        text: node.name,
        onClick: () => openFileInExplorer(node.path),
      })
    );
  }

  function buildCustomizeNodes() {
    const quickBar = el('div', { className: 'customize-quick-bar' }, [
      el('span', { className: 'muted', style: { fontWeight: '600', marginRight: '4px' }, text: 'Quick Jump:' }),
      el('button', {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        text: 'Voice & Tone (voice.md)',
        onClick: () => openRelativeVaultFile('profile/voice.md', false),
      }),
      el('button', {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        text: 'Identity (identity.md)',
        onClick: () => openRelativeVaultFile('profile/identity.md', false),
      }),
      el('button', {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        text: 'Playbooks (playbooks.md)',
        onClick: () => openRelativeVaultFile('profile/playbooks.md', false),
      }),
      el('button', {
        type: 'button',
        className: 'btn btn-secondary btn-sm',
        text: 'Action Items Source',
        onClick: () => openRelativeVaultFile('action_items.md', false),
      }),
    ]);

    const roots = (appState.roots || []).filter(
      (r) => r.id === 'vault' || r.id === 'my-skills'
    );
    const treePane = el('div', { className: 'tree-pane' });
    roots.forEach((r) => {
      treePane.appendChild(el('div', { className: 'tree-root-label', text: r.label }));
      const hasChildren = r.tree && Array.isArray(r.tree.children) && r.tree.children.length > 0;
      if (!hasChildren && r.id === 'my-skills') {
        treePane.appendChild(
          el('div', {
            className: 'muted',
            style: { fontSize: '11px', padding: '4px 6px 8px 6px' },
            text: 'No personal copies yet — click "Save My Copy" on any skill in the Skills tab.',
          })
        );
      } else {
        appendTreeNodes(treePane, r.tree, 0);
      }
    });

    const editorPane = el('div', { className: 'editor-pane' });
    if (!selectedFile) {
      editorPane.appendChild(
        el('div', {
          className: 'muted',
          text: 'Select any Markdown or JSON file on the left to inspect or edit what Antigravity stores under the hood.',
        })
      );
    } else {
      let textareaRef = null;
      if (editorMode === 'edit') {
        textareaRef = el('textarea', {
          className: 'md-editor',
          id: 'file-textarea',
          value: selectedFile.content || '',
          readOnly: !selectedFile.writable,
        });
        textareaRef.addEventListener('input', () => {
          selectedFile.content = textareaRef.value;
          if (saveBtnRef) {
            const dirty = selectedFile.writable && selectedFile.content !== selectedFile.savedContent;
            saveBtnRef.textContent = dirty ? 'Save Changes *' : 'Save';
          }
        });
      }

      const isDirty = Boolean(
        selectedFile.writable &&
          selectedFile.savedContent !== undefined &&
          selectedFile.content !== selectedFile.savedContent
      );

      let saveBtnRef = null;
      const actionButtons = [
        el('button', {
          className: 'btn ' + (editorMode === 'preview' ? '' : 'btn-secondary ') + 'btn-sm',
          id: 'btn-mode-preview',
          title: 'View formatted Markdown preview',
          text: 'Rendered Preview',
          onClick: () => {
            if (textareaRef && selectedFile) selectedFile.content = textareaRef.value;
            if (editorMode === 'preview') {
              showToast('Already viewing Rendered Preview — click "' + (selectedFile.writable ? 'Edit Markdown' : 'Raw Source') + '" to switch');
              return;
            }
            editorMode = 'preview';
            render();
          },
        }),
        el('button', {
          className: 'btn ' + (editorMode === 'edit' ? '' : 'btn-secondary ') + 'btn-sm',
          id: 'btn-mode-edit',
          title: selectedFile.writable ? 'Edit raw Markdown text' : 'View raw Markdown source (read-only)',
          text: selectedFile.writable ? 'Edit Markdown' : 'Raw Source',
          onClick: () => {
            if (editorMode === 'edit') return;
            editorMode = 'edit';
            render();
          },
        }),
      ];

      if (selectedFile.writable && (editorMode === 'edit' || isDirty)) {
        saveBtnRef = el('button', {
          className: 'btn btn-sm',
          id: 'btn-save-file',
          text: isDirty ? 'Save Changes *' : 'Save',
          onClick: async () => {
            if (!selectedFile) return;
            try {
              if (textareaRef) selectedFile.content = textareaRef.value;
              await apiPost('/api/file', { path: selectedFile.path, content: selectedFile.content });
              selectedFile.savedContent = selectedFile.content;
              await loadState();
              showToast('Saved ' + selectedFile.name);
            } catch (err) {
              showToast('Error saving file: ' + err.message);
            }
          },
        });
        actionButtons.push(saveBtnRef);
      }

      if (selectedFile.name === 'voice.md') {
        actionButtons.push(
          el('button', {
            className: 'btn btn-sm',
            text: 'Draft in My Voice',
            onClick: () => {
              const snippet = String(selectedFile.content || '').slice(0, 8000);
              dispatchPrompt(
                '/my-voice Use my current voice.md calibration below to help me draft a message or memo:\n\n<voice_profile>\n' +
                  snippet +
                  '\n</voice_profile>',
                'Draft in My Voice'
              );
            },
          })
        );
      }

      actionButtons.push(
        el('button', {
          className: 'btn btn-secondary btn-sm',
          id: 'btn-ask-file',
          text: 'Ask Agent',
          onClick: () => {
            if (!selectedFile) return;
            const currentText = textareaRef && editorMode === 'edit' ? textareaRef.value : selectedFile.content || '';
            const inlineBlock =
              currentText && currentText.length <= 14000
                ? '\n\nHere is the current file content from WV Antigravity (`' +
                  selectedFile.path +
                  '`):\n\n```markdown\n' +
                  currentText +
                  '\n```'
                : '';
            dispatchPrompt(
              'Review `' +
                selectedFile.path +
                '` and summarize key takeaways, open risks, or recommended updates.' +
                inlineBlock,
              'Inspect ' + selectedFile.name
            );
          },
        })
      );

      editorPane.appendChild(
        el('div', { className: 'card-header', style: { marginBottom: '4px' } }, [
          el('div', null, [
            el('strong', { text: selectedFile.name }),
            ' ',
            el('span', {
              className: 'badge badge-neutral',
              text: selectedFile.writable
                ? selectedFile.rootId === 'my-skills'
                  ? 'Editable Personal Skill (Update-Proof)'
                  : 'Editable Memory File'
                : 'Read-Only Stock Plugin File',
            }),
          ]),
          el('div', { className: 'topbar-actions' }, actionButtons),
        ])
      );

      editorPane.appendChild(
        el('div', {
          className: 'muted',
          style: { fontSize: '11px', wordBreak: 'break-all' },
          text: selectedFile.path,
        })
      );

      if (editorMode === 'edit' && textareaRef) {
        editorPane.appendChild(textareaRef);
      } else {
        editorPane.appendChild(buildSimpleMarkdownPreview(selectedFile.content, selectedFile.name));
      }
    }

    const customizeHead = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Customize ',
        makeAnimatedEmoji('2699_fe0f', '\u2699\uFE0F', 'Customize'),
        ' your ',
        el('span', { className: 'ai-blue-count', text: 'voice, role' }),
        ' and ',
        el('span', { className: 'ai-blue-count', text: 'memory files' }),
        '.',
      ]),
    ]);

    const quickStack = el('div', { className: 'ai-todos-stack', style: { marginBottom: '14px' } }, [
      el('div', { className: 'ai-todo-row' }, [
        el('div', { className: 'ai-todo-main' }, [
          el('p', { className: 'ai-todo-title', text: 'Quick-Jump Personal Memory Files' }),
          el('p', { className: 'ai-todo-desc', text: 'Calibrate your writing tone, role identity, playbooks, or raw action items.' }),
        ]),
        quickBar,
      ]),
    ]);

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        customizeHead,
        buildRoleSetupCard(true),
        quickStack,
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        el('div', { className: 'ai-topics-section' }, [
          el('div', { className: 'explorer-layout' }, [treePane, editorPane]),
        ]),
      ]),
    ];
  }

  function buildSkillsNodes() {
    const allCategories = (appState && appState.skillsCatalog) || [];
    const primaryCategories = allCategories.filter((c) => c.scope !== 'other');
    const otherCategories = allCategories.filter((c) => c.scope === 'other');

    let otherSkillCount = 0;
    otherCategories.forEach((c) => {
      otherSkillCount += (c.skills || []).length;
    });

    const visibleCategories = showOtherPlugins ? allCategories : primaryCategories;
    const visibleKeySet = new Set(visibleCategories.map((c) => c.categoryId || c.plugin));
    if (skillsCategory !== 'all' && !visibleKeySet.has(skillsCategory)) {
      skillsCategory = 'all';
    }

    let totalVisibleSkills = 0;
    visibleCategories.forEach((cat) => {
      totalVisibleSkills += (cat.skills || []).length;
    });

    const myCat = allCategories.find((c) => c.categoryId === 'my-skills');
    const mySkillsCount = myCat && myCat.skills ? myCat.skills.length : 0;

    const chipButtons = [
      el('button', {
        type: 'button',
        className: 'skill-chip' + (skillsCategory === 'all' ? ' active' : ''),
        text: 'All (' + totalVisibleSkills + ')',
        onClick: () => {
          skillsCategory = 'all';
          render();
        },
      }),
      ...visibleCategories.map((cat) => {
        const key = cat.categoryId || cat.plugin;
        const label = (cat.chipLabel || cat.categoryLabel) + ' (' + (cat.skills || []).length + ')';
        const extraCls = cat.scope === 'my' ? ' my-skills-chip' : '';
        return el('button', {
          type: 'button',
          className: 'skill-chip' + extraCls + (skillsCategory === key ? ' active' : ''),
          text: label,
          onClick: () => {
            skillsCategory = key;
            render();
          },
        });
      }),
    ];

    if (otherSkillCount > 0) {
      chipButtons.push(
        el('button', {
          type: 'button',
          className: 'skill-chip other-toggle-chip' + (showOtherPlugins ? ' active' : ''),
          title: 'Show or hide skills from other plugins installed on this machine',
          text: (showOtherPlugins ? 'Hide Other Plugins (' : '+ Other Installed (') + otherSkillCount + ')',
          onClick: () => {
            showOtherPlugins = !showOtherPlugins;
            render();
          },
        })
      );
    }

    const chipRow = el('div', { className: 'skills-chip-row' }, chipButtons);

    const searchInput = el('input', {
      type: 'search',
      id: 'skills-search-input',
      placeholder: 'Search skills by name, /command, or prompt...',
      value: skillsSearch,
    });
    searchInput.addEventListener('input', () => {
      skillsSearch = searchInput.value;
      renderFilteredSkillCards();
    });

    const skillsHead = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Explore ',
        el('span', { className: 'ai-blue-count', text: totalVisibleSkills + ' skills' }),
        ' ',
        makeAnimatedEmoji('2728', '\u2728', 'Sparkles'),
        ' and ',
        el('span', {
          className: 'ai-blue-count',
          text: mySkillsCount + (mySkillsCount === 1 ? ' personal copy' : ' personal copies'),
        }),
        ' ready to run.',
      ]),
    ]);

    const searchBarWrap = el('div', { className: 'ai-search-bar' }, [
      el('span', { className: 'muted', style: { fontSize: '15px', fontWeight: '700' }, text: '\u2315' }),
      searchInput,
    ]);

    const toolbarWrap = el('div', { className: 'skills-toolbar' }, [searchBarWrap, chipRow]);

    const resultsContainer = el('div', {});

    function buildForkDrawer(skill, cardKey) {
      let currentMode = 'copy';
      const defaultCopySlug = skill.id.endsWith('-my') ? skill.id + '-2' : skill.id + '-my';

      const slugInput = el('input', {
        type: 'text',
        className: 'form-input',
        value: defaultCopySlug,
        placeholder: 'e.g. ' + defaultCopySlug,
      });

      const titleInput = el('input', {
        type: 'text',
        className: 'form-input',
        value: skill.title.endsWith('(My Copy)') ? skill.title : skill.title + ' (My Copy)',
      });

      const seedTextarea = el('textarea', {
        className: 'form-textarea seed-edit-textarea',
        value: String(skill.seedPrompt || '').replace(new RegExp('^/' + skill.id + '\\b'), '/' + defaultCopySlug),
      });

      const replaceCheckbox = el('input', { type: 'checkbox' });

      function syncSlugWithMode(nextMode) {
        const prevSlug = slugInput.value.trim().replace(/^\/+/, '') || skill.id;
        currentMode = nextMode;
        if (nextMode === 'override') {
          slugInput.value = skill.id;
          slugInput.readOnly = true;
          titleInput.value = skill.title.replace(/\s*\(My Copy\)$/, '') + ' (My Override)';
        } else {
          slugInput.readOnly = false;
          slugInput.value = defaultCopySlug;
          titleInput.value = skill.title.endsWith('(My Copy)') ? skill.title : skill.title + ' (My Copy)';
        }
        const targetCmd = '/' + slugInput.value.trim().replace(/^\/+/, '');
        seedTextarea.value = seedTextarea.value.replace(new RegExp('^/' + prevSlug + '\\b'), targetCmd);
      }

      slugInput.addEventListener('input', () => {
        const clean = slugInput.value.trim().replace(/^\/+/, '').toLowerCase();
        if (clean) {
          seedTextarea.value = seedTextarea.value.replace(/^\/[a-z0-9_-]+/, '/' + clean);
        }
      });

      const copyRadio = el('input', {
        type: 'radio',
        checked: true,
        onChange: () => {
          if (copyRadio.checked) {
            overrideRadio.checked = false;
            syncSlugWithMode('copy');
          }
        },
      });
      copyRadio.name = 'fork-mode-' + cardKey;

      const overrideRadio = el('input', {
        type: 'radio',
        checked: false,
        onChange: () => {
          if (overrideRadio.checked) {
            copyRadio.checked = false;
            syncSlugWithMode('override');
          }
        },
      });
      overrideRadio.name = 'fork-mode-' + cardKey;

      async function submitFork(openEditorAfter) {
        const cleanSlug = slugInput.value.trim().replace(/^\/+/, '').toLowerCase();
        try {
          const res = await apiPost('/api/skills/fork', {
            sourcePlugin: skill.plugin,
            sourceSkillId: skill.id,
            targetSlug: cleanSlug,
            mode: currentMode,
            title: titleInput.value.trim(),
            subtitle: skill.subtitle,
            seedPrompt: seedTextarea.value.trim(),
            overwrite: replaceCheckbox.checked,
          });
          activeForkCardKey = null;
          if (res.skillsCatalog && appState) {
            appState.skillsCatalog = res.skillsCatalog;
          }
          await loadState();
          showToast('Saved protected personal skill /' + cleanSlug + ' in ~/.gemini/config/skills/');
          if (openEditorAfter && res.skillMdPath) {
            await openFileInExplorer(res.skillMdPath, true);
          } else {
            skillsCategory = 'my-skills';
            skillsSearch = '';
            render();
          }
        } catch (err) {
          let msg = err.message || 'Could not copy skill';
          try {
            const parsed = JSON.parse(msg);
            if (parsed && parsed.error) msg = parsed.error;
          } catch {}
          showToast(msg);
        }
      }

      return el('div', { className: 'fork-drawer' }, [
        el('div', { className: 'fork-drawer-title', text: 'Save My Protected Copy (~/.gemini/config/skills/)' }),
        el('div', {
          className: 'muted',
          style: { fontSize: '11px', marginBottom: '6px' },
          text: 'Copies SKILL.md and any helper scripts/templates outside the plugin directory so future updates never overwrite your changes.',
        }),
        el('div', { className: 'fork-radio-group' }, [
          el('label', { className: 'fork-radio-label' }, [
            copyRadio,
            el('span', { text: 'New personal /command (keeps stock ' + skill.command + ' intact)' }),
          ]),
          el('label', { className: 'fork-radio-label' }, [
            overrideRadio,
            el('span', { text: 'Override ' + skill.command + ' (my copy wins priority over stock)' }),
          ]),
        ]),
        el('div', { className: 'fork-grid-2' }, [
          el('div', {}, [
            el('label', { className: 'fork-field-label', text: 'Slash Command Slug' }),
            slugInput,
          ]),
          el('div', {}, [
            el('label', { className: 'fork-field-label', text: 'Display Title' }),
            titleInput,
          ]),
        ]),
        el('div', { style: { marginTop: '6px' } }, [
          el('label', { className: 'fork-field-label', text: 'My 1-Click Seed Prompt' }),
          seedTextarea,
        ]),
        el('label', { className: 'fork-radio-label', style: { marginTop: '4px' } }, [
          replaceCheckbox,
          el('span', { text: 'Replace existing personal copy if /command already exists' }),
        ]),
        el('div', { className: 'topbar-actions', style: { marginTop: '8px', flexWrap: 'wrap' } }, [
          el('button', {
            type: 'button',
            className: 'btn btn-sm',
            text: 'Save My Copy',
            onClick: () => submitFork(false),
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Save & Edit SKILL.md',
            onClick: () => submitFork(true),
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Cancel',
            onClick: () => {
              activeForkCardKey = null;
              renderFilteredSkillCards();
            },
          }),
        ]),
      ]);
    }

    function buildSeedEditDrawer(skill) {
      const titleInput = skill.isPersonalCopy
        ? el('input', {
            type: 'text',
            className: 'form-input',
            value: skill.title || '',
            placeholder: 'Card Title',
          })
        : null;
      const promptArea = el('textarea', {
        className: 'form-textarea seed-edit-textarea',
        value: skill.seedPrompt || '',
      });

      return el('div', { className: 'fork-drawer' }, [
        el('div', {
          className: 'fork-drawer-title',
          text: (skill.isPersonalCopy ? 'Edit Title & Seed Prompt for ' : 'Customize 1-Click Seed Prompt for ') + skill.command,
        }),
        el('div', {
          className: 'muted',
          style: { fontSize: '11px', marginBottom: '6px' },
          text: 'Stored in ~/antigravity-twin/memory/profile/custom_seeds.json — never overwritten by plugin updates.',
        }),
        titleInput
          ? el('div', { style: { marginBottom: '6px' } }, [
              el('label', { className: 'fork-field-label', text: 'Display Title' }),
              titleInput,
            ])
          : null,
        el('label', { className: 'fork-field-label', text: '1-Click Seed Prompt' }),
        promptArea,
        el('div', { className: 'topbar-actions', style: { marginTop: '8px', flexWrap: 'wrap' } }, [
          el('button', {
            type: 'button',
            className: 'btn btn-sm',
            text: 'Save Seed Prompt',
            onClick: async () => {
              try {
                const res = await apiPost('/api/skills/save-seed', {
                  skillId: skill.id,
                  title: titleInput ? titleInput.value.trim() : undefined,
                  seedPrompt: promptArea.value.trim(),
                });
                activeSeedCardKey = null;
                if (res.skillsCatalog && appState) appState.skillsCatalog = res.skillsCatalog;
                render();
                showToast('Saved custom seed prompt for ' + skill.command);
              } catch (err) {
                showToast('Could not save seed prompt: ' + err.message);
              }
            },
          }),
          skill.hasCustomSeed
            ? el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: 'Reset Default Seed',
                onClick: async () => {
                  try {
                    const res = await apiPost('/api/skills/save-seed', {
                      skillId: skill.id,
                      reset: true,
                    });
                    activeSeedCardKey = null;
                    if (res.skillsCatalog && appState) appState.skillsCatalog = res.skillsCatalog;
                    render();
                    showToast('Reset ' + skill.command + ' to default seed prompt');
                  } catch (err) {
                    showToast('Reset failed: ' + err.message);
                  }
                },
              })
            : null,
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Cancel',
            onClick: () => {
              activeSeedCardKey = null;
              renderFilteredSkillCards();
            },
          }),
        ]),
      ]);
    }

    function renderFilteredSkillCards() {
      resultsContainer.replaceChildren();
      const q = (skillsSearch || '').trim().toLowerCase();
      let shownCount = 0;

      visibleCategories.forEach((cat) => {
        const key = cat.categoryId || cat.plugin;
        if (skillsCategory !== 'all' && skillsCategory !== key) return;

        const matching = (cat.skills || []).filter((s) => {
          if (!q) return true;
          return (
            String(s.title || '').toLowerCase().includes(q) ||
            String(s.subtitle || '').toLowerCase().includes(q) ||
            String(s.command || '').toLowerCase().includes(q) ||
            String(s.badge || '').toLowerCase().includes(q) ||
            String(s.seedPrompt || '').toLowerCase().includes(q)
          );
        });
        if (matching.length === 0) return;
        shownCount += matching.length;

        const grid = el(
          'div',
          { className: 'skills-seed-grid' },
          matching.map((skill) => {
            const cardKey = (skill.plugin || key) + ':' + skill.id;
            const statusBadges = [];
            if (skill.isPersonalCopy) {
              statusBadges.push(
                el('span', {
                  className: 'badge badge-blue',
                  text: skill.forkMode === 'override' ? '\u2605 My Override' : '\u2605 My Copy',
                })
              );
            } else if (skill.overriddenByPersonal) {
              statusBadges.push(el('span', { className: 'badge badge-amber', text: 'Overridden' }));
            } else if (skill.hasCustomSeed) {
              statusBadges.push(el('span', { className: 'badge badge-neutral', text: 'Custom Prompt' }));
            }

            const topRow = el('div', { className: 'seed-card-top' }, [
              el('div', { className: 'seed-card-title', text: skill.title }),
              el('div', { className: 'topbar-actions' }, [
                ...statusBadges,
                el('span', { className: 'prompt-cmd', text: skill.command }),
              ]),
            ]);

            const bodyBlock = el('div', {}, [
              topRow,
              el('p', { className: 'seed-card-sub', text: skill.subtitle }),
            ]);

            const promptBox = el('div', { className: 'prompt-box' }, [
              el('div', { className: 'prompt-box-head' }, [
                el('span', { className: 'prompt-box-label', text: 'Prompt' }),
                el('div', { className: 'topbar-actions' }, [
                  el('button', {
                    type: 'button',
                    className: 'btn btn-secondary btn-sm',
                    text: 'Copy',
                    title: 'Copy prompt to clipboard',
                    onClick: async () => {
                      if (await copyTextSafe(skill.seedPrompt)) {
                        showToast('Copied ' + skill.command + ' prompt');
                      } else {
                        showToast('Clipboard copy unavailable');
                      }
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'ai-sky-pill',
                    text: 'Run \u2192',
                    title: 'Run in Antigravity chat',
                    onClick: () => dispatchPrompt(skill.seedPrompt, skill.command),
                  }),
                ]),
              ]),
              el('button', {
                type: 'button',
                className: 'seed-prompt-btn',
                title: 'Click to run ' + skill.command + ' in Antigravity chat',
                text: skill.seedPrompt,
                onClick: () => dispatchPrompt(skill.seedPrompt, skill.command),
              }),
            ]);

            const leftFooterBtns = [
              !skill.isPersonalCopy
                ? el('button', {
                    type: 'button',
                    className: 'btn btn-ghost btn-sm',
                    text: 'Save My Copy',
                    title: 'Save your own editable copy in ~/.gemini/config/skills/',
                    onClick: () => {
                      activeSeedCardKey = null;
                      activeForkCardKey = activeForkCardKey === cardKey ? null : cardKey;
                      renderFilteredSkillCards();
                    },
                  })
                : null,
              el('button', {
                type: 'button',
                className: 'btn btn-ghost btn-sm',
                text: 'Edit Prompt',
                title: 'Customize the 1-click starter prompt for ' + skill.command,
                onClick: () => {
                  activeForkCardKey = null;
                  activeSeedCardKey = activeSeedCardKey === cardKey ? null : cardKey;
                  renderFilteredSkillCards();
                },
              }),
            ];

            const rightFooterBtns = [];
            if (skill.skillMdPath) {
              rightFooterBtns.push(
                el('button', {
                  type: 'button',
                  className: 'btn btn-ghost btn-sm',
                  text: skill.isPersonalCopy ? 'Edit SKILL.md' : 'SKILL.md',
                  onClick: () => openFileInExplorer(skill.skillMdPath, Boolean(skill.isPersonalCopy)),
                })
              );
            }
            if (skill.isPersonalCopy) {
              if (confirmDeleteSlug === skill.id) {
                rightFooterBtns.push(
                  el('button', {
                    type: 'button',
                    className: 'btn btn-sm',
                    text: skill.forkMode === 'override' ? 'Confirm Revert' : 'Confirm Delete',
                    onClick: async () => {
                      try {
                        const res = await apiPost('/api/skills/delete-copy', { slug: skill.id });
                        confirmDeleteSlug = null;
                        if (res.skillsCatalog && appState) appState.skillsCatalog = res.skillsCatalog;
                        await loadState();
                        showToast(
                          skill.forkMode === 'override'
                            ? 'Reverted ' + skill.command + ' back to stock skill'
                            : 'Removed personal skill ' + skill.command
                        );
                      } catch (err) {
                        showToast('Delete failed: ' + err.message);
                      }
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'btn btn-secondary btn-sm',
                    text: 'Keep',
                    onClick: () => {
                      confirmDeleteSlug = null;
                      renderFilteredSkillCards();
                    },
                  })
                );
              } else {
                rightFooterBtns.push(
                  el('button', {
                    type: 'button',
                    className: 'btn btn-ghost btn-sm',
                    text: skill.forkMode === 'override' ? 'Revert to Stock' : 'Remove',
                    onClick: () => {
                      confirmDeleteSlug = skill.id;
                      renderFilteredSkillCards();
                    },
                  })
                );
              }
            }

            const actionRow = el('div', { className: 'seed-card-actions' }, [
              el('div', { className: 'topbar-actions' }, leftFooterBtns),
              el('div', { className: 'topbar-actions' }, rightFooterBtns),
            ]);

            const drawerNode =
              activeForkCardKey === cardKey
                ? buildForkDrawer(skill, cardKey)
                : activeSeedCardKey === cardKey
                  ? buildSeedEditDrawer(skill)
                  : null;

            return el(
              'div',
              {
                className:
                  'seed-skill-card' +
                  (skill.enabled === false ? ' is-paused' : '') +
                  (skill.isPersonalCopy ? ' is-personal-copy' : ''),
              },
              [bodyBlock, promptBox, actionRow, drawerNode]
            );
          })
        );

        resultsContainer.appendChild(
          el('div', { className: 'card' }, [
            el('div', { className: 'card-header' }, [
              el('h3', { className: 'card-title', text: cat.categoryLabel }),
              el('span', { className: 'muted', text: matching.length + ' skills' }),
            ]),
            grid,
          ])
        );
      });

      if (shownCount === 0) {
        resultsContainer.appendChild(
          el('div', { className: 'card muted', text: 'No skills match your current filter.' })
        );
      }
    }

    renderFilteredSkillCards();
    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        skillsHead,
        toolbarWrap,
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        el('div', { className: 'ai-topics-section' }, [resultsContainer]),
      ]),
    ];
  }

  function render() {
    if (!appState) {
      viewRoot.replaceChildren(el('div', { className: 'muted', text: 'Loading WV Antigravity...' }));
      return;
    }
    let nodes = [];
    if (activeTab === 'overview') nodes = buildOverviewNodes();
    else if (activeTab === 'actions') nodes = buildActionItemsNodes();
    else if (activeTab === 'initiatives') nodes = buildInitiativesNodes();
    else if (activeTab === 'contacts') nodes = buildContactsNodes();
    else if (activeTab === 'tokens') nodes = window.AGYTokenAndUpdatesUI ? window.AGYTokenAndUpdatesUI.buildTokenEconomicsView(getUiBridgeContext()) : [];
    else if (activeTab === 'customize') nodes = buildCustomizeNodes();

    viewRoot.replaceChildren(...nodes);
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      syncTabButtons();
      render();
    });
  });
  syncTabButtons();

  let tokenMeter = null;
  if (window.AGYTokenPill) {
    tokenMeter = window.AGYTokenPill.mount(document.querySelector('.topbar-actions'));
  }

  document.getElementById('btn-refresh').addEventListener('click', () => {
    if (tokenMeter) tokenMeter.refresh();
    loadState()
      .then(() => showToast('Refreshed action items, skills & token meter'))
      .catch((err) => showToast('Refresh failed: ' + err.message));
  });

  const openClawyBtn = document.getElementById('btn-open-clawy-ext');
  if (openClawyBtn) {
    openClawyBtn.addEventListener('click', () => {
      markMasteryStep('setup-clawy');
      openClawyCoordinator();
    });
  }

  const openSkillsBtn = document.getElementById('btn-open-skills-ext');
  if (openSkillsBtn) {
    openSkillsBtn.addEventListener('click', openDedicatedSkillsHub);
  }

  const customizeBtn = document.getElementById('btn-customize');
  if (customizeBtn) {
    customizeBtn.addEventListener('click', async () => {
      activeTab = 'customize';
      syncTabButtons();
      if (!selectedFile && appState) {
        await openRelativeVaultFile('profile/voice.md', false);
        return;
      }
      render();
    });
  }

  loadState().catch((err) => {
    viewRoot.replaceChildren(
      el('div', { className: 'card' }, [
        el('strong', { text: 'Unable to load WV Antigravity: ' }),
        err.message || 'Unknown error',
      ])
    );
  });
})();
