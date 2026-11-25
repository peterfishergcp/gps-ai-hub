(function () {
  'use strict';

  let appState = null;
  let skillsCategory = 'all';
  let skillsSearch = '';
  let showOtherPlugins = false;
  let showCreateSkillDrawer = false;
  let showClawyDrawer = false;
  let clawyInputText = '';
  let clawyResponse = null; // { mode: 'matches'|'workspace'|'chat', query, message, matches: [] }
  let activeForkCardKey = null;
  let activeSeedCardKey = null;
  let confirmDeleteSlug = null;
  let inspectingFile = null; // { path, name, writable, content, savedContent, editMode }
  let toastTimer = null;

  const viewRoot = document.getElementById('view-root');
  const headerSub = document.getElementById('header-sub');
  const toastEl = document.getElementById('toast');

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
      if (opts.checked !== undefined) node.checked = Boolean(opts.checked);
      if (opts.readOnly !== undefined) node.readOnly = Boolean(opts.readOnly);
      if (opts.style) {
        Object.entries(opts.style).forEach(([k, v]) => {
          node.style[k] = v;
        });
      }
      if (typeof opts.onClick === 'function') node.addEventListener('click', opts.onClick);
      if (typeof opts.onChange === 'function') node.addEventListener('change', opts.onChange);
    }
    if (Array.isArray(children)) {
      children.forEach((c) => {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
      });
    }
    return node;
  }

  function showToast(msg) {
    toastEl.textContent = String(msg || '');
    toastEl.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 2600);
  }

  async function apiGet(url) {
    const fn = window.sidecar && window.sidecar.fetch ? window.sidecar.fetch : window.fetch.bind(window);
    const res = await fn(url, { method: 'GET' });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async function apiPost(url, bodyObj) {
    const fn = window.sidecar && window.sidecar.fetch ? window.sidecar.fetch : window.fetch.bind(window);
    const res = await fn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj || {}),
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {}
    if (!res.ok || (parsed && parsed.ok === false && parsed.error)) {
      throw new Error((parsed && parsed.error) || text || 'Request failed');
    }
    return parsed || { ok: true };
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
      document.body.appendChild(ta);
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
          showToast('Sent ' + (title || 'prompt') + ' to active conversation');
        } else {
          const created = await window.sidecar.agent.startConversation(promptText, title || 'Skills');
          if (created && created.conversationId && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Started conversation for ' + (title || 'skill'));
        }
        return;
      }
      if (await copyTextSafe(promptText)) {
        showToast('Copied prompt to clipboard');
      }
    } catch (err) {
      showToast('Could not send prompt: ' + err.message);
    }
  }

  function makeAnimatedEmoji(code, fallbackGlyph, altText) {
    const img = el('img', {
      className: 'ai-noto-emoji fallback-pulse',
      alt: altText || fallbackGlyph || '',
      src: '/api/emoji-png?code=' + encodeURIComponent(code),
    });
    img.addEventListener('error', () => {
      if (img.parentNode) {
        img.parentNode.insertBefore(document.createTextNode(fallbackGlyph || ''), img);
        img.parentNode.removeChild(img);
      }
    });
    return img;
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

  function makeToggleSwitch(checked, titleText, onToggle) {
    const btn = el('button', {
      type: 'button',
      className: 'agy-switch' + (checked ? ' on' : ''),
      title: titleText || (checked ? 'Enabled (click to pause)' : 'Paused (click to enable)'),
      onClick: (ev) => {
        ev.stopPropagation();
        onToggle(!checked);
      },
    }, [el('span', { className: 'agy-switch-knob' })]);
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
    return btn;
  }

  async function openSkillFileModal(filePath, startEdit) {
    try {
      const data = await apiGet('/api/file?path=' + encodeURIComponent(filePath));
      inspectingFile = {
        path: data.path,
        name: data.name,
        writable: Boolean(data.writable),
        content: data.content || '',
        savedContent: data.content || '',
        editMode: Boolean(startEdit && data.writable),
      };
      render();
    } catch (err) {
      showToast('Unable to read SKILL.md: ' + err.message);
    }
  }

  function buildNewSkillDrawer() {
    if (!showCreateSkillDrawer) return null;
    const slugIn = el('input', {
      type: 'text',
      className: 'form-input',
      id: 'new-skill-slug',
      placeholder: 'e.g. weekly-kpi-audit',
    });
    const titleIn = el('input', {
      type: 'text',
      className: 'form-input',
      id: 'new-skill-title',
      placeholder: 'e.g. Weekly KPI & Grant Audit',
    });
    const descIn = el('input', {
      type: 'text',
      className: 'form-input',
      id: 'new-skill-desc',
      placeholder: '1-sentence description of when Antigravity should use this personal skill...',
    });
    const bodyIn = el('textarea', {
      className: 'seed-edit-textarea',
      id: 'new-skill-body',
      placeholder: 'Markdown instructions, checklist steps, or output template for your personal skill...',
      style: { minHeight: '95px' },
    });

    return el('div', { className: 'card', style: { marginBottom: '16px', border: '1px solid var(--tv-accent)' } }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: '+ Create a Protected Personal Skill (~/.gemini/config/skills/)' }),
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          text: 'Close',
          onClick: () => {
            showCreateSkillDrawer = false;
            render();
          },
        }),
      ]),
      el('p', {
        className: 'muted',
        style: { marginTop: '0', marginBottom: '10px' },
        text: 'Personal skills live in ~/.gemini/config/skills/ — 100% zero-footprint, immediately available via /command, and never overwritten by plugin updates.',
      }),
      el('div', { className: 'fork-grid-2', style: { marginBottom: '8px' } }, [
        el('div', {}, [el('label', { className: 'fork-field-label', text: 'Slash Command Slug' }), slugIn]),
        el('div', {}, [el('label', { className: 'fork-field-label', text: 'Display Title' }), titleIn]),
      ]),
      el('div', { style: { marginBottom: '8px' } }, [
        el('label', { className: 'fork-field-label', text: 'Trigger Description (YAML Frontmatter)' }),
        descIn,
      ]),
      el('div', { style: { marginBottom: '10px' } }, [
        el('label', { className: 'fork-field-label', text: 'Skill Instructions (Markdown)' }),
        bodyIn,
      ]),
      el('div', { className: 'topbar-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          id: 'btn-submit-new-skill',
          text: 'Create Personal Skill',
          onClick: async () => {
            try {
              const res = await apiPost('/api/skills/create', {
                slug: slugIn.value,
                title: titleIn.value,
                description: descIn.value,
                instructions: bodyIn.value,
              });
              showCreateSkillDrawer = false;
              skillsCategory = 'my-skills';
              await loadState();
              showToast('Created personal skill ' + res.command + '!');
            } catch (err) {
              showToast(err.message);
            }
          },
        }),
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          text: 'Ask AI to Draft Skill Instead →',
          onClick: () => {
            const topic = titleIn.value.trim() || slugIn.value.trim() || 'my recurring weekly workflow';
            dispatchPrompt(
              'Help me author a clean, reusable personal SKILL.md inside ~/.gemini/config/skills/ for "' +
                topic +
                '" with clear YAML frontmatter and deterministic step-by-step instructions.',
              'Author Personal Skill'
            );
          },
        }),
      ]),
    ]);
  }

  function makeClawyBearImg(altText) {
    const img = el('img', {
      className: 'clawy-bear-img',
      src: '/api/clawy-mascot',
      alt: altText || 'Clawy Bear',
    });
    img.addEventListener('error', () => {
      if (img.parentNode) {
        img.parentNode.insertBefore(document.createTextNode('\uD83D\uDC3B'), img);
        img.parentNode.removeChild(img);
      }
    });
    return img;
  }

  function runClawySkillAssistant(rawQuery) {
    const q = String(rawQuery || '').trim();
    clawyInputText = q;
    if (!q) {
      clawyResponse = null;
      render();
      return;
    }
    const lower = q.toLowerCase();

    // 1. Google Workspace / Connectors question -> guide directly to built-in Customizations
    if (
      /\b(google\s+workspace|google\s+docs|google\s+sheets|google\s+slides|google\s+drive|google\s+calendar|gmail|connector|connectors|ge\s+hub|customizations|marketplace)\b/.test(
        lower
      )
    ) {
      clawyResponse = {
        mode: 'workspace',
        query: q,
        message:
          'Connect Google Docs, Sheets, Slides, Drive, Calendar, and Gmail right inside Antigravity: open Customizations in the left sidebar → Marketplace → Google Workspace, then click + next to each app.',
        matches: [],
      };
      render();
      return;
    }

    // 2. Active chats / general conversation triage -> direct 1-click chat launch
    if (/\b(active\s+chats?|my\s+chats?|conversations?|what\s+needs\s+my\s+attention|my\s+agents?)\b/.test(lower)) {
      clawyResponse = {
        mode: 'chat',
        query: q,
        message: 'Ready to run this directly in Antigravity chat with your workspace context:',
        promptToSend: '/daily-brief ' + q,
        matches: [],
      };
      render();
      return;
    }

    // 3. Smart local skill matching across suite + personal skills with WV domain synonyms
    const synonymMap = {
      foia: ['foia', 'public', 'records', 'redaction', '29b', 'vaughn'],
      redact: ['redaction', 'foia', 'pii', 'ssn', 'public-records-redaction'],
      dashboard: ['dashboard', 'kpi', 'wv-dashboard', 'chart', 'tracker'],
      slide: ['slides', 'deck', 'presentation', 'briefing'],
      deck: ['slides', 'deck', 'presentation'],
      flyer: ['doc-design', 'flyer', 'memo', 'notice', 'pdf'],
      memo: ['doc-design', 'memo', 'plain-language', 'my-voice'],
      contract: ['legal-procurement-review', 'redline', 'sow', 'rfp', '5a-3'],
      rfp: ['rfp-vendor-evaluation', 'bid', 'vendor', 'procurement'],
      grant: ['expense-auditor', '2 cfr', 'wv-dashboard', 'policy-program-audit'],
      expense: ['expense-auditor', 'voucher', 'receipt', 'ledger', '2 cfr'],
      paystub: ['document-intake-cleanup-and-validation', 'income', 'intake', 'lease'],
      boil: ['plain-language-notice-generator', 'advisory', 'notice'],
      statute: ['policy-and-statute-assistant', 'cfr', 'regulation', 'snap'],
      policy: ['policy-program-audit', 'policy-and-statute-assistant', 'bill', 'rule'],
      email: ['inbox-triage', 'my-voice', 'followup-plan', 'daily-brief'],
      reply: ['my-voice', 'followup-plan', 'no-ai-slop'],
      meeting: ['meeting-prep', 'meeting-notes', 'swarm-prep'],
      slop: ['no-ai-slop', 'outbound-scrub'],
      scrub: ['outbound-scrub', 'security-audit', 'pii'],
      sql: ['bigquery-architect', 'bigquery'],
      cloud: ['deploy-cloudrun', 'find-cloud-skill', 'security-audit', 'iam-secret-hygiene'],
      refactor: ['modernize-refactor', 'legacy'],
      security: ['security-audit', 'iam-secret-hygiene', 'owasp'],
      token: ['token-usage', 'orchestrator-guide', 'model-guide'],
      claude: ['model-guide', 'orchestrator-guide'],
      model: ['model-guide', 'orchestrator-guide'],
      memory: ['memory', 'wv-onboard', 'weekly-impact'],
      swarm: ['swarm-prep', 'weekly-impact'],
    };

    const rawTokens = lower
      .replace(/[^a-z0-9/_-]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !new Set(['the', 'and', 'for', 'with', 'how', 'can', 'what', 'which', 'help', 'helps', 'skill', 'skills', 'need', 'want', 'this', 'that', 'from']).has(t));

    const expandedTokens = new Set(rawTokens);
    rawTokens.forEach((tok) => {
      Object.keys(synonymMap).forEach((k) => {
        if (tok.includes(k) || k.includes(tok)) {
          synonymMap[k].forEach((syn) => expandedTokens.add(syn));
        }
      });
    });

    const allCats = (appState && appState.categories) || [];
    const pool = [];
    allCats.forEach((c) => {
      if (c.scope === 'other') return;
      (c.skills || []).forEach((s) => pool.push({ ...s, categoryLabel: c.chipLabel || c.categoryLabel }));
    });

    const scored = pool
      .map((s) => {
        const hay = [s.id, s.command, s.title, s.subtitle, s.badge, s.seedPrompt, s.categoryLabel]
          .join(' ')
          .toLowerCase();
        let score = 0;
        if (hay.includes(lower)) score += 10;
        expandedTokens.forEach((tok) => {
          if (String(s.id || '').toLowerCase().includes(tok) || String(s.command || '').toLowerCase().includes(tok)) {
            score += 5;
          } else if (String(s.title || '').toLowerCase().includes(tok)) {
            score += 3;
          } else if (hay.includes(tok)) {
            score += 1;
          }
        });
        return { skill: s, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length > 0) {
      clawyResponse = {
        mode: 'matches',
        query: q,
        message:
          'Here ' +
          (scored.length === 1 ? 'is the best WV skill' : 'are the top ' + scored.length + ' WV skills') +
          ' for "' +
          q +
          '":',
        matches: scored.map((x) => x.skill),
      };
    } else {
      clawyResponse = {
        mode: 'chat',
        query: q,
        message: 'No exact skill keyword matched — launch this straight into an Antigravity conversation:',
        promptToSend: q,
        matches: [],
      };
    }
    render();
  }

  function buildClawyAssistantDrawer() {
    if (!showClawyDrawer) return null;

    const inputEl = el('input', {
      type: 'text',
      className: 'form-input',
      id: 'clawy-ask-input',
      value: clawyInputText,
      placeholder: 'Ask Clawy — e.g. "Which skill redacts a FOIA memo?", "Build a KPI dashboard", or "Connect Google Drive"...',
    });
    inputEl.addEventListener('input', () => {
      clawyInputText = inputEl.value;
    });
    inputEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        runClawySkillAssistant(inputEl.value);
      }
    });

    const starters = [
      { label: '\uD83D\uDCC4 Redact a FOIA memo', q: 'Which skill helps redact a FOIA memo?' },
      { label: '\uD83D\uDCCA Build a KPI dashboard', q: 'Build a West Virginia executive KPI dashboard' },
      { label: '\u2709\uFE0F Draft a reply in my voice', q: 'Draft an email reply in my voice and triage inbox' },
      { label: '\uD83D\uDD0C Connect Google Workspace', q: 'How do I connect Google Workspace Docs Drive Gmail?' },
    ];

    let replyNode = null;
    if (clawyResponse) {
      const r = clawyResponse;
      const children = [el('div', { style: { fontSize: '12.5px', fontWeight: '600' }, text: r.message })];

      if (r.mode === 'workspace') {
        children.push(
          el('div', { className: 'topbar-actions' }, [
            el('button', {
              type: 'button',
              className: 'ai-sky-pill',
              text: 'Walk Me Through Google Workspace Setup \u2192',
              onClick: () =>
                dispatchPrompt(
                  'Walk me through enabling the built-in Google Workspace connectors (Google Docs, Sheets, Slides, Drive, Calendar, and Gmail) under Customizations -> Marketplace -> Google Workspace in Antigravity.',
                  'Google Workspace Connectors'
                ),
            }),
          ])
        );
      } else if (r.mode === 'matches' && r.matches.length > 0) {
        r.matches.forEach((sk) => {
          children.push(
            el('div', { className: 'clawy-match-row' }, [
              el('div', { className: 'clawy-match-meta' }, [
                el('div', { className: 'clawy-match-title', text: sk.title + ' (' + sk.command + ')' }),
                el('div', { className: 'clawy-match-sub', text: sk.subtitle || sk.categoryLabel }),
              ]),
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                text: 'Run ' + sk.command + ' \u2192',
                onClick: () => dispatchPrompt(sk.command + ' ' + r.query, sk.command),
              }),
            ])
          );
        });
        children.push(
          el('div', { className: 'topbar-actions' }, [
            el('button', {
              type: 'button',
              className: 'btn btn-secondary btn-sm',
              text: 'Filter Grid to Top Match',
              onClick: () => {
                skillsCategory = 'all';
                skillsSearch = r.matches[0].id;
                render();
              },
            }),
            el('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              text: 'Ask in Chat Instead \u2192',
              onClick: () => dispatchPrompt(r.query, 'Ask Clawy'),
            }),
          ])
        );
      } else {
        children.push(
          el('div', { className: 'topbar-actions' }, [
            el('button', {
              type: 'button',
              className: 'ai-sky-pill',
              text: 'Launch in Antigravity Chat \u2192',
              onClick: () => dispatchPrompt(r.promptToSend || r.query, 'Ask Clawy'),
            }),
          ])
        );
      }

      replyNode = el('div', { className: 'clawy-reply-box' }, children);
    }

    return el('div', { className: 'clawy-drawer', id: 'clawy-assistant-drawer' }, [
      el('div', { className: 'clawy-drawer-head' }, [
        el('div', { className: 'clawy-drawer-brand' }, [
          makeClawyBearImg('Clawy'),
          el('div', {}, [
            el('strong', { style: { fontSize: '13.5px' }, text: 'Clawy — WV Skill & Workspace Assistant' }),
            el('div', {
              className: 'muted',
              style: { fontSize: '11.5px' },
              text: 'Describe what you need in plain English — I will match the best WV skill or launch a chat.',
            }),
          ]),
        ]),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost btn-sm',
          text: 'Close \u00D7',
          onClick: () => {
            showClawyDrawer = false;
            render();
          },
        }),
      ]),
      el('div', { className: 'clawy-prompt-row' }, [
        inputEl,
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          id: 'btn-clawy-submit',
          text: 'Ask Clawy \u2192',
          onClick: () => runClawySkillAssistant(inputEl.value),
        }),
      ]),
      el(
        'div',
        { className: 'clawy-chip-row' },
        starters.map((st) =>
          el('button', {
            type: 'button',
            className: 'skill-chip',
            text: st.label,
            onClick: () => runClawySkillAssistant(st.q),
          })
        )
      ),
      replyNode,
    ]);
  }

  function buildFileInspectorModal() {
    if (!inspectingFile) return null;
    const f = inspectingFile;
    let taRef = null;
    if (f.editMode) {
      taRef = el('textarea', {
        className: 'md-editor',
        value: f.content,
        readOnly: !f.writable,
        style: { minHeight: '340px', width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px' },
      });
      taRef.addEventListener('input', () => {
        f.content = taRef.value;
      });
    }

    return el('div', { className: 'card', style: { marginBottom: '18px', border: '1px solid var(--tv-fg)' } }, [
      el('div', { className: 'card-header' }, [
        el('div', {}, [
          el('strong', { text: f.name }),
          ' ',
          el('span', {
            className: 'badge ' + (f.writable ? 'badge-blue' : 'badge-neutral'),
            text: f.writable ? 'Editable Personal Skill' : 'Read-Only Stock Skill (Click Save My Copy to Customize)',
          }),
        ]),
        el('div', { className: 'topbar-actions' }, [
          f.writable
            ? el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: f.editMode ? 'Preview' : 'Edit Markdown',
                onClick: () => {
                  f.editMode = !f.editMode;
                  render();
                },
              })
            : null,
          f.writable && f.editMode
            ? el('button', {
                type: 'button',
                className: 'btn btn-sm',
                text: 'Save SKILL.md',
                onClick: async () => {
                  try {
                    await apiPost('/api/file', { path: f.path, content: f.content });
                    f.savedContent = f.content;
                    f.editMode = false;
                    await loadState();
                    showToast('Saved ' + f.name);
                  } catch (err) {
                    showToast('Save failed: ' + err.message);
                  }
                },
              })
            : null,
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Close Viewer',
            onClick: () => {
              inspectingFile = null;
              render();
            },
          }),
        ]),
      ]),
      el('div', { className: 'muted', style: { fontSize: '11px', marginBottom: '8px', wordBreak: 'break-all' }, text: f.path }),
      f.editMode && taRef
        ? taRef
        : el('pre', { className: 'skill-md-pre' }, [el('code', { text: f.content })]),
    ]);
  }

  function render() {
    if (!appState) {
      viewRoot.replaceChildren(el('div', { className: 'muted', text: 'Loading Skills...' }));
      return;
    }

    const allCategories = appState.categories || [];
    const suiteAndMyCats = allCategories.filter((c) => c.scope !== 'other');
    const otherCats = allCategories.filter((c) => c.scope === 'other');

    const myCat = allCategories.find((c) => c.categoryId === 'my-skills') || { skills: [] };
    const mySkillsCount = (myCat.skills || []).length;

    let suiteSkillsCount = 0;
    let enabledSuiteCount = 0;
    suiteAndMyCats.forEach((c) => {
      if (c.categoryId !== 'my-skills') {
        suiteSkillsCount += (c.skills || []).length;
        enabledSuiteCount += (c.skills || []).filter((s) => s.enabled).length;
      }
    });

    let otherSkillCount = 0;
    otherCats.forEach((c) => {
      otherSkillCount += (c.skills || []).length;
    });

    headerSub.textContent =
      enabledSuiteCount +
      ' of ' +
      suiteSkillsCount +
      ' suite skills enabled \u00B7 ' +
      mySkillsCount +
      ' personal';

    const visibleCategories = showOtherPlugins ? allCategories : suiteAndMyCats;
    const visibleKeys = new Set(visibleCategories.map((c) => c.categoryId || c.plugin));
    if (skillsCategory !== 'all' && !visibleKeys.has(skillsCategory)) {
      skillsCategory = 'all';
    }

    const totalVisibleCount = visibleCategories.reduce((acc, c) => acc + (c.skills || []).length, 0);

    const chipButtons = [
      el('button', {
        type: 'button',
        className: 'skill-chip' + (skillsCategory === 'all' ? ' active' : ''),
        text: 'All (' + totalVisibleCount + ')',
        onClick: () => {
          skillsCategory = 'all';
          render();
        },
      }),
      ...visibleCategories.map((cat) => {
        const key = cat.categoryId || cat.plugin;
        const label = (cat.chipLabel || cat.categoryLabel) + ' (' + (cat.skills || []).length + ')';
        const isMy = cat.categoryId === 'my-skills';
        return el('button', {
          type: 'button',
          className: 'skill-chip' + (isMy ? ' my-skills-chip' : '') + (skillsCategory === key ? ' active' : ''),
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
          text: (showOtherPlugins ? 'Hide Other Installed (' : '+ Other Installed (') + otherSkillCount + ')',
          onClick: () => {
            showOtherPlugins = !showOtherPlugins;
            render();
          },
        })
      );
    }

    const searchInput = el('input', {
      type: 'search',
      id: 'skills-search-input',
      placeholder: 'Search suite & personal skills by name, /command, or prompt...',
      value: skillsSearch,
    });

    const resultsContainer = el('div', {});

    function buildForkDrawer(skill, cardKey) {
      let currentMode = 'copy';
      const defaultCopySlug = skill.id.endsWith('-my') ? skill.id + '-2' : skill.id + '-my';
      const slugInput = el('input', { type: 'text', className: 'form-input', value: defaultCopySlug });
      const titleInput = el('input', {
        type: 'text',
        className: 'form-input',
        value: skill.title.endsWith('(My Copy)') ? skill.title : skill.title + ' (My Copy)',
      });
      const seedTextarea = el('textarea', {
        className: 'seed-edit-textarea',
        value: String(skill.seedPrompt || '').replace(new RegExp('^/' + skill.id + '\\b'), '/' + defaultCopySlug),
      });
      const replaceCheckbox = el('input', { type: 'checkbox' });

      function syncMode(nextMode) {
        const prev = slugInput.value.trim().replace(/^\/+/, '') || skill.id;
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
        seedTextarea.value = seedTextarea.value.replace(
          new RegExp('^/' + prev + '\\b'),
          '/' + slugInput.value.trim().replace(/^\/+/, '')
        );
      }

      const copyRadio = el('input', {
        type: 'radio',
        checked: true,
        onChange: () => {
          if (copyRadio.checked) {
            overrideRadio.checked = false;
            syncMode('copy');
          }
        },
      });
      const overrideRadio = el('input', {
        type: 'radio',
        checked: false,
        onChange: () => {
          if (overrideRadio.checked) {
            copyRadio.checked = false;
            syncMode('override');
          }
        },
      });

      return el('div', { className: 'fork-drawer' }, [
        el('div', { className: 'fork-drawer-title', text: 'Save Protected Copy in ~/.gemini/config/skills/' }),
        el('div', { className: 'fork-radio-group' }, [
          el('label', { className: 'fork-radio-label' }, [
            copyRadio,
            el('span', { text: 'New personal /command (keeps stock ' + skill.command + ' intact)' }),
          ]),
          el('label', { className: 'fork-radio-label' }, [
            overrideRadio,
            el('span', { text: 'Override ' + skill.command + ' (my copy wins priority)' }),
          ]),
        ]),
        el('div', { className: 'fork-grid-2' }, [
          el('div', {}, [el('label', { className: 'fork-field-label', text: 'Slash Command Slug' }), slugInput]),
          el('div', {}, [el('label', { className: 'fork-field-label', text: 'Display Title' }), titleInput]),
        ]),
        el('div', { style: { marginTop: '6px' } }, [
          el('label', { className: 'fork-field-label', text: '1-Click Starter Prompt' }),
          seedTextarea,
        ]),
        el('label', { className: 'fork-radio-label', style: { marginTop: '4px' } }, [
          replaceCheckbox,
          el('span', { text: 'Replace existing managed copy if /command already exists' }),
        ]),
        el('div', { className: 'topbar-actions', style: { marginTop: '8px' } }, [
          el('button', {
            type: 'button',
            className: 'btn btn-sm',
            text: 'Save My Copy',
            onClick: async () => {
              try {
                const res = await apiPost('/api/skills/fork', {
                  sourcePlugin: skill.plugin,
                  sourceSkillId: skill.id,
                  targetSlug: slugInput.value.trim(),
                  mode: currentMode,
                  title: titleInput.value.trim(),
                  subtitle: skill.subtitle,
                  seedPrompt: seedTextarea.value.trim(),
                  overwrite: replaceCheckbox.checked,
                });
                activeForkCardKey = null;
                skillsCategory = 'my-skills';
                await loadState();
                showToast('Saved personal skill ' + res.command);
              } catch (err) {
                showToast(err.message);
              }
            },
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Cancel',
            onClick: () => {
              activeForkCardKey = null;
              renderCards();
            },
          }),
        ]),
      ]);
    }

    function buildSeedDrawer(skill) {
      const promptArea = el('textarea', { className: 'seed-edit-textarea', value: skill.seedPrompt || '' });
      return el('div', { className: 'fork-drawer' }, [
        el('div', { className: 'fork-drawer-title', text: 'Customize 1-Click Starter Prompt for ' + skill.command }),
        promptArea,
        el('div', { className: 'topbar-actions', style: { marginTop: '8px' } }, [
          el('button', {
            type: 'button',
            className: 'btn btn-sm',
            text: 'Save Prompt',
            onClick: async () => {
              try {
                await apiPost('/api/skills/save-seed', {
                  skillId: skill.id,
                  seedPrompt: promptArea.value.trim(),
                });
                activeSeedCardKey = null;
                await loadState();
                showToast('Saved custom prompt for ' + skill.command);
              } catch (err) {
                showToast(err.message);
              }
            },
          }),
          skill.hasCustomSeed
            ? el('button', {
                type: 'button',
                className: 'btn btn-secondary btn-sm',
                text: 'Reset Default',
                onClick: async () => {
                  await apiPost('/api/skills/save-seed', { skillId: skill.id, reset: true });
                  activeSeedCardKey = null;
                  await loadState();
                  showToast('Reset ' + skill.command + ' prompt');
                },
              })
            : null,
          el('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            text: 'Cancel',
            onClick: () => {
              activeSeedCardKey = null;
              renderCards();
            },
          }),
        ]),
      ]);
    }

    function renderCards() {
      resultsContainer.replaceChildren();
      const q = (skillsSearch || '').trim().toLowerCase();
      let shownCount = 0;

      visibleCategories.forEach((cat) => {
        const key = cat.categoryId || cat.plugin;
        if (skillsCategory !== 'all' && skillsCategory !== key) return;

        // Empty state specifically when user clicks ★ My Personal Skills (0)
        if (cat.categoryId === 'my-skills' && (cat.skills || []).length === 0 && !q) {
          if (skillsCategory === 'my-skills') {
            shownCount += 1;
            resultsContainer.appendChild(
              el('div', { className: 'card' }, [
                el('div', { className: 'card-header' }, [
                  el('h3', { className: 'card-title', text: cat.categoryLabel }),
                  el('button', {
                    type: 'button',
                    className: 'ai-sky-pill',
                    text: '+ Create My First Personal Skill',
                    onClick: () => {
                      showCreateSkillDrawer = true;
                      render();
                    },
                  }),
                ]),
                el('p', {
                  className: 'muted',
                  text: 'Any skill you create with "+ New Skill", fork via "Save My Copy", or add to ~/.gemini/config/skills/ (or .gemini/skills/ in your workspace) appears automatically right here.',
                }),
              ])
            );
          }
          return;
        }

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
            const badges = [];
            if (skill.isPersonalCopy) {
              badges.push(
                el('span', {
                  className: 'badge ' + (skill.personalKind === 'workspace' ? 'badge-green' : 'badge-blue'),
                  text: skill.badge || '\u2605 Personal Skill',
                })
              );
            } else if (skill.overriddenByPersonal) {
              badges.push(el('span', { className: 'badge badge-amber', text: 'Overridden' }));
            } else if (skill.hasCustomSeed) {
              badges.push(el('span', { className: 'badge badge-neutral', text: 'Custom Prompt' }));
            }

            const toggleNode =
              skill.plugin !== 'workspace-skills'
                ? makeToggleSwitch(skill.enabled !== false, 'Enable or pause ' + skill.command, async (nextVal) => {
                    try {
                      await apiPost('/api/toggle-skill', {
                        plugin: skill.plugin,
                        skill: skill.id,
                        enabled: nextVal,
                      });
                      await loadState();
                      showToast((nextVal ? 'Enabled ' : 'Paused ') + skill.command);
                    } catch (err) {
                      showToast('Toggle failed: ' + err.message);
                    }
                  })
                : null;

            const topRow = el('div', { className: 'seed-card-top' }, [
              el('div', { className: 'seed-card-title', text: skill.title }),
              el('div', { className: 'topbar-actions' }, [
                ...badges,
                el('span', { className: 'prompt-cmd', text: skill.command }),
                toggleNode,
              ]),
            ]);

            const promptBox = el('div', { className: 'prompt-box' }, [
              el('div', { className: 'prompt-box-head' }, [
                el('span', { className: 'prompt-box-label', text: 'Prompt' }),
                el('div', { className: 'topbar-actions' }, [
                  el('button', {
                    type: 'button',
                    className: 'btn btn-secondary btn-sm',
                    text: 'Copy',
                    onClick: async () => {
                      if (await copyTextSafe(skill.seedPrompt)) {
                        showToast('Copied ' + skill.command + ' prompt');
                      }
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'ai-sky-pill',
                    text: 'Run \u2192',
                    onClick: () => dispatchPrompt(skill.seedPrompt, skill.command),
                  }),
                ]),
              ]),
              el('button', {
                type: 'button',
                className: 'seed-prompt-btn',
                text: skill.seedPrompt,
                onClick: () => dispatchPrompt(skill.seedPrompt, skill.command),
              }),
            ]);

            const leftBtns = [
              !skill.isPersonalCopy
                ? el('button', {
                    type: 'button',
                    className: 'btn btn-ghost btn-sm',
                    text: 'Save My Copy',
                    onClick: () => {
                      activeSeedCardKey = null;
                      activeForkCardKey = activeForkCardKey === cardKey ? null : cardKey;
                      renderCards();
                    },
                  })
                : el('button', {
                    type: 'button',
                    className: 'btn btn-ghost btn-sm',
                    title: 'Run outbound secret/PII scrub check & copy shareable SKILL.md',
                    text: 'Share / Export',
                    onClick: async () => {
                      try {
                        const res = await apiPost('/api/skills/export-safe', { path: skill.skillMdPath });
                        if (!res.clean) {
                          showToast('Export blocked — scrub findings: ' + (res.findings || []).join(', '));
                          return;
                        }
                        if (await copyTextSafe(res.content)) {
                          showToast('Scrub check passed! Copied clean SKILL.md to clipboard.');
                        }
                      } catch (err) {
                        showToast('Export check failed: ' + err.message);
                      }
                    },
                  }),
              el('button', {
                type: 'button',
                className: 'btn btn-ghost btn-sm',
                text: 'Edit Prompt',
                onClick: () => {
                  activeForkCardKey = null;
                  activeSeedCardKey = activeSeedCardKey === cardKey ? null : cardKey;
                  renderCards();
                },
              }),
            ];

            const rightBtns = [];
            if (skill.skillMdPath) {
              rightBtns.push(
                el('button', {
                  type: 'button',
                  className: 'btn btn-ghost btn-sm',
                  text: skill.writable ? 'Edit SKILL.md' : 'SKILL.md',
                  onClick: () => openSkillFileModal(skill.skillMdPath, Boolean(skill.writable)),
                })
              );
            }
            if (skill.deletableCopy) {
              if (confirmDeleteSlug === skill.id) {
                rightBtns.push(
                  el('button', {
                    type: 'button',
                    className: 'btn btn-sm',
                    text: 'Confirm Remove',
                    onClick: async () => {
                      await apiPost('/api/skills/delete-copy', { slug: skill.id });
                      confirmDeleteSlug = null;
                      await loadState();
                      showToast('Removed ' + skill.command);
                    },
                  }),
                  el('button', {
                    type: 'button',
                    className: 'btn btn-secondary btn-sm',
                    text: 'Keep',
                    onClick: () => {
                      confirmDeleteSlug = null;
                      renderCards();
                    },
                  })
                );
              } else {
                rightBtns.push(
                  el('button', {
                    type: 'button',
                    className: 'btn btn-ghost btn-sm',
                    text: skill.forkMode === 'override' ? 'Revert' : 'Remove',
                    onClick: () => {
                      confirmDeleteSlug = skill.id;
                      renderCards();
                    },
                  })
                );
              }
            }

            const drawer =
              activeForkCardKey === cardKey
                ? buildForkDrawer(skill, cardKey)
                : activeSeedCardKey === cardKey
                  ? buildSeedDrawer(skill)
                  : null;

            return el(
              'div',
              {
                className:
                  'seed-skill-card' +
                  (skill.enabled === false ? ' is-paused' : '') +
                  (skill.isPersonalCopy ? ' is-personal-copy' : ''),
              },
              [
                el('div', {}, [topRow, el('p', { className: 'seed-card-sub', text: skill.subtitle })]),
                promptBox,
                el('div', { className: 'seed-card-actions' }, [
                  el('div', { className: 'topbar-actions' }, leftBtns),
                  el('div', { className: 'topbar-actions' }, rightBtns),
                ]),
                drawer,
              ]
            );
          })
        );

        const catToggle =
          cat.scope === 'suite'
            ? makeToggleSwitch(cat.pluginEnabled !== false, 'Toggle entire category on/off', async (nextVal) => {
                try {
                  await apiPost('/api/toggle-category', {
                    plugin: cat.plugin,
                    categoryId: key,
                    enabled: nextVal,
                  });
                  await loadState();
                  showToast((nextVal ? 'Enabled ' : 'Paused ') + (cat.chipLabel || cat.categoryLabel));
                } catch (err) {
                  showToast('Category toggle failed: ' + err.message);
                }
              })
            : null;

        resultsContainer.appendChild(
          el('div', { className: 'card' }, [
            el('div', { className: 'card-header' }, [
              el('h3', { className: 'card-title', text: cat.categoryLabel }),
              el('div', { className: 'topbar-actions' }, [
                el('span', { className: 'muted', text: matching.length + ' skills' }),
                catToggle,
              ]),
            ]),
            grid,
          ])
        );
      });

      if (shownCount === 0) {
        resultsContainer.appendChild(
          el('div', { className: 'card muted', text: 'No skills match "' + skillsSearch + '".' })
        );
      }
    }

    searchInput.addEventListener('input', () => {
      skillsSearch = searchInput.value;
      renderCards();
    });

    const heroHead = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Explore ',
        el('span', { className: 'ai-blue-count', text: suiteSkillsCount + ' suite skills' }),
        ' ',
        makeAnimatedEmoji('2728', '\u2728', 'Sparkles'),
        ' and ',
        el('span', {
          className: 'ai-blue-count',
          text: mySkillsCount + (mySkillsCount === 1 ? ' personal skill' : ' personal skills'),
        }),
        ' ready to run.',
      ]),
    ]);

    renderCards();

    const clawyToggleBtn = el(
      'button',
      {
        type: 'button',
        id: 'btn-clawy-inline',
        className: 'clawy-search-btn' + (showClawyDrawer ? ' active' : ''),
        title: 'Ask Clawy to match a WV skill or launch a chat',
        onClick: () => {
          showClawyDrawer = !showClawyDrawer;
          if (showClawyDrawer) showCreateSkillDrawer = false;
          render();
          if (showClawyDrawer) {
            setTimeout(() => {
              const ci = document.getElementById('clawy-ask-input');
              if (ci) ci.focus();
            }, 30);
          }
        },
      },
      [makeClawyBearImg('Clawy'), el('span', { text: 'Ask Clawy' })]
    );

    viewRoot.replaceChildren(
      el('div', { className: 'ai-inbox-wrap' }, [
        buildFileInspectorModal(),
        buildNewSkillDrawer(),
        heroHead,
        el('div', { className: 'skills-toolbar' }, [
          el('div', { className: 'skills-search-clawy-row' }, [
            el('div', { className: 'ai-search-bar' }, [
              el('span', { className: 'muted', style: { fontSize: '15px', fontWeight: '700' }, text: '\u2315' }),
              searchInput,
            ]),
            clawyToggleBtn,
          ]),
          buildClawyAssistantDrawer(),
          el('div', { className: 'skills-chip-row' }, chipButtons),
        ]),
        el('div', { className: 'ai-wave-sep' }, [makeWaveSvg()]),
        el('div', { className: 'ai-topics-section' }, [resultsContainer]),
      ])
    );
  }

  async function loadState() {
    appState = await apiGet('/api/state');
    render();
  }

  let tokenMeter = null;
  if (window.AGYTokenPill) {
    tokenMeter = window.AGYTokenPill.mount(document.getElementById('topbar-actions'));
  }

  document.getElementById('btn-new-skill').addEventListener('click', () => {
    showCreateSkillDrawer = !showCreateSkillDrawer;
    showClawyDrawer = false;
    render();
  });

  document.getElementById('btn-sync-updates').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-updates');
    btn.textContent = 'Syncing...';
    try {
      const res = await apiPost('/api/incremental-sync', {});
      await loadState();
      showToast(
        res.updatedSkillsCount > 0
          ? 'Updated ' + res.updatedSkillsCount + ' skills (' + res.updatedFilesCount + ' files)'
          : 'All ' + (res.checkedSkillsCount || 36) + ' skills are up to date (v' + (res.suiteVersion || '2.3.0') + ')'
      );
    } catch (err) {
      showToast('Sync check offline or unreachable — local skills remain ready');
    } finally {
      btn.textContent = 'Sync Updates';
    }
  });

  document.getElementById('btn-refresh').addEventListener('click', () => {
    if (tokenMeter) tokenMeter.refresh();
    loadState().then(() => showToast('Refreshed suite & personal skills'));
  });

  loadState().catch((err) => {
    viewRoot.replaceChildren(
      el('div', { className: 'card' }, [el('strong', { text: 'Unable to load Skills Hub: ' }), err.message])
    );
  });
})();
