(function () {
  let appState = null;
  let activeTab = 'overview';
  let gtdFilter = 'OPEN';
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
      cmd: '/twin-brief',
      desc: 'Morning kickoff: P0 tasks, calendar & >21d stale contacts',
      prompt: '/twin-brief Give me my workday kickoff brief, top 3 actions, and any stale stakeholder check-ins.',
    },
    {
      cmd: '/twin-followup-plan',
      desc: 'Sweep open action items and stage [Draft-Only] replies',
      prompt: '/twin-followup-plan Run a follow-up sweep across my vault and stage [Draft-Only] replies for P0 and P1 tasks.',
    },
    {
      cmd: '/twin-jit-prep',
      desc: '15-minute pre-meeting brief + Adversarial SCQA Critic',
      prompt: '/twin-jit-prep Build a 1-page pre-meeting brief and Adversarial SCQA Critic for my top active initiative.',
    },
    {
      cmd: '/twin-meeting-notes',
      desc: 'Compact call notes into 4-tier memory & extract GTD tasks',
      prompt: '/twin-meeting-notes Help me ingest and compact meeting notes into my initiative vault and update gtd_board.md.',
    },
    {
      cmd: '/twin-swarm-prep',
      desc: 'Run 4 parallel subagents for 360-degree milestone prep',
      prompt: '/twin-swarm-prep Run a 4-agent parallel prep pack for my highest-priority initiative.',
    },
    {
      cmd: '/twin-weekly-impact',
      desc: 'Friday 3-Altitude executive, peer & sprint readout',
      prompt: '/twin-weekly-impact Generate my Friday 3-Altitude weekly impact summary from my vault.',
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
          const created = await window.sidecar.agent.startConversation(promptText, title || 'Twin Workflow');
          if (created && created.conversationId && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Started new Twin conversation');
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
    headerTitle.textContent = 'My Antigravity';
    headerSub.textContent = p.role && p.role !== 'Ready' ? p.role : '';
    render();
  }

  async function openFileInExplorer(filePath, startInEditMode) {
    try {
      const data = await apiGet('/api/file?path=' + encodeURIComponent(filePath));
      data.savedContent = data.content || '';
      selectedFile = data;
      editorMode = startInEditMode && data.writable ? 'edit' : 'preview';
      activeTab = 'explorer';
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
  }

  function buildRoleSetupCard() {
    if (!showRoleDrawer || !appState) return null;
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
      value: cur.name === 'Workspace User' ? '' : cur.name || '',
    });
    const roleTitle = el('input', {
      type: 'text',
      id: 'role-title',
      placeholder: 'Job Title (optional)',
      value: '',
    });
    const roleOrg = el('input', {
      type: 'text',
      id: 'role-org',
      placeholder: 'Team / Agency (optional)',
      value: cur.organization || '',
    });

    const applyBtn = el('button', {
      className: 'btn',
      id: 'btn-apply-role',
      text: 'Apply Role Preset',
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
          showToast('Initialized ' + role + ' vault preset');
        } catch (err) {
          showToast('Error applying preset: ' + err.message);
        }
      },
    });

    return el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Initialize or Switch Persona Preset' }),
        el('button', {
          className: 'btn btn-secondary btn-sm',
          id: 'btn-close-role',
          text: 'Close',
          onClick: () => {
            showRoleDrawer = false;
            render();
          },
        }),
      ]),
      el('p', { className: 'muted', style: { marginTop: '0' } }, [
        'Seeds tailored profile playbooks, sample 4-file initiatives, and GTD items in ',
        el('code', { text: appState.vaultRoot || '' }),
        '.',
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

  function buildOverviewNodes() {
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
      dispatchPrompt(q, 'My Antigravity');
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
              el('span', { className: 'badge badge-neutral', text: m.actionLabel }),
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

    const heroSection = el('div', { className: 'hero-section' }, [
      el('h2', { className: 'hero-greeting', text: 'How can I help?' }),
      el('div', { className: 'hero-ask-bar' }, [
        askInput,
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          id: 'btn-hero-ask',
          text: 'Ask \u2192',
          onClick: submitHeroPrompt,
        }),
      ]),
      resultsBox,
    ]);

    const workflowsCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: '1-Click Workflows' }),
        el('span', { className: 'muted', text: 'Click any card to run in chat' }),
      ]),
      el(
        'div',
        { className: 'action-grid' },
        QUICK_WORKFLOWS.map((q, idx) =>
          el(
            'button',
            {
              type: 'button',
              className: 'prompt-card',
              dataset: { quickIdx: idx },
              onClick: () => dispatchPrompt(q.prompt, q.cmd),
            },
            [
              el('span', { className: 'prompt-step-num', text: '0' + (idx + 1) }),
              el('span', { className: 'prompt-cmd', text: q.cmd }),
              el('span', { className: 'prompt-desc', text: q.desc }),
            ]
          )
        )
      ),
    ]);

    return [buildRoleSetupCard(), heroSection, workflowsCard].filter(Boolean);
  }

  function buildGtdNodes() {
    const items = (appState.gtd && appState.gtd.items) || [];
    const filtered = items.filter((item) => {
      if (gtdFilter === 'OPEN') return !item.checked;
      if (gtdFilter === 'DONE') return item.checked;
      return item.bucket === gtdFilter && !item.checked;
    });

    const prioSelect = el('select', { id: 'gtd-prio' }, [
      el('option', { value: 'P0', text: 'P0 - Today' }),
      el('option', { value: 'P1', text: 'P1 - This Week' }),
      el('option', { value: 'P2', text: 'P2 - Backlog' }),
    ]);
    const initInput = el('input', {
      type: 'text',
      id: 'gtd-init',
      placeholder: 'Initiative slug',
      style: { width: '140px' },
    });
    const taskInput = el('input', {
      type: 'text',
      id: 'gtd-task',
      placeholder: 'Verb + concrete deliverable...',
      style: { flex: '1', minWidth: '180px' },
    });
    const addBtn = el('button', {
      className: 'btn',
      id: 'btn-add-gtd',
      text: 'Add Task',
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
          await loadState();
          showToast('Added commitment to gtd_board.md');
        } catch (err) {
          showToast('Error adding task: ' + err.message);
        }
      },
    });

    const filterRow = el(
      'div',
      { className: 'pill-row', style: { marginBottom: '8px' } },
      ['OPEN', 'P0', 'P1', 'P2', 'DONE'].map((f) =>
        el('button', {
          className: 'btn ' + (gtdFilter === f ? '' : 'btn-secondary ') + 'btn-sm',
          dataset: { gtdFilter: f },
          text: f,
          onClick: () => {
            gtdFilter = f;
            render();
          },
        })
      )
    );

    const listContainer = el('div');
    if (filtered.length === 0) {
      listContainer.appendChild(
        el('div', {
          className: 'muted',
          style: { padding: '10px 0' },
          text: 'No matching tasks in this filter.',
        })
      );
    } else {
      filtered.forEach((it) => {
        const badgeCls =
          it.bucket === 'P0' ? 'badge-red' : it.bucket === 'P1' ? 'badge-amber' : 'badge-neutral';
        const draftLabel = '[' + it.initiative + '] ' + it.task;
        const row = el('div', { className: 'task-item' }, [
          el('div', { className: 'task-left' }, [
            el('input', {
              type: 'checkbox',
              checked: Boolean(it.checked),
              dataset: { toggleLine: it.lineNumber },
              onChange: async () => {
                try {
                  await apiPost('/api/gtd/toggle', { lineNumber: Number(it.lineNumber) });
                  await loadState();
                  showToast('Updated gtd_board.md');
                } catch (err) {
                  showToast('Error toggling task: ' + err.message);
                }
              },
            }),
            el('div', null, [
              el('div', { className: 'task-text' + (it.checked ? ' done' : '') }, [
                el('span', { className: 'badge ' + badgeCls, text: it.bucket }),
                ' ',
                el('strong', { text: '[' + it.initiative + ']' }),
                ' ' + it.task,
              ]),
              el('div', {
                className: 'muted',
                text: 'Owner: ' + it.owner + (it.dateMeta ? ' | ' + it.dateMeta : ''),
              }),
            ]),
          ]),
          el('button', {
            className: 'btn btn-secondary btn-sm',
            dataset: { draftTask: draftLabel },
            text: 'Draft',
            onClick: () =>
              dispatchPrompt(
                '/twin-voice-draft Draft a clear, direct [Draft-Only] follow-up message to advance this commitment: ' +
                  draftLabel,
                'Draft Follow-Up'
              ),
          }),
        ]);
        listContainer.appendChild(row);
      });
    }

    return [
      el('div', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { className: 'card-title', text: 'Add Zero-Decay GTD Commitment' }),
          el('button', {
            className: 'btn btn-secondary btn-sm',
            dataset: { openRel: 'gtd_board.md' },
            text: 'Edit Raw Markdown',
            onClick: () => openRelativeVaultFile('gtd_board.md', true),
          }),
        ]),
        el('div', { className: 'form-row' }, [prioSelect, initInput, taskInput, addBtn]),
        filterRow,
        listContainer,
      ]),
    ];
  }

  function buildInitiativesNodes() {
    const inits = appState.initiatives || [];

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
      el('option', { value: 'GREEN', text: 'GREEN' }),
      el('option', { value: 'AMBER', text: 'AMBER' }),
      el('option', { value: 'RED', text: 'RED' }),
    ]);
    const createBtn = el('button', {
      className: 'btn',
      id: 'btn-create-init',
      text: 'Create',
      onClick: async () => {
        const title = titleInput.value;
        const milestone = milestoneInput.value || 'TBD';
        const rag = ragSelect.value;
        if (!title.trim()) return;
        try {
          await apiPost('/api/initiatives/create', { title, milestone, rag });
          await loadState();
          showToast('Created 4-file initiative folder');
        } catch (err) {
          showToast('Error creating initiative: ' + err.message);
        }
      },
    });

    const createCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Create 4-File Isolated Initiative' }),
      ]),
      el('div', { className: 'form-row' }, [titleInput, milestoneInput, ragSelect, createBtn]),
    ]);

    const initCards = inits.map((init) => {
      const badgeCls =
        init.rag === 'RED' ? 'badge-red' : init.rag === 'AMBER' ? 'badge-amber' : 'badge-green';
      const filesList = init.files ? Object.values(init.files) : [];
      return el('div', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('div', null, [
            el('span', { className: 'badge ' + badgeCls, text: init.rag }),
            el('strong', { style: { marginLeft: '6px' }, text: init.title }),
            ' ',
            el('span', { className: 'muted', text: '(' + init.slug + ')' }),
          ]),
          el('button', {
            className: 'btn btn-sm',
            dataset: { scqaSlug: init.slug, scqaTitle: init.title },
            text: 'JIT SCQA Prep',
            onClick: () =>
              dispatchPrompt(
                '/twin-jit-prep Build a 1-page pre-meeting brief and Adversarial Minto SCQA Critic for initiative "' +
                  init.title +
                  '" (initiatives/' +
                  init.slug +
                  '/).',
                'JIT SCQA Prep'
              ),
          }),
        ]),
        el('div', { className: 'muted', text: init.summary || '' }),
        el('div', { className: 'muted', style: { marginTop: '4px' } }, [
          el('strong', { text: 'Next Milestone:' }),
          ' ' + (init.nextMilestone || 'TBD'),
        ]),
        el(
          'div',
          { className: 'pill-row' },
          filesList.map((f) =>
            el('button', {
              className: 'btn btn-secondary btn-sm',
              dataset: { openAbs: f.path },
              text: f.name,
              onClick: () => openFileInExplorer(f.path),
            })
          )
        ),
      ]);
    });

    return [createCard, ...initCards];
  }

  function buildContactsNodes() {
    const contacts = (appState.contacts && appState.contacts.contacts) || [];

    const thead = el('thead', null, [
      el('tr', null, [
        el('th', { text: 'Name & Role' }),
        el('th', { text: 'Initiative' }),
        el('th', { text: 'Priorities' }),
        el('th', { text: 'Last Touch' }),
        el('th', { text: 'Status' }),
        el('th', { text: 'Actions' }),
      ]),
    ]);

    const tbody = el(
      'tbody',
      null,
      contacts.map((c) => {
        const lastTouchChildren = [c.lastTouch || ''];
        if (c.daysAgo !== null && c.daysAgo !== undefined) {
          lastTouchChildren.push(' ');
          lastTouchChildren.push(el('span', { className: 'muted', text: '(' + c.daysAgo + 'd)' }));
        }
        return el('tr', null, [
          el('td', null, [
            el('strong', { text: c.name }),
            el('br'),
            el('span', { className: 'muted', text: c.role }),
          ]),
          el('td', null, [el('code', { text: c.initiative })]),
          el('td', { text: c.priorities }),
          el('td', null, lastTouchChildren),
          el('td', null, [
            el('span', {
              className: 'badge ' + (c.isStale ? 'badge-amber' : 'badge-green'),
              text: c.status,
            }),
          ]),
          el('td', null, [
            el('button', {
              className: 'btn btn-secondary btn-sm',
              dataset: { touchName: c.name },
              text: 'Mark Touched',
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
            ' ',
            el('button', {
              className: 'btn btn-secondary btn-sm',
              dataset: { checkinName: c.name, checkinInit: c.initiative },
              text: 'Draft Check-In',
              onClick: () =>
                dispatchPrompt(
                  '/twin-voice-draft Draft a short, warm [Draft-Only] check-in note to ' +
                    c.name +
                    ' regarding initiative "' +
                    c.initiative +
                    '" using our latest vault status.',
                  'Stakeholder Check-In'
                ),
            }),
          ]),
        ]);
      })
    );

    return [
      el('div', { className: 'card' }, [
        el('div', { className: 'card-header' }, [
          el('h3', { className: 'card-title', text: 'Stakeholder Relationship Pulse (>21-Day Staleness Check)' }),
          el('button', {
            className: 'btn btn-secondary btn-sm',
            dataset: { openRel: 'contacts.md' },
            text: 'Edit contacts.md',
            onClick: () => openRelativeVaultFile('contacts.md', true),
          }),
        ]),
        el('div', { className: 'table-wrap' }, [el('table', null, [thead, tbody])]),
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

  function buildExplorerNodes() {
    const roots = appState.roots || [];
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
                '/twin-voice-draft Use my current voice.md calibration below to help me draft a message or memo:\n\n<voice_profile>\n' +
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
                ? '\n\nHere is the current file content from Twin Vault (`' +
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
                  : 'Editable Vault File'
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

    return [el('div', { className: 'explorer-layout' }, [treePane, editorPane])];
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
      className: 'skills-search',
      placeholder: 'Search skills by name, /command, or prompt...',
      value: skillsSearch,
    });
    searchInput.addEventListener('input', () => {
      skillsSearch = searchInput.value;
      renderFilteredSkillCards();
    });

    const toolbarWrap = el('div', { className: 'skills-toolbar' }, [searchInput, chipRow]);

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
                    className: 'btn btn-sm',
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
    return [toolbarWrap, resultsContainer];
  }

  function render() {
    if (!appState) {
      viewRoot.replaceChildren(el('div', { className: 'muted', text: 'Loading vault state...' }));
      return;
    }
    let nodes = [];
    if (activeTab === 'overview') nodes = buildOverviewNodes();
    else if (activeTab === 'gtd') nodes = buildGtdNodes();
    else if (activeTab === 'initiatives') nodes = buildInitiativesNodes();
    else if (activeTab === 'contacts') nodes = buildContactsNodes();
    else if (activeTab === 'skills') nodes = buildSkillsNodes();
    else if (activeTab === 'explorer') nodes = buildExplorerNodes();

    viewRoot.replaceChildren(...nodes);
  }

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeTab = btn.dataset.tab;
      syncTabButtons();
      if (activeTab === 'explorer' && !selectedFile && appState) {
        await openFileInExplorer(appState.vaultRoot.replace(/[\\/]+$/, '') + '/gtd_board.md');
        return;
      }
      render();
    });
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    loadState()
      .then(() => showToast('Refreshed vault & skills from local disk'))
      .catch((err) => showToast('Refresh failed: ' + err.message));
  });

  document.getElementById('btn-configure-role').addEventListener('click', () => {
    activeTab = 'overview';
    showRoleDrawer = !showRoleDrawer;
    syncTabButtons();
    render();
  });

  loadState().catch((err) => {
    viewRoot.replaceChildren(
      el('div', { className: 'card' }, [
        el('strong', { text: 'Unable to load Twin Vault: ' }),
        err.message || 'Unknown error',
      ])
    );
  });
})();
