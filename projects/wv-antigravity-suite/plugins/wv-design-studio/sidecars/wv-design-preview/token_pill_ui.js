/**
 * Hoverable Antigravity Token Usage Pill + Popover (`token_pill_ui.js`)
 *
 * Renders a compact `17.8k in | 8.2k out | 1.3k thinking` pill in sidecar headers.
 * Hovering (or focusing/clicking) opens a rich breakdown popover showing:
 *   - Active Conversation (or Most Recent Thread) uncached in, cache read, out, thinking & peak context
 *   - Rolling 5-Hour Quota Window, 24-Hour, and 7-Day Weekly Window
 *   - Top Recent Conversations + 1-click `/token-usage` full report launcher
 *
 * Pure DOM API construction (`createElement` + `textContent` + `replaceChildren`).
 */
(function () {
  'use strict';

  var STYLE_ID = 'agy-token-pill-styles';

  function injectStylesOnce() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.agy-tm-wrap { position: relative; display: inline-flex; align-items: center; }',
      '.agy-tm-pill {',
      '  display: inline-flex; align-items: center; gap: 7px;',
      '  border-radius: 999px; padding: 5px 11px;',
      '  background: var(--card, #ffffff);',
      '  border: 1px solid var(--border, #e5e7eb);',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      '  font-size: 11.5px; font-weight: 600;',
      '  color: #b45309; cursor: pointer; white-space: nowrap;',
      '  transition: border-color 0.14s ease, background 0.14s ease;',
      '}',
      '@media (prefers-color-scheme: dark) {',
      '  .agy-tm-pill { color: #f59e0b; }',
      '}',
      '.agy-tm-pill:hover, .agy-tm-wrap:focus-within .agy-tm-pill {',
      '  border-color: #d97706; background: var(--secondary, #f7f8fa);',
      '}',
      '.agy-tm-dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; flex-shrink: 0; }',
      '.agy-tm-dot.warn { background: #f59e0b; }',
      '.agy-tm-popover {',
      '  position: absolute; top: calc(100% + 6px); right: 0;',
      '  width: 360px; max-width: calc(100vw - 24px);',
      '  background: var(--card, #ffffff); color: var(--foreground, #111827);',
      '  border: 1px solid var(--border, #e5e7eb); border-radius: 14px;',
      '  padding: 13px 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);',
      '  z-index: 120; opacity: 0; visibility: hidden; pointer-events: none;',
      '  transform: translateY(4px);',
      '  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;',
      '  font-family: "Google Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 12px; text-align: left; white-space: normal;',
      '}',
      '/* Seamless invisible hover bridge so moving cursor into popover never closes it */',
      '.agy-tm-popover::before { content: ""; position: absolute; top: -10px; left: 0; right: 0; height: 10px; }',
      '.agy-tm-wrap:hover .agy-tm-popover, .agy-tm-wrap:focus-within .agy-tm-popover, .agy-tm-wrap.pinned .agy-tm-popover {',
      '  opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0);',
      '}',
      '.agy-tm-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; }',
      '.agy-tm-title { font-weight: 600; font-size: 13px; }',
      '.agy-tm-cache { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(16,185,129,0.13); color: #047857; }',
      '.agy-tm-card { background: var(--secondary, #f7f8fa); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 9px 10px; margin-bottom: 9px; }',
      '.agy-tm-card-lbl { font-size: 10.5px; font-weight: 600; color: var(--muted-foreground, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 3px; }',
      '.agy-tm-card-line { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; font-weight: 600; color: #b45309; }',
      '@media (prefers-color-scheme: dark) { .agy-tm-card-line { color: #f59e0b; } .agy-tm-cache { color: #34d399; } }',
      '.agy-tm-card-sub { font-size: 11px; color: var(--muted-foreground, #6b7280); margin-top: 3px; }',
      '.agy-tm-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 9px; }',
      '.agy-tm-tbl th { text-align: left; font-size: 10.5px; color: var(--muted-foreground, #6b7280); font-weight: 600; padding: 3px 4px; border-bottom: 1px solid var(--border, #e5e7eb); }',
      '.agy-tm-tbl td { padding: 4px; border-bottom: 1px solid var(--border, #e5e7eb); font-variant-numeric: tabular-nums; }',
      '.agy-tm-tbl th.r, .agy-tm-tbl td.r { text-align: right; }',
      '.agy-tm-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 8px; }',
      '.agy-tm-btn { border-radius: 999px; border: 1px solid var(--border, #e5e7eb); background: var(--card, #ffffff); color: var(--foreground, #111827); font-size: 11px; font-weight: 500; padding: 4px 10px; cursor: pointer; }',
      '.agy-tm-btn.pri { background: #111827; color: #ffffff; border-color: #111827; }',
      '@media (prefers-color-scheme: dark) { .agy-tm-btn.pri { background: #f9fafb; color: #111827; border-color: #f9fafb; } }'
    ].join('\n');
    document.head.appendChild(st);
  }

  function fmtTok(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    return String(Math.round(v));
  }

  function makeEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function sidecarFetch(url) {
    var fn = (window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window);
    return fn(url);
  }

  async function runTokenUsageSkill() {
    var prompt = '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.';
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(prompt);
        } else {
          var created = await window.sidecar.agent.startConversation(prompt, '/token-usage');
          if (created && created.conversationId && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
            window.sidecar.ui.toggleConversation(created.conversationId);
          }
        }
      }
    } catch {}
  }

  function mountTokenPill(containerEl) {
    if (!containerEl) return null;
    injectStylesOnce();

    var wrap = makeEl('div', 'agy-tm-wrap');
    wrap.id = 'agyTokenMeterWrap';

    var pill = makeEl('button', 'agy-tm-pill');
    pill.type = 'button';
    pill.setAttribute('aria-label', 'Hover or click to inspect local token consumption');
    var dot = makeEl('span', 'agy-tm-dot');
    var pillLabel = makeEl('span', '', 'Tokens: -- in | -- out');
    pill.appendChild(dot);
    pill.appendChild(pillLabel);

    var pop = makeEl('div', 'agy-tm-popover');
    pop.setAttribute('role', 'region');
    pop.setAttribute('aria-label', 'Token Consumption Details');

    pill.addEventListener('click', function (ev) {
      ev.stopPropagation();
      wrap.classList.toggle('pinned');
    });
    if (document.addEventListener) {
      document.addEventListener('click', function () {
        wrap.classList.remove('pinned');
      });
    }
    pop.addEventListener('click', function (ev) {
      ev.stopPropagation();
    });

    wrap.appendChild(pill);
    wrap.appendChild(pop);

    if (containerEl.firstChild) {
      containerEl.insertBefore(wrap, containerEl.firstChild);
    } else {
      containerEl.appendChild(wrap);
    }

    function renderData(data) {
      if (!data || !data.ok || !data.windows) return;
      var w5 = data.windows.last5h || {};
      var w24 = data.windows.last24h || {};
      var w7 = data.windows.last7d || {};
      var focusConv = data.activeConversation || null;
      var pillSrc = focusConv || (w5.turns > 0 ? w5 : w7);
      var prefix = focusConv ? '' : (w5.turns > 0 ? '5h: ' : '7d: ');

      pillLabel.textContent =
        prefix +
        fmtTok(pillSrc.inputTokens) + ' in | ' +
        fmtTok(pillSrc.outputTokens) + ' out | ' +
        fmtTok(pillSrc.thinkingTokens) + ' thinking';

      var warnCtx = Boolean(
        (focusConv && focusConv.peakContextTokens >= 150000) ||
        (!focusConv && data.newestConversation && data.newestConversation.peakContextTokens >= 150000)
      );
      dot.className = 'agy-tm-dot' + (warnCtx ? ' warn' : '');

      pop.replaceChildren();

      var hd = makeEl('div', 'agy-tm-hd');
      hd.appendChild(makeEl('span', 'agy-tm-title', 'Token Consumption'));
      hd.appendChild(makeEl('span', 'agy-tm-cache', 'Cache Hit ' + (w7.cacheHitPct || '0%')));
      pop.appendChild(hd);

      var thread = focusConv || data.newestConversation;
      if (thread) {
        var card = makeEl('div', 'agy-tm-card');
        card.appendChild(
          makeEl(
            'div',
            'agy-tm-card-lbl',
            focusConv ? 'Active Conversation (' + thread.convId.slice(0, 8) + ')' : 'Latest Conversation (' + thread.convId.slice(0, 8) + ')'
          )
        );
        card.appendChild(
          makeEl(
            'div',
            'agy-tm-card-line',
            fmtTok(thread.inputTokens) + ' in | ' + fmtTok(thread.outputTokens) + ' out | ' + fmtTok(thread.thinkingTokens) + ' thinking'
          )
        );
        var ctxNote =
          fmtTok(thread.cacheReadTokens) + ' cache read · Peak ctx ' + fmtTok(thread.peakContextTokens) +
          (thread.peakContextTokens >= 150000 ? ' (run /compact)' : '');
        card.appendChild(makeEl('div', 'agy-tm-card-sub', ctxNote));
        pop.appendChild(card);
      }

      var tbl = makeEl('table', 'agy-tm-tbl');
      var thead = makeEl('thead');
      var hr = makeEl('tr');
      hr.appendChild(makeEl('th', '', 'Quota Window'));
      hr.appendChild(makeEl('th', 'r', 'In'));
      hr.appendChild(makeEl('th', 'r', 'Cached'));
      hr.appendChild(makeEl('th', 'r', 'Out'));
      hr.appendChild(makeEl('th', 'r', 'Think'));
      thead.appendChild(hr);
      tbl.appendChild(thead);

      var tbody = makeEl('tbody');
      [
        ['Last 5h (Rolling)', w5],
        ['Last 24h', w24],
        ['Last 7d (Weekly)', w7]
      ].forEach(function (pair) {
        var tr = makeEl('tr');
        tr.appendChild(makeEl('td', '', pair[0]));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].inputTokens)));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].cacheReadTokens)));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].outputTokens)));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].thinkingTokens)));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      pop.appendChild(tbl);

      var foot = makeEl('div', 'agy-tm-foot');
      var refBtn = makeEl('button', 'agy-tm-btn', 'Refresh Meter');
      refBtn.type = 'button';
      refBtn.addEventListener('click', function () { refresh(); });

      var runBtn = makeEl('button', 'agy-tm-btn pri', 'Full /token-usage Report');
      runBtn.type = 'button';
      runBtn.addEventListener('click', function () {
        wrap.classList.remove('pinned');
        runTokenUsageSkill();
      });

      foot.appendChild(refBtn);
      foot.appendChild(runBtn);
      pop.appendChild(foot);
    }

    function refresh() {
      var cid = (window.sidecar && window.sidecar.conversationId) ? String(window.sidecar.conversationId) : '';
      var url = '/api/token-summary' + (cid ? '?convId=' + encodeURIComponent(cid) : '');
      return sidecarFetch(url)
        .then(function (r) { return r.json(); })
        .then(renderData)
        .catch(function () {});
    }

    refresh();
    return { refresh: refresh, element: wrap };
  }

  window.AGYTokenPill = { mount: mountTokenPill };
})();
