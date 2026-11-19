(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i += 1) {
        var k = keys[i];
        if (attrs[k] !== undefined && attrs[k] !== null) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
    }
    return node;
  }

  function clearNode(node) {
    if (node) {
      node.replaceChildren();
    }
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('ttx-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('is-hidden');
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      toast.classList.add('is-hidden');
    }, 3600);
  }

  function parseClockMinutes(clockStr) {
    var m = /T\+(\d+)m/i.exec(String(clockStr || ''));
    return m ? parseInt(m[1], 10) : 0;
  }

  function formatElapsedClock(totalSeconds) {
    var mins = Math.floor(totalSeconds / 60);
    var secs = totalSeconds % 60;
    var mm = mins < 10 ? '0' + mins : String(mins);
    var ss = secs < 10 ? '0' + secs : String(secs);
    return 'T+' + mm + ':' + ss;
  }

  function computeEmpgDeadlineDate() {
    var now = new Date();
    var due = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    var yyyy = due.getFullYear();
    var mm = String(due.getMonth() + 1).padStart(2, '0');
    var dd = String(due.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
  }

  function loadEmbeddedConfig() {
    var dataEl = document.getElementById('ttx-config-data');
    if (dataEl && dataEl.textContent && dataEl.textContent.trim().length > 2) {
      try {
        return JSON.parse(dataEl.textContent);
      } catch (_err) {
        return null;
      }
    }
    return null;
  }

  function buildWvSealSvg() {
    var svg = svgEl('svg', {
      viewBox: '0 0 64 64',
      width: '46',
      height: '46',
      role: 'img',
      'aria-label': 'West Virginia Capitol Command Seal'
    });
    svg.appendChild(svgEl('circle', {
      cx: 32,
      cy: 32,
      r: 30,
      fill: '#09111E',
      stroke: '#D5A245',
      'stroke-width': 2.5
    }));
    svg.appendChild(svgEl('circle', {
      cx: 32,
      cy: 32,
      r: 25,
      fill: 'none',
      stroke: '#D5A245',
      'stroke-width': 1,
      'stroke-dasharray': '2,2'
    }));
    svg.appendChild(svgEl('polygon', {
      points: '12,42 25,22 33,33 42,19 52,42',
      fill: '#1D3352',
      stroke: '#E5B964',
      'stroke-width': 1.5
    }));
    var textTop = svgEl('text', {
      x: 32,
      y: 17,
      'text-anchor': 'middle',
      fill: '#E5B964',
      'font-size': '7.5',
      'font-weight': '800',
      'font-family': 'monospace'
    });
    textTop.textContent = 'WV · 1863';
    svg.appendChild(textTop);

    var textBot = svgEl('text', {
      x: 32,
      y: 52,
      'text-anchor': 'middle',
      fill: '#FFFFFF',
      'font-size': '7.5',
      'font-weight': '800',
      'font-family': 'sans-serif'
    });
    textBot.textContent = 'HSEEP TTX';
    svg.appendChild(textBot);
    return svg;
  }

  function scorePublicWarning(rawText, jur) {
    var text = String(rawText || '').trim();
    var lower = text.toLowerCase();
    var words = text ? text.split(/\s+/).filter(Boolean) : [];
    var wordCount = words.length;
    var seatLower = String(jur.seat || '').toLowerCase();
    var countyLower = String(jur.county || '').toLowerCase();

    var rows = [];
    var total = 0;

    // 1. Who is speaking (12 pts)
    var hasSource = /(emergency management|eoc|fire command|unified command|county commission|sheriff|health department|wvemd|911|official alert)/i.test(text);
    var p1 = hasSource ? 12 : 0;
    total += p1;
    rows.push({
      name: '1. Issuing Authority (Who Is Speaking)',
      earned: p1,
      max: 12,
      status: hasSource ? 'PASS' : 'MISSING',
      hint: hasSource
        ? 'Identifies authoritative county/emergency command sender.'
        : 'Name the official authority up front (e.g., "' + jur.county + ' County Emergency Management & Fire Command").'
    });

    // 2. What happened (12 pts)
    var hasAmmonia = /(ammonia|chemical leak|vapor release|hazardous gas)/i.test(text);
    var hasWater = /(water pump|water pressure|water outage|water main|water system|tap water)/i.test(text);
    var p2 = (hasAmmonia ? 8 : 0) + (hasWater ? 4 : 0);
    total += p2;
    rows.push({
      name: '2. Hazard Description (What Happened)',
      earned: p2,
      max: 12,
      status: p2 === 12 ? 'PASS' : (p2 > 0 ? 'PARTIAL' : 'MISSING'),
      hint: p2 === 12
        ? 'Names both the anhydrous ammonia leak and municipal water pump/pressure issue in plain English.'
        : 'State both hazards clearly: anhydrous ammonia leak + water pump/pressure drop.'
    });

    // 3. Where / Who is affected (12 pts)
    var hasRadius = /(0\.5\s*mile|half[- ]mile|500\s*f(ee|oo)?t|east[- ]northeast|ene|downwind|industrial|corridor|terrace|nursing home)/i.test(text) ||
      (seatLower && lower.indexOf(seatLower) !== -1) ||
      (countyLower && lower.indexOf(countyLower) !== -1);
    var hasSpecificZone = /(0\.5\s*mile|half[- ]mile|east[- ]northeast|industrial|terrace|nursing home)/i.test(text);
    var p3 = hasSpecificZone ? 12 : (hasRadius ? 6 : 0);
    total += p3;
    rows.push({
      name: '3. Affected Geography & Population (Where / Who)',
      earned: p3,
      max: 12,
      status: p3 === 12 ? 'PASS' : (p3 > 0 ? 'PARTIAL' : 'MISSING'),
      hint: p3 === 12
        ? 'Defines concrete 0.5-mile ENE / riverfront corridor boundary.'
        : 'Specify the exact protective boundary (within 0.5 miles east-northeast of the ' + jur.seat + ' riverfront industrial corridor).'
    });

    // 4. Protective Action: Shelter-in-Place + Shut off HVAC + Boil Water (16 pts)
    var hasShelter = /(shelter in place|shelter-in-place|go indoors|stay indoors|stay inside)/i.test(text);
    var hasHvac = /(shut off.*hvac|turn off.*hvac|hvac|heating|air conditioning|close windows|seal)/i.test(text);
    var hasBoil = /(boil.*water|boil tap|bottled water)/i.test(text);
    var p4 = (hasShelter ? 6 : 0) + (hasHvac ? 5 : 0) + (hasBoil ? 5 : 0);
    total += p4;
    rows.push({
      name: '4. Protective Action (Shelter + Shut Off HVAC + Boil Water)',
      earned: p4,
      max: 16,
      status: p4 === 16 ? 'PASS' : (p4 >= 6 ? 'PARTIAL' : 'MISSING'),
      hint: p4 === 16
        ? 'Covers indoor shelter-in-place, window/HVAC shutoff, and 1-minute boil-water guidance.'
        : 'Include all 3 life-safety actions: Shelter in Place indoors, close windows/shut off HVAC, and boil tap water.'
    });

    // 5. Corrects False Evacuation Rumor (14 pts)
    var refutesEvac = /(do not evacuate|don't evacuate|no evacuation|evacuation.*false|false.*evacuation|rumor|stay off.*bridge)/i.test(text);
    var namesBridgeOrFalse = /(bridge|false|rumor|social media)/i.test(text);
    var p5 = (refutesEvac && namesBridgeOrFalse) ? 14 : (refutesEvac ? 9 : 0);
    total += p5;
    rows.push({
      name: '5. Rumor Control (Refutes False Valley Bridge Evacuation)',
      earned: p5,
      max: 14,
      status: p5 === 14 ? 'PASS' : (p5 > 0 ? 'PARTIAL' : 'MISSING'),
      hint: p5 === 14
        ? 'Directly refutes the false Valley Bridge evacuation rumor.'
        : 'Explicitly state: DO NOT EVACUATE — social media claims of a Valley Bridge evacuation order are FALSE.'
    });

    // 6. Official Channels for Updates (10 pts)
    var hasChannel = /(wvemd|\.gov|911|radio|eas|hotline|official updates|county website)/i.test(text);
    var p6 = hasChannel ? 10 : 0;
    total += p6;
    rows.push({
      name: '6. Verified Information Source (Where to Get Updates)',
      earned: p6,
      max: 10,
      status: hasChannel ? 'PASS' : 'MISSING',
      hint: hasChannel
        ? 'Directs public to verified .gov / 911 / EAS broadcast channels.'
        : 'Point residents to official channels (e.g., wvemd.wv.gov and County 911 radio).'
    });

    // 7. Time of Next Update (10 pts)
    var hasNextTime = /(next.*update|update at|\b\d{1,2}:\d{2}\s*(am|pm|est)?\b|within \d+\s*min)/i.test(text);
    var p7 = hasNextTime ? 10 : 0;
    total += p7;
    rows.push({
      name: '7. Next Update Commitment (When Next Briefing Arrives)',
      earned: p7,
      max: 10,
      status: hasNextTime ? 'PASS' : 'MISSING',
      hint: hasNextTime
        ? 'Sets a concrete timestamp/interval for the next confirmed briefing.'
        : 'Commit to a specific next update time (e.g., "Next update at 7:00 AM EST").'
    });

    // 8. Word Count Gate <= 120 words (8 pts)
    var p8 = 0;
    var wcStatus = 'MISSING';
    var wcHint = '';
    if (wordCount >= 25 && wordCount <= 120) {
      p8 = 8;
      wcStatus = 'PASS';
      wcHint = wordCount + ' / 120 words — crisp IPAWS/WEA length.';
    } else if (wordCount > 120 && wordCount <= 145) {
      p8 = 4;
      wcStatus = 'PARTIAL';
      wcHint = wordCount + ' words — trim ' + (wordCount - 120) + ' words to meet the <= 120-word gate.';
    } else if (wordCount > 145) {
      p8 = 0;
      wcStatus = 'MISSING';
      wcHint = wordCount + ' words — exceeds 120-word emergency alert cap by ' + (wordCount - 120) + ' words.';
    } else {
      p8 = 0;
      wcStatus = 'MISSING';
      wcHint = wordCount + ' words — message is too short to cover essential protective instructions.';
    }
    total += p8;
    rows.push({
      name: '8. Brevity Gate (<= 120 Words)',
      earned: p8,
      max: 8,
      status: wcStatus,
      hint: wcHint
    });

    // 9. Calm, Plain-Language Tone Check (6 pts)
    var hasJargon = /\b(tih|pappg|emac|2\s*cfr|scba)\b/i.test(text) || (/\bun1005\b/i.test(text) && !/ammonia/i.test(text));
    var hasPanic = /(do not panic|don't panic|catastrophic|deadly doom|massacre)/i.test(text);
    var p9 = 6 - (hasJargon ? 3 : 0) - (hasPanic ? 3 : 0);
    if (wordCount === 0) p9 = 0;
    total += p9;
    rows.push({
      name: '9. Plain-Language & Non-Panic Tone Check',
      earned: p9,
      max: 6,
      status: p9 === 6 ? 'PASS' : (p9 > 0 ? 'PARTIAL' : 'MISSING'),
      hint: p9 === 6
        ? 'Clear, authoritative plain English with zero unexpanded acronyms or panic phrases.'
        : 'Avoid unexpanded acronyms (TIH, EMAC, PAPPG, bare UN1005) and avoid saying "Do not panic".'
    });

    return {
      score: total,
      wordCount: wordCount,
      toneOk: p9 === 6,
      rows: rows
    };
  }

  function startApp(config) {
    var jurisdictions = config.jurisdictions || [];
    var saved = config.savedSessionState || {};

    var state = {
      selectedCounty: saved.selectedCounty || (config.meta && config.meta.defaultCounty) || 'Kanawha',
      activeRoleId: saved.activeRoleId || (config.roles && config.roles[0] && config.roles[0].id) || 'facilitator',
      activeTab: saved.activeTab || '1',
      clockSeconds: typeof saved.clockSeconds === 'number' ? saved.clockSeconds : 0,
      clockRunning: false,
      resourceCategoryFilter: 'ALL',
      resourceStatus: Object.assign({}, saved.resourceStatus || {}),
      mapLayers: Object.assign({
        isolation500: true,
        plumeDay05: true,
        plumeNight13: false,
        facilities: true
      }, saved.mapLayers || {}),
      selectedFacilityId: saved.selectedFacilityId || 'fac-nursing',
      plotterReadout: 'Sheet 2 (NE) · Grid C2 · 0.38 mi ENE of UN1005 Source',
      injectChoices: Object.assign({}, saved.injectChoices || {}),
      warningDraftRaw: saved.warningDraftRaw || '',
      warningCustomized: Boolean(saved.warningCustomized),
      capabilityRatings: Object.assign({}, saved.capabilityRatings || {}),
      capabilityNotes: Object.assign({}, saved.capabilityNotes || {}),
      correctiveActions: Array.isArray(saved.correctiveActions)
        ? saved.correctiveActions.slice()
        : (config.aarConfig && config.aarConfig.starterCorrectiveActions
            ? JSON.parse(JSON.stringify(config.aarConfig.starterCorrectiveActions))
            : [])
    };

    var resourcesList = config.resources || [];
    for (var rIdx = 0; rIdx < resourcesList.length; rIdx += 1) {
      var res = resourcesList[rIdx];
      if (!state.resourceStatus[res.id]) {
        state.resourceStatus[res.id] = res.defaultStatus || 'Available';
      }
    }

    var evalCaps = (config.aarConfig && config.aarConfig.evaluatedCapabilities) || [];
    for (var cIdx = 0; cIdx < evalCaps.length; cIdx += 1) {
      var cap = evalCaps[cIdx];
      if (!state.capabilityRatings[cap.id]) {
        state.capabilityRatings[cap.id] = cap.rating || 'S';
      }
      if (state.capabilityNotes[cap.id] === undefined) {
        state.capabilityNotes[cap.id] = cap.observation || '';
      }
    }

    function getJurisdiction() {
      for (var i = 0; i < jurisdictions.length; i += 1) {
        if (jurisdictions[i].county === state.selectedCounty) {
          return jurisdictions[i];
        }
      }
      return jurisdictions[0] || {
        county: 'Kanawha',
        seat: 'Charleston',
        wvemdArea: 'Area 5 (Metro Valley)',
        wvdohDistrict: 'District 1',
        wvspTroop: 'Troop 4',
        rpdc: 'Region III',
        usaceDistrict: 'Huntington',
        riverBasin: 'Kanawha / Elk / Coal',
        legacyFloodWorks: 14
      };
    }

    function localize(templateStr) {
      var jur = getJurisdiction();
      return String(templateStr || '')
        .replace(/\{COUNTY\}/g, function () { return jur.county; })
        .replace(/\{SEAT\}/g, function () { return jur.seat; })
        .replace(/\{WVEMD_AREA\}/g, function () { return jur.wvemdArea; })
        .replace(/\{WVDOH_DIST\}/g, function () { return jur.wvdohDistrict; })
        .replace(/\{WVSP_TROOP\}/g, function () { return jur.wvspTroop; })
        .replace(/\{RPDC\}/g, function () { return jur.rpdc; })
        .replace(/\{USACE_DIST\}/g, function () { return jur.usaceDistrict; })
        .replace(/\{RIVER_BASIN\}/g, function () { return jur.riverBasin; })
        .replace(/\{LEGACY_FLOOD_WORKS\}/g, function () { return String(jur.legacyFloodWorks); });
    }

    if (!state.warningCustomized) {
      state.warningDraftRaw = localize(config.mediaInject && config.mediaInject.sampleGoldDraft);
    }

    // Mount WV Seal
    var sealSlot = document.getElementById('wv-seal-slot');
    if (sealSlot) {
      clearNode(sealSlot);
      sealSlot.appendChild(buildWvSealSvg());
    }

    // Header Titles
    var bannerEl = document.getElementById('classification-banner');
    var titleEl = document.getElementById('app-title');
    var subtitleEl = document.getElementById('app-subtitle');
    if (bannerEl && config.meta) bannerEl.textContent = config.meta.classificationBanner;
    if (titleEl && config.meta) titleEl.textContent = config.meta.title;
    if (subtitleEl && config.meta) subtitleEl.textContent = config.meta.subtitle;

    // Populate 55-County + Anonymized Selector
    var countySelect = document.getElementById('county-select');
    if (countySelect) {
      clearNode(countySelect);
      for (var j = 0; j < jurisdictions.length; j += 1) {
        var jItem = jurisdictions[j];
        var opt = el(
          'option',
          null,
          jItem.county === 'Anonymized WV Valley Town'
            ? 'Anonymized WV Valley Town (' + jItem.seat + ')'
            : jItem.county + ' County — ' + jItem.seat
        );
        opt.value = jItem.county;
        if (jItem.county === state.selectedCounty) {
          opt.selected = true;
        }
        countySelect.appendChild(opt);
      }
      countySelect.addEventListener('change', function () {
        state.selectedCounty = countySelect.value;
        if (!state.warningCustomized && config.mediaInject) {
          state.warningDraftRaw = localize(config.mediaInject.sampleGoldDraft);
        }
        renderAll();
        showToast('Switched jurisdiction to ' + state.selectedCounty + ' (' + getJurisdiction().seat + ').');
      });
    }

    // Clock Controls
    var clockInterval = null;
    var clockDisplay = document.getElementById('clock-display');
    var btnClockToggle = document.getElementById('btn-clock-toggle');
    var btnClockPlus5 = document.getElementById('btn-clock-plus5');
    var btnClockReset = document.getElementById('btn-clock-reset');

    function updateClockUi() {
      if (clockDisplay) {
        clockDisplay.textContent = formatElapsedClock(state.clockSeconds);
        clockDisplay.classList.toggle('is-running', state.clockRunning);
      }
      if (btnClockToggle) {
        btnClockToggle.textContent = state.clockRunning ? 'Pause' : 'Start';
      }
    }

    if (btnClockToggle) {
      btnClockToggle.addEventListener('click', function () {
        state.clockRunning = !state.clockRunning;
        if (state.clockRunning) {
          clockInterval = setInterval(function () {
            state.clockSeconds += 1;
            updateClockUi();
            if (state.clockSeconds % 60 === 0 && state.activeTab === '2') {
              renderTab2();
            }
          }, 1000);
        } else if (clockInterval) {
          clearInterval(clockInterval);
          clockInterval = null;
        }
        updateClockUi();
      });
    }

    if (btnClockPlus5) {
      btnClockPlus5.addEventListener('click', function () {
        state.clockSeconds += 300;
        updateClockUi();
        renderTab2();
        renderTab4();
        showToast('Advanced exercise clock +5 minutes to ' + formatElapsedClock(state.clockSeconds) + '.');
      });
    }

    if (btnClockReset) {
      btnClockReset.addEventListener('click', function () {
        state.clockSeconds = 0;
        state.clockRunning = false;
        if (clockInterval) {
          clearInterval(clockInterval);
          clockInterval = null;
        }
        updateClockUi();
        renderTab2();
      });
    }

    // Tab Navigation
    var tabBtns = [
      document.getElementById('tab-btn-1'),
      document.getElementById('tab-btn-2'),
      document.getElementById('tab-btn-3'),
      document.getElementById('tab-btn-4')
    ];
    var tabPanels = [
      document.getElementById('tab-panel-1'),
      document.getElementById('tab-panel-2'),
      document.getElementById('tab-panel-3'),
      document.getElementById('tab-panel-4')
    ];

    function setActiveTab(tabId) {
      state.activeTab = String(tabId);
      for (var t = 0; t < 4; t += 1) {
        var isMatch = String(t + 1) === state.activeTab;
        if (tabBtns[t]) {
          tabBtns[t].classList.toggle('is-active', isMatch);
          tabBtns[t].setAttribute('aria-selected', isMatch ? 'true' : 'false');
        }
        if (tabPanels[t]) {
          tabPanels[t].classList.toggle('is-hidden', !isMatch);
        }
      }
    }

    for (var tb = 0; tb < tabBtns.length; tb += 1) {
      if (tabBtns[tb]) {
        (function (idx) {
          tabBtns[idx].addEventListener('click', function () {
            setActiveTab(String(idx + 1));
          });
        })(tb);
      }
    }

    // Helper: Collect active cascade alerts prior to inject index
    function getPriorCascades(upToInjectIndex) {
      var cascades = [];
      var injects = config.injects || [];
      var limit = typeof upToInjectIndex === 'number' ? upToInjectIndex : injects.length;
      for (var i = 0; i < limit; i += 1) {
        var inj = injects[i];
        var pickedId = state.injectChoices[inj.id];
        if (!pickedId) continue;
        var opts = inj.options || [];
        for (var k = 0; k < opts.length; k += 1) {
          if (opts[k].id === pickedId && opts[k].cascadeAlert) {
            cascades.push({
              injectClock: inj.clock,
              grade: opts[k].grade,
              alertText: localize(opts[k].cascadeAlert)
            });
          }
        }
      }
      return cascades;
    }

    function renderCrosswalkRibbon() {
      var ribbon = document.getElementById('crosswalk-ribbon');
      if (!ribbon) return;
      clearNode(ribbon);
      var sm = config.stateMeta || {};
      var jurLabelEl = document.querySelector('label[for="county-select"]');
      if (jurLabelEl && sm.selectLabel) {
        jurLabelEl.textContent = sm.selectLabel;
      }
      var footerLeft = document.getElementById('footer-meta-left');
      if (footerLeft && sm.stateTitle) {
        footerLeft.textContent = sm.stateTitle + ' · HSEEP Multi-Role Tabletop & Crisis Simulator';
      }
      var footerRight = document.getElementById('footer-meta-right');
      if (footerRight && sm.statutoryFooter) {
        footerRight.textContent = sm.statutoryFooter;
      }
      var jur = getJurisdiction();
      var pairs = [
        [sm.seatLabel || 'County Seat', jur.seat, true],
        [sm.emaLabel || 'WVEMD Area', jur.wvemdArea, false],
        [sm.dotLabel || 'WVDOH District', jur.wvdohDistrict, false],
        [sm.policeLabel || 'WVSP Troop', jur.wvspTroop, false],
        [sm.rpdcLabel || 'RPDC', jur.rpdc, false],
        ['USACE District', jur.usaceDistrict, false],
        ['River Basin', jur.riverBasin, false],
        ['Legacy Flood Works', String(jur.legacyFloodWorks) + ' Structures', true]
      ];
      for (var i = 0; i < pairs.length; i += 1) {
        var item = el('div', 'crosswalk-item');
        item.appendChild(el('span', 'crosswalk-key', pairs[i][0] + ':'));
        item.appendChild(
          el('span', pairs[i][2] ? 'crosswalk-val crosswalk-val-gold' : 'crosswalk-val', pairs[i][1])
        );
        ribbon.appendChild(item);
      }
    }

    function renderRoleBar() {
      var container = document.getElementById('role-pills-container');
      if (!container) return;
      clearNode(container);
      var roles = config.roles || [];
      for (var i = 0; i < roles.length; i += 1) {
        (function (role) {
          var btn = el(
            'button',
            role.id === state.activeRoleId ? 'role-pill is-active' : 'role-pill',
            role.shortLabel
          );
          btn.type = 'button';
          btn.addEventListener('click', function () {
            state.activeRoleId = role.id;
            renderRoleBar();
            renderTab1();
            renderTab2();
            showToast('Switched Fog-of-War view to: ' + role.shortLabel);
          });
          container.appendChild(btn);
        })(roles[i]);
      }
    }

    function updateHeaderBadges() {
      var injBadge = document.getElementById('tab-badge-injects');
      var injects = config.injects || [];
      var answered = Object.keys(state.injectChoices).length;
      var activeCascades = getPriorCascades(injects.length).length;
      if (injBadge) {
        injBadge.textContent = activeCascades > 0
          ? answered + '/' + injects.length + ' · ' + activeCascades + ' CASCADE'
          : answered + '/' + injects.length;
        injBadge.className = 'tab-pill ' + (activeCascades > 0 ? 'pill-bad' : (answered === injects.length ? 'pill-good' : ''));
      }

      var scorerBadge = document.getElementById('tab-badge-scorer');
      var warningEval = scorePublicWarning(state.warningDraftRaw, getJurisdiction());
      if (scorerBadge) {
        scorerBadge.textContent = warningEval.score + '/100';
        scorerBadge.className = 'tab-pill ' + (warningEval.score >= 85 ? 'pill-good' : (warningEval.score >= 60 ? 'pill-warn' : 'pill-bad'));
      }
    }

    // TAB 1: Briefing, Roles & Dispatch
    function renderTab1() {
      var panel = document.getElementById('tab-panel-1');
      if (!panel) return;
      clearNode(panel);

      var haz = (config.meta && config.meta.hazmatProfile) || {};
      var dispatchedCount = 0;
      var stagedCount = 0;
      var etaSum = 0;
      for (var r = 0; r < resourcesList.length; r += 1) {
        var st = state.resourceStatus[resourcesList[r].id];
        if (st === 'Dispatched') {
          dispatchedCount += 1;
          etaSum += resourcesList[r].etaMin;
        } else if (st === 'Staged') {
          stagedCount += 1;
        }
      }
      var avgEta = dispatchedCount > 0 ? Math.round(etaSum / dispatchedCount) + ' min avg ETA' : 'Ready for tasking';

      // KPI Strip
      var kpiStrip = el('div', 'kpi-strip');
      var kpis = [
        {
          cls: 'kpi-card kpi-crimson',
          label: 'Primary Hazmat Release',
          val: haz.un + ' · ' + Number(haz.releaseQuantityLb || 9000).toLocaleString() + ' lb',
          sub: haz.material + ' · ERG 2024 Guide ' + haz.guide
        },
        {
          cls: 'kpi-card kpi-gold',
          label: 'ERG 2024 Protective Zones',
          val: haz.initialIsolationFt + ' ft / ' + haz.downwindDayMi + ' mi ENE',
          sub: 'Large Spill Isolation · ' + haz.downwindNightMi + ' mi Night Inversion'
        },
        {
          cls: 'kpi-card',
          label: 'Cyber & Utility Compound',
          val: 'SCADA < 20 psi Alert',
          sub: 'WV HB 5638 OT Isolation · Boil-Water Threshold'
        },
        {
          cls: 'kpi-card kpi-emerald',
          label: 'WV Resource Mobilization',
          val: dispatchedCount + ' Dispatched · ' + stagedCount + ' Staged',
          sub: resourcesList.length + ' Total WV Units · ' + avgEta
        }
      ];
      for (var k = 0; k < kpis.length; k += 1) {
        var kc = el('div', kpis[k].cls);
        kc.appendChild(el('div', 'kpi-label', kpis[k].label));
        kc.appendChild(el('div', 'kpi-value', kpis[k].val));
        kc.appendChild(el('div', 'kpi-sub', kpis[k].sub));
        kpiStrip.appendChild(kc);
      }
      panel.appendChild(kpiStrip);

      // 2-Column Briefing + Role Fog-of-War Intel
      var twoCol = el('div', 'grid-two-col');

      // Left Card: Situation Briefing
      var briefCard = el('div', 'card card-navy-accent');
      var briefHdr = el('div', 'card-header');
      briefHdr.appendChild(el('h2', 'card-title', 'Situation Manual (SitMan) Briefing — ' + localize('{COUNTY} County ({SEAT})')));
      briefHdr.appendChild(el('span', 'badge badge-navy', config.meta ? config.meta.operationalPeriod : 'OP PERIOD 1'));
      briefCard.appendChild(briefHdr);

      briefCard.appendChild(el('p', 'prose-p', localize(config.briefing && config.briefing.executiveSummary)));
      briefCard.appendChild(el('div', 'erg-rule-callout', localize(haz.tacticalRule)));

      briefCard.appendChild(el('div', 'section-subhead', 'Incident Chronology (EST)'));
      var tlList = el('ul', 'timeline-list');
      var timelines = (config.briefing && config.briefing.keyTimelines) || [];
      for (var tl = 0; tl < timelines.length; tl += 1) {
        var row = el('li', 'timeline-row');
        row.appendChild(el('span', 'timeline-time', timelines[tl].time));
        row.appendChild(el('span', null, localize(timelines[tl].event)));
        tlList.appendChild(row);
      }
      briefCard.appendChild(tlList);

      briefCard.appendChild(el('div', 'section-subhead', 'HSEEP Exercise Objectives'));
      var objList = el('ul', 'intel-list');
      var objs = (config.briefing && config.briefing.objectives) || [];
      for (var ob = 0; ob < objs.length; ob += 1) {
        objList.appendChild(
          el('li', 'intel-item', objs[ob].code + ' [' + objs[ob].capability + ']: ' + localize(objs[ob].text))
        );
      }
      briefCard.appendChild(objList);
      twoCol.appendChild(briefCard);

      // Right Card: Active Seat Fog-of-War Intelligence
      var activeRole = (config.roles || [])[0];
      for (var rl = 0; rl < (config.roles || []).length; rl += 1) {
        if (config.roles[rl].id === state.activeRoleId) {
          activeRole = config.roles[rl];
          break;
        }
      }

      var roleCard = el('div', 'card card-gold-accent');
      var roleHdr = el('div', 'card-header');
      roleHdr.appendChild(el('h2', 'card-title', localize(activeRole.title)));
      roleHdr.appendChild(el('span', 'badge badge-gold', activeRole.badge));
      roleCard.appendChild(roleHdr);

      roleCard.appendChild(el('p', 'prose-p', localize(activeRole.summary)));

      roleCard.appendChild(el('div', 'section-subhead', 'Seat-Specific Fog-of-War Intelligence'));
      var factsList = el('ul', 'intel-list');
      var facts = activeRole.knownFacts || [];
      for (var fi = 0; fi < facts.length; fi += 1) {
        factsList.appendChild(el('li', 'intel-item', localize(facts[fi])));
      }
      roleCard.appendChild(factsList);

      if (activeRole.blindSpots && activeRole.blindSpots.length > 0) {
        roleCard.appendChild(el('div', 'section-subhead', 'Cross-Agency Blind Spot (Requires Table Coordination)'));
        roleCard.appendChild(el('div', 'blindspot-box', localize(activeRole.blindSpots[0])));
      }

      roleCard.appendChild(el('div', 'section-subhead', 'Key Decisions & Prompts for Your Seat'));
      var qList = el('ul', 'intel-list');
      var pqs = activeRole.priorityQuestions || [];
      for (var qi = 0; qi < pqs.length; qi += 1) {
        qList.appendChild(el('li', 'intel-item', localize(pqs[qi])));
      }
      roleCard.appendChild(qList);

      roleCard.appendChild(el('div', 'anchor-footer', 'Statutory & Doctrine Anchors: ' + localize(activeRole.statutoryAnchors)));
      twoCol.appendChild(roleCard);
      panel.appendChild(twoCol);

      // Dispatchable Resource Roster
      var smRoster = config.stateMeta || {};
      var shortState = smRoster.shortState || 'West Virginia';
      var shortCode = smRoster.stateCode || 'WV';
      var rosterCard = el('div', 'card');
      var rosterHdr = el('div', 'card-header');
      rosterHdr.appendChild(
        el('h2', 'card-title', 'Dispatchable ' + shortState + ' Multi-Agency Resource Roster (' + resourcesList.length + ' Units)')
      );

      var categories = ['ALL'];
      for (var rc = 0; rc < resourcesList.length; rc += 1) {
        if (categories.indexOf(resourcesList[rc].category) === -1) {
          categories.push(resourcesList[rc].category);
        }
      }
      var filterWrap = el('div', 'filter-pills');
      for (var ci = 0; ci < categories.length; ci += 1) {
        (function (catName) {
          var fp = el(
            'button',
            state.resourceCategoryFilter === catName ? 'filter-pill is-active' : 'filter-pill',
            catName === 'ALL' ? 'All ' + shortCode + ' Units (' + resourcesList.length + ')' : catName
          );
          fp.type = 'button';
          fp.addEventListener('click', function () {
            state.resourceCategoryFilter = catName;
            renderTab1();
          });
          filterWrap.appendChild(fp);
        })(categories[ci]);
      }
      rosterHdr.appendChild(filterWrap);
      rosterCard.appendChild(rosterHdr);

      var scrollWrap = el('div', 'table-scroll');
      var table = el('table', 'data-table');
      var thead = el('thead');
      var trHead = el('tr');
      var cols = ['Unit / Asset', 'WV Agency', 'Discipline', 'ETA', 'Assigned Tactical Zone', 'Operational Capability', 'Status', 'Command Action'];
      for (var ch = 0; ch < cols.length; ch += 1) {
        trHead.appendChild(el('th', null, cols[ch]));
      }
      thead.appendChild(trHead);
      table.appendChild(thead);

      var tbody = el('tbody');
      for (var u = 0; u < resourcesList.length; u += 1) {
        var unit = resourcesList[u];
        if (state.resourceCategoryFilter !== 'ALL' && unit.category !== state.resourceCategoryFilter) {
          continue;
        }
        var curStatus = state.resourceStatus[unit.id] || 'Available';
        var tr = el('tr');
        tr.appendChild(el('td', 'unit-name', localize(unit.unitName)));
        tr.appendChild(el('td', null, localize(unit.agency)));
        tr.appendChild(el('td', null, unit.category));
        tr.appendChild(el('td', 'mono-cell', unit.etaMin + 'm'));
        tr.appendChild(el('td', null, localize(unit.assignedZone)));
        tr.appendChild(el('td', null, localize(unit.capability)));

        var tdBadge = el('td');
        var badgeCls = curStatus === 'Dispatched' ? 'badge badge-good' : (curStatus === 'Staged' ? 'badge badge-warn' : 'badge badge-navy');
        tdBadge.appendChild(el('span', badgeCls, curStatus));
        tr.appendChild(tdBadge);

        var tdAct = el('td');
        var btnGrp = el('div', 'dispatch-btn-group');
        (function (unitObj) {
          var bDisp = el('button', 'btn btn-gold-primary btn-sm', 'Dispatch');
          bDisp.type = 'button';
          bDisp.addEventListener('click', function () {
            state.resourceStatus[unitObj.id] = 'Dispatched';
            renderTab1();
            renderTab4();
            showToast('Dispatched ' + localize(unitObj.unitName) + ' (ETA ' + unitObj.etaMin + 'm).');
          });

          var bStg = el('button', 'btn btn-surface btn-sm', 'Stage');
          bStg.type = 'button';
          bStg.addEventListener('click', function () {
            state.resourceStatus[unitObj.id] = 'Staged';
            renderTab1();
            renderTab4();
          });

          var bAvl = el('button', 'btn btn-surface btn-sm', 'Hold');
          bAvl.type = 'button';
          bAvl.addEventListener('click', function () {
            state.resourceStatus[unitObj.id] = 'Available';
            renderTab1();
            renderTab4();
          });

          btnGrp.appendChild(bDisp);
          btnGrp.appendChild(bStg);
          btnGrp.appendChild(bAvl);
        })(unit);
        tdAct.appendChild(btnGrp);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      scrollWrap.appendChild(table);
      rosterCard.appendChild(scrollWrap);
      panel.appendChild(rosterCard);
    }

    // Build Interactive SVG Tactical Map (createElementNS exclusively)
    function buildTacticalSvg(readoutSpan, facilityBox) {
      var mapCfg = config.tacticalMap || {};
      var facilities = mapCfg.facilities || [];
      var svg = svgEl('svg', {
        viewBox: '0 0 620 420',
        class: 'tactical-svg',
        role: 'img',
        'aria-label': 'ERG 2024 UN1005 Plume and 4-Sheet Tactical Plotter Map'
      });

      // Background dark tactical slate
      svg.appendChild(svgEl('rect', { x: 0, y: 0, width: 620, height: 420, fill: '#0A1525' }));

      // Valley contour shading
      svg.appendChild(svgEl('path', {
        d: 'M 0,310 Q 190,265 360,215 T 620,130 L 620,255 Q 390,305 210,360 L 0,400 Z',
        fill: '#102138',
        opacity: '0.75'
      }));

      // River Basin Channel
      svg.appendChild(svgEl('path', {
        d: 'M 0,342 Q 195,288 375,232 T 620,152',
        fill: 'none',
        stroke: '#1E4E79',
        'stroke-width': 22,
        'stroke-linecap': 'round'
      }));
      svg.appendChild(svgEl('path', {
        d: 'M 0,342 Q 195,288 375,232 T 620,152',
        fill: 'none',
        stroke: '#38bdf8',
        'stroke-width': 2,
        'stroke-dasharray': '6,6',
        opacity: '0.55'
      }));

      // Secondary Upwind Ridge Access Road + Main Valley Highway & Valley Bridge
      svg.appendChild(svgEl('path', {
        d: 'M 30,385 L 135,342 L 112,278 L 228,88',
        fill: 'none',
        stroke: '#64748B',
        'stroke-width': 3,
        'stroke-dasharray': '5,4'
      }));
      svg.appendChild(svgEl('path', {
        d: 'M 40,260 L 255,255 L 392,235 L 585,195',
        fill: 'none',
        stroke: '#94A3B8',
        'stroke-width': 4
      }));
      // Valley Bridge span marker
      svg.appendChild(svgEl('line', {
        x1: 374,
        y1: 218,
        x2: 410,
        y2: 252,
        stroke: '#F59E0B',
        'stroke-width': 5
      }));

      // 4-Sheet Plotter Grid (Cols A-D: 155px each; Rows 1-4: 105px each)
      for (var c = 1; c < 4; c += 1) {
        svg.appendChild(svgEl('line', {
          x1: c * 155,
          y1: 0,
          x2: c * 155,
          y2: 420,
          stroke: c === 2 ? '#D5A245' : '#233854',
          'stroke-width': c === 2 ? 1.4 : 1,
          'stroke-dasharray': c === 2 ? '6,4' : '2,4',
          opacity: c === 2 ? '0.65' : '0.8'
        }));
      }
      for (var r = 1; r < 4; r += 1) {
        svg.appendChild(svgEl('line', {
          x1: 0,
          y1: r * 105,
          x2: 620,
          y2: r * 105,
          stroke: r === 2 ? '#D5A245' : '#233854',
          'stroke-width': r === 2 ? 1.4 : 1,
          'stroke-dasharray': r === 2 ? '6,4' : '2,4',
          opacity: r === 2 ? '0.65' : '0.8'
        }));
      }

      // Grid Col & Row Labels + 4-Sheet Labels
      var colLetters = ['A', 'B', 'C', 'D'];
      for (var cl = 0; cl < 4; cl += 1) {
        var cTxt = svgEl('text', {
          x: cl * 155 + 77,
          y: 15,
          'text-anchor': 'middle',
          fill: '#8EA4C2',
          'font-size': '10',
          'font-family': 'monospace',
          'font-weight': '700'
        });
        cTxt.textContent = 'COL ' + colLetters[cl];
        svg.appendChild(cTxt);
      }
      for (var rl = 0; rl < 4; rl += 1) {
        var rTxt = svgEl('text', {
          x: 10,
          y: rl * 105 + 56,
          fill: '#8EA4C2',
          'font-size': '10',
          'font-family': 'monospace',
          'font-weight': '700'
        });
        rTxt.textContent = String(rl + 1);
        svg.appendChild(rTxt);
      }

      var sheetTags = [
        { x: 32, y: 32, t: 'SHEET 1 (NW)' },
        { x: 320, y: 32, t: 'SHEET 2 (NE)' },
        { x: 32, y: 408, t: 'SHEET 3 (SW)' },
        { x: 320, y: 408, t: 'SHEET 4 (SE)' }
      ];
      for (var st = 0; st < sheetTags.length; st += 1) {
        var sTxt = svgEl('text', {
          x: sheetTags[st].x,
          y: sheetTags[st].y,
          fill: '#D5A245',
          opacity: '0.72',
          'font-size': '9.5',
          'font-family': 'monospace',
          'font-weight': '700'
        });
        sTxt.textContent = sheetTags[st].t;
        svg.appendChild(sTxt);
      }

      // Optional 1.3 mi Nighttime Inversion Plume Layer
      if (state.mapLayers.plumeNight13) {
        svg.appendChild(svgEl('polygon', {
          points: '255,255 598,42 618,225',
          fill: '#A855F7',
          opacity: '0.16',
          stroke: '#C084FC',
          'stroke-width': 1.5,
          'stroke-dasharray': '6,4'
        }));
        var nightLbl = svgEl('text', {
          x: 525,
          y: 92,
          'text-anchor': 'middle',
          fill: '#E9D5FF',
          'font-size': '9.5',
          'font-family': 'monospace',
          'font-weight': '700'
        });
        nightLbl.textContent = '1.3 MI NIGHT PLUME';
        svg.appendChild(nightLbl);
      }

      // 0.5 mi Daytime Downwind Plume Cone (WSW -> ENE 065 deg)
      if (state.mapLayers.plumeDay05) {
        svg.appendChild(svgEl('polygon', {
          points: '255,255 478,118 516,246',
          fill: '#F59E0B',
          opacity: '0.26',
          stroke: '#FBBF24',
          'stroke-width': 2
        }));
        svg.appendChild(svgEl('polygon', {
          points: '255,255 415,166 438,236',
          fill: '#EF4444',
          opacity: '0.30',
          stroke: '#F87171',
          'stroke-width': 1.2,
          'stroke-dasharray': '4,3'
        }));
        var plumeLbl = svgEl('text', {
          x: 438,
          y: 146,
          'text-anchor': 'middle',
          fill: '#FDE68A',
          'font-size': '10',
          'font-family': 'monospace',
          'font-weight': '800'
        });
        plumeLbl.textContent = '0.5 MI ENE PLUME (GUIDE 125)';
        svg.appendChild(plumeLbl);
      }

      // 500 ft Initial Isolation Circle around Cold Storage (255, 255)
      if (state.mapLayers.isolation500) {
        svg.appendChild(svgEl('circle', {
          cx: 255,
          cy: 255,
          r: 44,
          fill: '#DC2626',
          opacity: '0.26',
          stroke: '#F87171',
          'stroke-width': 2,
          'stroke-dasharray': '5,3'
        }));
        var isoLbl = svgEl('text', {
          x: 255,
          y: 204,
          'text-anchor': 'middle',
          fill: '#FCA5A5',
          'font-size': '9.5',
          'font-family': 'monospace',
          'font-weight': '800'
        });
        isoLbl.textContent = '500 FT ISOLATION';
        svg.appendChild(isoLbl);
      }

      // Critical Facilities Layer
      if (state.mapLayers.facilities) {
        var colorByType = {
          hazard: '#EF4444',
          vulnerable: '#F59E0B',
          checkpoint: '#FB923C',
          utility: '#38BDF8',
          medical: '#34D399',
          command: '#D5A245',
          staging: '#A3E635'
        };

        for (var f = 0; f < facilities.length; f += 1) {
          (function (fac) {
            var isSelected = fac.id === state.selectedFacilityId;
            var grp = svgEl('g', {
              class: 'fac-node',
              tabindex: '0',
              role: 'button',
              'aria-label': localize(fac.name) + ' (' + fac.grid + ')'
            });

            if (isSelected) {
              grp.appendChild(svgEl('circle', {
                cx: fac.x,
                cy: fac.y,
                r: 16,
                fill: 'none',
                stroke: '#FFFFFF',
                'stroke-width': 2
              }));
            }

            grp.appendChild(svgEl('circle', {
              cx: fac.x,
              cy: fac.y,
              r: 10,
              fill: colorByType[fac.type] || '#D5A245',
              stroke: '#09111E',
              'stroke-width': 2
            }));

            var codeTxt = svgEl('text', {
              x: fac.x,
              y: fac.y + 3.5,
              'text-anchor': 'middle',
              fill: '#09111E',
              'font-size': '7.5',
              'font-family': 'monospace',
              'font-weight': '900'
            });
            codeTxt.textContent = fac.code;
            grp.appendChild(codeTxt);

            var nameBg = svgEl('rect', {
              x: fac.x - 54,
              y: fac.y + 13,
              width: 108,
              height: 15,
              rx: 3,
              fill: '#09111E',
              opacity: '0.86'
            });
            grp.appendChild(nameBg);

            var nameTxt = svgEl('text', {
              x: fac.x,
              y: fac.y + 23.5,
              'text-anchor': 'middle',
              fill: '#F8FAFC',
              'font-size': '8.5',
              'font-family': 'sans-serif',
              'font-weight': '700'
            });
            var shortName = localize(fac.name);
            if (shortName.length > 22) {
              shortName = shortName.slice(0, 21) + '…';
            }
            nameTxt.textContent = shortName;
            grp.appendChild(nameTxt);

            grp.addEventListener('click', function (ev) {
              ev.stopPropagation();
              state.selectedFacilityId = fac.id;
              state.plotterReadout = fac.sheet + ' · Grid ' + fac.grid + ' · ' + fac.distanceMi;
              renderTab2();
            });
            svg.appendChild(grp);
          })(facilities[f]);
        }
      }

      // River label
      var rivTxt = svgEl('text', {
        x: 530,
        y: 190,
        fill: '#7DD3FC',
        'font-size': '9.5',
        'font-family': 'monospace',
        'font-weight': '700',
        transform: 'rotate(-16 530 190)'
      });
      rivTxt.textContent = localize('{RIVER_BASIN}');
      svg.appendChild(rivTxt);

      // Wind & Inversion Badge (Top-Right)
      svg.appendChild(svgEl('rect', {
        x: 278,
        y: 38,
        width: 332,
        height: 24,
        rx: 4,
        fill: '#09111E',
        stroke: '#D5A245',
        'stroke-width': 1.2,
        opacity: '0.94'
      }));
      var windTxt = svgEl('text', {
        x: 444,
        y: 53.5,
        'text-anchor': 'middle',
        fill: '#E5B964',
        'font-size': '8.4',
        'font-family': 'monospace',
        'font-weight': '800'
      });
      windTxt.textContent = mapCfg.windBadge || 'WIND WSW 245° -> PLUME ENE 065°';
      svg.appendChild(windTxt);

      // Interactive 4-Sheet Plotter Coordinate Hover/Click
      function handlePointer(evt) {
        var pt = svg.getBoundingClientRect();
        if (!pt.width || !pt.height) return;
        var sx = ((evt.clientX - pt.left) / pt.width) * 620;
        var sy = ((evt.clientY - pt.top) / pt.height) * 420;
        var cIdx = Math.min(3, Math.max(0, Math.floor(sx / 155)));
        var rIdx = Math.min(3, Math.max(0, Math.floor(sy / 105)));
        var gridCode = colLetters[cIdx] + String(rIdx + 1);
        var sheetNum = (rIdx < 2 ? (cIdx < 2 ? 'Sheet 1 (NW)' : 'Sheet 2 (NE)') : (cIdx < 2 ? 'Sheet 3 (SW)' : 'Sheet 4 (SE)'));
        var dx = sx - 255;
        var dy = sy - 255;
        // 245 px ~= 0.50 mi scale
        var distMi = (Math.sqrt(dx * dx + dy * dy) / 490).toFixed(2);
        var text = sheetNum + ' · Grid ' + gridCode + ' · ' + distMi + ' mi from UN1005 Source';
        state.plotterReadout = text;
        if (readoutSpan) {
          readoutSpan.textContent = text;
        }
      }

      svg.addEventListener('mousemove', handlePointer);
      svg.addEventListener('click', handlePointer);

      // Populate Selected Facility Detail Box
      if (facilityBox) {
        clearNode(facilityBox);
        var selFac = facilities[0];
        for (var sf = 0; sf < facilities.length; sf += 1) {
          if (facilities[sf].id === state.selectedFacilityId) {
            selFac = facilities[sf];
            break;
          }
        }
        if (selFac) {
          var topLine = el('div', 'option-top-row');
          topLine.appendChild(el('strong', null, localize(selFac.name) + ' [' + selFac.sheet + ' · Grid ' + selFac.grid + ']'));
          topLine.appendChild(el('span', 'badge badge-navy', selFac.distanceMi));
          facilityBox.appendChild(topLine);
          facilityBox.appendChild(el('div', null, localize(selFac.note)));
        }
      }

      return svg;
    }

    // TAB 2: Timed Injects & Tactical SVG Map
    function renderTab2() {
      var panel = document.getElementById('tab-panel-2');
      if (!panel) return;
      clearNode(panel);

      var grid = el('div', 'grid-tactical');

      // Left Column: Tactical Plotter Map
      var mapCard = el('div', 'card card-navy-accent tactical-sticky');
      var mapHdr = el('div', 'card-header');
      mapHdr.appendChild(el('h2', 'card-title', 'Tactical Plume & 4-Sheet Plotter — ' + localize('{SEAT} Corridor')));
      mapHdr.appendChild(el('span', 'badge badge-gold', 'ERG 2024 GUIDE 125'));
      mapCard.appendChild(mapHdr);

      var layerBar = el('div', 'map-layer-toggles');
      var layerDefs = [
        ['isolation500', '500 ft Isolation Circle'],
        ['plumeDay05', '0.5 mi Downwind Plume'],
        ['plumeNight13', '1.3 mi Night Inversion'],
        ['facilities', 'Critical Facilities (7)']
      ];
      for (var ld = 0; ld < layerDefs.length; ld += 1) {
        (function (key, label) {
          var btn = el(
            'button',
            state.mapLayers[key] ? 'layer-toggle is-active' : 'layer-toggle',
            (state.mapLayers[key] ? '\u2713 ' : '') + label
          );
          btn.type = 'button';
          btn.addEventListener('click', function () {
            state.mapLayers[key] = !state.mapLayers[key];
            renderTab2();
          });
          layerBar.appendChild(btn);
        })(layerDefs[ld][0], layerDefs[ld][1]);
      }
      mapCard.appendChild(layerBar);

      var svgFrame = el('div', 'svg-map-frame');
      var readoutBar = el('div', 'plotter-readout-bar');
      readoutBar.appendChild(el('span', null, '4-SHEET PLOTTER REF:'));
      var readoutSpan = el('span', 'crosswalk-val-gold', state.plotterReadout);
      readoutBar.appendChild(readoutSpan);

      var facilityBox = el('div', 'facility-detail-box');
      svgFrame.appendChild(buildTacticalSvg(readoutSpan, facilityBox));
      mapCard.appendChild(svgFrame);
      mapCard.appendChild(readoutBar);
      mapCard.appendChild(facilityBox);
      grid.appendChild(mapCard);

      // Right Column: 4 Timed Multi-Domain Injects + Dynamic Consequence Branching
      var injectCol = el('div');
      var injects = config.injects || [];
      var elapsedMins = Math.floor(state.clockSeconds / 60);

      var jumpBar = el('div', 'inject-jump-bar');
      for (var jb = 0; jb < injects.length; jb += 1) {
        (function (injItem) {
          var picked = state.injectChoices[injItem.id];
          var pill = el(
            'button',
            picked ? 'filter-pill is-active' : 'filter-pill',
            injItem.clock + ' · ' + injItem.domain + (picked ? ' \u2713' : '')
          );
          pill.type = 'button';
          pill.addEventListener('click', function () {
            var targetNode = document.getElementById('card-' + injItem.id);
            if (targetNode && targetNode.scrollIntoView) {
              targetNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          });
          jumpBar.appendChild(pill);
        })(injects[jb]);
      }
      injectCol.appendChild(jumpBar);

      var stack = el('div', 'inject-stack');
      for (var i = 0; i < injects.length; i += 1) {
        (function (inj, idx) {
          var injMins = parseClockMinutes(inj.clock);
          var isDue = elapsedMins >= injMins;
          var card = el('article', isDue ? 'inject-card is-due' : 'inject-card');
          card.id = 'card-' + inj.id;

          var hdr = el('div', 'card-header');
          hdr.appendChild(el('h3', 'card-title', inj.clock + ' — ' + localize(inj.title)));
          var metaBadges = el('div', 'dispatch-btn-group');
          metaBadges.appendChild(el('span', 'badge badge-navy', inj.domain));
          metaBadges.appendChild(el('span', 'badge badge-gold', inj.targetSeat));
          hdr.appendChild(metaBadges);
          card.appendChild(hdr);

          // DYNAMIC CONSEQUENCE BRANCHING BANNER from earlier injects!
          var priorCascades = getPriorCascades(idx);
          if (priorCascades.length > 0) {
            var cBanner = el('div', 'cascade-banner');
            cBanner.appendChild(
              el('div', 'cascade-banner-title', '\u26A0 DYNAMIC CASCADE ALERT — COMPOUND OPERATIONAL CONSEQUENCE (' + priorCascades.length + ')')
            );
            for (var pc = 0; pc < priorCascades.length; pc += 1) {
              cBanner.appendChild(el('div', 'cascade-banner-item', '\u2022 ' + priorCascades[pc].alertText));
            }
            card.appendChild(cBanner);
          }

          card.appendChild(el('p', 'prose-p', localize(inj.prompt)));

          var optGrid = el('div', 'options-grid');
          var chosenOption = null;
          var opts = inj.options || [];

          for (var o = 0; o < opts.length; o += 1) {
            (function (opt) {
              var isPicked = state.injectChoices[inj.id] === opt.id;
              if (isPicked) {
                chosenOption = opt;
              }
              var selClass = '';
              if (isPicked) {
                if (opt.grade === 'RECOMMENDED') selClass = ' selected-RECOMMENDED';
                else if (opt.grade === 'ACCEPTABLE WITH LIMITS') selClass = ' selected-ACCEPTABLE';
                else selClass = ' selected-NOT_RECOMMENDED';
              }

              var oBtn = el('button', 'option-btn' + selClass);
              oBtn.type = 'button';

              var topRow = el('div', 'option-top-row');
              topRow.appendChild(el('span', 'option-label', opt.label));
              if (isPicked) {
                var gCls = opt.grade === 'RECOMMENDED'
                  ? 'badge badge-good'
                  : (opt.grade === 'ACCEPTABLE WITH LIMITS' ? 'badge badge-warn' : 'badge badge-bad');
                topRow.appendChild(el('span', gCls, opt.grade));
              }
              oBtn.appendChild(topRow);
              oBtn.appendChild(el('div', 'option-summary', localize(opt.summary)));

              oBtn.addEventListener('click', function () {
                state.injectChoices[inj.id] = opt.id;
                updateHeaderBadges();
                renderTab2();
                renderTab4();
                showToast(inj.clock + ' decision logged: ' + opt.label + ' (' + opt.grade + ')');
              });

              optGrid.appendChild(oBtn);
            })(opts[o]);
          }
          card.appendChild(optGrid);

          if (chosenOption) {
            var fb = el('div', 'evaluation-feedback');
            var fbBadgeCls = chosenOption.grade === 'RECOMMENDED'
              ? 'badge badge-good'
              : (chosenOption.grade === 'ACCEPTABLE WITH LIMITS' ? 'badge badge-warn' : 'badge badge-bad');
            var fbHeader = el('div', 'option-top-row');
            fbHeader.appendChild(el('strong', null, 'HSEEP Evaluator Finding — ' + chosenOption.label));
            fbHeader.appendChild(el('span', fbBadgeCls, chosenOption.grade));
            fb.appendChild(fbHeader);
            fb.appendChild(el('div', null, localize(chosenOption.rationale)));
            fb.appendChild(el('div', 'evaluation-cite', 'Authority / Citation: ' + localize(chosenOption.citation)));
            card.appendChild(fb);
          }

          stack.appendChild(card);
        })(injects[i], i);
      }

      injectCol.appendChild(stack);
      grid.appendChild(injectCol);
      panel.appendChild(grid);
    }

    // TAB 3: Media Inject & 7-Essentials Public Warning Auto-Scorer
    function renderTab3() {
      var panel = document.getElementById('tab-panel-3');
      if (!panel) return;
      clearNode(panel);

      var media = config.mediaInject || {};
      var twoCol = el('div', 'grid-two-col');

      // Left Card: Live Broadcast Media Inject
      var mediaCard = el('div', 'card card-navy-accent');
      var mediaHdr = el('div', 'card-header');
      mediaHdr.appendChild(el('h2', 'card-title', 'Broadcast & Social Rumor Inject'));
      mediaHdr.appendChild(el('span', 'badge badge-bad', 'RUMOR CONTROL GATE'));
      mediaCard.appendChild(mediaHdr);

      var screen = el('div', 'broadcast-screen');
      var topBar = el('div', 'broadcast-top-bar');
      topBar.appendChild(el('span', null, media.outlet || 'LIVE · Mountain State 8 News'));
      topBar.appendChild(el('span', null, media.clock || 'T+24m'));
      screen.appendChild(topBar);

      var bBody = el('div', 'broadcast-body');
      bBody.appendChild(el('h3', 'broadcast-headline', localize(media.headline)));
      bBody.appendChild(el('p', 'broadcast-quote', localize(media.transcript)));
      screen.appendChild(bBody);
      mediaCard.appendChild(screen);

      mediaCard.appendChild(el('div', 'section-subhead', 'PIO & County Commission Mission'));
      mediaCard.appendChild(el('p', 'prose-p', localize(media.pioTask)));

      var presetRow = el('div', 'dispatch-btn-group');
      var btnGoldSample = el('button', 'btn btn-gold-primary btn-sm', 'Load Gold-Standard <=120w Draft');
      btnGoldSample.type = 'button';
      btnGoldSample.addEventListener('click', function () {
        state.warningCustomized = false;
        state.warningDraftRaw = localize(media.sampleGoldDraft);
        updateHeaderBadges();
        renderTab3();
        renderTab4();
      });

      var btnWeakSample = el('button', 'btn btn-surface btn-sm', 'Load Weak Jargon Draft (Demo)');
      btnWeakSample.type = 'button';
      btnWeakSample.addEventListener('click', function () {
        state.warningCustomized = true;
        state.warningDraftRaw = localize(media.sampleWeakDraft);
        updateHeaderBadges();
        renderTab3();
        renderTab4();
      });

      var btnClearDraft = el('button', 'btn btn-surface btn-sm', 'Clear Draft');
      btnClearDraft.type = 'button';
      btnClearDraft.addEventListener('click', function () {
        state.warningCustomized = true;
        state.warningDraftRaw = '';
        updateHeaderBadges();
        renderTab3();
        renderTab4();
      });

      presetRow.appendChild(btnGoldSample);
      presetRow.appendChild(btnWeakSample);
      presetRow.appendChild(btnClearDraft);
      mediaCard.appendChild(presetRow);
      twoCol.appendChild(mediaCard);

      // Right Card: Live 7-Essentials Scorer (0-100)
      var scorerCard = el('div', 'card card-gold-accent');
      var scorerHdr = el('div', 'card-header');
      scorerHdr.appendChild(el('h2', 'card-title', '7-Essentials <=120-Word Public Warning Auto-Scorer'));
      scorerHdr.appendChild(el('span', 'badge badge-navy', 'LIVE 0–100 RUBRIC'));
      scorerCard.appendChild(scorerHdr);

      var textarea = el('textarea', 'warning-textarea');
      textarea.id = 'warning-draft-input';
      textarea.setAttribute('aria-label', 'Public Emergency Warning Draft');
      textarea.value = state.warningDraftRaw;
      scorerCard.appendChild(textarea);

      var liveResultsWrap = el('div');
      scorerCard.appendChild(liveResultsWrap);

      function refreshScorerView() {
        clearNode(liveResultsWrap);
        var res = scorePublicWarning(state.warningDraftRaw, getJurisdiction());

        var sumRow = el('div', 'scorer-summary-row');
        var leftScore = el('div');
        leftScore.appendChild(el('div', 'control-label', 'HSEEP PUBLIC WARNING SCORE'));
        leftScore.appendChild(el('div', 'score-big', res.score + ' / 100'));
        sumRow.appendChild(leftScore);

        // SVG Progress Bar (zero inline style attributes!)
        var barSvg = svgEl('svg', {
          viewBox: '0 0 220 18',
          width: '220',
          height: '18',
          'aria-hidden': 'true'
        });
        barSvg.appendChild(svgEl('rect', { x: 0, y: 3, width: 220, height: 12, rx: 6, fill: '#213654' }));
        var fillW = Math.max(0, Math.min(220, Math.round((res.score / 100) * 220)));
        var barColor = res.score >= 85 ? '#34D399' : (res.score >= 60 ? '#FBBF24' : '#F87171');
        barSvg.appendChild(svgEl('rect', { x: 0, y: 3, width: fillW, height: 12, rx: 6, fill: barColor }));
        sumRow.appendChild(barSvg);

        var rightPills = el('div', 'dispatch-btn-group');
        rightPills.appendChild(
          el('span', res.wordCount <= 120 && res.wordCount >= 25 ? 'badge badge-good' : 'badge badge-bad', res.wordCount + ' / 120 words')
        );
        rightPills.appendChild(
          el('span', res.toneOk ? 'badge badge-good' : 'badge badge-warn', res.toneOk ? 'Tone: Calm' : 'Tone: Review')
        );
        sumRow.appendChild(rightPills);
        liveResultsWrap.appendChild(sumRow);

        var rList = el('div', 'rubric-list');
        for (var i = 0; i < res.rows.length; i += 1) {
          var item = res.rows[i];
          var rRow = el('div', 'rubric-row');
          var textWrap = el('div');
          textWrap.appendChild(el('div', 'rubric-title', item.name));
          textWrap.appendChild(el('div', 'rubric-hint', item.hint));
          rRow.appendChild(textWrap);

          var bCls = item.status === 'PASS' ? 'badge badge-good' : (item.status === 'PARTIAL' ? 'badge badge-warn' : 'badge badge-bad');
          rRow.appendChild(el('span', bCls, item.earned + '/' + item.max + ' · ' + item.status));
          rList.appendChild(rRow);
        }
        liveResultsWrap.appendChild(rList);
      }

      textarea.addEventListener('input', function () {
        state.warningCustomized = true;
        state.warningDraftRaw = textarea.value;
        updateHeaderBadges();
        refreshScorerView();
      });

      refreshScorerView();
      twoCol.appendChild(scorerCard);
      panel.appendChild(twoCol);
    }

    // TAB 4: HSEEP Debrief & 90-Day AAR/IP
    function renderTab4() {
      var panel = document.getElementById('tab-panel-4');
      if (!panel) return;
      clearNode(panel);

      var injects = config.injects || [];
      var recCount = 0;
      var answeredCount = 0;
      for (var ic = 0; ic < injects.length; ic += 1) {
        var pid = state.injectChoices[injects[ic].id];
        if (pid) {
          answeredCount += 1;
          var opts = injects[ic].options || [];
          for (var op = 0; op < opts.length; op += 1) {
            if (opts[op].id === pid && opts[op].grade === 'RECOMMENDED') {
              recCount += 1;
            }
          }
        }
      }
      var allCascades = getPriorCascades(injects.length);
      var warnScore = scorePublicWarning(state.warningDraftRaw, getJurisdiction());
      var due90 = computeEmpgDeadlineDate();

      // Debrief Summary KPIs
      var kpiStrip = el('div', 'kpi-strip');
      var debriefKpis = [
        {
          cls: 'kpi-card kpi-emerald',
          label: 'Inject Tactical Alignment',
          val: recCount + ' / ' + injects.length + ' Recommended',
          sub: answeredCount + ' of ' + injects.length + ' injects adjudicated · ' + allCascades.length + ' cascades'
        },
        {
          cls: 'kpi-card kpi-gold',
          label: 'Public Warning 7-Essentials',
          val: warnScore.score + ' / 100 pts',
          sub: warnScore.wordCount + ' words (<=120 gate)'
        },
        {
          cls: 'kpi-card',
          label: 'Jurisdiction & Clock',
          val: localize('{COUNTY} County'),
          sub: 'Seat: ' + localize('{SEAT}') + ' · Clock ' + formatElapsedClock(state.clockSeconds)
        },
        {
          cls: 'kpi-card kpi-crimson',
          label: '90-Day EMPG AAR/IP Deadline',
          val: due90,
          sub: 'FEMA FY2025 EMPG Manual §§ 12.8.2 & 12.10'
        }
      ];
      for (var dk = 0; dk < debriefKpis.length; dk += 1) {
        var cardK = el('div', debriefKpis[dk].cls);
        cardK.appendChild(el('div', 'kpi-label', debriefKpis[dk].label));
        cardK.appendChild(el('div', 'kpi-value', debriefKpis[dk].val));
        cardK.appendChild(el('div', 'kpi-sub', debriefKpis[dk].sub));
        kpiStrip.appendChild(cardK);
      }
      panel.appendChild(kpiStrip);

      // Core Capabilities Assessment Card
      var capCard = el('div', 'card card-navy-accent');
      var capHdr = el('div', 'card-header');
      capHdr.appendChild(el('h2', 'card-title', 'FEMA Core Capabilities HSEEP Performance Ratings (P / S / M / U)'));
      capHdr.appendChild(
        el('span', 'badge badge-navy', 'P=No Challenges · S=Some · M=Major · U=Unable')
      );
      capCard.appendChild(capHdr);

      var capScroll = el('div', 'table-scroll');
      var capTable = el('table', 'data-table');
      var capHead = el('thead');
      var capHeadRow = el('tr');
      var capCols = ['FEMA Core Capability', 'Mission Area', 'HSEEP Rating', 'Evaluator Observation / Local Notes'];
      for (var cc = 0; cc < capCols.length; cc += 1) {
        capHeadRow.appendChild(el('th', null, capCols[cc]));
      }
      capHead.appendChild(capHeadRow);
      capTable.appendChild(capHead);

      var capBody = el('tbody');
      for (var ci = 0; ci < evalCaps.length; ci += 1) {
        (function (capItem) {
          var tr = el('tr');
          tr.appendChild(el('td', 'unit-name', capItem.name));
          tr.appendChild(el('td', null, capItem.missionArea));

          var tdRate = el('td');
          var rGrp = el('div', 'rating-btn-group');
          var codes = ['P', 'S', 'M', 'U'];
          for (var rIdx2 = 0; rIdx2 < codes.length; rIdx2 += 1) {
            (function (letter) {
              var active = state.capabilityRatings[capItem.id] === letter;
              var rb = el('button', active ? 'rating-btn active-' + letter : 'rating-btn', letter);
              rb.type = 'button';
              rb.addEventListener('click', function () {
                state.capabilityRatings[capItem.id] = letter;
                renderTab4();
              });
              rGrp.appendChild(rb);
            })(codes[rIdx2]);
          }
          tdRate.appendChild(rGrp);
          tr.appendChild(tdRate);

          var tdObs = el('td');
          var obsInput = el('input', 'inline-input');
          obsInput.type = 'text';
          obsInput.value = localize(state.capabilityNotes[capItem.id] || '');
          obsInput.addEventListener('input', function () {
            state.capabilityNotes[capItem.id] = obsInput.value;
          });
          tdObs.appendChild(obsInput);
          tr.appendChild(tdObs);
          capBody.appendChild(tr);
        })(evalCaps[ci]);
      }
      capTable.appendChild(capBody);
      capScroll.appendChild(capTable);
      capCard.appendChild(capScroll);
      panel.appendChild(capCard);

      // Spacer + Improvement Plan (Corrective Action Matrix)
      var ipCard = el('div', 'card card-gold-accent');
      var ipHdr = el('div', 'card-header');
      ipHdr.appendChild(el('h2', 'card-title', '90-Day Improvement Plan (IP) — Corrective Action Matrix'));
      ipHdr.appendChild(el('span', 'badge badge-gold', config.aarConfig ? config.aarConfig.empgCitation : '90-DAY EMPG MANDATE'));
      ipCard.appendChild(ipHdr);

      var ipScroll = el('div', 'table-scroll');
      var ipTable = el('table', 'data-table');
      var ipHead = el('thead');
      var ipHeadRow = el('tr');
      var ipCols = ['ID', 'Core Capability', 'Observation / Gap', 'Corrective Action', 'Responsible WV Agency', 'Authority', 'Due Window', 'Status'];
      for (var icl = 0; icl < ipCols.length; icl += 1) {
        ipHeadRow.appendChild(el('th', null, ipCols[icl]));
      }
      ipHead.appendChild(ipHeadRow);
      ipTable.appendChild(ipHead);

      var ipBody = el('tbody');
      for (var ca = 0; ca < state.correctiveActions.length; ca += 1) {
        (function (caItem) {
          var tr = el('tr');
          tr.appendChild(el('td', 'mono-cell', caItem.id));
          tr.appendChild(el('td', 'unit-name', caItem.capability));
          tr.appendChild(el('td', null, localize(caItem.issue)));
          tr.appendChild(el('td', null, localize(caItem.action)));
          tr.appendChild(el('td', null, localize(caItem.owner)));
          tr.appendChild(el('td', 'mono-cell', caItem.authority || 'HSEEP'));
          tr.appendChild(el('td', 'mono-cell', caItem.dueWindow));

          var tdSt = el('td');
          var stSel = el('select', 'inline-select');
          var statuses = ['Assigned', 'In Progress', 'Validated'];
          for (var s = 0; s < statuses.length; s += 1) {
            var sOpt = el('option', null, statuses[s]);
            sOpt.value = statuses[s];
            if (caItem.status === statuses[s]) sOpt.selected = true;
            stSel.appendChild(sOpt);
          }
          stSel.addEventListener('change', function () {
            caItem.status = stSel.value;
          });
          tdSt.appendChild(stSel);
          tr.appendChild(tdSt);
          ipBody.appendChild(tr);
        })(state.correctiveActions[ca]);
      }
      ipTable.appendChild(ipBody);
      ipScroll.appendChild(ipTable);
      ipCard.appendChild(ipScroll);

      // Add Custom Corrective Action Form
      var formRow = el('div', 'add-ca-form');

      function makeField(labelTxt, inputNode) {
        var wrap = el('div');
        wrap.appendChild(el('label', 'field-label', labelTxt));
        wrap.appendChild(inputNode);
        return wrap;
      }

      var capSelect = el('select', 'inline-select');
      var allCaps = config.femaCapabilitiesCatalog || evalCaps;
      for (var ac = 0; ac < allCaps.length; ac += 1) {
        var cOpt = el('option', null, allCaps[ac].name);
        cOpt.value = allCaps[ac].name;
        capSelect.appendChild(cOpt);
      }

      var inIssue = el('input', 'inline-input');
      inIssue.placeholder = 'Observed gap during TTX...';
      var inAction = el('input', 'inline-input');
      inAction.placeholder = 'Concrete SOP / training / equipment fix...';
      var inOwner = el('input', 'inline-input');
      inOwner.placeholder = localize('{COUNTY} County EOC / Agency');

      var winSelect = el('select', 'inline-select');
      var wins = ['30 Days', '60 Days', '90 Days (EMPG AAR/IP Gate)'];
      for (var w = 0; w < wins.length; w += 1) {
        var wOpt = el('option', null, wins[w]);
        wOpt.value = wins[w];
        winSelect.appendChild(wOpt);
      }

      var btnAddCa = el('button', 'btn btn-gold-primary', '+ Add Action');
      btnAddCa.type = 'button';
      btnAddCa.addEventListener('click', function () {
        if (!inIssue.value.trim() || !inAction.value.trim()) {
          showToast('Enter both an Observation/Gap and a Corrective Action first.');
          return;
        }
        var nextNum = state.correctiveActions.length + 1;
        var nextId = 'CA-' + (nextNum < 10 ? '0' + nextNum : String(nextNum));
        state.correctiveActions.push({
          id: nextId,
          capability: capSelect.value,
          issue: inIssue.value.trim(),
          action: inAction.value.trim(),
          owner: inOwner.value.trim() || localize('{COUNTY} County EOC'),
          authority: 'FEMA EMPG 90-Day AAR/IP',
          dueWindow: winSelect.value,
          status: 'Assigned'
        });
        renderTab4();
        showToast('Added ' + nextId + ' to the 90-Day Improvement Plan.');
      });

      formRow.appendChild(makeField('FEMA Core Capability', capSelect));
      formRow.appendChild(makeField('Issue / Observation', inIssue));
      formRow.appendChild(makeField('Corrective Action', inAction));
      formRow.appendChild(makeField('Responsible WV Agency', inOwner));
      formRow.appendChild(makeField('Target Window', winSelect));
      formRow.appendChild(btnAddCa);
      ipCard.appendChild(formRow);
      panel.appendChild(ipCard);
    }

    function buildAarExportPayload() {
      var jur = getJurisdiction();
      var warnEval = scorePublicWarning(state.warningDraftRaw, jur);
      var injects = config.injects || [];
      var decisions = [];
      for (var i = 0; i < injects.length; i += 1) {
        var inj = injects[i];
        var chosenId = state.injectChoices[inj.id] || null;
        var chosenObj = null;
        for (var o = 0; o < (inj.options || []).length; o += 1) {
          if (inj.options[o].id === chosenId) {
            chosenObj = inj.options[o];
            break;
          }
        }
        decisions.push({
          injectId: inj.id,
          clock: inj.clock,
          domain: inj.domain,
          selectedOption: chosenObj ? chosenObj.label : 'UNANSWERED',
          grade: chosenObj ? chosenObj.grade : 'PENDING',
          citation: chosenObj ? chosenObj.citation : null,
          cascadeTriggered: chosenObj ? Boolean(chosenObj.cascadeAlert) : false
        });
      }

      return {
        exportFormat: 'wv-readiness-command-center-aar/v1',
        exportedAtIso: new Date().toISOString(),
        empg90DaySubmissionDue: computeEmpgDeadlineDate(),
        exerciseId: config.meta && config.meta.exerciseId,
        operationName: config.meta && config.meta.operationName,
        elapsedExerciseClock: formatElapsedClock(state.clockSeconds),
        jurisdiction: jur,
        publicWarningEvaluation: {
          scoreOutOf100: warnEval.score,
          wordCount: warnEval.wordCount,
          draftText: state.warningDraftRaw
        },
        injectDecisions: decisions,
        activeDynamicCascades: getPriorCascades(injects.length),
        resourceMobilization: state.resourceStatus,
        femaCoreCapabilityRatings: evalCaps.map(function (c) {
          return {
            id: c.id,
            name: c.name,
            missionArea: c.missionArea,
            hseepRating: state.capabilityRatings[c.id] || c.rating,
            observation: localize(state.capabilityNotes[c.id] || '')
          };
        }),
        improvementPlanCorrectiveActions: state.correctiveActions.map(function (ca) {
          return {
            id: ca.id,
            capability: ca.capability,
            issue: localize(ca.issue),
            action: localize(ca.action),
            owner: localize(ca.owner),
            authority: ca.authority,
            dueWindow: ca.dueWindow,
            status: ca.status
          };
        })
      };
    }

    function triggerDownload(filename, mimeType, contentStr) {
      var blob = new Blob([contentStr], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var link = el('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 2000);
    }

    // Header Action Buttons: Print, Export JSON, Download Clean Standalone HTML
    var btnPrint = document.getElementById('btn-print-aar');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        window.print();
      });
    }

    var btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', function () {
        var payload = buildAarExportPayload();
        var slug = state.selectedCounty.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        var fname = 'wv-ttx-aar-' + slug + '.json';
        triggerDownload(fname, 'application/json;charset=utf-8', JSON.stringify(payload, null, 2) + '\n');
        showToast('Exported HSEEP AAR/IP package: ' + fname);
      });
    }

    var btnDownloadHtml = document.getElementById('btn-download-html');
    if (btnDownloadHtml) {
      btnDownloadHtml.addEventListener('click', function () {
        // Clean serialization from static template + escaped JSON payload (zero unsafe DOM serialization)
        var snapshotConfig = JSON.parse(JSON.stringify(config));
        snapshotConfig.savedSessionState = {
          selectedCounty: state.selectedCounty,
          activeRoleId: state.activeRoleId,
          activeTab: state.activeTab,
          clockSeconds: state.clockSeconds,
          resourceStatus: state.resourceStatus,
          mapLayers: state.mapLayers,
          selectedFacilityId: state.selectedFacilityId,
          injectChoices: state.injectChoices,
          warningDraftRaw: state.warningDraftRaw,
          warningCustomized: state.warningCustomized,
          capabilityRatings: state.capabilityRatings,
          capabilityNotes: state.capabilityNotes,
          correctiveActions: state.correctiveActions
        };

        var safeJson = JSON.stringify(snapshotConfig).replace(/</g, '\\u003c');
        var styleNode = document.getElementById('ttx-inline-styles');
        var scriptNode = document.getElementById('ttx-inline-script');
        var cspMetaNode = document.querySelector('meta[http-equiv="Content-Security-Policy"]');

        var cssText = styleNode ? styleNode.textContent : '';
        var jsText = scriptNode ? scriptNode.textContent : '';
        var cspTag = cspMetaNode
          ? '<meta http-equiv="Content-Security-Policy" content="' + cspMetaNode.getAttribute('content') + '">'
          : '';

        var htmlParts = [
          '<!DOCTYPE html>',
          '<html lang="en">',
          '<head>',
          '  <meta charset="UTF-8">',
          '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
          cspTag ? '  ' + cspTag : '',
          '  <title>WV HSEEP Tabletop &amp; Crisis Simulator — ' + localize('{COUNTY} County') + '</title>',
          cssText ? '  <style id="ttx-inline-styles">' + cssText + '<' + '/style>' : '  <link rel="stylesheet" href="./styles.css">',
          '</head>',
          '<body>',
          '  <div id="ttx-toast" class="ttx-toast is-hidden" role="status" aria-live="polite"></div>',
          '  <header class="command-header">',
          '    <div class="header-row-main">',
          '      <div class="brand-cluster">',
          '        <div id="wv-seal-slot" class="wv-seal-slot" aria-hidden="true"></div>',
          '        <div class="brand-titles">',
          '          <div id="classification-banner" class="classification-kicker">HSEEP TABLETOP EXERCISE (TTX)</div>',
          '          <h1 id="app-title" class="app-title">WV HSEEP Tabletop &amp; Crisis Simulator</h1>',
          '          <p id="app-subtitle" class="app-subtitle">Operation Winter Gorge</p>',
          '        </div>',
          '      </div>',
          '      <div class="header-controls">',
          '        <div class="control-group county-control">',
          '          <label for="county-select" class="control-label">WV Jurisdiction (55 Counties + Training)</label>',
          '          <select id="county-select" class="county-select" aria-label="Select West Virginia County or Anonymized Town"></select>',
          '        </div>',
          '        <div class="control-group clock-control" role="group" aria-label="Exercise Clock Controls">',
          '          <div class="clock-readout-wrap">',
          '            <span class="control-label">Exercise Clock</span>',
          '            <span id="clock-display" class="clock-display">T+00:00</span>',
          '          </div>',
          '          <div class="clock-btn-row">',
          '            <button type="button" id="btn-clock-toggle" class="btn btn-gold-outline btn-sm">Start</button>',
          '            <button type="button" id="btn-clock-plus5" class="btn btn-gold-outline btn-sm">+5m</button>',
          '            <button type="button" id="btn-clock-reset" class="btn btn-ghost btn-sm" title="Reset Exercise Clock">Reset</button>',
          '          </div>',
          '        </div>',
          '        <div class="header-actions">',
          '          <button type="button" id="btn-print-aar" class="btn btn-navy-action">Print SitMan / AAR</button>',
          '          <button type="button" id="btn-export-json" class="btn btn-navy-action">Export AAR to Command Center (.json)</button>',
          '          <button type="button" id="btn-download-html" class="btn btn-gold-primary">Open / Download HTML &#8599;</button>',
          '        </div>',
          '      </div>',
          '    </div>',
          '    <div id="crosswalk-ribbon" class="crosswalk-ribbon" aria-label="West Virginia Regional Jurisdiction Crosswalk"></div>',
          '    <div class="role-selector-bar" role="navigation" aria-label="Agency Fog-of-War Role Seats">',
          '      <span class="role-bar-label">ACTIVE SEAT (FOG-OF-WAR):</span>',
          '      <div id="role-pills-container" class="role-pills-container"></div>',
          '    </div>',
          '    <nav class="tab-bar" role="tablist" aria-label="Simulator Modules">',
          '      <button type="button" id="tab-btn-1" class="tab-btn is-active" role="tab" aria-selected="true" aria-controls="tab-panel-1" data-tab="1"><span class="tab-num">1.</span> BRIEFING, ROLES &amp; DISPATCH</button>',
          '      <button type="button" id="tab-btn-2" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-panel-2" data-tab="2"><span class="tab-num">2.</span> TIMED INJECTS &amp; TACTICAL MAP <span id="tab-badge-injects" class="tab-pill">0/4</span></button>',
          '      <button type="button" id="tab-btn-3" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-panel-3" data-tab="3"><span class="tab-num">3.</span> MEDIA INJECT &amp; 7-ESSENTIALS SCORER <span id="tab-badge-scorer" class="tab-pill">0/100</span></button>',
          '      <button type="button" id="tab-btn-4" class="tab-btn" role="tab" aria-selected="false" aria-controls="tab-panel-4" data-tab="4"><span class="tab-num">4.</span> HSEEP DEBRIEF &amp; 90-DAY AAR/IP</button>',
          '    </nav>',
          '  </header>',
          '  <main class="workspace-main">',
          '    <section id="tab-panel-1" class="tab-panel" role="tabpanel" aria-labelledby="tab-btn-1"></section>',
          '    <section id="tab-panel-2" class="tab-panel is-hidden" role="tabpanel" aria-labelledby="tab-btn-2"></section>',
          '    <section id="tab-panel-3" class="tab-panel is-hidden" role="tabpanel" aria-labelledby="tab-btn-3"></section>',
          '    <section id="tab-panel-4" class="tab-panel is-hidden" role="tabpanel" aria-labelledby="tab-btn-4"></section>',
          '  </main>',
          '  <footer class="command-footer">',
          '    <div id="footer-meta-left">State of West Virginia · HSEEP Multi-Role Tabletop &amp; Crisis Simulator</div>',
          '    <div id="footer-meta-right">Offline Deterministic Runtime · ERG 2024 · W. Va. Code § 15-5-6 · WV HB 5638 · FEMA EMPG 90-Day AAR/IP</div>',
          '  </footer>',
          '  <script id="ttx-config-data" type="application/json">' + safeJson + '<' + '/script>',
          jsText ? '  <script id="ttx-inline-script">' + jsText + '<' + '/script>' : '  <script src="./app.js"><' + '/script>',
          '</body>',
          '</html>'
        ];

        var slug = state.selectedCounty.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        var outName = 'wv-ttx-standalone-' + slug + '.html';
        triggerDownload(outName, 'text/html;charset=utf-8', htmlParts.join('\n') + '\n');
        showToast('Downloaded standalone offline simulator: ' + outName);
      });
    }

    function renderAll() {
      renderCrosswalkRibbon();
      renderRoleBar();
      updateClockUi();
      updateHeaderBadges();
      renderTab1();
      renderTab2();
      renderTab3();
      renderTab4();
      setActiveTab(state.activeTab);
    }

    renderAll();
  }

  function boot() {
    var embedded = loadEmbeddedConfig();
    if (embedded) {
      startApp(embedded);
      return;
    }
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      fetch('./ttx.config.json')
        .then(function (r) { return r.json(); })
        .then(function (cfg) { startApp(cfg); })
        .catch(function () {
          showToast('Unable to load ttx.config.json.');
        });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
