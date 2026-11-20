/**
 * AGY Skills & Connectors Sidecar Frontend
 * Zero innerHTML / localStorage — pure createElement + textContent + window.sidecar bridge.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var state = {
    categories: [],
    geConfig: { rawInput: '' },
    selectedPlugin: 'all',
    search: ''
  };

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function playIcon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('width', '13');
    svg.setAttribute('height', '13');
    svg.setAttribute('fill', 'currentColor');
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', 'M4.5 3.2l8 4.8-8 4.8V3.2z');
    svg.appendChild(p);
    return svg;
  }

  var toastTimer = null;
  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.hidden = true;
    }, 2400);
  }

  async function apiPost(url, payload) {
    var fn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window);
    var res = await fn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function runPromptInChat(promptText, title) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(promptText);
          showToast('Sent ' + title + ' to active conversation');
        } else {
          var created = await window.sidecar.agent.startConversation(promptText, title);
          if (created && created.conversationId && window.sidecar.ui) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Started new conversation with ' + title);
        }
        return;
      }
    } catch {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(promptText);
      showToast('Copied prompt: ' + promptText);
    }
  }

  function createToggleSwitch(checked, label, onToggle) {
    var btn = el('button', 'toggle-switch');
    btn.type = 'button';
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', String(Boolean(checked)));
    btn.setAttribute('aria-label', label);
    btn.appendChild(el('span', 'toggle-thumb'));
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('aria-checked') !== 'true';
      btn.setAttribute('aria-checked', String(next));
      onToggle(next, btn);
    });
    return btn;
  }

  function renderChips() {
    var wrap = document.getElementById('categoryChips');
    if (!wrap) return;
    wrap.replaceChildren();

    var totalSkills = 0;
    var enabledSkills = 0;
    state.categories.forEach(function (c) {
      c.skills.forEach(function (s) {
        totalSkills += 1;
        if (s.enabled) enabledSkills += 1;
      });
    });

    var counter = document.getElementById('summaryCounter');
    if (counter) {
      var geLabel = (state.geConfig && state.geConfig.rawInput) ? 'GE Instance Configured' : 'GE Instance Not Set';
      counter.textContent = enabledSkills + ' of ' + totalSkills + ' skills enabled · ' + geLabel;
    }

    var allChip = el('button', 'chip' + (state.selectedPlugin === 'all' ? ' active' : ''), 'All (' + totalSkills + ')');
    allChip.type = 'button';
    allChip.addEventListener('click', function () {
      state.selectedPlugin = 'all';
      renderAll();
    });
    wrap.appendChild(allChip);

    state.categories.forEach(function (cat) {
      var catKey = cat.categoryId || cat.plugin;
      var shortName = cat.chipLabel || cat.categoryLabel.split('—')[0].split(',')[0].trim();
      var chip = el(
        'button',
        'chip' + (state.selectedPlugin === catKey ? ' active' : ''),
        shortName + ' (' + cat.skills.length + ')'
      );
      chip.type = 'button';
      chip.addEventListener('click', function () {
        state.selectedPlugin = catKey;
        renderAll();
      });
      wrap.appendChild(chip);
    });
  }

  function renderList() {
    var container = document.getElementById('categoriesContainer');
    if (!container) return;
    container.replaceChildren();

    var q = state.search.trim().toLowerCase();

    state.categories.forEach(function (cat) {
      var catKey = cat.categoryId || cat.plugin;
      if (state.selectedPlugin !== 'all' && state.selectedPlugin !== catKey) return;

      var matchingSkills = cat.skills.filter(function (s) {
        if (!q) return true;
        return (
          s.title.toLowerCase().includes(q) ||
          s.subtitle.toLowerCase().includes(q) ||
          s.command.toLowerCase().includes(q) ||
          s.badge.toLowerCase().includes(q)
        );
      });
      if (matchingSkills.length === 0) return;

      var block = el('section', 'category-block');

      var head = el('div', 'category-head');
      var titleWrap = el('div', 'cat-title-wrap');
      titleWrap.appendChild(el('span', '', cat.categoryLabel));
      titleWrap.appendChild(el('span', 'cat-count', String(matchingSkills.length)));
      head.appendChild(titleWrap);
      head.appendChild(el('span', 'col-hide', 'Slash Command'));
      head.appendChild(el('span', 'col-hide', 'Capability'));

      var catToggleWrap = el('div', 'row-controls');
      catToggleWrap.appendChild(
        createToggleSwitch(cat.pluginEnabled, 'Toggle ' + cat.categoryLabel, async function (next) {
          try {
            await apiPost('/api/toggle-category', { categoryId: catKey, plugin: cat.plugin, enabled: next });
            cat.pluginEnabled = next;
            cat.skills.forEach(function (s) { s.enabled = next; });
            renderAll();
            showToast((next ? 'Enabled ' : 'Disabled ') + cat.categoryLabel);
          } catch {
            showToast('Failed to toggle category ' + cat.categoryLabel);
          }
        })
      );
      head.appendChild(catToggleWrap);
      block.appendChild(head);

      matchingSkills.forEach(function (s) {
        var row = el('div', 'skill-row' + (s.enabled ? '' : ' is-disabled'));
        var mainCol = el('div');
        mainCol.appendChild(el('p', 'skill-title', s.title));
        mainCol.appendChild(el('p', 'skill-sub', s.subtitle));

        var cmdCol = el('div', 'cmd-col', s.command);
        var badgeCol = el('div', 'badge-col', s.badge);

        var controls = el('div', 'row-controls');

        var syncOneBtn = el('button', 'icon-btn', '↻');
        syncOneBtn.type = 'button';
        syncOneBtn.title = 'Incrementally check & update only ' + s.command + ' from GitHub';
        syncOneBtn.addEventListener('click', async function () {
          syncOneBtn.disabled = true;
          showToast('Checking ' + s.command + ' for updates...');
          try {
            var res = await apiPost('/api/incremental-sync', { skill: s.id });
            if (res.updatedFilesCount > 0) {
              showToast('Updated ' + s.command + ' (' + res.updatedFilesCount + ' file(s) synced)');
            } else {
              showToast(s.command + ' is already up to date');
            }
          } catch {
            showToast('Incremental sync failed for ' + s.command);
          } finally {
            syncOneBtn.disabled = false;
          }
        });
        controls.appendChild(syncOneBtn);

        var runBtn = el('button', 'icon-btn');
        runBtn.type = 'button';
        runBtn.title = 'Run ' + s.command + ' in Antigravity chat';
        runBtn.appendChild(playIcon());
        runBtn.addEventListener('click', function () {
          runPromptInChat(s.starterPrompt, s.command);
        });
        controls.appendChild(runBtn);

        controls.appendChild(
          createToggleSwitch(s.enabled, 'Toggle skill ' + s.command, async function (next) {
            try {
              await apiPost('/api/toggle-skill', { plugin: s.plugin || cat.plugin, skill: s.id, enabled: next });
              s.enabled = next;
              if (next) cat.pluginEnabled = true;
              renderAll();
              showToast((next ? 'Enabled ' : 'Paused ') + s.command);
            } catch {
              showToast('Could not update ' + s.command);
            }
          })
        );

        row.appendChild(mainCol);
        row.appendChild(cmdCol);
        row.appendChild(badgeCol);
        row.appendChild(controls);
        block.appendChild(row);
      });

      container.appendChild(block);
    });
  }

  function renderAll() {
    renderChips();
    renderList();
  }

  async function init() {
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        state.search = searchInput.value || '';
        renderList();
      });
    }

    var geBtn = document.getElementById('toggleGePanelBtn');
    var geDrawer = document.getElementById('geDrawer');
    if (geBtn && geDrawer) {
      geBtn.addEventListener('click', function () {
        geDrawer.hidden = !geDrawer.hidden;
      });
    }

    var saveGeBtn = document.getElementById('saveGeBtn');
    var geInput = document.getElementById('geInput');
    if (saveGeBtn && geInput) {
      saveGeBtn.addEventListener('click', async function () {
        try {
          var out = await apiPost('/api/save-ge', { geInstance: geInput.value });
          state.geConfig = out.geConfig || { rawInput: geInput.value };
          renderChips();
          showToast('Saved default Gemini Enterprise instance');
        } catch {
          showToast('Failed to save GE instance');
        }
      });
    }

    var updateBtn = document.getElementById('updateSuiteBtn');
    if (updateBtn) {
      updateBtn.addEventListener('click', async function () {
        updateBtn.disabled = true;
        var origText = updateBtn.textContent;
        updateBtn.textContent = 'Syncing...';
        showToast('Checking SHA-256 skill hashes against GitHub...');
        try {
          var res = await apiPost('/api/incremental-sync', {});
          if (res.updatedSkillsCount > 0) {
            showToast('Incrementally updated ' + res.updatedSkillsCount + ' skill(s) (' + res.updatedFilesCount + ' file(s)) to v' + res.suiteVersion);
          } else {
            showToast('All ' + res.checkedSkillsCount + ' skills are up to date (v' + res.suiteVersion + ')');
          }
        } catch {
          runPromptInChat('/agy-update Incrementally check and sync any updated Public Sector skills.', '/agy-update');
        } finally {
          updateBtn.disabled = false;
          updateBtn.textContent = origText;
        }
      });
    }

    try {
      var res = await fetch('/api/state');
      if (res.ok) {
        var payload = await res.json();
        state.categories = payload.categories || [];
        state.geConfig = payload.geConfig || { rawInput: '' };
        if (geInput && state.geConfig.rawInput) {
          geInput.value = state.geConfig.rawInput;
        }
        renderAll();
      }
    } catch {
      showToast('Unable to load skill catalog');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
