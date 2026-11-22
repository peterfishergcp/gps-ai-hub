/**
 * Hoverable Antigravity Token Usage Pill + Context-Bloat Indicator (`token_pill_ui.js`)
 *
 * Renders a compact `17.8k in | 8.2k out | 1.3k thinking` pill in sidecar headers.
 * - Turns dot Amber + shows `Context Heavy` badge when active/latest thread passes 160k peak context,
 *   with a 1-click `/compact` helper inside the hover popover!
 * - Displays 30-day Estimated Pooled Spend vs Plan Cap alongside 5h / 24h / 7d windows.
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
      '.agy-tm-pill.ctx-warn { border-color: #f59e0b; background: rgba(245, 158, 11, 0.08); }',
      'html[data-theme="dark"] .agy-tm-pill { color: #fbbf24; }',
      '@media (prefers-color-scheme: dark) {',
      '  .agy-tm-pill { color: #f59e0b; }',
      '}',
      '.agy-tm-pill:hover, .agy-tm-wrap:focus-within .agy-tm-pill {',
      '  border-color: #d97706; background: var(--secondary, #f7f8fa);',
      '}',
      '.agy-tm-dot { width: 7px; height: 7px; border-radius: 50%; background: #10b981; flex-shrink: 0; }',
      '.agy-tm-dot.warn { background: #f59e0b; box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22); }',
      '.agy-tm-dot.red { background: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.22); }',
      '.agy-tm-ctx-tag { font-family: "Google Sans", Inter, sans-serif; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 999px; background: rgba(245, 158, 11, 0.2); color: #b45309; }',
      '.agy-tm-popover {',
      '  position: absolute; top: calc(100% + 6px); right: 0;',
      '  width: 380px; max-width: calc(100vw - 24px);',
      '  background: var(--card, #ffffff); color: var(--foreground, #111827);',
      '  border: 1px solid var(--border, #e5e7eb); border-radius: 14px;',
      '  padding: 13px 14px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);',
      '  z-index: 120; opacity: 0; visibility: hidden; pointer-events: none;',
      '  transform: translateY(4px);',
      '  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;',
      '  font-family: "Google Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
      '  font-size: 12px; text-align: left; white-space: normal;',
      '}',
      '.agy-tm-popover::before { content: ""; position: absolute; top: -10px; left: 0; right: 0; height: 10px; }',
      '.agy-tm-wrap:hover .agy-tm-popover, .agy-tm-wrap:focus-within .agy-tm-popover, .agy-tm-wrap.pinned .agy-tm-popover {',
      '  opacity: 1; visibility: visible; pointer-events: auto; transform: translateY(0);',
      '}',
      '.agy-tm-hd { display: flex; justify-content: space-between; align-items: center; margin-bottom: 9px; gap: 6px; }',
      '.agy-tm-title { font-weight: 600; font-size: 13px; }',
      '.agy-tm-cache { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: rgba(16,185,129,0.13); color: #047857; }',
      '.agy-tm-card { background: var(--secondary, #f7f8fa); border: 1px solid var(--border, #e5e7eb); border-radius: 10px; padding: 9px 10px; margin-bottom: 9px; }',
      '.agy-tm-card.warn { border-color: rgba(245, 158, 11, 0.55); background: rgba(245, 158, 11, 0.08); }',
      '.agy-tm-card-lbl { font-size: 10.5px; font-weight: 600; color: var(--muted-foreground, #6b7280); text-transform: uppercase; letter-spacing: 0.03em; margin-bottom: 3px; }',
      '.agy-tm-card-line { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; font-weight: 600; color: #b45309; }',
      '@media (prefers-color-scheme: dark) { .agy-tm-card-line { color: #f59e0b; } .agy-tm-cache { color: #34d399; } .agy-tm-ctx-tag { color: #fbbf24; } }',
      '.agy-tm-card-sub { font-size: 11px; color: var(--muted-foreground, #6b7280); margin-top: 3px; line-height: 1.4; }',
      '.agy-tm-cap-bar { height: 6px; border-radius: 999px; background: rgba(107,114,128,0.18); overflow: hidden; margin-top: 6px; }',
      '.agy-tm-cap-fill { height: 100%; border-radius: 999px; background: #10b981; transition: width 0.2s ease; }',
      '.agy-tm-cap-fill.amber { background: #f59e0b; }',
      '.agy-tm-cap-fill.red { background: #ef4444; }',
      '.agy-tm-tbl { width: 100%; border-collapse: collapse; font-size: 11.5px; margin-bottom: 9px; }',
      '.agy-tm-tbl th { text-align: left; font-size: 10.5px; color: var(--muted-foreground, #6b7280); font-weight: 600; padding: 3px 4px; border-bottom: 1px solid var(--border, #e5e7eb); }',
      '.agy-tm-tbl td { padding: 4px; border-bottom: 1px solid var(--border, #e5e7eb); font-variant-numeric: tabular-nums; }',
      '.agy-tm-tbl th.r, .agy-tm-tbl td.r { text-align: right; }',
      '.agy-tm-foot { display: flex; justify-content: space-between; align-items: center; gap: 6px; margin-top: 8px; flex-wrap: wrap; }',
      '.agy-tm-btn { border-radius: 999px; border: 1px solid var(--border, #e5e7eb); background: var(--card, #ffffff); color: var(--foreground, #111827); font-size: 11px; font-weight: 500; padding: 4px 10px; cursor: pointer; }',
      '.agy-tm-btn.pri { background: #111827; color: #ffffff; border-color: #111827; }',
      '.agy-tm-btn.amber { background: #fef3c7; color: #92400e; border-color: #f59e0b; font-weight: 600; }',
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
    var fn = window.__agyAuthedFetch || ((window.sidecar && window.sidecar.fetch) ? window.sidecar.fetch : window.fetch.bind(window));
    return fn(url);
  }

  async function sendAgentPrompt(prompt, title) {
    try {
      if (window.sidecar && window.sidecar.agent) {
        if (window.sidecar.conversationId) {
          await window.sidecar.agent.sendMessage(prompt);
        } else {
          var created = await window.sidecar.agent.startConversation(prompt, title || '/token-usage');
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
    pill.setAttribute('aria-label', 'Hover or click to inspect local token consumption and spending cap');
    var dot = makeEl('span', 'agy-tm-dot');
    var pillLabel = makeEl('span', '', 'Tokens: -- in | -- out');
    var ctxTag = makeEl('span', 'agy-tm-ctx-tag', '/compact');
    ctxTag.style.display = 'none';
    pill.appendChild(dot);
    pill.appendChild(pillLabel);
    pill.appendChild(ctxTag);

    var pop = makeEl('div', 'agy-tm-popover');
    pop.setAttribute('role', 'region');
    pop.setAttribute('aria-label', 'Token Consumption & Pooled Cap Details');

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
      var w30 = data.windows.last30d || w7;
      var cap = data.spendingCap || null;
      var focusConv = data.activeConversation || null;
      var thread = focusConv || data.newestConversation;
      var pillSrc = focusConv || (w5.turns > 0 ? w5 : w7);
      var prefix = focusConv ? '' : (w5.turns > 0 ? '5h: ' : '7d: ');

      pillLabel.textContent =
        prefix +
        fmtTok(pillSrc.inputTokens) + ' in | ' +
        fmtTok(pillSrc.outputTokens) + ' out | ' +
        fmtTok(pillSrc.thinkingTokens) + ' thinking';

      var warnCtx = Boolean(thread && thread.peakContextTokens >= 160000);
      var capRed = Boolean(cap && cap.capUsedPct >= 90);
      dot.className = 'agy-tm-dot' + (capRed ? ' red' : warnCtx ? ' warn' : '');
      pill.className = 'agy-tm-pill' + (warnCtx ? ' ctx-warn' : '');
      ctxTag.style.display = warnCtx ? 'inline-block' : 'none';

      pop.replaceChildren();

      var hd = makeEl('div', 'agy-tm-hd');
      hd.appendChild(makeEl('span', 'agy-tm-title', 'TokenEconomics & Quota'));
      hd.appendChild(makeEl('span', 'agy-tm-cache', 'Cache Hit ' + (w30.cacheHitPct || w7.cacheHitPct || '0%')));
      pop.appendChild(hd);

      if (cap) {
        var capCard = makeEl('div', 'agy-tm-card');
        capCard.appendChild(makeEl('div', 'agy-tm-card-lbl', '30-Day Est. Spend vs Plan Cap'));
        capCard.appendChild(
          makeEl(
            'div',
            'agy-tm-card-line',
            '$' + Number(cap.estSpend30dUsd || 0).toFixed(2) + ' / $' + Number(cap.capUsd || 30).toFixed(2) +
            ' (' + (cap.capUsedPct || 0) + '%)'
          )
        );
        var bar = makeEl('div', 'agy-tm-cap-bar');
        var fill = makeEl('div', 'agy-tm-cap-fill' + (cap.status === 'red' ? ' red' : cap.status === 'amber' ? ' amber' : ''));
        fill.style.width = Math.min(100, Math.max(2, Number(cap.capUsedPct) || 0)) + '%';
        bar.appendChild(fill);
        capCard.appendChild(bar);
        capCard.appendChild(
          makeEl(
            'div',
            'agy-tm-card-sub',
            'Cache saved ~$' + Number(cap.cacheSaved30dUsd || 0).toFixed(2) + ' · ' + (cap.rateLabel || 'Orchestrator')
          )
        );
        pop.appendChild(capCard);
      }

      if (thread) {
        var card = makeEl('div', 'agy-tm-card' + (warnCtx ? ' warn' : ''));
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
          fmtTok(thread.cacheReadTokens) + ' cached · Peak ctx ' + fmtTok(thread.peakContextTokens) +
          (warnCtx ? ' — Context is heavy! Run /compact or start a fresh thread to cut token burn ~60%.' : '');
        card.appendChild(makeEl('div', 'agy-tm-card-sub', ctxNote));
        pop.appendChild(card);
      }

      var tbl = makeEl('table', 'agy-tm-tbl');
      var thead = makeEl('thead');
      var hr = makeEl('tr');
      hr.appendChild(makeEl('th', '', 'Window'));
      hr.appendChild(makeEl('th', 'r', 'In'));
      hr.appendChild(makeEl('th', 'r', 'Cached'));
      hr.appendChild(makeEl('th', 'r', 'Out'));
      hr.appendChild(makeEl('th', 'r', 'Est. $'));
      thead.appendChild(hr);
      tbl.appendChild(thead);

      var tbody = makeEl('tbody');
      [
        ['Last 5h (Burst)', w5],
        ['Last 24h', w24],
        ['Last 7d', w7],
        ['Last 30d (Month)', w30]
      ].forEach(function (pair) {
        var tr = makeEl('tr');
        tr.appendChild(makeEl('td', '', pair[0]));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].inputTokens)));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].cacheReadTokens)));
        tr.appendChild(makeEl('td', 'r', fmtTok(pair[1].outputTokens)));
        tr.appendChild(makeEl('td', 'r', '$' + Number(pair[1].estUsd || 0).toFixed(2)));
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      pop.appendChild(tbl);

      var foot = makeEl('div', 'agy-tm-foot');
      var refBtn = makeEl('button', 'agy-tm-btn', 'Refresh');
      refBtn.type = 'button';
      refBtn.addEventListener('click', function () { refresh(); });
      foot.appendChild(refBtn);

      var tabBtn = document.querySelector('.tab-btn[data-tab="tokens"]');
      if (tabBtn) {
        var openTabBtn = makeEl('button', 'agy-tm-btn', 'Open TokenEconomics');
        openTabBtn.type = 'button';
        openTabBtn.addEventListener('click', function () {
          wrap.classList.remove('pinned');
          tabBtn.click();
        });
        foot.appendChild(openTabBtn);
      }

      if (warnCtx) {
        var compactBtn = makeEl('button', 'agy-tm-btn amber', 'Prep /compact');
        compactBtn.type = 'button';
        compactBtn.addEventListener('click', function () {
          wrap.classList.remove('pinned');
          sendAgentPrompt(
            'Summarize our progress, active file paths, and next steps in 6 concise bullets so I can run /compact safely.',
            'Compact Context'
          );
        });
        foot.appendChild(compactBtn);
      } else {
        var runBtn = makeEl('button', 'agy-tm-btn pri', '/token-usage Report');
        runBtn.type = 'button';
        runBtn.addEventListener('click', function () {
          wrap.classList.remove('pinned');
          sendAgentPrompt(
            '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.',
            '/token-usage'
          );
        });
        foot.appendChild(runBtn);
      }

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
