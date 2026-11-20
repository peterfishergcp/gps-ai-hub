(function () {
  let appState = null;
  let activeTab = 'overview';
  let gtdFilter = 'OPEN';
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
      cmd: '/daily-brief',
      desc: 'Morning kickoff: P0 tasks, calendar & >21d stale contacts',
      prompt: '/daily-brief Give me my workday kickoff brief, top 3 actions, and any stale stakeholder check-ins.',
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

  async function dispatchPrompt(promptText, title) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(promptText);
          showToast('Sent prompt to active conversation');
        } else {
          await window.sidecar.agent.startConversation(promptText, title || 'Twin Workflow');
          showToast('Started new Twin conversation');
        }
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(promptText);
        showToast('Copied prompt to clipboard');
      }
    } catch (err) {
      showToast('Error sending prompt: ' + err.message);
    }
  }

  function appendInlineMarkdown(parent, rawText) {
    const str = String(rawText || '');
    const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
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
      } else {
        parent.appendChild(document.createTextNode(token));
      }
      lastIndex = tokenRe.lastIndex;
    }
    if (lastIndex < str.length) {
      parent.appendChild(document.createTextNode(str.slice(lastIndex)));
    }
  }

  function buildSimpleMarkdownPreview(md) {
    const container = el('div', { className: 'md-preview' });
    const lines = String(md || '').split(/\r?\n/);
    let inCode = false;
    let codeBuffer = [];

    const flushCodeBlock = () => {
      const codeNode = el('code', { text: codeBuffer.join('\n') });
      container.appendChild(el('pre', null, [codeNode]));
      codeBuffer = [];
    };

    for (const raw of lines) {
      if (raw.trim().startsWith('```')) {
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
      if (raw.startsWith('# ')) {
        const h1 = el('h1');
        appendInlineMarkdown(h1, raw.slice(2));
        container.appendChild(h1);
      } else if (raw.startsWith('## ')) {
        const h2 = el('h2');
        appendInlineMarkdown(h2, raw.slice(3));
        container.appendChild(h2);
      } else if (raw.startsWith('### ')) {
        const h3 = el('h3');
        appendInlineMarkdown(h3, raw.slice(4));
        container.appendChild(h3);
      } else if (/^\s*-\s+/.test(raw)) {
        const row = el('div', null, ['\u2022 ']);
        appendInlineMarkdown(row, raw.replace(/^\s*-\s+/, ''));
        container.appendChild(row);
      } else if (raw.trim() === '') {
        container.appendChild(el('div', { style: { height: '6px' } }));
      } else {
        const lineDiv = el('div');
        appendInlineMarkdown(lineDiv, raw);
        container.appendChild(lineDiv);
      }
    }
    if (inCode) {
      flushCodeBlock();
    }
    return container;
  }

  async function loadState() {
    appState = await apiGet('/api/state');
    const p = appState.profile || {};
    headerTitle.textContent = p.name && p.name !== 'Workspace User' ? p.name + ' - Twin Vault' : 'Twin Second Brain Vault';
    headerSub.textContent = (p.role || 'Ready') + ' | ' + (appState.vaultRoot || '~/antigravity-twin/memory');
    render();
  }

  async function openFileInExplorer(filePath) {
    try {
      const data = await apiGet('/api/file?path=' + encodeURIComponent(filePath));
      selectedFile = data;
      editorMode = 'preview';
      activeTab = 'explorer';
      syncTabButtons();
      render();
    } catch (err) {
      showToast('Unable to open file: ' + err.message);
    }
  }

  function openRelativeVaultFile(relPath) {
    if (!appState || !appState.vaultRoot) return;
    const full = appState.vaultRoot.replace(/[\\/]+$/, '') + '/' + relPath;
    openFileInExplorer(full);
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

  function buildOverviewNodes() {
    const gtd = (appState.gtd && appState.gtd.counts) || { open: 0, p0Open: 0 };
    const inits = appState.initiatives || [];
    const stale = (appState.contacts && appState.contacts.counts && appState.contacts.counts.stale) || 0;
    const prof = appState.profile || {};

    const kpiGrid = el('div', { className: 'kpi-grid' }, [
      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-val', text: gtd.open }),
        el('div', { className: 'kpi-label', text: 'Open GTD Tasks (' + gtd.p0Open + ' P0)' }),
      ]),
      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-val', text: inits.length }),
        el('div', { className: 'kpi-label', text: '4-File Initiatives' }),
      ]),
      el('div', { className: 'kpi' }, [
        el('div', {
          className: 'kpi-val',
          style: stale > 0 ? { color: 'var(--tv-amber-fg)' } : null,
          text: stale,
        }),
        el('div', { className: 'kpi-label', text: 'Stale Contacts (>21d)' }),
      ]),
      el('div', { className: 'kpi' }, [
        el('div', { className: 'kpi-val', text: appState.vaultFileCount || 0 }),
        el('div', { className: 'kpi-label', text: 'Markdown Files' }),
      ]),
    ]);

    const workflowsCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: '1-Click Twin Workflows' }),
        el('span', { className: 'muted', text: 'Sends directly to Antigravity chat' }),
      ]),
      el(
        'div',
        { className: 'action-grid' },
        QUICK_WORKFLOWS.map((q, idx) =>
          el(
            'button',
            {
              className: 'prompt-card',
              dataset: { quickIdx: idx },
              onClick: () => dispatchPrompt(q.prompt, 'Twin Workflow'),
            },
            [
              el('span', { className: 'prompt-cmd', text: q.cmd }),
              el('span', { className: 'prompt-desc', text: q.desc }),
            ]
          )
        )
      ),
    ]);

    const profileSummaryChildren = [
      el('strong', { text: prof.name || 'Workspace User' }),
      ' \u2022 ' + (prof.role || ''),
    ];
    if (prof.organization) {
      profileSummaryChildren.push(' \u2022 ' + prof.organization);
    }
    profileSummaryChildren.push(' \u2022 TZ: ');
    profileSummaryChildren.push(el('code', { text: prof.timezone || '' }));

    const profileCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Profile & Standing Context' }),
        el('button', {
          className: 'btn btn-secondary btn-sm',
          dataset: { openRel: 'profile/identity.md' },
          text: 'Inspect identity.md',
          onClick: () => openRelativeVaultFile('profile/identity.md'),
        }),
      ]),
      el('div', { className: 'muted' }, profileSummaryChildren),
      el(
        'div',
        { className: 'pill-row' },
        [
          { label: 'voice.md', rel: 'profile/voice.md' },
          { label: 'playbooks.md', rel: 'profile/playbooks.md' },
          { label: 'gtd_board.md', rel: 'gtd_board.md' },
          { label: 'contacts.md', rel: 'contacts.md' },
        ].map((item) =>
          el('button', {
            className: 'btn btn-secondary btn-sm',
            dataset: { openRel: item.rel },
            text: item.label,
            onClick: () => openRelativeVaultFile(item.rel),
          })
        )
      ),
    ]);

    return [buildRoleSetupCard(), kpiGrid, workflowsCard, profileCard].filter(Boolean);
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
                '/digital-twin Draft a clear, direct [Draft-Only] follow-up message to advance this commitment: ' +
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
            onClick: () => openRelativeVaultFile('gtd_board.md'),
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
                  '/digital-twin Draft a short, warm [Draft-Only] check-in note to ' +
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
            onClick: () => openRelativeVaultFile('contacts.md'),
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
      appendTreeNodes(treePane, r.tree, 0);
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
      }

      const actionButtons = [
        el('button', {
          className: 'btn ' + (editorMode === 'preview' ? '' : 'btn-secondary ') + 'btn-sm',
          id: 'btn-mode-preview',
          text: 'Preview',
          onClick: () => {
            if (textareaRef && selectedFile) selectedFile.content = textareaRef.value;
            editorMode = 'preview';
            render();
          },
        }),
        el('button', {
          className: 'btn ' + (editorMode === 'edit' ? '' : 'btn-secondary ') + 'btn-sm',
          id: 'btn-mode-edit',
          text: 'Raw Markdown',
          onClick: () => {
            editorMode = 'edit';
            render();
          },
        }),
      ];

      if (selectedFile.writable && editorMode === 'edit') {
        actionButtons.push(
          el('button', {
            className: 'btn btn-sm',
            id: 'btn-save-file',
            text: 'Save',
            onClick: async () => {
              if (!textareaRef || !selectedFile) return;
              try {
                selectedFile.content = textareaRef.value;
                await apiPost('/api/file', { path: selectedFile.path, content: selectedFile.content });
                await loadState();
                showToast('Saved ' + selectedFile.name);
              } catch (err) {
                showToast('Error saving file: ' + err.message);
              }
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
            dispatchPrompt(
              'Read ' + selectedFile.path + ' and summarize key takeaways, open risks, or recommended updates.',
              'Inspect Vault File'
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
              text: selectedFile.writable ? 'Editable Vault File' : 'Read-Only Plugin File',
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
        editorPane.appendChild(buildSimpleMarkdownPreview(selectedFile.content));
      }
    }

    return [el('div', { className: 'explorer-layout' }, [treePane, editorPane])];
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
      .then(() => showToast('Refreshed vault'))
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
