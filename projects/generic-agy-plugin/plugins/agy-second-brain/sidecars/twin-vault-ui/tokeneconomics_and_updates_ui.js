/**
 * TokenEconomics Dashboard, 5-Step Mastery Bar, Orchestrator Prompt Optimizer,
 * and "Stay in sync with Google Antigravity" Updates & Video Walkthroughs UI
 * (`tokeneconomics_and_updates_ui.js`).
 *
 * 100% Pure DOM construction (`createElement` + `textContent` — zero `.innerHTML`).
 */
(function () {
  'use strict';

  var activeUpdateTopic = 'all';
  var selectedSubTopics = new Set(['all']);

  function fmtTok(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'k';
    return String(Math.round(v));
  }

  function fmtUsd(n) {
    return '$' + (Number(n) || 0).toFixed(2);
  }

  function openExternalSafe(url) {
    var s = String(url || '');
    if (!s.startsWith('https://')) return;
    try {
      if (window.sidecar && window.sidecar.ui && typeof window.sidecar.ui.openExternal === 'function') {
        window.sidecar.ui.openExternal(s);
        return;
      }
    } catch {}
    window.open(s, '_blank', 'noopener,noreferrer');
  }

  function wrapPromptForOrchestrator(rawQuery) {
    var q = String(rawQuery || '').trim();
    if (!q || q.startsWith('/')) return q;
    return [
      'Execute this request using Orchestrator best practices (Plan once, delegate execution cleanly, and keep parent context lean):',
      '',
      '1. **Objective:** ' + q,
      '2. **Explore & Plan First:** Verify exact file paths, schemas, or constraints before mutating anything.',
      '3. **Delegate Heavy Reads/Checks:** Offload broad searches, multi-file scans, or deterministic calculations to fast Hydrogen subagents or scripts so noisy output stays out of our main context window.',
      '4. **Verification Gate:** Confirm outputs deterministically and summarize the result concisely with clickable links and next actions.'
    ].join('\n');
  }

  function buildDailySvgChart(el, dailySeries) {
    var series = Array.isArray(dailySeries) && dailySeries.length > 0 ? dailySeries : [];
    var SVG_NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 560 150');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '150');
    svg.style.display = 'block';

    var maxTok = 1;
    series.forEach(function (d) {
      if ((d.totalTokens || 0) > maxTok) maxTok = d.totalTokens;
    });

    var count = series.length || 14;
    var slotW = 532 / count;
    var barW = Math.max(10, Math.min(24, slotW - 10));

    series.forEach(function (d, idx) {
      var val = Number(d.totalTokens) || 0;
      var h = val > 0 ? Math.max(6, Math.round((val / maxTok) * 96)) : 3;
      var x = 16 + idx * slotW + (slotW - barW) / 2;
      var y = 114 - h;

      var rect = document.createElementNS(SVG_NS, 'rect');
      rect.setAttribute('x', String(x));
      rect.setAttribute('y', String(y));
      rect.setAttribute('width', String(barW));
      rect.setAttribute('height', String(h));
      rect.setAttribute('rx', '5');
      rect.setAttribute('fill', val > 0 ? '#3b78e7' : 'rgba(156,163,175,0.28)');

      var titleNode = document.createElementNS(SVG_NS, 'title');
      titleNode.textContent = d.date + ': ' + fmtTok(val) + ' tokens (' + fmtUsd(d.estUsd) + ', ' + (d.turns || 0) + ' turns)';
      rect.appendChild(titleNode);
      svg.appendChild(rect);

      if (idx % 2 === 0 || idx === count - 1) {
        var lbl = document.createElementNS(SVG_NS, 'text');
        lbl.setAttribute('x', String(x + barW / 2));
        lbl.setAttribute('y', '134');
        lbl.setAttribute('text-anchor', 'middle');
        lbl.setAttribute('font-size', '9.5');
        lbl.setAttribute('fill', '#6b7280');
        lbl.textContent = d.label || '';
        svg.appendChild(lbl);
      }
    });

    return el('div', { className: 'card', style: { marginBottom: '0' } }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: '14-Day Token & Quota Velocity' }),
        el('span', { className: 'muted', text: 'Hover any bar for daily turns & est. $' }),
      ]),
      svg,
    ]);
  }

  function buildMasteryOnboardingBar(ctx) {
    var el = ctx.el;
    var updatesState = (ctx.appState && ctx.appState.updates) || {};
    var sub = updatesState.subscription || {};
    if (sub.dismissedMastery) return null;

    var doneSet = new Set(Array.isArray(sub.completedMasterySteps) ? sub.completedMasterySteps : []);
    // Auto-credit personal skill step if user already has >=1 personal skill
    var myCat = ((ctx.appState && ctx.appState.skillsCatalog) || []).find(function (c) {
      return c.categoryId === 'my-skills';
    });
    if (myCat && Array.isArray(myCat.skills) && myCat.skills.length > 0) {
      doneSet.add('personal-skill');
    }

    var steps = [
      {
        id: 'run-skill',
        label: '1. Run a 1-Click Skill',
        onSelect: function () {
          ctx.markMasteryStep('run-skill');
          ctx.dispatchPrompt('/daily-brief Run my quick morning kickoff brief with my top 3 priorities.', '/daily-brief');
        },
      },
      {
        id: 'preview-dash',
        label: '2. Preview a Dashboard',
        onSelect: function () {
          ctx.markMasteryStep('preview-dash');
          var dashCmd = ctx.isWv ? '/wv-dashboard' : '/agy-dashboard';
          ctx.dispatchPrompt(
            dashCmd + ' Spin up an interactive executive KPI dashboard and open the rendered visual in Preview.',
            dashCmd
          );
        },
      },
      {
        id: 'personal-skill',
        label: '3. Explore Personal Skills',
        onSelect: function () {
          ctx.markMasteryStep('personal-skill');
          ctx.openSkillsExtension();
        },
      },
      {
        id: 'check-tokens',
        label: '4. Check TokenEconomics Cap',
        onSelect: function () {
          ctx.markMasteryStep('check-tokens');
          ctx.switchTab('tokens');
        },
      },
      {
        id: 'watch-guide',
        label: '5. Watch a 3-Min Walkthrough',
        onSelect: function () {
          ctx.markMasteryStep('watch-guide');
          activeUpdateTopic = 'videos';
          ctx.rerender();
          var target = document.getElementById('agy-updates-section');
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth' });
        },
      },
    ];

    var doneCount = steps.filter(function (s) {
      return doneSet.has(s.id);
    }).length;

    return el('div', { className: 'mastery-bar', id: 'mastery-onboarding-bar' }, [
      el('div', { className: 'mastery-top' }, [
        el('div', { className: 'topbar-actions' }, [
          el('strong', { style: { fontSize: '12.5px' }, text: 'Quick Adoption Checklist' }),
          el('span', { className: 'badge badge-blue', text: doneCount + '/5 Unlocked' }),
        ]),
        el('button', {
          type: 'button',
          className: 'btn btn-ghost btn-sm',
          title: 'Dismiss quick adoption bar',
          text: 'Dismiss \u00D7',
          onClick: async function () {
            await ctx.apiPost('/api/updates/prefs', { dismissedMastery: true });
            await ctx.reloadState();
          },
        }),
      ]),
      el(
        'div',
        { className: 'mastery-steps' },
        steps.map(function (st) {
          var isDone = doneSet.has(st.id);
          return el('button', {
            type: 'button',
            className: 'mastery-pill' + (isDone ? ' done' : ''),
            text: (isDone ? '\u2713 ' : '') + st.label,
            onClick: st.onSelect,
          });
        })
      ),
    ]);
  }

  function buildOverviewSpendMiniStrip(ctx) {
    var el = ctx.el;
    var tm = (ctx.appState && ctx.appState.tokenEconomics) || null;
    if (!tm || !tm.spendingCap) return null;
    var cap = tm.spendingCap;
    var w30 = (tm.windows && tm.windows.last30d) || {};

    return el('div', { className: 'overview-spend-strip' }, [
      el('div', { className: 'overview-spend-left' }, [
        el('strong', { style: { fontSize: '12.5px' }, text: 'Monthly Pooled Quota:' }),
        el('span', {
          className: 'badge ' + (cap.status === 'red' ? 'badge-red' : cap.status === 'amber' ? 'badge-amber' : 'badge-green'),
          text: fmtUsd(cap.estSpend30dUsd) + ' / ' + fmtUsd(cap.capUsd) + ' (' + cap.capUsedPct + '%)',
        }),
        el('div', { className: 'mini-cap-track' }, [
          el('div', {
            className: 'mini-cap-fill ' + (cap.status || 'green'),
            style: { width: Math.min(100, Math.max(3, cap.capUsedPct || 0)) + '%' },
          }),
        ]),
        el('span', {
          className: 'muted',
          text: 'Cache Hit ' + (w30.cacheHitPct || '0%') + ' (saved ~' + fmtUsd(cap.cacheSaved30dUsd) + ')',
        }),
      ]),
      el('div', { className: 'topbar-actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          text: 'Open Skills Hub \u2728',
          onClick: function () {
            ctx.openSkillsExtension();
          },
        }),
        el('button', {
          type: 'button',
          className: 'ai-sky-pill',
          text: 'TokenEconomics \u2192',
          onClick: function () {
            ctx.switchTab('tokens');
          },
        }),
      ]),
    ]);
  }

  function buildUpdatesAndSubscribeSection(ctx) {
    var el = ctx.el;
    var updates = (ctx.appState && ctx.appState.updates) || { topics: [], items: [], subscription: {} };
    var topics = updates.topics || [
      { id: 'all', label: 'All Updates' },
      { id: 'videos', label: 'Video Walkthroughs' },
      { id: 'app', label: 'Antigravity App' },
      { id: 'cli', label: 'Antigravity CLI' },
      { id: 'extensions', label: 'IDE Extensions' },
      { id: 'sdk', label: 'Antigravity SDK' },
    ];
    var items = updates.items || [];
    var filtered = items.filter(function (it) {
      if (activeUpdateTopic === 'all') return true;
      return it.topic === activeUpdateTopic;
    });

    var topicFilterRow = el(
      'div',
      { className: 'skills-chip-row', style: { marginBottom: '14px' } },
      topics.map(function (tp) {
        var count =
          tp.id === 'all'
            ? items.length
            : items.filter(function (i) {
                return i.topic === tp.id;
              }).length;
        return el('button', {
          type: 'button',
          className: 'skill-chip' + (activeUpdateTopic === tp.id ? ' active' : ''),
          text: (tp.id === 'videos' ? '\uD83C\uDFA5 ' : '') + tp.label + ' (' + count + ')',
          onClick: function () {
            activeUpdateTopic = tp.id;
            ctx.rerender();
          },
        });
      })
    );

    var cardsGrid = el(
      'div',
      { className: 'ai-topics-grid' },
      filtered.slice(0, 9).map(function (item) {
        var isVideo = item.kind === 'video';
        return el('div', { className: 'ai-topic-card' }, [
          el('div', { className: 'ai-topic-top' }, [
            el('span', {
              className: 'badge ' + (isVideo ? 'badge-blue' : 'badge-neutral'),
              text: item.badge || (isVideo ? '3–4 Min Video' : 'Antigravity Blog'),
            }),
            el('span', { className: 'muted', style: { fontSize: '11px' }, text: item.dateLabel || '' }),
          ]),
          el('h4', { className: 'ai-topic-title', text: item.title }),
          el('p', { className: 'ai-topic-body', text: item.summary }),
          el('div', { className: 'ai-topic-foot' }, [
            el('button', {
              type: 'button',
              className: 'btn btn-secondary btn-sm',
              text: isVideo ? '\u25B6 Watch Video \u2197' : 'Read Post \u2197',
              onClick: function () {
                if (isVideo) ctx.markMasteryStep('watch-guide');
                openExternalSafe(item.url);
              },
            }),
            item.tryPrompt
              ? el('button', {
                  type: 'button',
                  className: 'ai-sky-pill',
                  text: item.tryLabel || 'Try It \u2192',
                  onClick: function () {
                    ctx.markMasteryStep('run-skill');
                    ctx.dispatchPrompt(item.tryPrompt, item.title);
                  },
                })
              : el('span'),
          ]),
        ]);
      })
    );

    // Subscribe Banner modeled directly on Screenshot 1 ("Stay in sync with Google Antigravity")
    var savedSub = updates.subscription || {};
    if (Array.isArray(savedSub.topics) && savedSub.topics.length > 0 && selectedSubTopics.size === 1 && selectedSubTopics.has('all')) {
      selectedSubTopics = new Set(savedSub.topics);
    }

    var subPills = [
      { id: 'all', label: 'All Updates' },
      { id: 'app', label: 'Antigravity App' },
      { id: 'cli', label: 'Antigravity CLI' },
      { id: 'extensions', label: 'IDE Extensions' },
      { id: 'sdk', label: 'Antigravity SDK' },
    ];

    var emailInput = el('input', {
      type: 'email',
      placeholder: 'Enter your email address for Google Antigravity updates',
      value: savedSub.emailHint || '',
    });
    var termsCheck = el('input', {
      type: 'checkbox',
      checked: Boolean(savedSub.emailHint),
    });

    var subscribeCard = el('div', { className: 'agy-subscribe-card' }, [
      el('h3', { className: 'agy-subscribe-title', text: 'Stay in sync with Google Antigravity' }),
      el('p', {
        className: 'agy-subscribe-sub',
        text: 'Get the latest product updates, releases, feature drops, and 3–4 minute video walkthroughs.',
      }),
      el(
        'div',
        { className: 'agy-subscribe-pills' },
        subPills.map(function (sp) {
          var isSel = selectedSubTopics.has(sp.id);
          return el('button', {
            type: 'button',
            className: 'skill-chip' + (isSel ? ' active' : ''),
            text: (isSel ? '\u2713 ' : '') + sp.label,
            onClick: function () {
              if (sp.id === 'all') {
                selectedSubTopics = new Set(['all']);
              } else {
                selectedSubTopics.delete('all');
                if (selectedSubTopics.has(sp.id)) selectedSubTopics.delete(sp.id);
                else selectedSubTopics.add(sp.id);
                if (selectedSubTopics.size === 0) selectedSubTopics.add('all');
              }
              activeUpdateTopic = sp.id;
              ctx.rerender();
            },
          });
        })
      ),
      el('div', { className: 'agy-subscribe-form' }, [
        emailInput,
        el('button', {
          type: 'button',
          className: 'btn',
          text: 'Subscribe',
          onClick: async function () {
            if (!termsCheck.checked) {
              ctx.showToast('Please check the Terms & Privacy box to subscribe.');
              return;
            }
            await ctx.apiPost('/api/updates/prefs', {
              email: emailInput.value.trim(),
              topics: Array.from(selectedSubTopics),
            });
            await ctx.reloadState();
            ctx.showToast('Saved topic filters & opening official Google Antigravity Blog signup');
            openExternalSafe(updates.officialBlogUrl || 'https://antigravity.google/blog');
          },
        }),
      ]),
      el('div', { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } }, [
        el('label', { className: 'agy-subscribe-terms' }, [
          termsCheck,
          el('span', { text: 'I accept Google Terms & Privacy Policy. Unsubscribe anytime.' }),
        ]),
        el('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          text: '\u25B6 Subscribe to 3–4 Min Video Channel (@PeterFisher-gps-google) \u2197',
          onClick: async function () {
            await ctx.apiPost('/api/updates/prefs', { subscribedYoutube: true });
            openExternalSafe(updates.youtubeChannelUrl || 'https://www.youtube.com/@PeterFisher-gps-google');
          },
        }),
      ]),
    ]);

    var syncBtn = el('button', {
      type: 'button',
      className: 'btn btn-secondary btn-sm',
      id: 'btn-sync-rss',
      text: '\u21BB Check Latest Updates',
      onClick: async function () {
        syncBtn.textContent = 'Checking...';
        try {
          var res = await ctx.apiPost('/api/updates/sync', {});
          await ctx.reloadState();
          ctx.showToast(
            res.syncedLive
              ? 'Synced live updates from antigravity.google/blog'
              : 'Showing bundled updates snapshot (offline-safe)'
          );
        } catch (err) {
          ctx.showToast('Using offline updates snapshot');
        } finally {
          syncBtn.textContent = '\u21BB Check Latest Updates';
        }
      },
    });

    return el('div', { className: 'ai-topics-section', id: 'agy-updates-section' }, [
      el('div', { className: 'card-header', style: { marginBottom: '10px' } }, [
        el('p', {
          className: 'ai-section-label',
          style: { margin: '0' },
          text: 'What’s New in Antigravity & 3–4 Min Video Walkthroughs',
        }),
        syncBtn,
      ]),
      topicFilterRow,
      cardsGrid,
      subscribeCard,
    ]);
  }

  function buildTokenEconomicsView(ctx) {
    var el = ctx.el;
    var tm = (ctx.appState && ctx.appState.tokenEconomics) || null;
    if (!tm || !tm.spendingCap || !tm.windows) {
      return [
        el('div', { className: 'ai-inbox-wrap' }, [
          el('div', { className: 'card muted', text: 'Loading TokenEconomics telemetry...' }),
        ]),
      ];
    }

    var cap = tm.spendingCap;
    var w5 = tm.windows.last5h || {};
    var w24 = tm.windows.last24h || {};
    var w7 = tm.windows.last7d || {};
    var w30 = tm.windows.last30d || {};
    var orch = tm.orchestrationStats || {};

    var headRow = el('div', { className: 'ai-inbox-head' }, [
      el('h2', { className: 'ai-inbox-greeting' }, [
        'Manage your pooled quota ',
        ctx.makeAnimatedEmoji('1f48e', '\uD83D\uDC8E', 'Gem'),
        ' \u2014 ',
        el('span', { className: 'ai-blue-count', text: fmtUsd(cap.estSpend30dUsd) + ' of ' + fmtUsd(cap.capUsd) }),
        ' estimated (',
        el('span', { className: 'ai-blue-count', text: (w30.cacheHitPct || '0%') + ' cache hit' }),
        ').',
      ]),
      el('div', { className: 'ai-inbox-meta-actions' }, [
        el('button', {
          type: 'button',
          className: 'ai-sky-pill',
          text: 'Full HTML Report \u2192',
          onClick: function () {
            ctx.dispatchPrompt(
              '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.',
              '/token-usage'
            );
          },
        }),
        el('button', {
          type: 'button',
          className: 'ai-updated-pill',
          text: 'Recalculate \u21BB',
          onClick: function () {
            ctx.reloadState().then(function () {
              ctx.showToast('Recalculated local TokenEconomics telemetry');
            });
          },
        }),
      ]),
    ]);

    // Plan & Rate Profile Bar
    var planSelect = el(
      'select',
      { id: 'te-plan-select' },
      (tm.planTiers || []).map(function (pt) {
        var opt = el('option', { value: pt.id, text: pt.label });
        if (pt.id === cap.planTier) opt.selected = true;
        return opt;
      })
    );

    var customCapInput = el('input', {
      type: 'text',
      id: 'te-custom-cap',
      value: String((tm.prefs && tm.prefs.customCapUsd) || cap.capUsd || 50),
      placeholder: 'Custom $ cap',
      style: { width: '95px', display: cap.planTier === 'custom' ? 'inline-block' : 'none' },
    });

    planSelect.addEventListener('change', function () {
      customCapInput.style.display = planSelect.value === 'custom' ? 'inline-block' : 'none';
    });

    var rateSelect = el(
      'select',
      { id: 'te-rate-select' },
      (tm.rateProfiles || []).map(function (rp) {
        var opt = el('option', { value: rp.id, text: rp.label });
        if (rp.id === cap.rateProfile) opt.selected = true;
        return opt;
      })
    );

    var planCard = el('div', { className: 'card', style: { marginBottom: '16px' } }, [
      el('div', { className: 'card-header', style: { marginBottom: '8px' } }, [
        el('h3', { className: 'card-title', text: 'Subscription Plan & Spending Cap Estimator' }),
        el('span', {
          className: 'badge ' + (cap.includesPooledQuota ? 'badge-green' : 'badge-amber'),
          text: cap.includesPooledQuota
            ? '1P Pooled $ Quota Included'
            : '3P Pay-As-You-Go (Outside Pooled Quota)',
        }),
      ]),
      el('div', { className: 'form-row', style: { marginBottom: '8px', alignItems: 'center' } }, [
        planSelect,
        customCapInput,
        rateSelect,
        el('button', {
          type: 'button',
          className: 'btn btn-sm',
          id: 'btn-save-token-prefs',
          text: 'Save Cap Settings',
          onClick: async function () {
            await ctx.apiPost('/api/token-prefs', {
              planTier: planSelect.value,
              customCapUsd: Number(customCapInput.value) || 50,
              rateProfile: rateSelect.value,
            });
            ctx.markMasteryStep('check-tokens');
            await ctx.reloadState();
            ctx.showToast('Updated TokenEconomics plan & rate profile');
          },
        }),
      ]),
      el('div', { className: 'te-gauge-track' }, [
        el('div', {
          className: 'te-gauge-fill ' + (cap.status || 'green'),
          style: { width: Math.min(100, Math.max(2, cap.capUsedPct || 0)) + '%' },
        }),
      ]),
      el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '4px' } }, [
        el('span', {
          className: 'muted',
          text:
            'Estimated 30d Usage: ' +
            fmtUsd(cap.estSpend30dUsd) +
            ' (' +
            cap.capUsedPct +
            '% of ' +
            fmtUsd(cap.capUsd) +
            ')',
        }),
        el('span', {
          className: 'muted',
          text: 'Remaining Headroom: ' + fmtUsd(cap.remainingUsd) + ' \u00B7 30d Pace: ' + fmtUsd(cap.projected30dUsd),
        }),
      ]),
    ]);

    // 4 KPI Cards
    var kpiGrid = el('div', { className: 'te-kpi-grid' }, [
      el('div', { className: 'te-kpi-card' }, [
        el('span', { className: 'te-kpi-label', text: '30-Day Est. Spend vs Cap' }),
        el('span', { className: 'te-kpi-value', text: fmtUsd(cap.estSpend30dUsd) }),
        el('span', { className: 'te-kpi-sub', text: 'of ' + fmtUsd(cap.capUsd) + ' cap \u00B7 ' + (w30.turns || 0) + ' turns' }),
      ]),
      el('div', { className: 'te-kpi-card' }, [
        el('span', { className: 'te-kpi-label', text: 'Prompt Cache Savings (30d)' }),
        el('span', { className: 'te-kpi-value', text: fmtUsd(cap.cacheSaved30dUsd) }),
        el('span', { className: 'te-kpi-sub', text: (w30.cacheHitPct || '0%') + ' cache hit (' + fmtTok(w30.cacheReadTokens) + ' read)' }),
      ]),
      el('div', { className: 'te-kpi-card' }, [
        el('span', { className: 'te-kpi-label', text: '5-Hour Burst Window' }),
        el('span', { className: 'te-kpi-value', text: fmtTok(w5.totalTokens) }),
        el('span', {
          className: 'te-kpi-sub',
          text: fmtTok(w5.inputTokens) + ' in \u00B7 ' + fmtTok(w5.outputTokens) + ' out \u00B7 ' + fmtTok(w5.thinkingTokens) + ' think',
        }),
      ]),
      el('div', { className: 'te-kpi-card' }, [
        el('span', { className: 'te-kpi-label', text: 'Delegation & Context Hygiene' }),
        el('span', {
          className: 'te-kpi-value',
          text: (orch.subagentCalls || 0) + (orch.workflowCalls || 0) + ' delegated',
        }),
        el('span', {
          className: 'te-kpi-sub',
          text:
            (orch.subagentCalls || 0) +
            ' subagents \u00B7 ' +
            (orch.workflowCalls || 0) +
            ' workflows \u00B7 ' +
            (orch.highContextConvs || 0) +
            ' heavy threads (>160k)',
        }),
      ]),
    ]);

    // Personalized Optimization Coach
    var coachStack = el(
      'div',
      { className: 'ai-todos-stack', style: { marginBottom: '18px' } },
      (tm.suggestions || []).map(function (sg) {
        var badgeCls = sg.severity === 'red' ? 'badge-red' : sg.severity === 'amber' ? 'badge-amber' : 'badge-green';
        return el('div', { className: 'ai-todo-row' }, [
          el('div', { className: 'ai-todo-main' }, [
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' } }, [
              el('span', { className: 'badge ' + badgeCls, text: sg.badge }),
              el('p', { className: 'ai-todo-title', style: { margin: '0' }, text: sg.title }),
            ]),
            el('p', { className: 'ai-todo-desc', text: sg.detail }),
          ]),
          el('div', { className: 'ai-todo-actions' }, [
            el('button', {
              type: 'button',
              className: 'ai-sky-pill',
              text: sg.actionLabel || 'Apply \u2192',
              onClick: function () {
                ctx.dispatchPrompt(sg.prompt, sg.title);
              },
            }),
          ]),
        ]);
      })
    );

    // Windows Table + Daily SVG Chart side-by-side
    var winTable = el('div', { className: 'card', style: { marginBottom: '0' } }, [
      el('div', { className: 'card-header' }, [
        el('h3', { className: 'card-title', text: 'Rolling Quota Windows' }),
        el('span', { className: 'muted', text: 'Local transcript telemetry' }),
      ]),
      el('div', { className: 'table-wrap' }, [
        el('table', null, [
          el('thead', null, [
            el('tr', null, [
              el('th', { text: 'Window' }),
              el('th', { text: 'Uncached In' }),
              el('th', { text: 'Cached' }),
              el('th', { text: 'Out + Think' }),
              el('th', { text: 'Est. $' }),
            ]),
          ]),
          el(
            'tbody',
            null,
            [
              ['Last 5h (Burst)', w5],
              ['Last 24h (Daily)', w24],
              ['Last 7d (Weekly)', w7],
              ['Last 30d (Billing)', w30],
            ].map(function (row) {
              var w = row[1] || {};
              return el('tr', null, [
                el('td', { text: row[0] }),
                el('td', { text: fmtTok(w.inputTokens) }),
                el('td', { text: fmtTok(w.cacheReadTokens) + ' (' + (w.cacheHitPct || '0%') + ')' }),
                el('td', { text: fmtTok((w.outputTokens || 0) + (w.thinkingTokens || 0)) }),
                el('td', { text: fmtUsd(w.estUsd) }),
              ]);
            })
          ),
        ]),
      ]),
    ]);

    var twoCol = el('div', { className: 'te-two-col' }, [
      buildDailySvgChart(el, tm.dailySeries),
      winTable,
    ]);

    // Top Token-Consuming Conversations
    var topConvs = tm.topRecentConversations || [];
    var convsCard =
      topConvs.length > 0
        ? el('div', { className: 'card' }, [
            el('div', { className: 'card-header' }, [
              el('h3', { className: 'card-title', text: 'Highest-Burn Recent Conversations (30d)' }),
              el('span', { className: 'muted', text: 'Threads >160k peak context benefit most from /compact' }),
            ]),
            el('div', { className: 'table-wrap' }, [
              el('table', null, [
                el('thead', null, [
                  el('tr', null, [
                    el('th', { text: 'Conversation' }),
                    el('th', { text: 'Turns' }),
                    el('th', { text: 'Peak Context' }),
                    el('th', { text: 'Cache Hit' }),
                    el('th', { text: 'Est. $' }),
                  ]),
                ]),
                el(
                  'tbody',
                  null,
                  topConvs.map(function (c) {
                    var heavy = (c.peakContextTokens || 0) >= 160000;
                    return el('tr', null, [
                      el('td', { text: c.preview }),
                      el('td', { text: String(c.turns || 0) }),
                      el('td', null, [
                        document.createTextNode(fmtTok(c.peakContextTokens) + ' '),
                        heavy ? el('span', { className: 'badge badge-amber', text: '/compact' }) : null,
                      ]),
                      el('td', { text: c.cacheHitPct || '0%' }),
                      el('td', { text: fmtUsd(c.estUsd) }),
                    ]);
                  })
                ),
              ]),
            ]),
          ])
        : null;

    // Spend-Smart Playbook: Orchestrator vs Workflows vs Swarm vs 3P Claude
    var playbookCards = [
      {
        badge: 'Lowest Burn · Save 50–65%',
        badgeCls: 'badge-green',
        title: '1. Orchestrator (Argon/Neon Planner + Hydrogen)',
        body:
          'Default choice for multi-step work. A frontier Gemini 4 model plans the architecture once, while fast Hydrogen workers run iterative file reads, edits, and tests at a fraction of frontier token cost.',
        actionLabel: 'Run Orchestrator Guide \u2192',
        prompt:
          '/orchestrator-guide Show me how to select Orchestrator (Argon or Neon) and structure my next multi-step task so Hydrogen handles execution loops.',
      },
      {
        badge: 'Zero Thinking Waste',
        badgeCls: 'badge-blue',
        title: '2. Deterministic Workflows (Scripts + Pipelines)',
        body:
          'Never burn LLM thinking tokens on math, CSV/SQL transforms, or 50-file regex checks. Offload structured fan-out and validation to deterministic scripts or run_workflow stages.',
        actionLabel: 'Build a Workflow \u2192',
        prompt:
          'Help me convert a repetitive multi-file audit or data check into a deterministic workflow script so it runs in seconds with minimal token burn.',
      },
      {
        badge: 'Targeted vs High-Burn',
        badgeCls: 'badge-amber',
        title: '3. Stateless Subagents vs Full /swarm',
        body:
          'Spawning 1–4 focused subagents (/swarm-prep) SAVES parent tokens by keeping large file reads out of your main context window. Reserve full multi-agent board /swarm only for major parallel builds.',
        actionLabel: 'Run 4-Agent /swarm-prep \u2192',
        prompt:
          '/swarm-prep Run a 4-agent parallel 360 prep pack for my top active initiative while keeping my main conversation context compact.',
      },
      {
        badge: 'PayGo Outside Quota',
        badgeCls: 'badge-neutral',
        title: '4. 1P Pooled Quota vs 3P Claude 5.5 Pass-2 Review',
        body:
          '1P Gemini 4, Antigravity, and Notebook draw from your included pooled $ quota. Opt-in 3P Anthropic Claude bills Pay-As-You-Go at list price—use Gemini/Orchestrator for Pass 1 and Claude for Pass-2 review.',
        actionLabel: 'Dual-Model Playbook \u2192',
        prompt:
          '/model-guide Give me a 2-Pass Dual-Model workflow (Pass 1 on Orchestrator inside pooled quota, Pass 2 surgical review on Claude Sonnet/Opus).',
      },
    ];

    var playbookSection = el('div', { className: 'ai-topics-section' }, [
      el('p', {
        className: 'ai-section-label',
        text: 'Best Practices: Managing Spend Across Orchestrator, Workflows & Swarm',
      }),
      el(
        'div',
        { className: 'ai-topics-grid' },
        playbookCards.map(function (pc) {
          return el('div', { className: 'ai-topic-card' }, [
            el('div', { className: 'ai-topic-top' }, [
              el('span', { className: 'badge ' + pc.badgeCls, text: pc.badge }),
              el('button', {
                type: 'button',
                className: 'ai-sky-pill',
                text: pc.actionLabel,
                onClick: function () {
                  ctx.dispatchPrompt(pc.prompt, pc.title);
                },
              }),
            ]),
            el('h4', { className: 'ai-topic-title', text: pc.title }),
            el('p', { className: 'ai-topic-body', text: pc.body }),
          ]);
        })
      ),
    ]);

    return [
      el('div', { className: 'ai-inbox-wrap' }, [
        headRow,
        planCard,
        kpiGrid,
        el('p', { className: 'ai-section-label', text: 'Personalized Optimization Suggestions' }),
        coachStack,
        twoCol,
        convsCard,
        el('div', { className: 'ai-wave-sep' }, [ctx.makeWaveSvg()]),
        playbookSection,
      ]),
    ];
  }

  window.AGYTokenAndUpdatesUI = {
    wrapPromptForOrchestrator: wrapPromptForOrchestrator,
    buildMasteryOnboardingBar: buildMasteryOnboardingBar,
    buildOverviewSpendMiniStrip: buildOverviewSpendMiniStrip,
    buildUpdatesAndSubscribeSection: buildUpdatesAndSubscribeSection,
    buildTokenEconomicsView: buildTokenEconomicsView,
  };
})();
