(function () {
  'use strict';

  var deliverables = [];
  var activeId = '';

  function showToast(msg) {
    var t = document.getElementById('statusToast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 2400);
  }

  function renderTabs() {
    var bar = document.getElementById('deliverableTabs');
    var openBtn = document.getElementById('openBrowserBtn');
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    if (!bar) return;

    bar.replaceChildren();
    if (!deliverables.length) {
      if (openBtn) openBtn.disabled = true;
      if (empty) empty.hidden = false;
      if (frame) frame.hidden = true;
      return;
    }

    if (!activeId || !deliverables.some(function (d) { return d.id === activeId; })) {
      activeId = deliverables[0].id;
    }

    deliverables.forEach(function (d) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab-pill' + (d.id === activeId ? ' active' : '');
      var badge = d.kind === 'dashboard' ? '📊 ' : d.kind === 'slides' ? '📽 ' : '📄 ';
      btn.textContent = badge + (d.title || d.id);
      btn.addEventListener('click', function () {
        activeId = d.id;
        renderTabs();
        loadSelectedPreview();
      });
      bar.appendChild(btn);
    });

    if (openBtn) openBtn.disabled = false;
  }

  function loadSelectedPreview() {
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    if (!activeId || !frame) return;

    fetch('api/render?id=' + encodeURIComponent(activeId))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        if (empty) empty.hidden = true;
        frame.hidden = false;
        frame.srcdoc = data.html;
      })
      .catch(function () {});
  }

  function fetchDeliverables() {
    fetch('api/deliverables')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        deliverables = Array.isArray(data.deliverables) ? data.deliverables : [];
        renderTabs();
        if (deliverables.length > 0) {
          loadSelectedPreview();
        }
      })
      .catch(function () {});
  }

  function init() {
    var refreshBtn = document.getElementById('refreshListBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', fetchDeliverables);
    }

    var openBtn = document.getElementById('openBrowserBtn');
    if (openBtn) {
      openBtn.addEventListener('click', function () {
        if (!activeId) return;
        fetch('api/open-browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: activeId })
        })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.ok) {
              showToast('Launched in default browser: ' + res.launchedUrl);
            }
          })
          .catch(function () {});
      });
    }

    fetchDeliverables();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
