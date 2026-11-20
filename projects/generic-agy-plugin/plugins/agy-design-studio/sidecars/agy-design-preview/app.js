/**
 * Preview — Antigravity Visual Deliverable Frontend
 * Pure DOM API construction (createElement + textContent + replaceChildren).
 */
(function () {
  'use strict';

  var deliverables = [];
  var selectedKind = 'all';
  var activeId = '';
  var activeDeliverable = null;
  var currentHtml = '';
  var toastTimer = null;

  var STARTERS = [
    {
      cmd: '/agy-dashboard',
      label: 'Executive Dashboard',
      desc: 'KPI cards, charts & Customize Layout',
      prompt: '/agy-dashboard Spin up a Public Sector branded executive dashboard I can customize visually in Chrome or Edge.'
    },
    {
      cmd: '/slides',
      label: '16:9 Slide Deck',
      desc: 'Executive presentation + speaker notes',
      prompt: '/slides Build a 6-slide 16:9 Public Sector executive briefing deck with key metrics, roadmap, and decisions needed.'
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
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function sidecarFetch(url, opts) {
    var fn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window);
    return fn(url, opts);
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
    if (selectedKind === 'all') return deliverables;
    return deliverables.filter(function (d) { return d.kind === selectedKind; });
  }

  function updateSubtitleAndButtons() {
    var sub = document.getElementById('previewSubtitle');
    var dlBtn = document.getElementById('downloadStandaloneBtn');
    var printBtn = document.getElementById('printPdfBtn');
    var openConvBtn = document.getElementById('openConvBtn');

    if (sub) {
      if (deliverables.length === 0) {
        sub.textContent = 'Dashboards, 16:9 Slides & Branded Docs';
      } else {
        sub.textContent = deliverables.length + (deliverables.length === 1 ? ' deliverable captured' : ' deliverables captured') + ' · Click any pill to preview';
      }
    }

    var hasActive = Boolean(activeDeliverable && currentHtml);
    if (dlBtn) dlBtn.disabled = !hasActive;
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
      var btn = el('button', 'tab-pill' + (d.id === activeId ? ' active' : ''));
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(d.id === activeId));
      btn.title = (d.title || d.id) + (d.fileName ? ' (' + d.fileName + ')' : '');
      btn.appendChild(el('span', 'tab-kind-tag', kindShortLabel(d.kind)));
      btn.appendChild(el('span', '', d.title || d.id));
      btn.addEventListener('click', function () {
        activeId = d.id;
        activeDeliverable = d;
        renderTabs();
        loadSelectedPreview();
      });
      bar.appendChild(btn);
    });
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
        deliverables = Array.isArray(data.deliverables) ? data.deliverables : [];
        if (selectedKind !== 'all' && !deliverables.some(function (d) { return d.kind === selectedKind; })) {
          selectedKind = 'all';
        }
        renderKindFilter();
        renderTabs();
        if (deliverables.length > 0) {
          loadSelectedPreview();
        }
        if (isManualRefresh) {
          showToast(
            deliverables.length > 0
              ? 'Refreshed — ' + deliverables.length + (deliverables.length === 1 ? ' deliverable' : ' deliverables') + ' ready'
              : 'No HTML deliverables found yet'
          );
        }
      })
      .catch(function () {});
  }

  function buildDownloadFilename() {
    if (activeDeliverable && activeDeliverable.fileName) {
      return activeDeliverable.fileName;
    }
    var raw = (activeDeliverable && activeDeliverable.title) ? activeDeliverable.title : (activeId || 'antigravity-deliverable');
    var slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return (slug || 'antigravity-deliverable') + '.html';
  }

  function init() {
    renderStarterCards();

    var refreshBtn = document.getElementById('refreshListBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
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
      printBtn.addEventListener('click', function () {
        var frame = document.getElementById('previewFrame');
        if (frame && frame.contentWindow && currentHtml) {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        }
      });
    }

    var dlBtn = document.getElementById('downloadStandaloneBtn');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        if (!currentHtml) return;
        var blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = buildDownloadFilename();
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Downloaded ' + a.download + ' — open directly in Chrome or Edge');
      });
    }

    fetchDeliverables(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
