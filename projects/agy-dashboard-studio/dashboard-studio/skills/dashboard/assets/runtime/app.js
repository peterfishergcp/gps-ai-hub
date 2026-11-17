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
      label: 'West Virginia Official',
      theme: {
        mode: 'light',
        fontFamily: '"Fira Sans", system-ui, -apple-system, sans-serif',
        bg: '#F4F6F8',
        surface: '#FFFFFF',
        ink: '#1E252B',
        muted: '#5A6772',
        border: '#D8E0E6',
        primary: '#053254',
        accent: '#C1452C',
        secondary: '#D5A245',
        radius: 12,
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
    var cfg = state.config;
    var eyebrowEl = document.getElementById('dashEyebrow');
    var titleEl = document.getElementById('dashTitle');
    var subEl = document.getElementById('dashSubtitle');
    var pillEl = document.getElementById('connectorPill');
    var stampEl = document.getElementById('footerStamp');

    eyebrowEl.textContent = cfg.eyebrow || 'Analytics';
    titleEl.textContent = cfg.title || 'Dashboard';
    subEl.textContent = cfg.subtitle || '';
    document.title = cfg.title || 'Dashboard Studio';

    var connName = ((state.snapshot && state.snapshot.connector) || cfg.connector || 'bigquery').toUpperCase();
    var srcMode = String((state.snapshot && state.snapshot.sourceMode) || '');
    var modeName = srcMode.indexOf('live-') === 0 ? 'LIVE' : 'SNAPSHOT';
    pillEl.textContent = connName + ' · ' + modeName;

    if (stampEl) {
      stampEl.textContent = cfg.lastUpdatedLabel || '';
    }

    makeInlineEditable(eyebrowEl, function () { return cfg.eyebrow; }, function (v) { cfg.eyebrow = v; });
    makeInlineEditable(titleEl, function () { return cfg.title; }, function (v) { cfg.title = v; });
    makeInlineEditable(subEl, function () { return cfg.subtitle; }, function (v) { cfg.subtitle = v; });
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

    var searchBox = el('div', 'search-box');
    var searchInput = el('input', 'search-input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Filter counties, agencies, or status...';
    searchInput.value = state.searchQuery;
    searchInput.addEventListener('input', function () {
      state.searchQuery = searchInput.value;
      renderKpisAndWidgets();
    });
    searchBox.appendChild(searchInput);

    if (state.searchQuery || Object.keys(state.activeFilters).some(function (k) { return state.activeFilters[k] && state.activeFilters[k] !== 'All'; })) {
      var resetBtn = el('button', 'chip-btn', 'Reset');
      resetBtn.type = 'button';
      resetBtn.addEventListener('click', function () {
        state.activeFilters = {};
        state.searchQuery = '';
        renderFilters();
        renderKpisAndWidgets();
      });
      searchBox.appendChild(resetBtn);
    }

    bar.appendChild(searchBox);
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

  function renderKpisAndWidgets() {
    var filtered = getFilteredRecords();
    renderKpis(filtered);
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
      try {
        localStorage.setItem('dashboard-studio-demo-config:' + (state.config.id || 'default'), JSON.stringify(state.config));
      } catch {}
      state.dirty = false;
      saveBtn.textContent = 'Saved';
      setTimeout(function () {
        if (!state.dirty) saveBtn.hidden = true;
      }, 1200);
      showToast('Saved layout in browser preview (click Export Config to download JSON)');
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
    var customizeBtn = document.getElementById('customizeBtn');
    customizeBtn.addEventListener('click', function () {
      state.editMode = !state.editMode;
      customizeBtn.setAttribute('aria-pressed', String(state.editMode));
      customizeBtn.textContent = state.editMode ? 'Done Customizing' : 'Customize Layout';
      renderAll();
    });

    document.getElementById('saveBtn').addEventListener('click', saveConfigToDisk);

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

    document.getElementById('refreshBtn').addEventListener('click', async function () {
      var btn = document.getElementById('refreshBtn');
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
    try {
      var res = await fetch('./api/state');
      if (res.ok) {
        var payload = await res.json();
        state.config = payload.config;
        state.snapshot = payload.snapshot;
        if (payload.csrfToken) state.csrfToken = payload.csrfToken;
        renderAll();
        return;
      }
    } catch {}

    // Fallback for static Zipline / hosted live preview without local Node server:
    try {
      state.staticHosted = true;
      var cfgRes = await fetch('./dashboard.config.json');
      var snapRes = await fetch('./data/snapshot.json');
      state.config = await cfgRes.json();
      state.snapshot = await snapRes.json();
      try {
        var savedLocal = localStorage.getItem('dashboard-studio-demo-config:' + (state.config.id || 'default'));
        if (savedLocal) {
          state.config = JSON.parse(savedLocal);
        }
      } catch {}
      renderAll();
    } catch {
      showToast('Failed to load dashboard.config.json');
    }
  }

  init();
})();
