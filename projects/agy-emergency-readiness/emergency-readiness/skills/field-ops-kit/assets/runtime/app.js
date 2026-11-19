(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k === 'className') {
          node.className = String(v);
        } else if (k === 'text') {
          node.textContent = String(v);
        } else if (k === 'checked') {
          node.checked = Boolean(v);
        } else if (k === 'hidden') {
          node.hidden = Boolean(v);
        } else if (k === 'value') {
          node.value = String(v);
        } else if (k.indexOf('on') === 0 && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else {
          node.setAttribute(k, v === true ? '' : String(v));
        }
      }
    }
    if (Array.isArray(children)) {
      for (var j = 0; j < children.length; j++) {
        var child = children[j];
        if (child === null || child === undefined || child === false) continue;
        if (typeof child === 'string' || typeof child === 'number') {
          node.appendChild(document.createTextNode(String(child)));
        } else {
          node.appendChild(child);
        }
      }
    }
    return node;
  }

  function svgEl(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = attrs[k];
        if (v !== undefined && v !== null) {
          node.setAttribute(k, String(v));
        }
      }
    }
    if (Array.isArray(children)) {
      for (var j = 0; j < children.length; j++) {
        if (children[j]) node.appendChild(children[j]);
      }
    }
    return node;
  }

  function formatUsd(amount) {
    var num = Number(amount) || 0;
    return '$' + num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatTons(tons) {
    var num = Number(tons) || 0;
    return num.toFixed(2) + ' t';
  }

  function showToast(message) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var toast = el('div', { className: 'toast-msg', text: message });
    region.appendChild(toast);
    window.setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 2800);
  }

  function openModal(titleText, bodyNodes, footerNodes) {
    var backdrop = document.getElementById('modal-backdrop');
    var titleNode = document.getElementById('modal-title');
    var body = document.getElementById('modal-body');
    var footer = document.getElementById('modal-footer');
    if (!backdrop || !titleNode || !body || !footer) return;
    titleNode.textContent = titleText;
    body.replaceChildren();
    footer.replaceChildren();
    for (var i = 0; i < bodyNodes.length; i++) {
      if (bodyNodes[i]) body.appendChild(bodyNodes[i]);
    }
    for (var j = 0; j < footerNodes.length; j++) {
      if (footerNodes[j]) footer.appendChild(footerNodes[j]);
    }
    backdrop.hidden = false;
  }

  function closeModal() {
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.hidden = true;
  }

  function copyTextSafe(textToCopy, labelForToast, triggerBtn) {
    var markCopied = function () {
      showToast(labelForToast || 'Copied to clipboard.');
      if (triggerBtn) {
        var orig = triggerBtn.textContent;
        triggerBtn.classList.add('is-copied');
        triggerBtn.textContent = 'Copied!';
        window.setTimeout(function () {
          triggerBtn.classList.remove('is-copied');
          triggerBtn.textContent = orig;
        }, 1600);
      }
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(textToCopy).then(markCopied).catch(function () {
        showCopyFallbackModal(textToCopy, labelForToast);
      });
    } else {
      showCopyFallbackModal(textToCopy, labelForToast);
    }
  }

  function showCopyFallbackModal(textToCopy, titleHint) {
    var area = el('textarea', {
      className: 'input-text',
      rows: '14',
      readonly: 'readonly',
      value: textToCopy
    });
    area.setAttribute('aria-label', 'Copyable plain-language operational text');
    openModal(
      titleHint || 'Copy Operational Checklist',
      [
        el('p', {
          text: 'Select and copy the plain-language text below for county operational packets:'
        }),
        area
      ],
      [
        el('button', {
          type: 'button',
          className: 'btn btn-navy',
          text: 'Done',
          onClick: closeModal
        })
      ]
    );
    area.focus();
    area.select();
  }

  function downloadJsonFile(filename, dataObj) {
    var safeName = String(filename || 'export.json').replace(/[^a-zA-Z0-9._-]/g, '-');
    var jsonText = JSON.stringify(dataObj, null, 2);
    var blob = new Blob([jsonText], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: safeName });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    showToast('Downloaded ' + safeName);
  }

  function loadKitPayload() {
    var scriptNode = document.getElementById('ops-kit-data');
    if (!scriptNode) return null;
    var raw = (scriptNode.textContent || '').trim();
    if (!raw || raw.indexOf('__OPS_KIT_JSON_PAYLOAD__') !== -1) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return null;
    }
  }

  function evaluateForensicLoad(row, params, maxTransitWindowMin) {
    var minPhysical = Number(params.minPhysicalTransitMin) || 32;
    var minTurnaround = Number(params.minRoundTripTurnaroundMin) || 72;
    var maxTareDiff = Number(params.maxTareVarianceTons) || 0.35;
    var fleetCap = Number(params.certifiedFleetLimit) || 5;
    var maxTonDiff = Number(params.maxBilledVsScaleVarianceTons) || 0.05;

    var c1FloorOk = row.loadedTransitMin >= minPhysical;
    var c1CapOk = row.loadedTransitMin <= maxTransitWindowMin;
    var check1Pass = c1FloorOk && c1CapOk;
    var check2Pass = row.roundTripTurnaroundMin >= minTurnaround;
    var tareDiff = Math.abs(row.emptyTareTons - row.registeredTareTons);
    var check3Pass = tareDiff <= maxTareDiff;
    var check4Pass = row.activeFleetCount <= fleetCap;
    var tonDiff = Math.abs(row.billedTons - row.netTonsWeighed);
    var check5Pass = !row.isDuplicateTicket && tonDiff <= maxTonDiff;
    var check6Pass = Boolean(row.photoContinuityOk) && row.gatePhotoHash !== 'MISSING_GATE_FRAME';

    var reasons = [];
    if (!c1FloorOk) {
      reasons.push('IMPOSSIBLE ' + row.loadedTransitMin + 'm TRANSIT (<' + minPhysical + 'm FLOOR)');
    } else if (!c1CapOk) {
      reasons.push('EXCEEDS ' + maxTransitWindowMin + 'm MAX TRANSIT (' + row.loadedTransitMin + 'm)');
    }
    if (!check2Pass) {
      reasons.push(row.roundTripTurnaroundMin + 'm TURNAROUND (<' + minTurnaround + 'm)');
    }
    if (!check3Pass) {
      var sign = row.emptyTareTons >= row.registeredTareTons ? '+' : '-';
      reasons.push(sign + tareDiff.toFixed(1) + 't TARE SWAP MISMATCH');
    }
    if (!check4Pass) {
      reasons.push('UNCERTIFIED #' + row.activeFleetCount + ' FLEET CHASSIS');
    }
    if (!check5Pass) {
      if (row.isDuplicateTicket) {
        reasons.push('DUPLICATE TICKET (' + row.scaleTicketId + ')');
      } else {
        reasons.push('BILLED VS SCALE MISMATCH');
      }
    }
    if (!check6Pass) {
      reasons.push('MISSING GATE CAMERA PHOTO');
    }

    var allPass = check1Pass && check2Pass && check3Pass && check4Pass && check5Pass && check6Pass;
    return {
      row: row,
      verified: allPass,
      checks: [check1Pass, check2Pass, check3Pass, check4Pass, check5Pass, check6Pass],
      tareDiff: tareDiff,
      reasons: reasons
    };
  }

  function severityBadgeClass(sev) {
    var upper = String(sev || '').toUpperCase();
    if (upper === 'CRITICAL') return 'badge badge-critical';
    if (upper === 'HIGH') return 'badge badge-high';
    return 'badge badge-moderate';
  }

  function initApp(data) {
    var titleEl = document.getElementById('kit-title');
    var subEl = document.getElementById('kit-subtitle');
    if (titleEl && data.title) titleEl.textContent = data.title;
    if (subEl && data.subtitle) subEl.textContent = data.subtitle;

    var defaultCheckedMap = {};
    for (var p = 0; p < data.selfCheckPillars.length; p++) {
      var qs = data.selfCheckPillars[p].questions;
      for (var q = 0; q < qs.length; q++) {
        defaultCheckedMap[qs[q].id] = Boolean(qs[q].defaultChecked);
      }
    }

    var defaultCounty = 'Kanawha';
    var hasKanawha = data.regionalCrosswalk.counties.some(function (c) {
      return c.county === 'Kanawha';
    });
    if (!hasKanawha && data.regionalCrosswalk.counties.length > 0) {
      defaultCounty = data.regionalCrosswalk.counties[0].county;
    }

    var state = {
      activeView: 'binder',
      binderTabId: data.binderTabs[0].id,
      binderSearch: '',
      selectedCounty: data.defaultCounty || defaultCounty,
      checkedQuestions: Object.assign({}, defaultCheckedMap),
      maxTransitMin: Number(data.forensicCrosswalk.parameters.defaultMaxTransitMin) || 55,
      forensicFilter: 'ALL',
      showJustificationMemo: false,
      regionalChip: 'ALL',
      regionalDoh: 'ALL',
      regionalTroop: 'ALL',
      regionalSearch: ''
    };

    var printBtn = document.getElementById('btn-print-kit');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        window.print();
      });
    }

    var closeBtn = document.getElementById('btn-close-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    var backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', function (ev) {
        if (ev.target === backdrop) closeModal();
      });
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeModal();
    });

    function switchPrimaryView(viewName) {
      state.activeView = viewName;
      var views = ['binder', 'selfcheck', 'forensic', 'regional'];
      for (var i = 0; i < views.length; i++) {
        var v = views[i];
        var btn = document.getElementById('tab-btn-' + v);
        var panel = document.getElementById('panel-' + v);
        var active = v === viewName;
        if (btn) {
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        if (panel) {
          panel.classList.toggle('is-active', active);
          panel.hidden = !active;
        }
      }
    }

    var tabIds = ['binder', 'selfcheck', 'forensic', 'regional'];
    tabIds.forEach(function (v) {
      var btn = document.getElementById('tab-btn-' + v);
      if (btn) {
        btn.addEventListener('click', function () {
          switchPrimaryView(v);
        });
      }
    });

    function updateHeaderBadges() {
      var totalTools = 0;
      for (var i = 0; i < data.binderTabs.length; i++) {
        totalTools += data.binderTabs[i].tools.length;
      }
      var bBinder = document.getElementById('badge-binder-count');
      if (bBinder) bBinder.textContent = totalTools + ' Tools';

      var totalQ = 0;
      var checkedQ = 0;
      for (var pIdx = 0; pIdx < data.selfCheckPillars.length; pIdx++) {
        var pQs = data.selfCheckPillars[pIdx].questions;
        for (var qIdx = 0; qIdx < pQs.length; qIdx++) {
          totalQ++;
          if (state.checkedQuestions[pQs[qIdx].id]) checkedQ++;
        }
      }
      var pct = totalQ > 0 ? Math.round((checkedQ / totalQ) * 100) : 0;
      var bSelf = document.getElementById('badge-selfcheck-score');
      if (bSelf) bSelf.textContent = pct + '% Ready';

      var verifiedCount = 0;
      var loads = data.forensicCrosswalk.loads;
      for (var l = 0; l < loads.length; l++) {
        var res = evaluateForensicLoad(loads[l], data.forensicCrosswalk.parameters, state.maxTransitMin);
        if (res.verified) verifiedCount++;
      }
      var bFor = document.getElementById('badge-forensic-summary');
      if (bFor) bFor.textContent = verifiedCount + '/' + loads.length + ' Verified';

      var bReg = document.getElementById('badge-regional-count');
      if (bReg) bReg.textContent = data.regionalCrosswalk.counties.length + ' Counties';
    }

    /* ==================== MODULE 1: 7-TAB BINDER ==================== */
    function renderBinderView() {
      var panel = document.getElementById('panel-binder');
      if (!panel) return;
      panel.replaceChildren();

      var searchInput = el('input', {
        type: 'search',
        className: 'input-text',
        placeholder: 'Search 24 tools, CFR, T&M, ROE, UN1017...',
        value: state.binderSearch,
        'aria-label': 'Search all 24 disaster timeline operational tools'
      });

      var clearBtn = el('button', {
        type: 'button',
        className: 'btn btn-sm btn-ghost',
        text: 'Clear',
        onClick: function () {
          state.binderSearch = '';
          searchInput.value = '';
          renderBinderRightPane(rightCol, navListContainer);
        }
      });

      var navListContainer = el('div', { className: 'binder-nav-list' });
      var rightCol = el('div', { className: 'binder-content-col' });

      searchInput.addEventListener('input', function () {
        state.binderSearch = searchInput.value;
        renderBinderRightPane(rightCol, navListContainer);
      });

      var ergItems = (data.regionalCrosswalk.erg2024 || []).map(function (item) {
        return el('div', {
          className: 'erg-quick-item',
          text: item.un + ' ' + item.material + ' (Guide ' + item.guide + '): Small ' + item.smallIsolationFt + ' ft · Large ' + item.largeIsolationFt + ' ft (' + item.largeDownwindNightMi + ' mi night)'
        });
      });

      var sidebar = el('aside', { className: 'binder-sidebar' }, [
        el('div', { className: 'binder-search-box' }, [
          el('label', { className: 'binder-search-label', text: 'Search 7-Tab Operational Binder' }),
          el('div', { className: 'binder-search-row' }, [searchInput, clearBtn])
        ]),
        navListContainer,
        el('div', { className: 'erg-quick-box' }, [
          el('h3', { className: 'erg-quick-title', text: 'PHMSA ERG 2024 Quick Isolation' })
        ].concat(ergItems))
      ]);

      var layout = el('div', { className: 'binder-layout' }, [sidebar, rightCol]);
      panel.appendChild(layout);
      renderBinderRightPane(rightCol, navListContainer);
    }

    function toolMatchesQuery(tool, tab, qLower) {
      if (!qLower) return true;
      var haystack = [
        tool.id,
        tool.title,
        tool.category,
        tool.cite,
        tool.summary,
        tool.trapWarning,
        tool.endnote,
        tab.title,
        (tool.steps || []).join(' '),
        (tool.copyChecklist || []).join(' ')
      ].join(' ').toLowerCase();
      return haystack.indexOf(qLower) !== -1;
    }

    function buildFormattedToolChecklist(tool, tabTitle) {
      var lines = [
        '====================================================================',
        tool.id + ' — ' + tool.title,
        'Phase: ' + tabTitle,
        'Statutory Authority: ' + tool.cite,
        '====================================================================',
        'DEOBLIGATION TRAP TO AVOID:',
        '  ' + tool.trapWarning,
        '',
        'FIELD EXECUTION CHECKLIST:'
      ];
      var items = tool.copyChecklist || [];
      for (var i = 0; i < items.length; i++) {
        lines.push('  ' + items[i]);
      }
      lines.push('');
      lines.push(tool.endnote);
      return lines.join('\n');
    }

    function renderBinderRightPane(rightCol, navListContainer) {
      var qLower = (state.binderSearch || '').trim().toLowerCase();
      navListContainer.replaceChildren();

      data.binderTabs.forEach(function (tab) {
        var matchCount = tab.tools.filter(function (t) {
          return toolMatchesQuery(t, tab, qLower);
        }).length;
        var isActive = !qLower && state.binderTabId === tab.id;
        var btn = el('button', {
          type: 'button',
          className: 'binder-tab-btn' + (isActive ? ' is-active' : ''),
          onClick: function () {
            state.binderTabId = tab.id;
            state.binderSearch = '';
            renderBinderView();
          }
        }, [
          el('div', { className: 'binder-tab-top' }, [
            el('span', { className: 'binder-tab-code', text: tab.shortCode + ' · ' + tab.phaseWindow }),
            el('span', { className: 'binder-tab-count', text: qLower ? (matchCount + ' hit' + (matchCount === 1 ? '' : 's')) : (tab.tools.length + ' tools') })
          ]),
          el('div', { className: 'binder-tab-title', text: tab.title })
        ]);
        navListContainer.appendChild(btn);
      });

      rightCol.replaceChildren();

      var activeTab = data.binderTabs.find(function (t) {
        return t.id === state.binderTabId;
      }) || data.binderTabs[0];

      var toolsToRender = [];
      if (qLower) {
        data.binderTabs.forEach(function (tab) {
          tab.tools.forEach(function (tool) {
            if (toolMatchesQuery(tool, tab, qLower)) {
              toolsToRender.push({ tab: tab, tool: tool });
            }
          });
        });
        rightCol.appendChild(el('div', { className: 'binder-phase-banner' }, [
          el('div', { className: 'binder-phase-meta', text: 'CROSS-BINDER SEARCH RESULTS' }),
          el('h2', { className: 'binder-phase-heading', text: toolsToRender.length + ' Operational Tool(s) Matching "' + state.binderSearch.trim() + '"' }),
          el('p', { className: 'binder-phase-desc', text: 'Click Clear or choose any tab on the left to return to chronological disaster timeline browsing.' })
        ]));
      } else {
        activeTab.tools.forEach(function (tool) {
          toolsToRender.push({ tab: activeTab, tool: tool });
        });
        rightCol.appendChild(el('div', { className: 'binder-phase-banner' }, [
          el('div', { className: 'binder-phase-meta', text: activeTab.shortCode + ' · ' + activeTab.phaseWindow }),
          el('h2', { className: 'binder-phase-heading', text: activeTab.title }),
          el('p', { className: 'binder-phase-desc', text: activeTab.summary })
        ]));
      }

      var stack = el('div', { className: 'tool-cards-stack' });
      if (toolsToRender.length === 0) {
        stack.appendChild(el('div', { className: 'tool-card' }, [
          el('h3', { className: 'tool-card-title', text: 'No matching binder tools found' }),
          el('p', { className: 'tool-card-summary', text: 'Try searching for terms such as "70-hour", "SAM.gov", "piggyback", "33 CFR 208", "UN1017", or "ROE".' })
        ]));
      } else {
        toolsToRender.forEach(function (entry) {
          var tool = entry.tool;
          var tab = entry.tab;
          var copyText = buildFormattedToolChecklist(tool, tab.title);
          var copyBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-navy',
            text: 'Copy Template Checklist',
            onClick: function () {
              copyTextSafe(copyText, 'Copied ' + tool.id + ' template checklist.', copyBtn);
            }
          });

          var stepsOl = el('ol', { className: 'tool-steps-list' }, (tool.steps || []).map(function (st) {
            return el('li', { text: st });
          }));

          var card = el('article', { className: 'tool-card' }, [
            el('div', { className: 'tool-card-header' }, [
              el('div', { className: 'tool-card-badges' }, [
                el('span', { className: 'tool-id-pill', text: tool.id }),
                el('span', { className: severityBadgeClass(tool.riskLevel), text: tool.riskLevel + ' GATE' }),
                el('span', { className: 'badge badge-moderate', text: tool.category }),
                el('span', { className: 'badge badge-cite', text: tool.cite })
              ]),
              copyBtn
            ]),
            el('h3', { className: 'tool-card-title', text: tool.title }),
            el('p', { className: 'tool-card-summary', text: tool.summary }),
            el('div', { className: 'trap-callout' }, [
              el('span', { className: 'trap-callout-label', text: 'Deobligation Trap:' }),
              el('span', { text: tool.trapWarning })
            ]),
            stepsOl,
            el('div', {
              className: 'tool-checklist-preview',
              text: (tool.copyChecklist || []).join('\n')
            }),
            el('div', { className: 'tool-endnote', text: tool.endnote })
          ]);
          stack.appendChild(card);
        });
      }
      rightCol.appendChild(stack);
    }

    /* ==================== MODULE 2: 25-QUESTION COUNTY SELF-CHECK ==================== */
    function computeSelfCheckSummary() {
      var total = 0;
      var checked = 0;
      var openGaps = [];
      var criticalOpen = 0;

      data.selfCheckPillars.forEach(function (pillar) {
        pillar.questions.forEach(function (q) {
          total++;
          if (state.checkedQuestions[q.id]) {
            checked++;
          } else {
            if (q.severity === 'CRITICAL') criticalOpen++;
            openGaps.push({
              pillarTitle: pillar.title,
              question: q
            });
          }
        });
      });

      var rankMap = { CRITICAL: 1, HIGH: 2, MODERATE: 3 };
      openGaps.sort(function (a, b) {
        var ra = rankMap[a.question.severity] || 9;
        var rb = rankMap[b.question.severity] || 9;
        if (ra !== rb) return ra - rb;
        return a.question.id.localeCompare(b.question.id);
      });

      var pct = total > 0 ? Math.round((checked / total) * 100) : 0;
      var riskLabel = '';
      var riskBadgeClass = '';
      if (pct >= 88 && criticalOpen === 0) {
        riskLabel = 'AUDIT-DEFENSIBLE READY (LOW RISK)';
        riskBadgeClass = 'badge badge-verified';
      } else if (pct >= 68 && criticalOpen <= 2) {
        riskLabel = 'MODERATE EXPOSURE — TARGETED GAPS';
        riskBadgeClass = 'badge badge-high';
      } else if (pct >= 44) {
        riskLabel = 'ELEVATED DEOBLIGATION RISK (' + criticalOpen + ' CRITICAL GAPS)';
        riskBadgeClass = 'badge badge-critical';
      } else {
        riskLabel = 'HIGH CLAWBACK / DISALLOWANCE EXPOSURE';
        riskBadgeClass = 'badge badge-critical';
      }

      return {
        total: total,
        checked: checked,
        pct: pct,
        criticalOpen: criticalOpen,
        openGaps: openGaps,
        riskLabel: riskLabel,
        riskBadgeClass: riskBadgeClass
      };
    }

    function renderSelfCheckView() {
      var panel = document.getElementById('panel-selfcheck');
      if (!panel) return;
      panel.replaceChildren();
      updateHeaderBadges();

      var summary = computeSelfCheckSummary();
      var countyObj = data.regionalCrosswalk.counties.find(function (c) {
        return c.county === state.selectedCounty;
      }) || data.regionalCrosswalk.counties[0];

      var countySelect = el('select', {
        className: 'select-box',
        'aria-label': 'Select West Virginia County for Readiness Self-Check',
        onChange: function (ev) {
          state.selectedCounty = ev.target.value;
          renderSelfCheckView();
        }
      }, data.regionalCrosswalk.counties.map(function (c) {
        var opt = el('option', {
          value: c.county,
          text: c.county + ' County (Seat: ' + c.seat + ' · ' + c.wvemdArea + ')'
        });
        if (c.county === state.selectedCounty) opt.selected = true;
        return opt;
      }));

      var radius = 23;
      var circumference = Number((2 * Math.PI * radius).toFixed(2));
      var dashOffset = Number((circumference * (1 - summary.pct / 100)).toFixed(2));
      var ringColor = summary.pct >= 88 && summary.criticalOpen === 0 ? '#0F6E4B' : (summary.pct >= 68 ? '#D5A245' : '#A32029');

      var gaugeSvg = svgEl('svg', { viewBox: '0 0 58 58', width: '58', height: '58', 'aria-hidden': 'true' }, [
        svgEl('circle', { cx: '29', cy: '29', r: String(radius), fill: 'none', stroke: '#D5DEE8', 'stroke-width': '6' }),
        svgEl('circle', {
          cx: '29',
          cy: '29',
          r: String(radius),
          fill: 'none',
          stroke: ringColor,
          'stroke-width': '6',
          'stroke-linecap': 'round',
          'stroke-dasharray': String(circumference),
          'stroke-dashoffset': String(dashOffset),
          transform: 'rotate(-90 29 29)'
        })
      ]);

      var topBar = el('div', { className: 'selfcheck-top-bar' }, [
        el('div', { className: 'county-picker-block' }, [
          el('label', { className: 'field-label', text: 'Selected WV Jurisdiction (All 55 Counties)' }),
          countySelect,
          el('div', { className: 'county-meta-tags' }, [
            el('span', { className: 'badge badge-moderate', text: 'USACE: ' + countyObj.usaceDistrict }),
            el('span', { className: 'badge badge-moderate', text: 'WVDOH: ' + countyObj.wvdohDistrict }),
            el('span', { className: 'badge badge-moderate', text: 'WVSP: ' + countyObj.wvspTroop + ' · ' + countyObj.rpdc }),
            el('span', { className: 'badge badge-cite', text: countyObj.legacyFloodWorks + ' County Flood Reaches (' + countyObj.riverBasin + ')' })
          ])
        ]),
        el('div', { className: 'score-gauge-block' }, [
          gaugeSvg,
          el('div', {}, [
            el('div', { className: 'score-readout-num', text: summary.pct + '% (' + summary.checked + '/' + summary.total + ')' }),
            el('div', { className: summary.riskBadgeClass, text: summary.riskLabel })
          ])
        ]),
        el('div', { className: 'selfcheck-actions-col' }, [
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: 'Mark All 25 Ready',
            onClick: function () {
              data.selfCheckPillars.forEach(function (pl) {
                pl.questions.forEach(function (q) {
                  state.checkedQuestions[q.id] = true;
                });
              });
              renderSelfCheckView();
            }
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: 'Reset Baseline',
            onClick: function () {
              state.checkedQuestions = Object.assign({}, defaultCheckedMap);
              renderSelfCheckView();
            }
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-ghost',
            text: 'Clear All',
            onClick: function () {
              state.checkedQuestions = {};
              renderSelfCheckView();
            }
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-gold',
            text: 'Export County Assessment (.json)',
            onClick: function () {
              var exportPayload = {
                exportedAtIso: new Date().toISOString(),
                county: countyObj,
                readinessPercent: summary.pct,
                verifiedControlsCount: summary.checked,
                totalControlsCount: summary.total,
                femaDeobligationRiskStatus: summary.riskLabel,
                prioritizedActionPlan: summary.openGaps.map(function (g, idx) {
                  return {
                    priorityRank: idx + 1,
                    id: g.question.id,
                    severity: g.question.severity,
                    pillar: g.pillarTitle,
                    owner: g.question.owner,
                    citation: g.question.cite,
                    remediationAction: g.question.actionItem
                  };
                }),
                controlResponses: state.checkedQuestions
              };
              downloadJsonFile(countyObj.county.toLowerCase() + '-county-fema-readiness.json', exportPayload);
            }
          }),
          el('button', {
            type: 'button',
            className: 'btn btn-sm btn-navy',
            text: 'Print',
            onClick: function () {
              window.print();
            }
          })
        ])
      ]);

      var pillarsCol = el('div', { className: 'pillars-col' });
      data.selfCheckPillars.forEach(function (pillar) {
        var pillarDone = pillar.questions.filter(function (q) {
          return Boolean(state.checkedQuestions[q.id]);
        }).length;

        var rows = pillar.questions.map(function (q) {
          var isChecked = Boolean(state.checkedQuestions[q.id]);
          var checkbox = el('input', {
            type: 'checkbox',
            className: 'question-checkbox',
            checked: isChecked,
            'aria-label': q.id + ': ' + q.text,
            onChange: function (ev) {
              state.checkedQuestions[q.id] = ev.target.checked;
              renderSelfCheckView();
            }
          });

          return el('label', {
            className: 'question-row' + (isChecked ? ' is-checked' : '')
          }, [
            checkbox,
            el('div', { className: 'question-content' }, [
              el('div', { className: 'question-text', text: q.id + ' — ' + q.text }),
              el('div', { className: 'question-meta-row' }, [
                el('span', { className: severityBadgeClass(q.severity), text: q.severity }),
                el('span', { className: 'badge badge-cite', text: q.cite }),
                el('span', { text: 'Lead: ' + q.owner })
              ])
            ])
          ]);
        });

        var pCard = el('div', { className: 'pillar-card' }, [
          el('div', { className: 'pillar-header' }, [
            el('div', {}, [
              el('h3', { className: 'pillar-title', text: pillar.title }),
              el('div', { className: 'pillar-sub', text: pillar.subtitle })
            ]),
            el('span', {
              className: pillarDone === pillar.questions.length ? 'badge badge-verified' : 'badge badge-cite',
              text: pillarDone + ' / ' + pillar.questions.length + ' Verified'
            })
          ])
        ].concat(rows));

        pillarsCol.appendChild(pCard);
      });

      var actionList = el('div', { className: 'action-plan-list' });
      if (summary.openGaps.length === 0) {
        actionList.appendChild(el('div', { className: 'action-gap-card gap-moderate' }, [
          el('div', { className: 'action-gap-body', text: 'All 25 Readiness Controls Verified for ' + countyObj.county + ' County!' }),
          el('div', { className: 'action-gap-owner', text: 'Export the JSON readiness record above and store alongside your annual EMPG / County EOP archive.' })
        ]));
      } else {
        summary.openGaps.forEach(function (item, idx) {
          var q = item.question;
          var sevCls = q.severity === 'HIGH' ? ' gap-high' : (q.severity === 'MODERATE' ? ' gap-moderate' : '');
          actionList.appendChild(el('div', { className: 'action-gap-card' + sevCls }, [
            el('div', { className: 'action-gap-top' }, [
              el('span', { className: severityBadgeClass(q.severity), text: '#' + (idx + 1) + ' · ' + q.severity + ' (' + q.id + ')' }),
              el('span', { className: 'badge badge-cite', text: q.cite })
            ]),
            el('div', { className: 'action-gap-body', text: q.actionItem }),
            el('div', { className: 'action-gap-owner', text: 'Action Owner: ' + q.owner + ' · ' + item.pillarTitle })
          ]));
        });
      }

      var copyPlanBtn = el('button', {
        type: 'button',
        className: 'btn btn-sm btn-navy',
        text: 'Copy Action Plan',
        onClick: function () {
          var lines = [
            countyObj.county.toUpperCase() + ' COUNTY, WV — FEMA PA DEBRIS & FLOOD READINESS ACTION PLAN',
            'Seat: ' + countyObj.seat + ' | ' + countyObj.wvemdArea + ' | USACE ' + countyObj.usaceDistrict + ' | ' + countyObj.wvdohDistrict,
            'Readiness Score: ' + summary.pct + '% (' + summary.checked + '/' + summary.total + ') — ' + summary.riskLabel,
            '--------------------------------------------------------------------'
          ];
          summary.openGaps.forEach(function (g, i) {
            lines.push((i + 1) + '. [' + g.question.severity + ' | ' + g.question.id + ' | ' + g.question.cite + '] Owner: ' + g.question.owner);
            lines.push('   Action: ' + g.question.actionItem);
          });
          copyTextSafe(lines.join('\n'), 'Copied ' + countyObj.county + ' County Action Plan.', copyPlanBtn);
        }
      });

      var actionPanel = el('aside', { className: 'action-plan-panel' }, [
        el('div', { className: 'tool-card-header' }, [
          el('div', {}, [
            el('h3', { className: 'action-plan-title', text: 'Prioritized County Action Plan (' + countyObj.county + ')' }),
            el('p', { className: 'action-plan-sub', text: summary.openGaps.length + ' open deobligation gap(s) auto-ranked by statutory severity' })
          ]),
          copyPlanBtn
        ]),
        actionList
      ]);

      panel.appendChild(topBar);
      panel.appendChild(el('div', { className: 'selfcheck-grid' }, [pillarsCol, actionPanel]));
    }

    /* ==================== MODULE 3: FORENSIC RECORD-GAP CROSSWALK ==================== */
    function buildJustificationMemoText(evaluatedRows, totalClaimed, verifiedUsd, holdUsd, uniqueDays) {
      var verifiedRows = evaluatedRows.filter(function (r) { return r.verified; });
      var flaggedRows = evaluatedRows.filter(function (r) { return !r.verified; });
      var verifiedNetTons = verifiedRows.reduce(function (s, r) { return s + r.row.netTonsWeighed; }, 0);
      var gapVerifiedCount = verifiedRows.filter(function (r) {
        return r.row.period.indexOf('Weeks 1') === 0;
      }).length;
      var wk4VerifiedCount = verifiedRows.filter(function (r) {
        return r.row.period.indexOf('Week 4') === 0;
      }).length;

      var smMemo = data.stateMeta || {};
      var closeoutAgency = smMemo.closeoutAgency || 'WVEMD';
      var lines = [
        'MEMORANDUM FOR FEMA PUBLIC ASSISTANCE / ' + closeoutAgency + ' CLOSEOUT REVIEW',
        'SUBJECT: Forensic Multi-Source Record-Gap Reconciliation & Proactive Questioned-Cost Carve-Out',
        'AUTHORITY: 2 CFR §§ 200.303, 200.403–200.405 (Reasonable & Documented Costs); FEMA PAPPG Category A',
        'CORRIDOR: ' + data.forensicCrosswalk.scenarioTitle,
        '--------------------------------------------------------------------------------',
        '1. EXECUTIVE SUMMARY OF RECONCILED CLAIM',
        '   - Total Contractor Invoices Audited (' + evaluatedRows.length + ' loads across ' + uniqueDays + ' hauling days): ' + formatUsd(totalClaimed),
        '   - Independently Corroborated & Claimed (' + verifiedRows.length + ' loads / ' + verifiedNetTons.toFixed(2) + ' certified net tons): ' + formatUsd(verifiedUsd),
        '   - Quarantined / Withheld by County Before Claim (' + flaggedRows.length + ' anomalous load[s]): ' + formatUsd(holdUsd),
        '',
        '2. SIX-CHECK FORENSIC METHODOLOGY (ACTIVE MAX TRANSIT WINDOW: ' + data.forensicCrosswalk.parameters.minPhysicalTransitMin + '–' + state.maxTransitMin + ' MIN)',
        '   To address the Weeks 1–3 tower-monitor mobilization gap without relying on unverified contractor paper logs, the County Fiscal & Emergency Services offices executed a deterministic 6-point crosswalk linking NTP-synced TDMS exit gate camera hashes, WV Division of Labor certified landfill scale tickets, and the Week 4 independently monitored baseline (' + wk4VerifiedCount + ' benchmark loads establishing empirical 42–52 min loaded transit):',
        '   [Check 1] Loaded-Trip Time Window (' + data.forensicCrosswalk.parameters.minPhysicalTransitMin + 'm physical floor to ' + state.maxTransitMin + 'm max window)',
        '   [Check 2] Round-Trip Turnaround (>= ' + data.forensicCrosswalk.parameters.minRoundTripTurnaroundMin + 'm full haul/dump/return/reload cycle)',
        '   [Check 3] Tare Weight Identity Consistency (<= ' + data.forensicCrosswalk.parameters.maxTareVarianceTons + 't variance vs. certified empty registry)',
        '   [Check 4] Active Fleet Count (<= ' + data.forensicCrosswalk.parameters.certifiedFleetLimit + ' pre-certified county registry trucks per shift)',
        '   [Check 5] Billed vs. Certified Scale Tonnage Match & Unique Scale Ticket Verification',
        '   [Check 6] Unbroken SHA-256 TDMS Gate Exit Camera Timestamp & Photo Hash Continuity',
        '',
        '3. PROACTIVE COUNTY CARVE-OUT OF QUESTIONED LOADS (' + formatUsd(holdUsd) + ' EXCLUDED):'
      ];

      if (flaggedRows.length === 0) {
        lines.push('   - Zero loads exceeded forensic thresholds under current window.');
      } else {
        flaggedRows.forEach(function (f) {
          lines.push('   - ' + f.row.loadId + ' (' + f.row.date + ' | ' + f.row.truckId + ' | ' + formatUsd(f.row.contractorBilledUsd) + '): HELD — ' + f.reasons.join('; '));
        });
      }

      lines.push('');
      lines.push('4. DETERMINATION: Excluding the ' + flaggedRows.length + ' quarantined load(s) (' + formatUsd(holdUsd) + '), the remaining ' + verifiedRows.length + ' loads (' + gapVerifiedCount + ' Weeks 1–3 forensically corroborated + ' + wk4VerifiedCount + ' Week 4 monitored baseline = ' + formatUsd(verifiedUsd) + ') satisfy all six independent physical, photographic, and certified-weight controls under 2 CFR § 200.403.');
      return lines.join('\n');
    }

    function renderForensicView() {
      var panel = document.getElementById('panel-forensic');
      if (!panel) return;
      panel.replaceChildren();

      var kpiContainer = el('div', { className: 'kpi-grid' });
      var checksStripContainer = el('div', { className: 'checks-strip' });
      var memoWrapper = el('div', {});
      var ledgerBody = el('tbody', {});
      var tableCountSpan = el('span', { className: 'badge badge-cite' });

      var params = data.forensicCrosswalk.parameters;
      var sliderReadout = el('span', { className: 'slider-value-pill' });

      var rangeInput = el('input', {
        type: 'range',
        className: 'range-slider',
        min: String(params.sliderMinTransitMin || 35),
        max: String(params.sliderMaxTransitMin || 65),
        step: '1',
        value: String(state.maxTransitMin),
        'aria-label': 'Max Loaded-Trip Minutes Slider'
      });

      function setSliderVal(val) {
        state.maxTransitMin = Number(val);
        rangeInput.value = String(state.maxTransitMin);
        refreshForensicDynamicParts();
      }

      rangeInput.addEventListener('input', function () {
        state.maxTransitMin = Number(rangeInput.value);
        refreshForensicDynamicParts();
      });

      var filterDefs = [
        { key: 'ALL', label: 'All 18 Loads' },
        { key: 'FLAGGED', label: 'Questioned / Hold' },
        { key: 'VERIFIED', label: 'Verified Only' },
        { key: 'GAP', label: 'Weeks 1–3 Gap (12)' },
        { key: 'BASELINE', label: 'Week 4 Baseline (6)' }
      ];
      var filterChipRow = el('div', { className: 'filter-chips-row' });

      var memoBtn = el('button', {
        type: 'button',
        className: 'btn btn-gold',
        text: state.showJustificationMemo ? 'Hide Reviewer Justification Memo' : 'Generate Federal Reviewer Justification Memo',
        onClick: function () {
          state.showJustificationMemo = !state.showJustificationMemo;
          memoBtn.textContent = state.showJustificationMemo ? 'Hide Reviewer Justification Memo' : 'Generate Federal Reviewer Justification Memo';
          refreshForensicDynamicParts();
        }
      });

      var controlsCard = el('div', { className: 'forensic-controls-card' }, [
        el('div', { className: 'slider-control-group' }, [
          el('div', { className: 'slider-label-row' }, [
            el('span', { className: 'field-label', text: 'Max Loaded-Trip Transit Window Slider (35–65 Min)' }),
            sliderReadout
          ]),
          el('div', { className: 'slider-input-row' }, [
            el('span', { className: 'mono-cell', text: '35m' }),
            rangeInput,
            el('span', { className: 'mono-cell', text: '65m' }),
            el('button', { type: 'button', className: 'btn btn-sm btn-ghost', text: 'Strict 45m', onClick: function () { setSliderVal(45); } }),
            el('button', { type: 'button', className: 'btn btn-sm btn-ghost', text: 'Default 55m', onClick: function () { setSliderVal(55); } })
          ])
        ]),
        filterChipRow,
        memoBtn
      ]);

      var tableCard = el('div', { className: 'table-card' }, [
        el('div', { className: 'table-card-header' }, [
          el('div', {}, [
            el('h3', { className: 'table-card-title', text: data.forensicCrosswalk.scenarioTitle }),
            el('div', { className: 'pillar-sub', text: data.forensicCrosswalk.routeSummary })
          ]),
          tableCountSpan
        ]),
        el('div', { className: 'table-scroll' }, [
          el('table', { className: 'data-table' }, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', { text: 'Load ID' }),
                el('th', { text: 'Date & Period' }),
                el('th', { text: 'Truck ID' }),
                el('th', { text: 'Empty Tare (t)' }),
                el('th', { text: 'Gate Exit -> Scale' }),
                el('th', { text: 'Transit' }),
                el('th', { text: 'Net Tons' }),
                el('th', { text: 'Billed ($)' }),
                el('th', { text: 'Gate Photo Hash / Ticket' }),
                el('th', { text: 'Forensic Audit Flag' })
              ])
            ]),
            ledgerBody
          ])
        ])
      ]);

      function refreshForensicDynamicParts() {
        updateHeaderBadges();
        sliderReadout.textContent = params.minPhysicalTransitMin + 'm – ' + state.maxTransitMin + 'm Allowed';

        var loads = data.forensicCrosswalk.loads;
        var evaluated = loads.map(function (row) {
          return evaluateForensicLoad(row, params, state.maxTransitMin);
        });

        var totalClaimed = 0;
        var verifiedUsd = 0;
        var holdUsd = 0;
        var verifiedCount = 0;
        var holdCount = 0;
        var daySet = {};
        var checkFailCounts = [0, 0, 0, 0, 0, 0];

        evaluated.forEach(function (evRow) {
          totalClaimed += evRow.row.contractorBilledUsd;
          daySet[evRow.row.date] = true;
          if (evRow.verified) {
            verifiedUsd += evRow.row.contractorBilledUsd;
            verifiedCount++;
          } else {
            holdUsd += evRow.row.contractorBilledUsd;
            holdCount++;
          }
          for (var c = 0; c < 6; c++) {
            if (!evRow.checks[c]) checkFailCounts[c]++;
          }
        });

        var uniqueDays = Object.keys(daySet).length;
        var pctVerified = totalClaimed > 0 ? ((verifiedUsd / totalClaimed) * 100).toFixed(1) : '0.0';

        kpiContainer.replaceChildren(
          el('div', { className: 'kpi-card kpi-gold' }, [
            el('div', { className: 'kpi-label', text: 'Total Claimed ($)' }),
            el('div', { className: 'kpi-value', text: formatUsd(totalClaimed) }),
            el('div', { className: 'kpi-sub', text: loads.length + ' Contractor Haul Invoices Submitted' })
          ]),
          el('div', { className: 'kpi-card kpi-emerald' }, [
            el('div', { className: 'kpi-label', text: 'Independently Verified ($)' }),
            el('div', { className: 'kpi-value', text: formatUsd(verifiedUsd) }),
            el('div', { className: 'kpi-sub', text: verifiedCount + ' of ' + loads.length + ' Loads Pass All 6 Checks (' + pctVerified + '%)' })
          ]),
          el('div', { className: 'kpi-card kpi-crimson' }, [
            el('div', { className: 'kpi-label', text: 'Questioned / Hold ($)' }),
            el('div', { className: 'kpi-value', text: formatUsd(holdUsd) }),
            el('div', { className: 'kpi-sub', text: holdCount + ' Load(s) Quarantined Before FEMA Claim' })
          ]),
          el('div', { className: 'kpi-card' }, [
            el('div', { className: 'kpi-label', text: 'Hauling Days Reconciled' }),
            el('div', { className: 'kpi-value', text: uniqueDays + ' Days' }),
            el('div', { className: 'kpi-sub', text: '4 Unmonitored Gap Days + 2 Week 4 Benchmark Days' })
          ])
        );

        filterChipRow.replaceChildren();
        filterDefs.forEach(function (fd) {
          filterChipRow.appendChild(el('button', {
            type: 'button',
            className: 'chip-btn' + (state.forensicFilter === fd.key ? ' is-active' : ''),
            text: fd.label,
            onClick: function () {
              state.forensicFilter = fd.key;
              refreshForensicDynamicParts();
            }
          }));
        });

        checksStripContainer.replaceChildren();
        data.forensicCrosswalk.auditChecksMeta.forEach(function (meta, idx) {
          var fails = checkFailCounts[idx];
          var passes = loads.length - fails;
          var ruleText = idx === 0
            ? (params.minPhysicalTransitMin + 'm <= Transit <= ' + state.maxTransitMin + 'm')
            : meta.rule;
          checksStripContainer.appendChild(el('div', {
            className: 'check-mini-card' + (fails > 0 ? ' has-fail' : '')
          }, [
            el('div', { className: 'check-mini-title', text: meta.name }),
            el('div', {
              className: 'check-mini-stats',
              text: passes + '/' + loads.length + ' Pass · ' + fails + ' Flagged'
            }),
            el('div', { className: 'check-mini-rule', text: ruleText })
          ]));
        });

        memoWrapper.replaceChildren();
        if (state.showJustificationMemo) {
          var memoText = buildJustificationMemoText(evaluated, totalClaimed, verifiedUsd, holdUsd, uniqueDays);
          var copyMemoBtn = el('button', {
            type: 'button',
            className: 'btn btn-sm btn-navy',
            text: 'Copy Justification Memo',
            onClick: function () {
              copyTextSafe(memoText, 'Copied Federal Reviewer Justification Memo.', copyMemoBtn);
            }
          });
          memoWrapper.appendChild(el('div', { className: 'memo-preview-card' }, [
            el('div', { className: 'tool-card-header' }, [
              el('div', {}, [
                el('span', { className: 'badge badge-cite', text: '2 CFR § 200.403 CORROBORATING EVIDENCE MEMO' }),
                el('h3', { className: 'tool-card-title', text: 'Auto-Generated Federal Reviewer Justification Memo (Live Synced to ' + state.maxTransitMin + 'm Window)' })
              ]),
              el('div', { className: 'filter-chips-row' }, [
                copyMemoBtn,
                el('button', {
                  type: 'button',
                  className: 'btn btn-sm btn-ghost',
                  text: 'Export Reconciled Ledger (.json)',
                  onClick: function () {
                    downloadJsonFile('wv-forensic-debris-crosswalk-reconciled.json', {
                      maxTransitWindowMin: state.maxTransitMin,
                      totalClaimedUsd: Number(totalClaimed.toFixed(2)),
                      independentlyVerifiedUsd: Number(verifiedUsd.toFixed(2)),
                      questionedHoldUsd: Number(holdUsd.toFixed(2)),
                      evaluatedLoads: evaluated
                    });
                  }
                })
              ])
            ]),
            el('pre', { className: 'memo-pre', text: memoText })
          ]));
        }

        var filtered = evaluated.filter(function (item) {
          if (state.forensicFilter === 'FLAGGED') return !item.verified;
          if (state.forensicFilter === 'VERIFIED') return item.verified;
          if (state.forensicFilter === 'GAP') return item.row.period.indexOf('Weeks 1') === 0;
          if (state.forensicFilter === 'BASELINE') return item.row.period.indexOf('Week 4') === 0;
          return true;
        });

        tableCountSpan.textContent = 'Showing ' + filtered.length + ' of ' + loads.length + ' Loads';
        ledgerBody.replaceChildren();

        filtered.forEach(function (item) {
          var r = item.row;
          var isGap = r.period.indexOf('Weeks 1') === 0;
          var tareText = r.emptyTareTons.toFixed(2) + 't (reg ' + r.registeredTareTons.toFixed(2) + 't)';
          var flagBadge = item.verified
            ? el('span', { className: 'badge badge-verified', text: 'VERIFIED · 6/6 PASS' })
            : el('span', { className: 'badge badge-critical', text: 'HOLD: ' + item.reasons.join(' · ') });

          ledgerBody.appendChild(el('tr', {
            className: item.verified ? '' : 'row-flagged',
            title: r.plantedNote || ''
          }, [
            el('td', { className: 'mono-cell', text: r.loadId }),
            el('td', {}, [
              el('div', { className: 'mono-cell', text: r.date }),
              el('span', {
                className: isGap ? 'badge badge-high' : 'badge badge-moderate',
                text: isGap ? 'Wks 1–3 Gap' : 'Wk 4 Baseline'
              })
            ]),
            el('td', { className: 'mono-cell', text: r.truckId }),
            el('td', { className: 'mono-cell', text: tareText }),
            el('td', { className: 'mono-cell', text: r.gateExitTime + ' -> ' + r.scaleArrivalTime }),
            el('td', { className: 'mono-cell', text: r.loadedTransitMin + ' min' }),
            el('td', { className: 'mono-cell', text: formatTons(r.netTonsWeighed) }),
            el('td', { className: 'mono-cell', text: formatUsd(r.contractorBilledUsd) }),
            el('td', { className: 'mono-cell', text: r.gatePhotoHash + ' (' + r.scaleTicketId + ')' }),
            el('td', {}, [flagBadge])
          ]));
        });
      }

      panel.appendChild(kpiContainer);
      panel.appendChild(controlsCard);
      panel.appendChild(checksStripContainer);
      panel.appendChild(memoWrapper);
      panel.appendChild(tableCard);
      refreshForensicDynamicParts();
    }

    /* ==================== MODULE 4: 55-COUNTY / 28-REGION CROSSWALK ==================== */
    function renderRegionalView() {
      var panel = document.getElementById('panel-regional');
      if (!panel) return;
      panel.replaceChildren();

      var sm = data.stateMeta || {};
      var stateName = sm.stateName || 'West Virginia';
      var stateCode = sm.stateCode || 'WV';
      var emaLabel = sm.emaLabel || 'WVEMD Area';
      var emaShort = sm.emaShort || 'WVEMD';
      var dotShort = sm.dotShort || 'WVDOH';
      var policeShort = sm.policeShort || 'WVSP';
      var rpdcLabel = sm.rpdcLabel || 'RPDC';
      var metrics = data.regionalCrosswalk.summaryMetrics;
      var allCounties = data.regionalCrosswalk.counties;

      var kpiRow = el('div', { className: 'kpi-grid' }, [
        el('div', { className: 'kpi-card kpi-gold' }, [
          el('div', { className: 'kpi-label', text: 'Statewide County Matrix' }),
          el('div', { className: 'kpi-value', text: metrics.totalCounties + ' Counties' }),
          el('div', { className: 'kpi-sub', text: sm.countyMatrixSub || ('100% ' + stateName + ' County & County-Seat Crosswalk') })
        ]),
        el('div', { className: 'kpi-card' }, [
          el('div', { className: 'kpi-label', text: 'Multi-Agency Boundaries' }),
          el('div', { className: 'kpi-value', text: metrics.distinctRegions + ' Regions' }),
          el('div', { className: 'kpi-sub', text: sm.regionsSub || '6 WVEMD · 10 WVDOH · 6 WVSP · 3 USACE · 3 NWS' })
        ]),
        el('div', { className: 'kpi-card kpi-emerald' }, [
          el('div', { className: 'kpi-label', text: 'Flood Works Tracked' }),
          el('div', { className: 'kpi-value', text: metrics.floodWorksTracked + ' Flood Works' }),
          el('div', { className: 'kpi-sub', text: 'Levees, Concrete Floodwalls, Closures & Channels' })
        ]),
        el('div', { className: 'kpi-card kpi-crimson' }, [
          el('div', { className: 'kpi-label', text: 'Outside Federal Levee DB' }),
          el('div', { className: 'kpi-value', text: metrics.outsideFederalLeveeDb + ' Unlisted' }),
          el('div', { className: 'kpi-sub', text: sm.unlistedSub || '84.8% Non-NLD Local, WPA & NRCS Structures' })
        ])
      ]);

      var searchBox = el('input', {
        type: 'search',
        className: 'input-text',
        placeholder: sm.searchPlaceholder || ('Instant search across all ' + allCounties.length + ' ' + stateCode + ' counties, seats, river basins, ' + rpdcLabel + 's...'),
        value: state.regionalSearch,
        'aria-label': 'Instant search across all ' + allCounties.length + ' ' + stateName + ' counties'
      });

      var uniqueDoh = [];
      var uniqueTroops = [];
      var uniqueAreaPrefixes = [];
      var uniqueUsace = [];
      allCounties.forEach(function (c) {
        if (c.wvdohDistrict && uniqueDoh.indexOf(c.wvdohDistrict) === -1) uniqueDoh.push(c.wvdohDistrict);
        if (c.wvspTroop && uniqueTroops.indexOf(c.wvspTroop) === -1) uniqueTroops.push(c.wvspTroop);
        var areaPrefix = String(c.wvemdArea || '').split(' (')[0];
        if (areaPrefix && uniqueAreaPrefixes.indexOf(areaPrefix) === -1) uniqueAreaPrefixes.push(areaPrefix);
        if (c.usaceDistrict && uniqueUsace.indexOf(c.usaceDistrict) === -1) uniqueUsace.push(c.usaceDistrict);
      });
      uniqueDoh.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      uniqueTroops.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });
      uniqueAreaPrefixes.sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); });

      var dohOptions = ['ALL'].concat(uniqueDoh);
      var dohSelect = el('select', {
        className: 'select-box',
        'aria-label': 'Filter by ' + dotShort + ' Engineering District',
        onChange: function (ev) {
          state.regionalDoh = ev.target.value;
          refreshRegionalTable();
        }
      }, dohOptions.map(function (d) {
        var o = el('option', { value: d, text: d === 'ALL' ? ('All ' + uniqueDoh.length + ' ' + dotShort + ' Districts') : (dotShort + ' ' + d) });
        if (state.regionalDoh === d) o.selected = true;
        return o;
      }));

      var troopOptions = ['ALL'].concat(uniqueTroops);
      var troopSelect = el('select', {
        className: 'select-box',
        'aria-label': 'Filter by ' + policeShort + ' Troop',
        onChange: function (ev) {
          state.regionalTroop = ev.target.value;
          refreshRegionalTable();
        }
      }, troopOptions.map(function (t) {
        var o = el('option', { value: t, text: t === 'ALL' ? ('All ' + uniqueTroops.length + ' ' + policeShort + ' Troops') : (policeShort + ' ' + t) });
        if (state.regionalTroop === t) o.selected = true;
        return o;
      }));

      var resetBtn = el('button', {
        type: 'button',
        className: 'btn btn-ghost',
        text: 'Reset Filters',
        onClick: function () {
          state.regionalChip = 'ALL';
          state.regionalDoh = 'ALL';
          state.regionalTroop = 'ALL';
          state.regionalSearch = '';
          searchBox.value = '';
          dohSelect.value = 'ALL';
          troopSelect.value = 'ALL';
          refreshRegionalTable();
        }
      });

      searchBox.addEventListener('input', function () {
        state.regionalSearch = searchBox.value;
        refreshRegionalTable();
      });

      var chipDefs = [{ key: 'ALL', label: 'All ' + allCounties.length + ' Counties' }]
        .concat(uniqueAreaPrefixes.map(function (ap) { return { key: 'AREA:' + ap, label: emaShort + ' ' + ap }; }))
        .concat(uniqueUsace.map(function (us) { return { key: 'USACE:' + us, label: 'USACE ' + us }; }));

      var chipBar = el('div', { className: 'filter-chips-row' });
      var countBadge = el('span', { className: 'badge badge-cite' });
      var tbody = el('tbody', {});

      var filterPanel = el('div', { className: 'regional-filter-panel' }, [
        el('div', { className: 'regional-inputs-row' }, [searchBox, dohSelect, troopSelect, resetBtn]),
        chipBar
      ]);

      var matrixCard = el('div', { className: 'table-card' }, [
        el('div', { className: 'table-card-header' }, [
          el('div', {}, [
            el('h3', { className: 'table-card-title', text: stateName + ' ' + allCounties.length + '-County Multi-Region SEOC Crosswalk Matrix' }),
            el('div', { className: 'pillar-sub', text: 'Cross-indexes County Seat, ' + emaLabel + ', USACE Civil Works District, ' + dotShort + ' District, ' + policeShort + ' Troop, ' + rpdcLabel + ', River Basin & Flood Control Reaches' })
          ]),
          countBadge
        ]),
        el('div', { className: 'table-scroll' }, [
          el('table', { className: 'data-table' }, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', { text: 'County' }),
                el('th', { text: 'County Seat' }),
                el('th', { text: emaLabel }),
                el('th', { text: 'USACE District' }),
                el('th', { text: dotShort }),
                el('th', { text: policeShort }),
                el('th', { text: rpdcLabel }),
                el('th', { text: 'Primary River Basin' }),
                el('th', { text: 'Flood Reaches' }),
                el('th', { text: 'Readiness Audit' })
              ])
            ]),
            tbody
          ])
        ])
      ]);

      function refreshRegionalTable() {
        chipBar.replaceChildren();
        chipDefs.forEach(function (cd) {
          chipBar.appendChild(el('button', {
            type: 'button',
            className: 'chip-btn' + (state.regionalChip === cd.key ? ' is-active' : ''),
            text: cd.label,
            onClick: function () {
              state.regionalChip = cd.key;
              refreshRegionalTable();
            }
          }));
        });

        var q = (state.regionalSearch || '').trim().toLowerCase();
        var filtered = allCounties.filter(function (c) {
          if (state.regionalChip.indexOf('AREA:') === 0) {
            var areaPrefix = state.regionalChip.slice(5);
            if (c.wvemdArea.indexOf(areaPrefix) !== 0) return false;
          } else if (state.regionalChip.indexOf('USACE:') === 0) {
            var usaceName = state.regionalChip.slice(6);
            if (c.usaceDistrict !== usaceName) return false;
          }
          if (state.regionalDoh !== 'ALL' && c.wvdohDistrict !== state.regionalDoh) return false;
          if (state.regionalTroop !== 'ALL' && c.wvspTroop !== state.regionalTroop) return false;
          if (q) {
            var blob = [
              c.county,
              c.seat,
              c.wvemdArea,
              c.usaceDistrict,
              c.wvdohDistrict,
              c.wvspTroop,
              c.rpdc,
              c.riverBasin
            ].join(' ').toLowerCase();
            if (blob.indexOf(q) === -1) return false;
          }
          return true;
        });

        var reachSum = filtered.reduce(function (s, c) { return s + (Number(c.legacyFloodWorks) || 0); }, 0);
        countBadge.textContent = 'Showing ' + filtered.length + ' of ' + allCounties.length + ' Counties · ' + reachSum + ' County Flood Reaches';
        tbody.replaceChildren();

        filtered.forEach(function (c) {
          var usaceCls = c.usaceDistrict === 'Huntington'
            ? 'badge badge-cite'
            : (c.usaceDistrict === 'Pittsburgh' ? 'badge badge-moderate' : 'badge badge-verified');

          tbody.appendChild(el('tr', {}, [
            el('td', {}, [el('strong', { text: c.county })]),
            el('td', { text: c.seat }),
            el('td', { text: c.wvemdArea }),
            el('td', {}, [el('span', { className: usaceCls, text: c.usaceDistrict })]),
            el('td', { className: 'mono-cell', text: c.wvdohDistrict }),
            el('td', { className: 'mono-cell', text: c.wvspTroop }),
            el('td', { className: 'mono-cell', text: c.rpdc }),
            el('td', { text: c.riverBasin }),
            el('td', { className: 'mono-cell', text: String(c.legacyFloodWorks) }),
            el('td', {}, [
              el('button', {
                type: 'button',
                className: 'btn btn-sm btn-ghost',
                text: 'Self-Check ->',
                onClick: function () {
                  state.selectedCounty = c.county;
                  renderSelfCheckView();
                  switchPrimaryView('selfcheck');
                  showToast('Loaded ' + c.county + ' County in 25-Question Readiness Self-Check.');
                }
              })
            ])
          ]));
        });
      }

      panel.appendChild(kpiRow);
      panel.appendChild(filterPanel);
      panel.appendChild(matrixCard);
      refreshRegionalTable();
    }

    updateHeaderBadges();
    renderBinderView();
    renderSelfCheckView();
    renderForensicView();
    renderRegionalView();

    var rawHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
    var validViews = { binder: true, selfcheck: true, forensic: true, regional: true };
    switchPrimaryView(validViews[rawHash] ? rawHash : 'binder');
    window.addEventListener('hashchange', function () {
      var nextHash = (window.location.hash || '').replace(/^#/, '').toLowerCase();
      if (validViews[nextHash]) {
        switchPrimaryView(nextHash);
      }
    });
  }

  function boot() {
    var payload = loadKitPayload();
    if (!payload) {
      var main = document.getElementById('cmd-main');
      if (main) {
        main.replaceChildren(
          el('div', { className: 'tool-card' }, [
            el('h2', { className: 'tool-card-title', text: 'Field Operations Kit Payload Not Hydrated' }),
            el('p', {
              className: 'tool-card-summary',
              text: 'Run node scripts/scaffold_ops_kit.mjs --target <dir> to generate ops-kit-standalone.html with an embedded operational JSON dataset.'
            })
          ])
        );
      }
      return;
    }
    initApp(payload);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
