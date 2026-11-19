(function () {
  'use strict';

  var deliverables = [];
  var activeId = '';
  var currentHtml = '';

  function showToast(msg) {
    var t = document.getElementById('statusToast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 2600);
  }

  function sidecarFetch(url, opts) {
    var fn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window);
    return fn(url, opts);
  }

  function renderTabs() {
    var bar = document.getElementById('deliverableTabs');
    var dlBtn = document.getElementById('downloadStandaloneBtn');
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    if (!bar) return;

    bar.replaceChildren();
    if (!deliverables.length) {
      if (dlBtn) dlBtn.disabled = true;
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

    if (dlBtn) dlBtn.disabled = false;
  }

  function loadSelectedPreview() {
    var empty = document.getElementById('emptyState');
    var frame = document.getElementById('previewFrame');
    if (!activeId || !frame) return;

    sidecarFetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: activeId })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        currentHtml = data.html || '';
        if (empty) empty.hidden = true;
        frame.hidden = false;
        frame.srcdoc = currentHtml;
      })
      .catch(function () {});
  }

  function fetchDeliverables() {
    sidecarFetch('/api/deliverables')
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

    var dlBtn = document.getElementById('downloadStandaloneBtn');
    if (dlBtn) {
      dlBtn.addEventListener('click', function () {
        if (!currentHtml) return;
        var blob = new Blob([currentHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (activeId || 'agy-deliverable') + '.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Downloaded standalone HTML — click it in your downloads bar to open in Chrome/Edge!');
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
