(function () {
  'use strict';

  let appState = null;
  let skillsCategory = 'all';
  let skillsSearch = '';
  let showOtherPlugins = false;
  let showCreateSkillDrawer = false;
  let showGeDrawer = false;
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

  function buildGeConnectorDrawer() {
    if (!showGeDrawer) return null;
    const curVal =
      (appState && appState.geConfig && (appState.geConfig.rawInput || appState.geConfig.engineId)) || '';
    const geInput = el('input', {
      type: 'text',
      className: 'form-input',
      id: 'ge-resource-input',
      value: curVal,
      placeholder: 'projects/YOUR_PROJECT/locations/global/collections/default_collection/engines/YOUR_ENGINE_ID',
    });

    return el('div', { className: 'card', style: { marginBottom: '16px' } }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Gemini Enterprise (GE) Federated Connector Hub' }),
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          text: 'Close',
          onClick: () => {
            showGeDrawer = false;
            render();
          },
        }),
      ]),
      el('p', {
        className: 'muted',
        style: { marginTop: '0', marginBottom: '8px' },
        text: 'Paste your Gemini Enterprise Engine Resource Path to connect federated SharePoint, Outlook, OneDrive, Teams, Gmail, Drive, and GitHub.',
      }),
      el('div', { className: 'form-row' }, [
        el('div', { style: { flex: '1', minWidth: '260px' } }, [geInput]),
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          id: 'btn-save-ge',
          text: 'Save GE Instance',
          onClick: async () => {
            try {
              await apiPost('/api/save-ge', { geInstance: geInput.value });
              await loadState();
              showToast('Saved Gemini Enterprise instance configuration');
            } catch (err) {
              showToast('Could not save GE config: ' + err.message);
            }
          },
        }),
        el('button', {
          type: 'button',
          className: 'ai-sky-pill',
          text: 'Test /connect-ge →',
          onClick: () =>
            dispatchPrompt(
              '/connect-ge Verify my Gemini Enterprise bridge status and test federated search connectivity.',
              '/connect-ge'
            ),
        }),
      ]),
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

    const geConfigured = Boolean(
      appState.geConfig && (appState.geConfig.rawInput || appState.geConfig.engineId || appState.geConfig.projectId)
    );
    headerSub.textContent =
      enabledSuiteCount +
      ' of ' +
      suiteSkillsCount +
      ' suite skills enabled \u00B7 ' +
      mySkillsCount +
      ' personal \u00B7 ' +
      (geConfigured ? 'GE Connected' : 'GE Optional');

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

    viewRoot.replaceChildren(
      el('div', { className: 'ai-inbox-wrap' }, [
        buildFileInspectorModal(),
        buildNewSkillDrawer(),
        buildGeConnectorDrawer(),
        heroHead,
        el('div', { className: 'skills-toolbar' }, [
          el('div', { className: 'ai-search-bar', style: { marginBottom: '4px' } }, [
            el('span', { className: 'muted', style: { fontSize: '15px', fontWeight: '700' }, text: '\u2315' }),
            searchInput,
          ]),
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
    showGeDrawer = false;
    render();
  });

  document.getElementById('btn-ge-hub').addEventListener('click', () => {
    showGeDrawer = !showGeDrawer;
    showCreateSkillDrawer = false;
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
          : 'All ' + (res.checkedSkillsCount || 40) + ' skills are up to date (v' + (res.suiteVersion || '2.1') + ')'
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
