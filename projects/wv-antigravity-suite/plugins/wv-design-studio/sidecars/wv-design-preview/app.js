/**
 * WV Preview — Antigravity Visual Deliverable Frontend (v2.3.0)
 * - Newest-first sorting with Search, Sort toggle & Today/Yesterday/Earlier dropdown picker
 * - Working Open in Browser, Print / PDF (unsandboxed tab), and Save HTML (~/Downloads)
 * - postMessage bridge so buttons inside embedded dashboards/slides/flyers work too!
 * - 100% Pure DOM API construction (createElement + textContent + replaceChildren).
 */
(function () {
  'use strict';

  var deliverables = [];
  var selectedKind = 'all';
  var searchQuery = '';
  var sortMode = 'newest';
  var dropdownOpen = false;
  var activeId = '';
  var activeDeliverable = null;
  var currentHtml = '';
  var toastTimer = null;

  var STARTERS = [
    {
      cmd: '/wv-dashboard',
      label: 'Executive Dashboard',
      desc: 'KPI cards, charts & Customize Layout',
      prompt: '/wv-dashboard Spin up a West Virginia branded executive dashboard I can customize visually in Chrome or Edge.'
    },
    {
      cmd: '/slides',
      label: '16:9 Slide Deck',
      desc: 'Executive presentation + speaker notes',
      prompt: '/slides Build a 6-slide 16:9 West Virginia executive briefing deck with key metrics, roadmap, and decisions needed.'
    },
    {
      cmd: '/doc-design',
      label: 'Branded Flyer / Memo',
      desc: 'Print-ready 1-2 page brief or PDF flyer',
      prompt: '/doc-design Create a print-ready 1-page executive decision memo and stakeholder fact sheet.'
    }
  ];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function showToast(msg) {
    var t = document.getElementById('statusToast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3400);
  }

  function sidecarFetch(url, opts) {
    var fn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window);
    return fn(url, opts);
  }

  function getTimestampMs(d) {
    if (!d) return 0;
    if (typeof d.mtimeMs === 'number' && d.mtimeMs > 0) return d.mtimeMs;
    if (d.updatedAt) {
      var parsed = Date.parse(d.updatedAt);
      if (!isNaN(parsed)) return parsed;
    }
    return 0;
  }

  function formatRelativeStamp(tsMs) {
    if (!tsMs) return '';
    var now = Date.now();
    var diff = Math.max(0, now - tsMs);
    var mins = Math.floor(diff / 60000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var dt = new Date(tsMs);
    var today = new Date(now);
    var sameDay =
      dt.getFullYear() === today.getFullYear() &&
      dt.getMonth() === today.getMonth() &&
      dt.getDate() === today.getDate();
    if (sameDay) {
      return 'Today ' + dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    var yest = new Date(now - 86400000);
    var isYest =
      dt.getFullYear() === yest.getFullYear() &&
      dt.getMonth() === yest.getMonth() &&
      dt.getDate() === yest.getDate();
    if (isYest) return 'Yesterday';
    return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function dateGroupLabel(tsMs) {
    if (!tsMs) return 'Earlier';
    var now = Date.now();
    var dt = new Date(tsMs);
    var today = new Date(now);
    if (
      dt.getFullYear() === today.getFullYear() &&
      dt.getMonth() === today.getMonth() &&
      dt.getDate() === today.getDate()
    ) {
      return 'Today';
    }
    var yest = new Date(now - 86400000);
    if (
      dt.getFullYear() === yest.getFullYear() &&
      dt.getMonth() === yest.getMonth() &&
      dt.getDate() === yest.getDate()
    ) {
      return 'Yesterday';
    }
    if (now - tsMs < 7 * 86400000) return 'This Week';
    return 'Earlier';
  }

  async function launchStarterPrompt(promptText, cmd) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(promptText);
          showToast('Sent ' + cmd + ' to active conversation');
        } else {
          var created = await window.sidecar.agent.startConversation(promptText, cmd);
          if (created && created.conversationId && window.sidecar.ui) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
          showToast('Started ' + cmd + ' — click Refresh here once generated');
        }
        return;
      }
    } catch {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(promptText);
      showToast('Copied prompt: ' + cmd);
    }
  }

  function renderStarterCards() {
    var grid = document.getElementById('starterGrid');
    if (!grid || grid.childElementCount > 0) return;
    STARTERS.forEach(function (s) {
      var btn = el('button', 'starter-card');
      btn.type = 'button';
      btn.appendChild(el('span', 'starter-cmd', s.cmd));
      btn.appendChild(el('span', 'starter-label', s.label));
      btn.appendChild(el('span', 'starter-desc', s.desc));
      btn.addEventListener('click', function () {
        launchStarterPrompt(s.prompt, s.cmd);
      });
      grid.appendChild(btn);
    });
  }

  function kindShortLabel(kind) {
    if (kind === 'dashboard') return 'Dashboard';
    if (kind === 'slides') return 'Slides';
    if (kind === 'flyer') return 'Doc';
    if (kind === 'ttx') return 'TTX';
    return 'App';
  }

  function filteredDeliverables() {
    var q = (searchQuery || '').trim().toLowerCase();
    var list = deliverables.filter(function (d) {
      if (selectedKind !== 'all' && d.kind !== selectedKind) return false;
      if (!q) return true;
      var hay = [
        d.title || '',
        d.fileName || '',
        kindShortLabel(d.kind),
        formatRelativeStamp(getTimestampMs(d)),
        d.updatedAt || ''
      ].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    list.sort(function (a, b) {
      if (sortMode === 'oldest') return getTimestampMs(a) - getTimestampMs(b);
      if (sortMode === 'title') return String(a.title || '').localeCompare(String(b.title || ''));
      return getTimestampMs(b) - getTimestampMs(a);
    });
    return list;
  }

  function updateSubtitleAndButtons() {
    var sub = document.getElementById('previewSubtitle');
    var openBrowserBtn = document.getElementById('openBrowserBtn');
    var saveBtn = document.getElementById('saveDownloadsBtn');
    var printBtn = document.getElementById('printPdfBtn');
    var openConvBtn = document.getElementById('openConvBtn');
    var finderBar = document.getElementById('artifactFinderBar');
    var pickerBtn = document.getElementById('artifactPickerBtn');

    var visible = filteredDeliverables();
    if (finderBar) finderBar.hidden = deliverables.length === 0;
    if (pickerBtn) {
      pickerBtn.textContent = 'All Artifacts (' + visible.length + ') \u25BE';
      pickerBtn.setAttribute('aria-expanded', String(dropdownOpen));
    }

    if (sub) {
      if (deliverables.length === 0) {
        sub.textContent = 'Dashboards, 16:9 Slides & Branded Docs';
      } else {
        var latestStamp = activeDeliverable ? formatRelativeStamp(getTimestampMs(activeDeliverable)) : '';
        sub.textContent =
          deliverables.length +
          (deliverables.length === 1 ? ' artifact' : ' artifacts') +
          ' (newest first)' +
          (latestStamp ? ' · Viewing: ' + latestStamp : '');
      }
    }

    var hasActive = Boolean(activeDeliverable && currentHtml);
    if (openBrowserBtn) openBrowserBtn.disabled = !hasActive;
    if (saveBtn) saveBtn.disabled = !hasActive;
    if (printBtn) printBtn.disabled = !hasActive;
    if (openConvBtn) {
      var canJump = Boolean(
        activeDeliverable &&
        activeDeliverable.convId &&
        window.sidecar &&
        window.sidecar.ui &&
        typeof window.sidecar.ui.toggleConversation === 'function'
      );
      openConvBtn.hidden = !canJump;
    }
  }

  function renderDropdown() {
    var menu = document.getElementById('artifactDropdown');
    if (!menu) return;
    menu.hidden = !dropdownOpen;
    if (!dropdownOpen) return;
    menu.replaceChildren();

    var visible = filteredDeliverables();
    if (!visible.length) {
      menu.appendChild(el('div', 'artifact-group-label', 'No matching artifacts'));
      return;
    }

    var lastGroup = '';
    visible.forEach(function (d) {
      var ts = getTimestampMs(d);
      var grp = sortMode === 'title' ? 'Alphabetical' : dateGroupLabel(ts);
      if (grp !== lastGroup) {
        lastGroup = grp;
        menu.appendChild(el('div', 'artifact-group-label', grp));
      }
      var item = el('button', 'artifact-dropdown-item' + (d.id === activeId ? ' active' : ''));
      item.type = 'button';
      var left = el('span', 'artifact-dropdown-left');
      left.appendChild(el('span', 'tab-kind-tag', kindShortLabel(d.kind)));
      left.appendChild(el('span', 'artifact-dropdown-title', d.title || d.id));
      item.appendChild(left);
      item.appendChild(el('span', 'artifact-time-tag', formatRelativeStamp(ts)));
      item.addEventListener('click', function () {
        activeId = d.id;
        activeDeliverable = d;
        dropdownOpen = false;
        renderDropdown();
        renderTabs();
        loadSelectedPreview();
      });
      menu.appendChild(item);
    });
  }

  function renderKindFilter() {
    var bar = document.getElementById('kindFilterBar');
    if (!bar) return;
    bar.replaceChildren();

    if (deliverables.length < 2) {
      bar.hidden = true;
      return;
    }

    var counts = { all: deliverables.length };
    deliverables.forEach(function (d) {
      var k = d.kind || 'interactive';
      counts[k] = (counts[k] || 0) + 1;
    });

    var kinds = Object.keys(counts).filter(function (k) { return k !== 'all' && counts[k] > 0; });
    if (kinds.length < 2) {
      bar.hidden = true;
      return;
    }

    bar.hidden = false;
    var labels = {
      all: 'All (' + counts.all + ')',
      dashboard: 'Dashboards (' + (counts.dashboard || 0) + ')',
      slides: 'Slides (' + (counts.slides || 0) + ')',
      flyer: 'Docs & Flyers (' + (counts.flyer || 0) + ')',
      ttx: 'TTX (' + (counts.ttx || 0) + ')',
      interactive: 'Interactive (' + (counts.interactive || 0) + ')'
    };

    ['all'].concat(kinds).forEach(function (k) {
      var chip = el('button', 'kind-chip' + (selectedKind === k ? ' active' : ''), labels[k] || k);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        selectedKind = k;
        renderKindFilter();
        renderTabs();
        renderDropdown();
        loadSelectedPreview();
      });
      bar.appendChild(chip);
    });
  }

  function renderTabs() {
    var bar = document.getElementById('deliverableTabs');
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    if (!bar) return;

    bar.replaceChildren();
    var visible = filteredDeliverables();

    if (!visible.length) {
      activeDeliverable = null;
      currentHtml = '';
      if (empty) empty.hidden = false;
      if (frame) frame.hidden = true;
      updateSubtitleAndButtons();
      return;
    }

    if (!activeId || !visible.some(function (d) { return d.id === activeId; })) {
      activeId = visible[0].id;
    }
    activeDeliverable = visible.find(function (d) { return d.id === activeId; }) || visible[0];

    visible.forEach(function (d) {
      var ts = getTimestampMs(d);
      var stamp = formatRelativeStamp(ts);
      var btn = el('button', 'tab-pill' + (d.id === activeId ? ' active' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(d.id === activeId));
      btn.title = (d.title || d.id) + (stamp ? ' · ' + stamp : '') + (d.fileName ? ' (' + d.fileName + ')' : '');
      btn.appendChild(el('span', 'tab-kind-tag', kindShortLabel(d.kind)));
      btn.appendChild(el('span', '', d.title || d.id));
      if (stamp) {
        btn.appendChild(el('span', 'artifact-time-tag', stamp));
      }
      btn.addEventListener('click', function () {
        activeId = d.id;
        activeDeliverable = d;
        renderTabs();
        renderDropdown();
        loadSelectedPreview();
      });
      bar.appendChild(btn);
    });

    updateSubtitleAndButtons();
  }

  function loadSelectedPreview() {
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    var visible = filteredDeliverables();
    if (!visible.length || !activeId || !frame) return;

    sidecarFetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        currentHtml = data.html || '';
        activeDeliverable = data.deliverable || activeDeliverable;
        if (empty) empty.hidden = true;
        frame.hidden = false;
        frame.srcdoc = currentHtml;
        updateSubtitleAndButtons();
      })
      .catch(function () {});
  }

  function fetchDeliverables(isManualRefresh) {
    return sidecarFetch('/api/deliverables')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        var prevTopId = deliverables.length > 0 ? deliverables[0].id : '';
        deliverables = Array.isArray(data.deliverables) ? data.deliverables : [];
        // Auto-jump to newest deliverable when a brand-new artifact appears on Refresh
        if (deliverables.length > 0 && (!activeId || (isManualRefresh && deliverables[0].id !== prevTopId))) {
          activeId = deliverables[0].id;
        }
        if (selectedKind !== 'all' && !deliverables.some(function (d) { return d.kind === selectedKind; })) {
          selectedKind = 'all';
        }
        renderKindFilter();
        renderTabs();
        renderDropdown();
        if (deliverables.length > 0) {
          loadSelectedPreview();
        }
        if (isManualRefresh) {
          showToast(
            deliverables.length > 0
              ? 'Refreshed — ' + deliverables.length + ' artifacts sorted newest first'
              : 'No HTML deliverables found yet'
          );
        }
      })
      .catch(function () {});
  }

  function openInUnsandboxedTab(urlPath, fallbackLabel) {
    var fullUrl = new URL(urlPath, window.location.origin).href;
    var opened = null;
    try {
      opened = window.open(fullUrl, '_blank', 'noopener');
    } catch (_) {
      opened = null;
    }
    if (opened) {
      showToast(fallbackLabel || 'Opened in browser tab');
      return true;
    }
    try {
      var a = document.createElement('a');
      a.href = fullUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast(fallbackLabel || 'Opened in browser tab');
      return true;
    } catch (_) {
      return false;
    }
  }

  async function saveToUserDownloads() {
    if (!activeId) return;
    try {
      var res = await sidecarFetch('/api/save-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeId })
      });
      var data = await res.json();
      if (data && data.ok) {
        showToast('Saved to Downloads/' + data.fileName + ' — double-click to open in Chrome/Edge!');
        return true;
      }
      showToast('Save failed: ' + ((data && data.error) || 'Could not write to Downloads'));
    } catch (err) {
      showToast('Could not save to Downloads — try Open in Browser instead.');
    }
    return false;
  }

  function handleOpenInBrowser() {
    if (!activeId) return;
    var ok = openInUnsandboxedTab('/api/raw?id=' + encodeURIComponent(activeId), 'Opened full-screen in browser tab');
    if (!ok) {
      saveToUserDownloads();
    }
  }

  function handlePrintPdf() {
    if (!activeId) return;
    var ok = openInUnsandboxedTab(
      '/api/raw?id=' + encodeURIComponent(activeId) + '&autoprint=1',
      'Opened Print / Save as PDF view in browser tab'
    );
    if (!ok) {
      saveToUserDownloads().then(function () {
        showToast('Saved HTML to Downloads — open in Chrome/Edge and press Ctrl+P / Cmd+P to Save as PDF');
      });
    }
  }

  function init() {
    renderStarterCards();
    var tokenMeter = window.AGYTokenPill ? window.AGYTokenPill.mount(document.querySelector('.header-actions')) : null;

    var refreshBtn = document.getElementById('refreshListBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        if (tokenMeter) tokenMeter.refresh();
        fetchDeliverables(true);
      });
    }

    var openConvBtn = document.getElementById('openConvBtn');
    if (openConvBtn) {
      openConvBtn.addEventListener('click', function () {
        if (activeDeliverable && activeDeliverable.convId && window.sidecar && window.sidecar.ui) {
          window.sidecar.ui.toggleConversation(activeDeliverable.convId);
        }
      });
    }

    var printBtn = document.getElementById('printPdfBtn');
    if (printBtn) {
      printBtn.addEventListener('click', handlePrintPdf);
    }

    var saveBtn = document.getElementById('saveDownloadsBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveToUserDownloads();
      });
    }

    var openBrowserBtn = document.getElementById('openBrowserBtn');
    if (openBrowserBtn) {
      openBrowserBtn.addEventListener('click', handleOpenInBrowser);
    }

    var searchIn = document.getElementById('artifactSearchInput');
    if (searchIn) {
      searchIn.addEventListener('input', function () {
        searchQuery = searchIn.value || '';
        renderTabs();
        renderDropdown();
        if (filteredDeliverables().length > 0) {
          loadSelectedPreview();
        }
      });
    }

    var sortSel = document.getElementById('artifactSortSelect');
    if (sortSel) {
      sortSel.addEventListener('change', function () {
        sortMode = sortSel.value || 'newest';
        renderTabs();
        renderDropdown();
      });
    }

    var pickerBtn = document.getElementById('artifactPickerBtn');
    if (pickerBtn) {
      pickerBtn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        dropdownOpen = !dropdownOpen;
        renderDropdown();
        updateSubtitleAndButtons();
      });
    }

    document.addEventListener('click', function (ev) {
      if (!dropdownOpen) return;
      var wrap = document.querySelector('.artifact-picker-wrap');
      if (wrap && !wrap.contains(ev.target)) {
        dropdownOpen = false;
        renderDropdown();
        updateSubtitleAndButtons();
      }
    });

    // Listen for action delegation from embedded dashboards, slides & flyers inside previewFrame
    window.addEventListener('message', function (ev) {
      var frame = document.getElementById('previewFrame');
      if (!frame || ev.source !== frame.contentWindow) return;
      if (!ev.data || ev.data.type !== 'wv-preview-action') return;
      if (ev.data.action === 'print') {
        handlePrintPdf();
      } else if (ev.data.action === 'save-downloads') {
        saveToUserDownloads();
      } else if (ev.data.action === 'open' || ev.data.action === 'open-or-save' || ev.data.action === 'download') {
        saveToUserDownloads();
      }
    });

    fetchDeliverables(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
