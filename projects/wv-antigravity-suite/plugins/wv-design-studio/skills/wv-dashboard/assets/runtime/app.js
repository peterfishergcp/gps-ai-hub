/**
 * Dashboard Studio — Clean Dynamic Frontend & Zero-Prompt Visual Layout Editor
 *
 * Security notes:
 * - Zero innerHTML / outerHTML / insertAdjacentHTML / document.write.
 * - All DOM and SVG elements are constructed via createElement / createElementNS / textContent.
 * - CSRF token stays in closure memory only (never stored in localStorage/sessionStorage).
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  var THEME_PRESETS = [
    {
      id: 'wv-official',
      label: 'WV Command Center (Official)',
      theme: {
        mode: 'light',
        fontFamily: '"Fira Sans", system-ui, -apple-system, sans-serif',
        bg: '#F4F6F9',
        surface: '#FFFFFF',
        ink: '#0F1A2A',
        muted: '#475569',
        border: '#CBD5E1',
        primary: '#0F1A2A',
        accent: '#C1452C',
        secondary: '#D5A245',
        radius: 6,
        density: 'comfortable'
      }
    },
    {
      id: 'clean-executive',
      label: 'Executive Clean',
      theme: {
        mode: 'light',
        fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
        bg: '#F8FAFC',
        surface: '#FFFFFF',
        ink: '#0F172A',
        muted: '#64748B',
        border: '#E2E8F0',
        primary: '#1D4ED8',
        accent: '#0F766E',
        secondary: '#D97706',
        radius: 12,
        density: 'comfortable'
      }
    },
    {
      id: 'dark-ops',
      label: 'Midnight Operations',
      theme: {
        mode: 'dark',
        fontFamily: '"Fira Sans", system-ui, -apple-system, sans-serif',
        bg: '#0B1120',
        surface: '#131C31',
        ink: '#F1F5F9',
        muted: '#94A3B8',
        border: '#24324D',
        primary: '#1E3A8A',
        accent: '#F97316',
        secondary: '#38BDF8',
        radius: 12,
        density: 'comfortable'
      }
    },
    {
      id: 'civic-forest',
      label: 'Appalachian Forest',
      theme: {
        mode: 'light',
        fontFamily: '"Fira Sans", system-ui, -apple-system, sans-serif',
        bg: '#F4F7F5',
        surface: '#FFFFFF',
        ink: '#18261E',
        muted: '#52665A',
        border: '#D3DFD7',
        primary: '#14452F',
        accent: '#B45309',
        secondary: '#D5A245',
        radius: 14,
        density: 'comfortable'
      }
    }
  ];

  var state = {
    config: null,
    snapshot: null,
    csrfToken: '',
    staticHosted: false,
    editMode: false,
    dirty: false,
    activeTab: 'today',
    activeOwner: 'All',
    activeFilters: {},
    searchQuery: '',
    sortKey: '',
    sortAsc: false,
    dragSourceId: null
  };

  var metaCsrf = document.querySelector('meta[name="csrf-token"]');
  if (metaCsrf) {
    state.csrfToken = metaCsrf.getAttribute('content') || '';
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        node.setAttribute(k, String(attrs[k]));
      });
    }
    return node;
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
    }, 2800);
  }

  function formatNumber(val, fmt) {
    var num = Number(val);
    if (!Number.isFinite(num)) return String(val ?? '');
    if (fmt === 'currency_m') {
      return '$' + num.toFixed(1) + 'M';
    }
    if (fmt === 'integer_suffix_ac') {
      return Math.round(num).toLocaleString('en-US') + ' ac';
    }
    if (fmt === 'decimal_min') {
      return num.toFixed(1) + 'm';
    }
    if (fmt === 'percent') {
      return num.toFixed(1) + '%';
    }
    return Math.round(num).toLocaleString('en-US');
  }

  function applyTheme(theme) {
    if (!theme) return;
    var root = document.documentElement;
    root.style.setProperty('--bg', theme.bg || '#F4F6F8');
    root.style.setProperty('--surface', theme.surface || '#FFFFFF');
    root.style.setProperty('--ink', theme.ink || '#1E252B');
    root.style.setProperty('--muted', theme.muted || '#5A6772');
    root.style.setProperty('--border', theme.border || '#D8E0E6');
    root.style.setProperty('--primary', theme.primary || '#053254');
    root.style.setProperty('--accent', theme.accent || '#C1452C');
    root.style.setProperty('--secondary', theme.secondary || '#D5A245');
    root.style.setProperty('--radius', (theme.radius || 12) + 'px');
    if (theme.fontFamily) {
      root.style.setProperty('--font-sans', theme.fontFamily);
    }
    document.body.classList.toggle('density-compact', theme.density === 'compact');

    var cPri = document.getElementById('colPrimary');
    var cAcc = document.getElementById('colAccent');
    var cSec = document.getElementById('colSecondary');
    var cBg = document.getElementById('colBg');
    var cSur = document.getElementById('colSurface');
    if (cPri && theme.primary) cPri.value = theme.primary;
    if (cAcc && theme.accent) cAcc.value = theme.accent;
    if (cSec && theme.secondary) cSec.value = theme.secondary;
    if (cBg && theme.bg) cBg.value = theme.bg;
    if (cSur && theme.surface) cSur.value = theme.surface;

    var densBtn = document.getElementById('densityToggle');
    if (densBtn) {
      densBtn.textContent = 'Compact: ' + (theme.density === 'compact' ? 'On' : 'Off');
      densBtn.classList.toggle('active', theme.density === 'compact');
    }
  }

  function markDirty() {
    state.dirty = true;
    var saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.textContent = 'Save Changes *';
    }
  }

  function makeInlineEditable(targetNode, getValue, setValue) {
    if (!state.editMode) {
      targetNode.classList.remove('editable-active');
      targetNode.onclick = null;
      return;
    }
    targetNode.classList.add('editable-active');
    targetNode.title = 'Click to rename';
    targetNode.onclick = function (ev) {
      ev.stopPropagation();
      if (targetNode.querySelector('input')) return;
      var current = getValue();
      var input = el('input', 'inline-edit-input');
      input.type = 'text';
      input.value = current;
      targetNode.replaceChildren(input);
      input.focus();
      input.select();

      function commit() {
        var next = input.value.trim() || current;
        if (next !== current) {
          setValue(next);
          markDirty();
        }
        renderAll();
      }
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', function (ke) {
        if (ke.key === 'Enter') {
          ke.preventDefault();
          input.blur();
        } else if (ke.key === 'Escape') {
          input.value = current;
          input.blur();
        }
      });
    };
  }

  function getFilteredRecords() {
    var records = (state.snapshot && Array.isArray(state.snapshot.records)) ? state.snapshot.records : [];
    var q = state.searchQuery.toLowerCase().trim();
    return records.filter(function (row) {
      var filterKeys = Object.keys(state.activeFilters);
      for (var i = 0; i < filterKeys.length; i++) {
        var fk = filterKeys[i];
        var expected = state.activeFilters[fk];
        if (expected && expected !== 'All' && String(row[fk] || '') !== expected) {
          return false;
        }
      }
      if (q) {
        var vals = Object.keys(row).map(function (k) { return String(row[k] ?? '').toLowerCase(); }).join(' ');
        if (vals.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function aggregateBy(records, groupBy, metricField) {
    var map = new Map();
    records.forEach(function (r) {
      var key = String(r[groupBy] || 'Other');
      var val = metricField ? Number(r[metricField] || 0) : 1;
      map.set(key, (map.get(key) || 0) + (Number.isFinite(val) ? val : 0));
    });
    var arr = [];
    map.forEach(function (value, label) {
      arr.push({ label: label, value: value });
    });
    arr.sort(function (a, b) { return b.value - a.value; });
    return arr.slice(0, 10);
  }

  function renderHeader() {
    var cfg = state.config || {};
    var cc = cfg.commandCenter || {};
    var sealSubEl = document.getElementById('sealSubText');
    var sealMainEl = document.getElementById('sealMainText');
    var eyebrowEl = document.getElementById('dashEyebrow');
    var titleEl = document.getElementById('dashTitle');
    var clockBadgeEl = document.getElementById('clockBadge');
    var clockMilestonesEl = document.getElementById('clockMilestones');
    var telemetryEl = document.getElementById('telemetryLine');
    var healthTextEl = document.getElementById('healthBannerText');
    var ownerPillEl = document.getElementById('activeOwnerPill');
    var ownerSelectEl = document.getElementById('ownerSelect');
    var tabsEl = document.getElementById('commandTabs');
    var stampEl = document.getElementById('footerStamp');

    if (sealSubEl) sealSubEl.textContent = cc.sealSubtitle || 'West Virginia Office of the Governor';
    if (sealMainEl) sealMainEl.textContent = cc.sealTitle || 'Executive Command';
    if (eyebrowEl) eyebrowEl.textContent = cfg.eyebrow || 'WEST VIRGINIA · OFFICE OF THE GOVERNOR';
    if (titleEl) titleEl.textContent = cfg.title || 'EXECUTIVE COMMAND CENTER';
    document.title = cfg.title || 'West Virginia Command Center';

    if (clockBadgeEl) clockBadgeEl.textContent = cc.clockBadge || '2026–2027 PROGRAM CLOCK';
    if (clockMilestonesEl) {
      clockMilestonesEl.textContent =
        cc.clockMilestones ||
        cfg.subtitle ||
        'Nov 10: Program Launch • Dec 15: Priority Review Cutoff • Dec 31, 2026: Round 1 Window Close • Jan 13, 2027: Legislative Session Convening';
    }
    if (telemetryEl) {
      telemetryEl.textContent =
        cc.telemetryText ||
        'All 8 Automations Healthy • Live Federated Gemini Enterprise Capture Active • ' + (cfg.lastUpdatedLabel || 'Updated Nov 2026');
    }

    // Populate Owner Select Dropdown
    var owners = Array.isArray(cc.owners) && cc.owners.length
      ? cc.owners
      : ['All Leads (Statewide View)', 'WVDED & IJDC Review Lead (Owner)', 'Legislative & Policy Counsel'];
    if (ownerSelectEl && ownerSelectEl.options.length === 0) {
      owners.forEach(function (o) {
        var opt = el('option', '', o);
        opt.value = o;
        ownerSelectEl.appendChild(opt);
      });
      state.activeOwner = owners[0];
    }

    if (healthTextEl) {
      healthTextEl.replaceChildren();
      var strongEl = el('strong', '', 'System & Room Coverage Healthy: ');
      var spanEl = el(
        'span',
        '',
        cc.healthBannerText ||
          'All automations running on schedule. Gemini Enterprise (Google Drive • Gmail • Google Chat • SharePoint • BigQuery) connected.'
      );
      healthTextEl.appendChild(strongEl);
      healthTextEl.appendChild(spanEl);
    }
    if (ownerPillEl) {
      ownerPillEl.textContent = (state.activeOwner || owners[0]).toUpperCase();
    }

    // Populate Numbered Command Center Tabs
    if (tabsEl) {
      tabsEl.replaceChildren();
      var tabs = Array.isArray(cc.tabs) && cc.tabs.length
        ? cc.tabs
        : [
            { id: 'today', label: '1. TODAY & TRIAGE' },
            { id: 'agenda', label: '2. PRIORITY AGENDA' },
            { id: 'analytics', label: '3. ANALYTICS & CHARTS' },
            { id: 'register', label: '4. FULL REGISTER' }
          ];
      tabs.forEach(function (t) {
        var b = el('button', 'cmd-tab' + (state.activeTab === t.id ? ' active' : ''), t.label);
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(state.activeTab === t.id));
        b.addEventListener('click', function () {
          state.activeTab = t.id;
          renderAll();
        });
        tabsEl.appendChild(b);
      });
    }

    if (stampEl) {
      stampEl.textContent = cfg.lastUpdatedLabel || '';
    }

    if (eyebrowEl) makeInlineEditable(eyebrowEl, function () { return cfg.eyebrow; }, function (v) { cfg.eyebrow = v; });
    if (titleEl) makeInlineEditable(titleEl, function () { return cfg.title; }, function (v) { cfg.title = v; });
  }

  function renderStudioDrawer() {
    var drawer = document.getElementById('studioDrawer');
    drawer.hidden = !state.editMode;
    if (!state.editMode) return;

    var presetRow = document.getElementById('presetRow');
    presetRow.replaceChildren();
    THEME_PRESETS.forEach(function (p) {
      var btn = el('button', 'chip-btn' + (state.config.themePreset === p.id ? ' active' : ''), p.label);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        state.config.themePreset = p.id;
        state.config.theme = JSON.parse(JSON.stringify(p.theme));
        applyTheme(state.config.theme);
        markDirty();
        renderAll();
      });
      presetRow.appendChild(btn);
    });

    var hiddenGroup = document.getElementById('hiddenWidgetsGroup');
    var hiddenRow = document.getElementById('hiddenWidgetsRow');
    hiddenRow.replaceChildren();
    var hiddenWidgets = (state.config.widgets || []).filter(function (w) { return w.visible === false; });
    hiddenGroup.hidden = hiddenWidgets.length === 0;
    hiddenWidgets.forEach(function (w) {
      var b = el('button', 'chip-btn', '+ ' + w.title);
      b.type = 'button';
      b.addEventListener('click', function () {
        w.visible = true;
        markDirty();
        renderAll();
      });
      hiddenRow.appendChild(b);
    });
  }

  function renderFilters() {
    var bar = document.getElementById('filterBar');
    bar.replaceChildren();
    var filters = state.config.filters || [];

    filters.forEach(function (f) {
      var grp = el('div', 'filter-group');
      grp.appendChild(el('span', 'filter-label', f.label + ':'));
      var current = state.activeFilters[f.field] || 'All';
      (f.options || ['All']).forEach(function (opt) {
        var btn = el('button', 'chip-btn' + (current === opt ? ' active' : ''), opt);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          state.activeFilters[f.field] = opt;
          renderKpisAndWidgets();
          renderFilters();
        });
        grp.appendChild(btn);
      });
      bar.appendChild(grp);
    });

    if (state.searchQuery || Object.keys(state.activeFilters).some(function (k) { return state.activeFilters[k] && state.activeFilters[k] !== 'All'; })) {
      var resetBtn = el('button', 'chip-btn', 'Reset Filters');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', function () {
        state.activeFilters = {};
        state.searchQuery = '';
        var gSearch = document.getElementById('globalSearchInput');
        if (gSearch) gSearch.value = '';
        renderFilters();
        renderKpisAndWidgets();
      });
      bar.appendChild(resetBtn);
    }
  }

  function computeKpiValue(kpi, records) {
    if (kpi.mode === 'static') return kpi.value || '0';
    if (kpi.mode === 'count') return formatNumber(records.length, kpi.format || 'integer');
    var vals = records.map(function (r) { return Number(r[kpi.field] || 0); }).filter(Number.isFinite);
    if (vals.length === 0) return formatNumber(0, kpi.format);
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    if (kpi.mode === 'avg') return formatNumber(sum / vals.length, kpi.format);
    return formatNumber(sum, kpi.format);
  }

  function renderKpis(records) {
    var grid = document.getElementById('kpiGrid');
    grid.replaceChildren();
    (state.config.kpis || []).forEach(function (kpi) {
      var card = el('article', 'kpi-card tone-' + (kpi.tone || 'primary'));
      var lbl = el('div', 'kpi-label', kpi.label);
      makeInlineEditable(lbl, function () { return kpi.label; }, function (v) { kpi.label = v; });
      var val = el('div', 'kpi-value', computeKpiValue(kpi, records));
      var delta = el('div', 'kpi-delta', kpi.delta || '');
      card.appendChild(lbl);
      card.appendChild(val);
      card.appendChild(delta);
      grid.appendChild(card);
    });
  }

  function buildBarSvg(series, fmt, theme) {
    var width = 560;
    var height = 240;
    var padLeft = 52;
    var padRight = 18;
    var padTop = 22;
    var padBottom = 52;
    var svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'chart-svg', role: 'img' });
    if (!series.length) return svg;

    var maxVal = Math.max.apply(null, series.map(function (s) { return s.value; }).concat([1]));
    var plotW = width - padLeft - padRight;
    var plotH = height - padTop - padBottom;

    for (var g = 0; g <= 4; g++) {
      var gy = padTop + plotH - (g / 4) * plotH;
      svg.appendChild(svgEl('line', {
        x1: padLeft, y1: gy, x2: width - padRight, y2: gy,
        stroke: theme.border || '#D8E0E6', 'stroke-dasharray': g === 0 ? '' : '3 3'
      }));
      var tickText = svgEl('text', {
        x: padLeft - 8, y: gy + 4, 'text-anchor': 'end',
        fill: theme.muted || '#5A6772', 'font-size': '10'
      });
      tickText.textContent = formatNumber((maxVal * g) / 4, fmt);
      svg.appendChild(tickText);
    }

    var slotW = plotW / series.length;
    var barW = Math.min(42, Math.max(14, slotW * 0.62));
    var palette = [theme.primary, theme.accent, theme.secondary, '#2E7FA1', '#3B82F6'];

    series.forEach(function (item, idx) {
      var bh = Math.max(3, (item.value / maxVal) * plotH);
      var bx = padLeft + idx * slotW + (slotW - barW) / 2;
      var by = padTop + plotH - bh;
      var fill = idx === 0 ? (theme.accent || '#C1452C') : (palette[idx % palette.length] || '#053254');

      var rect = svgEl('rect', {
        x: bx, y: by, width: barW, height: bh, rx: 5, fill: fill
      });
      var title = svgEl('title');
      title.textContent = item.label + ': ' + formatNumber(item.value, fmt);
      rect.appendChild(title);
      svg.appendChild(rect);

      var valLbl = svgEl('text', {
        x: bx + barW / 2, y: by - 6, 'text-anchor': 'middle',
        fill: theme.ink || '#1E252B', 'font-size': '10', 'font-weight': '700'
      });
      valLbl.textContent = formatNumber(item.value, fmt);
      svg.appendChild(valLbl);

      var xLbl = svgEl('text', {
        x: bx + barW / 2, y: padTop + plotH + 18, 'text-anchor': 'middle',
        fill: theme.muted || '#5A6772', 'font-size': '10'
      });
      var shortName = item.label.length > 11 ? item.label.slice(0, 10) + '…' : item.label;
      xLbl.textContent = shortName;
      svg.appendChild(xLbl);
    });

    return svg;
  }

  function buildHorizontalBarSvg(series, fmt, theme) {
    var rows = series.slice(0, 8);
    var rowH = 28;
    var width = 560;
    var height = Math.max(140, rows.length * rowH + 24);
    var padLeft = 148;
    var padRight = 68;
    var svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'chart-svg', role: 'img' });
    var maxVal = Math.max.apply(null, rows.map(function (s) { return s.value; }).concat([1]));
    var plotW = width - padLeft - padRight;

    rows.forEach(function (item, idx) {
      var y = 12 + idx * rowH;
      var bw = Math.max(4, (item.value / maxVal) * plotW);
      var lbl = svgEl('text', {
        x: padLeft - 10, y: y + 14, 'text-anchor': 'end',
        fill: theme.ink || '#1E252B', 'font-size': '11'
      });
      lbl.textContent = item.label.length > 21 ? item.label.slice(0, 20) + '…' : item.label;
      svg.appendChild(lbl);

      svg.appendChild(svgEl('rect', {
        x: padLeft, y: y + 3, width: bw, height: 15, rx: 4,
        fill: idx === 0 ? (theme.accent || '#C1452C') : (theme.primary || '#053254')
      }));

      var vText = svgEl('text', {
        x: padLeft + bw + 7, y: y + 14,
        fill: theme.muted || '#5A6772', 'font-size': '11', 'font-weight': '700'
      });
      vText.textContent = formatNumber(item.value, fmt);
      svg.appendChild(vText);
    });
    return svg;
  }

  function buildLineSvg(series, fmt, theme) {
    var width = 760;
    var height = 220;
    var padLeft = 56;
    var padRight = 24;
    var padTop = 24;
    var padBottom = 40;
    var svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, class: 'chart-svg', role: 'img' });
    if (!series.length) return svg;

    var maxVal = Math.max.apply(null, series.map(function (s) { return s.value; }).concat([1]));
    var plotW = width - padLeft - padRight;
    var plotH = height - padTop - padBottom;

    for (var g = 0; g <= 3; g++) {
      var gy = padTop + plotH - (g / 3) * plotH;
      svg.appendChild(svgEl('line', {
        x1: padLeft, y1: gy, x2: width - padRight, y2: gy,
        stroke: theme.border || '#D8E0E6', 'stroke-dasharray': g === 0 ? '' : '3 3'
      }));
      var tLbl = svgEl('text', {
        x: padLeft - 8, y: gy + 4, 'text-anchor': 'end',
        fill: theme.muted || '#5A6772', 'font-size': '10'
      });
      tLbl.textContent = formatNumber((maxVal * g) / 3, fmt);
      svg.appendChild(tLbl);
    }

    var pts = series.map(function (item, idx) {
      var x = padLeft + (series.length === 1 ? plotW / 2 : (idx / (series.length - 1)) * plotW);
      var y = padTop + plotH - (item.value / maxVal) * plotH;
      return { x: x, y: y, label: item.label, value: item.value };
    });

    var areaD = 'M ' + pts[0].x + ' ' + (padTop + plotH) + ' ' +
      pts.map(function (p) { return 'L ' + p.x + ' ' + p.y; }).join(' ') +
      ' L ' + pts[pts.length - 1].x + ' ' + (padTop + plotH) + ' Z';
    svg.appendChild(svgEl('path', {
      d: areaD, fill: theme.primary || '#053254', 'fill-opacity': '0.12'
    }));

    var lineD = pts.map(function (p, i) { return (i === 0 ? 'M ' : 'L ') + p.x + ' ' + p.y; }).join(' ');
    svg.appendChild(svgEl('path', {
      d: lineD, fill: 'none', stroke: theme.accent || '#C1452C', 'stroke-width': '3', 'stroke-linecap': 'round'
    }));

    pts.forEach(function (p) {
      svg.appendChild(svgEl('circle', {
        cx: p.x, cy: p.y, r: 5, fill: theme.accent || '#C1452C', stroke: theme.surface || '#FFFFFF', 'stroke-width': '2'
      }));
      var valT = svgEl('text', {
        x: p.x, y: p.y - 10, 'text-anchor': 'middle',
        fill: theme.ink || '#1E252B', 'font-size': '10', 'font-weight': '700'
      });
      valT.textContent = formatNumber(p.value, fmt);
      svg.appendChild(valT);

      var xT = svgEl('text', {
        x: p.x, y: padTop + plotH + 18, 'text-anchor': 'middle',
        fill: theme.muted || '#5A6772', 'font-size': '10'
      });
      xT.textContent = p.label;
      svg.appendChild(xT);
    });

    return svg;
  }

  function buildDonutNode(series, fmt, theme) {
    var wrap = el('div', 'donut-layout');
    var size = 180;
    var r = 64;
    var cx = size / 2;
    var cy = size / 2;
    var circumference = 2 * Math.PI * r;
    var total = series.reduce(function (acc, s) { return acc + s.value; }, 0) || 1;
    var colors = [
      theme.primary || '#053254',
      theme.accent || '#C1452C',
      theme.secondary || '#D5A245',
      '#2E7FA1',
      '#64748B'
    ];

    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, role: 'img' });
    var offset = 0;
    series.slice(0, 6).forEach(function (s, idx) {
      var frac = s.value / total;
      var dash = frac * circumference;
      var circle = svgEl('circle', {
        cx: cx, cy: cy, r: r,
        fill: 'transparent',
        stroke: colors[idx % colors.length],
        'stroke-width': '24',
        'stroke-dasharray': dash + ' ' + (circumference - dash),
        'stroke-dashoffset': -offset,
        transform: 'rotate(-90 ' + cx + ' ' + cy + ')'
      });
      svg.appendChild(circle);
      offset += dash;
    });

    var centerTop = svgEl('text', {
      x: cx, y: cy - 2, 'text-anchor': 'middle',
      fill: theme.ink || '#1E252B', 'font-size': '15', 'font-weight': '800'
    });
    centerTop.textContent = formatNumber(total, fmt);
    svg.appendChild(centerTop);

    var centerSub = svgEl('text', {
      x: cx, y: cy + 14, 'text-anchor': 'middle',
      fill: theme.muted || '#5A6772', 'font-size': '10'
    });
    centerSub.textContent = 'Total';
    svg.appendChild(centerSub);

    var ul = el('ul', 'legend-list');
    series.slice(0, 6).forEach(function (s, idx) {
      var li = el('li', 'legend-item');
      var sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = colors[idx % colors.length];
      var nm = el('span', 'legend-name', s.label);
      var pct = Math.round((s.value / total) * 100);
      var vl = el('span', 'legend-val', formatNumber(s.value, fmt) + ' (' + pct + '%)');
      li.appendChild(sw);
      li.appendChild(nm);
      li.appendChild(vl);
      ul.appendChild(li);
    });

    wrap.appendChild(svg);
    wrap.appendChild(ul);
    return wrap;
  }

  function buildTableNode(widget, records) {
    if (!records.length) {
      return el('div', 'empty-state', 'No matching rows for the selected filters.');
    }
    var cols = widget.columns && widget.columns.length
      ? widget.columns
      : Object.keys(records[0]).slice(0, 8).map(function (k) { return { key: k, label: k }; });

    var rows = records.slice();
    if (state.sortKey) {
      rows.sort(function (a, b) {
        var av = a[state.sortKey];
        var bv = b[state.sortKey];
        var an = Number(av);
        var bn = Number(bv);
        var cmp = (Number.isFinite(an) && Number.isFinite(bn))
          ? (an - bn)
          : String(av ?? '').localeCompare(String(bv ?? ''));
        return state.sortAsc ? cmp : -cmp;
      });
    }

    var wrap = el('div', 'table-wrap');
    var table = el('table', 'data-table');
    var thead = el('thead');
    var trHead = el('tr');
    cols.forEach(function (c) {
      var indicator = state.sortKey === c.key ? (state.sortAsc ? ' ↑' : ' ↓') : '';
      var th = el('th', '', c.label + indicator);
      th.addEventListener('click', function () {
        if (state.sortKey === c.key) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortKey = c.key;
          state.sortAsc = false;
        }
        renderKpisAndWidgets();
      });
      trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    var tbody = el('tbody');
    rows.slice(0, 50).forEach(function (r) {
      var tr = el('tr');
      cols.forEach(function (c) {
        var td = el('td');
        var raw = r[c.key];
        var formatted = c.format ? formatNumber(raw, c.format) : String(raw ?? '');
        if (c.key === 'status' || c.key === 'disposition') {
          var isAlert = /alert|hold|unreadable/i.test(formatted);
          td.appendChild(el('span', 'status-pill' + (isAlert ? ' alert' : ''), formatted));
        } else {
          td.textContent = formatted;
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function getWidgetSeries(widget, records) {
    if (widget.seriesKey && state.snapshot && Array.isArray(state.snapshot[widget.seriesKey])) {
      return state.snapshot[widget.seriesKey];
    }
    var groupField = widget.groupBy || (records[0] ? Object.keys(records[0])[0] : 'category');
    return aggregateBy(records, groupField, widget.metricField);
  }

  function moveWidget(idx, delta) {
    var arr = state.config.widgets;
    var target = idx + delta;
    if (target < 0 || target >= arr.length) return;
    var tmp = arr[idx];
    arr[idx] = arr[target];
    arr[target] = tmp;
    markDirty();
    renderKpisAndWidgets();
  }

  function buildCardToolbar(widget, idx) {
    var bar = el('div', 'card-toolbar');
    var handle = el('span', 'drag-handle', '⠿ Drag card');
    bar.appendChild(handle);

    var orderGroup = el('div', 'mini-pills');
    var upBtn = el('button', 'mini-btn', '←');
    upBtn.type = 'button';
    upBtn.title = 'Move earlier';
    upBtn.addEventListener('click', function () { moveWidget(idx, -1); });
    var dnBtn = el('button', 'mini-btn', '→');
    dnBtn.type = 'button';
    dnBtn.title = 'Move later';
    dnBtn.addEventListener('click', function () { moveWidget(idx, 1); });
    orderGroup.appendChild(upBtn);
    orderGroup.appendChild(dnBtn);
    bar.appendChild(orderGroup);

    var spanGroup = el('div', 'mini-pills');
    [
      { label: '1/3', val: 4 },
      { label: '1/2', val: 6 },
      { label: '2/3', val: 8 },
      { label: 'Full', val: 12 }
    ].forEach(function (sp) {
      var b = el('button', 'mini-btn' + (Number(widget.span) === sp.val ? ' active' : ''), sp.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        widget.span = sp.val;
        markDirty();
        renderKpisAndWidgets();
      });
      spanGroup.appendChild(b);
    });
    bar.appendChild(spanGroup);

    var typeGroup = el('div', 'mini-pills');
    [
      { label: 'Bar', val: 'bar' },
      { label: 'H-Bar', val: 'hbar' },
      { label: 'Line', val: 'line' },
      { label: 'Donut', val: 'donut' },
      { label: 'Table', val: 'table' }
    ].forEach(function (ct) {
      var b = el('button', 'mini-btn' + (widget.chartType === ct.val ? ' active' : ''), ct.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        widget.chartType = ct.val;
        markDirty();
        renderKpisAndWidgets();
      });
      typeGroup.appendChild(b);
    });

    var hideBtn = el('button', 'mini-btn danger', 'Hide');
    hideBtn.type = 'button';
    hideBtn.addEventListener('click', function () {
      widget.visible = false;
      markDirty();
      renderAll();
    });
    typeGroup.appendChild(hideBtn);
    bar.appendChild(typeGroup);

    return bar;
  }

  function renderWidgets(records) {
    var grid = document.getElementById('widgetGrid');
    grid.replaceChildren();
    var theme = state.config.theme || {};

    (state.config.widgets || []).forEach(function (widget, idx) {
      if (widget.visible === false) return;
      if (state.activeTab === 'analytics' && widget.chartType === 'table') return;
      if (state.activeTab === 'register' && widget.chartType !== 'table') return;
      var span = [4, 6, 8, 12].indexOf(Number(widget.span)) !== -1 ? Number(widget.span) : 6;
      var card = el('article', 'card span-' + span);
      card.dataset.widgetId = widget.id;

      if (state.editMode) {
        card.draggable = true;
        card.addEventListener('dragstart', function (ev) {
          state.dragSourceId = widget.id;
          card.classList.add('dragging');
          if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', function () {
          state.dragSourceId = null;
          card.classList.remove('dragging');
        });
        card.addEventListener('dragover', function (ev) {
          ev.preventDefault();
          card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', function () {
          card.classList.remove('drag-over');
        });
        card.addEventListener('drop', function (ev) {
          ev.preventDefault();
          card.classList.remove('drag-over');
          if (!state.dragSourceId || state.dragSourceId === widget.id) return;
          var list = state.config.widgets;
          var fromIdx = list.findIndex(function (w) { return w.id === state.dragSourceId; });
          var toIdx = list.findIndex(function (w) { return w.id === widget.id; });
          if (fromIdx !== -1 && toIdx !== -1) {
            var moved = list.splice(fromIdx, 1)[0];
            list.splice(toIdx, 0, moved);
            markDirty();
            renderKpisAndWidgets();
          }
        });
        card.appendChild(buildCardToolbar(widget, idx));
      }

      var head = el('div', 'card-head');
      var h2 = el('h2', 'card-title', widget.title);
      makeInlineEditable(h2, function () { return widget.title; }, function (v) { widget.title = v; });
      head.appendChild(h2);
      if (widget.subtitle || state.editMode) {
        var sub = el('p', 'card-subtitle', widget.subtitle || 'Click to edit subtitle');
        makeInlineEditable(sub, function () { return widget.subtitle || ''; }, function (v) { widget.subtitle = v; });
        head.appendChild(sub);
      }
      card.appendChild(head);

      var bodyWrap = el('div', 'chart-wrap');
      if (widget.chartType === 'table') {
        bodyWrap.appendChild(buildTableNode(widget, records));
      } else {
        var series = getWidgetSeries(widget, records);
        if (!series.length) {
          bodyWrap.appendChild(el('div', 'empty-state', 'No data for current filter selection.'));
        } else if (widget.chartType === 'donut') {
          bodyWrap.appendChild(buildDonutNode(series, widget.format, theme));
        } else if (widget.chartType === 'hbar') {
          bodyWrap.appendChild(buildHorizontalBarSvg(series, widget.format, theme));
        } else if (widget.chartType === 'line') {
          bodyWrap.appendChild(buildLineSvg(series, widget.format, theme));
        } else {
          bodyWrap.appendChild(buildBarSvg(series, widget.format, theme));
        }
      }
      card.appendChild(bodyWrap);
      grid.appendChild(card);
    });
  }

  function renderOpsAndAgenda(records) {
    var opsGrid = document.getElementById('opsSplitGrid');
    var agendaSec = document.getElementById('agendaSection');
    var widgetGrid = document.getElementById('widgetGrid');
    var snap = state.snapshot || {};

    if (opsGrid) {
      opsGrid.replaceChildren();
      opsGrid.hidden = state.activeTab !== 'today';

      if (state.activeTab === 'today') {
        // Left Panel: NEEDS ACTION NOW — MOST URGENT FIRST (LIVE TRIAGE)
        var leftPanel = el('article', 'ops-panel');
        var leftHead = el('div', 'ops-panel-head');
        leftHead.appendChild(el('h2', 'ops-panel-title', (state.config.commandCenter && state.config.commandCenter.triageTitle) || 'NEEDS ACTION NOW — MOST URGENT FIRST (TOD-1)'));
        leftHead.appendChild(el('span', 'ops-badge red', 'LIVE TRIAGE'));
        leftPanel.appendChild(leftHead);

        var triageTbl = el('table', 'triage-table');
        var thead = el('thead');
        var htr = el('tr');
        ['URGENCY / CATEGORY', 'ITEM', 'ACTION'].forEach(function (col) {
          htr.appendChild(el('th', '', col));
        });
        thead.appendChild(htr);
        triageTbl.appendChild(thead);

        var tbody = el('tbody');
        var triageItems = Array.isArray(snap.triageItems) && snap.triageItems.length
          ? snap.triageItems
          : records.slice(0, 4).map(function (r, idx) {
              var label = r.county || r.bill || r.id || ('Item #' + (idx + 1));
              var detail = r.authority || r.title || r.summary || r.program || '';
              var status = r.status || r.stage || 'Pending Review';
              return {
                urgency: idx === 0 ? 'DESK CLOCK (PRI-1)' : idx === 1 ? 'JOINT REVIEW DUE' : 'MATCH VERIFICATION',
                tone: idx === 0 ? 'critical' : idx === 1 ? 'warning' : 'info',
                item: label + ' — ' + detail + ' (' + status + ')',
                action: idx === 0 ? 'Open Desk Record' : idx === 1 ? 'Request Updated Note' : 'Send Agency Reminder'
              };
            });

        triageItems.forEach(function (tItem) {
          var tr = el('tr');
          var tdUrg = el('td');
          tdUrg.appendChild(el('span', 'urg-pill ' + (tItem.tone || 'critical'), tItem.urgency || 'URGENT'));
          tr.appendChild(tdUrg);

          var tdItem = el('td', '', tItem.item || '');
          tr.appendChild(tdItem);

          var tdAct = el('td');
          var actBtn = el('button', 'action-link', tItem.action || 'Open Record');
          actBtn.type = 'button';
          actBtn.addEventListener('click', function () {
            showToast('Opened action workflow: ' + (tItem.action || 'Record'));
          });
          tdAct.appendChild(actBtn);
          tr.appendChild(tdAct);
          tbody.appendChild(tr);
        });
        triageTbl.appendChild(tbody);
        leftPanel.appendChild(triageTbl);
        opsGrid.appendChild(leftPanel);

        // Right Panel: MY WORK LIST & ASSIGNED FOLLOW-UPS
        var rightPanel = el('article', 'ops-panel');
        var rightHead = el('div', 'ops-panel-head');
        var wlTitle = (state.config.commandCenter && state.config.commandCenter.workListTitle) || 'MY WORK LIST & ASSIGNED PRIORITIES (WRK-3 / WRK-4)';
        rightHead.appendChild(el('h2', 'ops-panel-title', wlTitle));
        rightHead.appendChild(el('span', 'ops-badge green', records.slice(0, 3).length + ' ACTIVE • 2 FOLLOW-UPS'));
        rightPanel.appendChild(rightHead);

        var rightBody = el('div', 'ops-panel-body');
        rightBody.appendChild(el('h3', 'worklist-heading', 'Assigned Priority Items:'));
        var ulItems = el('ul', 'worklist-ul');
        var workItems = Array.isArray(snap.workListItems) && snap.workListItems.length
          ? snap.workListItems
          : records.slice(0, 3).map(function (r) {
              return {
                code: r.county || r.bill || r.id || 'Priority',
                text: (r.authority || r.title || '') + (r.program ? ' — ' + r.program : ''),
                badge: r.status || 'BOARD READY'
              };
            });
        workItems.forEach(function (w) {
          var li = el('li');
          var codeSpan = el('strong', '', w.code + ' — ');
          li.appendChild(codeSpan);
          li.appendChild(el('span', '', w.text + ' ('));
          li.appendChild(el('span', 'support-pill', w.badge || 'SUPPORT'));
          li.appendChild(el('span', '', ')'));
          ulItems.appendChild(li);
        });
        rightBody.appendChild(ulItems);

        rightBody.appendChild(el('h3', 'worklist-heading', 'Assigned Follow-Ups & Due Dates:'));
        var ulFollow = el('ul', 'worklist-ul');
        var followUps = Array.isArray(snap.followUps) && snap.followUps.length
          ? snap.followUps
          : [
              'Due 2026-12-10: Deliver Phase I/II utility & engineering readiness verification packet to review board.',
              'Due 2026-12-18: Finalize local matching funds certification and statutory compliance sign-off.'
            ];
        followUps.forEach(function (fText) {
          ulFollow.appendChild(el('li', '', fText));
        });
        rightBody.appendChild(ulFollow);
        rightPanel.appendChild(rightBody);
        opsGrid.appendChild(rightPanel);
      }
    }

    if (agendaSec) {
      agendaSec.replaceChildren();
      agendaSec.hidden = state.activeTab !== 'agenda';

      if (state.activeTab === 'agenda') {
        var agPanel = el('article', 'ops-panel');
        var agHead = el('div', 'ops-panel-head');
        agHead.appendChild(
          el(
            'h2',
            'ops-panel-title',
            (state.config.commandCenter && state.config.commandCenter.agendaTitle) ||
              "GOVERNOR'S & AGENCY PRIORITY AGENDA — TRACKED GOALS (AGN-1..4)"
          )
        );
        agHead.appendChild(el('span', 'ops-badge green', 'DEDUPLICATED AT FURTHEST STAGE'));
        agPanel.appendChild(agHead);

        var agTbl = el('table', 'agenda-table');
        var agThead = el('thead');
        var agHtr = el('tr');
        ['#', 'PRIORITY AREA', 'SESSION / PROGRAM GOAL', 'OFFICE LEAD', 'TRACKED MEASURES / SITES', 'EXCEPTIONS / HOLDS'].forEach(function (c) {
          agHtr.appendChild(el('th', '', c));
        });
        agThead.appendChild(agHtr);
        agTbl.appendChild(agThead);

        var agTbody = el('tbody');
        var agendaRows = Array.isArray(snap.agendaItems) && snap.agendaItems.length
          ? snap.agendaItems
          : records.map(function (r, idx) {
              return {
                rank: '#' + (idx + 1),
                area: r.county || r.priorityArea || ('Priority #' + (idx + 1)),
                sub: r.program || r.tier || '',
                goal: r.authority ? (r.authority + ' (' + (r.acres ? r.acres + ' ac, ' : '') + (r.projectedJobs ? r.projectedJobs + ' jobs target' : '') + ')') : (r.goal || ''),
                lead: r.officeLead || 'WVDED & IJDC Review Lead',
                measure: (r.requestedMillions ? '$' + r.requestedMillions + 'M' : '') + ' (' + (r.status || 'Active') + ')',
                holds: 'None'
              };
            });

        agendaRows.forEach(function (ar) {
          var tr = el('tr');
          tr.appendChild(el('td', '', ar.rank));
          var tdArea = el('td');
          tdArea.appendChild(el('strong', '', ar.area));
          if (ar.sub) {
            tdArea.appendChild(el('div', 'card-subtitle', ar.sub));
          }
          tr.appendChild(tdArea);
          tr.appendChild(el('td', '', ar.goal));
          tr.appendChild(el('td', '', ar.lead));
          var tdMeas = el('td');
          tdMeas.appendChild(el('strong', 'action-link', ar.measure));
          tr.appendChild(tdMeas);
          tr.appendChild(el('td', '', ar.holds || 'None'));
          agTbody.appendChild(tr);
        });
        agTbl.appendChild(agTbody);
        agPanel.appendChild(agTbl);
        agendaSec.appendChild(agPanel);
      }
    }

    if (widgetGrid) {
      widgetGrid.hidden = state.activeTab === 'agenda';
    }
  }

  function renderKpisAndWidgets() {
    var filtered = getFilteredRecords();
    renderKpis(filtered);
    renderOpsAndAgenda(filtered);
    renderWidgets(filtered);
  }

  function renderAll() {
    if (!state.config) return;
    applyTheme(state.config.theme);
    renderHeader();
    renderStudioDrawer();
    renderFilters();
    renderKpisAndWidgets();
  }

  async function saveConfigToDisk() {
    var saveBtn = document.getElementById('saveBtn');
    if (state.staticHosted) {
      if (typeof window.showSaveFilePicker === 'function') {
        try {
          var handle = await window.showSaveFilePicker({
            suggestedName: 'dashboard.config.json',
            types: [{ description: 'Dashboard Config JSON', accept: { 'application/json': ['.json'] } }]
          });
          var writable = await handle.createWritable();
          await writable.write(JSON.stringify(state.config, null, 2) + '\n');
          await writable.close();
          state.dirty = false;
          saveBtn.textContent = 'Saved';
          setTimeout(function () {
            if (!state.dirty) saveBtn.hidden = true;
          }, 1200);
          showToast('Saved layout directly to dashboard.config.json (Zero-Node Browser Mode)');
          renderAll();
          return;
        } catch (pickerErr) {
          if (pickerErr && pickerErr.name === 'AbortError') return;
        }
      }
      var dlBlob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
      var dlUrl = URL.createObjectURL(dlBlob);
      var dlLink = el('a');
      dlLink.href = dlUrl;
      dlLink.download = 'dashboard.config.json';
      document.body.appendChild(dlLink);
      dlLink.click();
      dlLink.remove();
      URL.revokeObjectURL(dlUrl);
      state.dirty = false;
      saveBtn.textContent = 'Saved';
      setTimeout(function () {
        if (!state.dirty) saveBtn.hidden = true;
      }, 1200);
      showToast('Downloaded updated dashboard.config.json');
      renderAll();
      return;
    }
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
      var res = await fetch('./api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': state.csrfToken
        },
        body: JSON.stringify({ config: state.config })
      });
      if (!res.ok) {
        showToast('Could not save layout. Refresh the page and try again.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes *';
        return;
      }
      var data = await res.json();
      if (data && data.config) state.config = data.config;
      state.dirty = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'Saved';
      setTimeout(function () {
        if (!state.dirty) saveBtn.hidden = true;
      }, 1200);
      showToast('Saved layout and theme to dashboard.config.json');
      renderAll();
    } catch {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes *';
      showToast('Save failed — check that node server.mjs is still running.');
    }
  }

  function bindGlobalControls() {
    var globalSearch = document.getElementById('globalSearchInput');
    if (globalSearch) {
      globalSearch.addEventListener('input', function () {
        state.searchQuery = globalSearch.value || '';
        renderKpisAndWidgets();
      });
    }

    var askGeBtn = document.getElementById('askGeBtn');
    if (askGeBtn) {
      askGeBtn.setAttribute('data-tooltip', 'Serverless preview: filters local snapshot records only. A hosted deployment can wire this button to embedded Gemini Enterprise.');
      askGeBtn.addEventListener('click', function () {
        var q = (globalSearch && globalSearch.value.trim()) || (state.config && state.config.title) || 'West Virginia Command Center status';
        showToast('Filtering Command Center & preparing Gemini Enterprise query for: "' + q + '"');
        state.searchQuery = globalSearch ? globalSearch.value || '' : '';
        renderKpisAndWidgets();
      });
    }

    var ownerSel = document.getElementById('ownerSelect');
    if (ownerSel) {
      ownerSel.addEventListener('change', function () {
        state.activeOwner = ownerSel.value;
        var pill = document.getElementById('activeOwnerPill');
        if (pill) pill.textContent = state.activeOwner.toUpperCase();
        showToast('Switched Command Center view to: ' + state.activeOwner);
      });
    }

    var printBtn = document.getElementById('printViewBtn');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        window.print();
      });
    }

    var customizeBtn = document.getElementById('customizeBtn');
    customizeBtn.addEventListener('click', function () {
      state.editMode = !state.editMode;
      customizeBtn.setAttribute('aria-pressed', String(state.editMode));
      customizeBtn.textContent = state.editMode ? 'Done Customizing' : 'Customize Layout';
      renderAll();
    });

    document.getElementById('saveBtn').addEventListener('click', saveConfigToDisk);

    var loadCfgBtn = document.getElementById('loadConfigBtn');
    var loadCfgInput = document.getElementById('loadConfigInput');
    if (loadCfgBtn && loadCfgInput) {
      loadCfgBtn.addEventListener('click', function () {
        loadCfgInput.value = '';
        loadCfgInput.click();
      });
      loadCfgInput.addEventListener('change', function () {
        var file = loadCfgInput.files && loadCfgInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var parsed = JSON.parse(String(reader.result || ''));
            if (parsed && parsed.theme && Array.isArray(parsed.widgets)) {
              state.config = parsed;
              state.dirty = false;
              renderAll();
              showToast('Loaded saved dashboard.config.json');
            } else {
              showToast('Invalid dashboard.config.json structure.');
            }
          } catch {
            showToast('Could not parse JSON file.');
          }
        };
        reader.readAsText(file);
      });
    }

    document.getElementById('exportBtn').addEventListener('click', function () {
      if (!state.config) return;
      var blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a');
      a.href = url;
      a.download = 'dashboard.config.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Downloaded dashboard.config.json');
    });

    var dlHtmlBtn = document.getElementById('downloadHtmlBtn');
    if (dlHtmlBtn) {
      dlHtmlBtn.addEventListener('click', function () {
        var inlineEl = document.getElementById('initial-data');
        if (inlineEl && state.config && state.snapshot) {
          inlineEl.textContent = JSON.stringify({ config: state.config, snapshot: state.snapshot }).replace(/</g, '\\u003c');
        }
        var fullHtml = '<!doctype html>\n' + document.documentElement.outerHTML;
        var blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'wv-dashboard-standalone.html';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Downloaded wv-dashboard-standalone.html — click it in your browser downloads bar to open in Chrome/Edge!');
      });
    }

    document.getElementById('refreshBtn').addEventListener('click', async function () {
      var btn = document.getElementById('refreshBtn');
      if (window.location.protocol === 'file:') {
        showToast('Zero-Node Browser Mode uses embedded snapshot data. Click Load Config to restore saved layout JSON, or ask Antigravity to refresh data.');
        return;
      }
      if (state.staticHosted) {
        try {
          var snapRes = await fetch('./data/snapshot.json');
          if (snapRes.ok) {
            state.snapshot = await snapRes.json();
            renderAll();
            showToast('Reloaded snapshot dataset');
          }
        } catch {}
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Refreshing...';
      try {
        var res = await fetch('./api/refresh', {
          method: 'POST',
          headers: { 'X-CSRF-Token': state.csrfToken }
        });
        if (res.ok) {
          var out = await res.json();
          if (out.snapshot) state.snapshot = out.snapshot;
          renderAll();
          showToast('Data refreshed (' + (state.snapshot.sourceMode || 'snapshot') + ')');
        } else {
          showToast('Refresh skipped — using cached snapshot.');
        }
      } catch {
        showToast('Unable to reach local server.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refresh Data';
      }
    });

    var colorMap = [
      { id: 'colPrimary', key: 'primary' },
      { id: 'colAccent', key: 'accent' },
      { id: 'colSecondary', key: 'secondary' },
      { id: 'colBg', key: 'bg' },
      { id: 'colSurface', key: 'surface' }
    ];
    colorMap.forEach(function (cm) {
      var input = document.getElementById(cm.id);
      input.addEventListener('input', function () {
        state.config.theme[cm.key] = input.value;
        state.config.themePreset = 'custom';
        applyTheme(state.config.theme);
        markDirty();
        renderKpisAndWidgets();
      });
    });

    document.querySelectorAll('[data-radius]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.config.theme.radius = Number(btn.getAttribute('data-radius'));
        applyTheme(state.config.theme);
        markDirty();
      });
    });

    document.getElementById('densityToggle').addEventListener('click', function () {
      var cur = state.config.theme.density;
      state.config.theme.density = cur === 'compact' ? 'comfortable' : 'compact';
      applyTheme(state.config.theme);
      markDirty();
    });
  }

  async function init() {
    bindGlobalControls();
    // 1. Check embedded initial-data first (0ms serverless rendering inside Antigravity Artifact Viewer & file://):
    try {
      var inlineEl = document.getElementById('initial-data');
      if (inlineEl && inlineEl.textContent) {
        var parsedInline = JSON.parse(inlineEl.textContent);
        if (parsedInline && parsedInline.config && parsedInline.snapshot) {
          state.staticHosted = true;
          state.config = parsedInline.config;
          state.snapshot = parsedInline.snapshot;
          renderAll();
          return;
        }
      }
    } catch {}

    if (window.location.protocol !== 'file:') {
      try {
        var res = await fetch('./api/state');
        if (res.ok) {
          var payload = await res.json();
          state.staticHosted = false;
          state.config = payload.config;
          state.snapshot = payload.snapshot;
          if (payload.csrfToken) state.csrfToken = payload.csrfToken;
          renderAll();
          return;
        }
      } catch {}

      try {
        state.staticHosted = true;
        var cfgRes = await fetch('./dashboard.config.json');
        var snapRes = await fetch('./data/snapshot.json');
        if (cfgRes.ok && snapRes.ok) {
          state.config = await cfgRes.json();
          state.snapshot = await snapRes.json();
          renderAll();
          return;
        }
      } catch {}
    }
    showToast('Failed to load dashboard configuration.');
  }

  init();
})();
