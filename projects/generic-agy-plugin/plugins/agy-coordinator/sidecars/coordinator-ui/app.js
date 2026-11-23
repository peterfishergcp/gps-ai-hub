/**
 * AGY Coordinator — Frontend Controller (`app.js`)
 *
 * Pure DOM API construction (`createElement` + `textContent` + `replaceChildren`).
 * Drives:
 *  - Animated Clawy mascot perch (blinking + voice lip-sync)
 *  - Browser Instant Voice (Web Speech API) & Gemini Live API (`gemini-3.8-live`) bridge
 *  - Workers board + Spawn/Relay controls
 *  - Strict 2-level Group -> Goal -> Task hierarchy
 *  - Coordinator Chat & Board feed
 *  - Editable IDENTITY.md / SOUL.md & Voice Preferences
 */
(function () {
  'use strict';

  var state = {
    tab: 'workers',
    groupFilter: 'all',
    snapshot: null,
    speaking: false,
    listening: false,
    ttsEnabled: true,
    showSpawnForm: false,
  };

  var tokenMeter = null;
  var toastTimer = null;
  var blinkTimer = null;
  var lipSyncTimer = null;
  var activeRecognition = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function sidecarFetch(url, opts) {
    var fn = window.__agyAuthedFetch || (window.sidecar && window.sidecar.fetch) || window.fetch.bind(window);
    return fn(url, opts);
  }

  async function apiGet(url) {
    var r = await sidecarFetch(url, { method: 'GET' });
    return await r.json();
  }

  async function apiPost(url, body) {
    var r = await sidecarFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    return await r.json();
  }

  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = String(msg || '');
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.classList.remove('show');
    }, 2600);
  }

  /* ---------- Mascot Animation & Lip-Sync ---------- */

  function setMascotMood(mood, labelText) {
    var perch = document.getElementById('mascotPerch');
    var pill = document.getElementById('mascotMoodPill');
    if (perch) perch.setAttribute('data-mood', mood || 'idle');
    if (pill) {
      pill.textContent = labelText || (mood === 'listening' ? 'Listening' : mood === 'thinking' ? 'Thinking' : mood === 'speaking' ? 'Speaking' : 'Idle');
    }
  }

  function setMouthShape(shape) {
    var perch = document.getElementById('mascotPerch');
    if (perch) perch.setAttribute('data-mouth', shape || 'closed');
  }

  function startBlinkLoop() {
    if (blinkTimer) clearTimeout(blinkTimer);
    var delay = 2600 + Math.floor(Math.random() * 2800);
    blinkTimer = setTimeout(function () {
      var eyes = document.querySelector('.coord-eyes');
      if (eyes) {
        eyes.classList.add('blink');
        setTimeout(function () {
          eyes.classList.remove('blink');
        }, 120);
      }
      startBlinkLoop();
    }, delay);
  }

  function startLipSyncPulse() {
    stopLipSyncPulse();
    var seq = ['half', 'open', 'wide', 'open', 'half', 'open'];
    var idx = 0;
    setMascotMood('speaking', 'Speaking');
    lipSyncTimer = setInterval(function () {
      setMouthShape(seq[idx % seq.length]);
      idx += 1;
    }, 115);
  }

  function stopLipSyncPulse() {
    if (lipSyncTimer) {
      clearInterval(lipSyncTimer);
      lipSyncTimer = null;
    }
    setMouthShape('closed');
    if (!state.listening) {
      setMascotMood('idle', 'Idle');
    }
  }

  function speakText(text) {
    var clean = String(text || '').trim();
    var bubble = document.getElementById('perchBubble');
    if (bubble && clean) bubble.textContent = clean;
    if (!clean || !state.ttsEnabled) return;

    if (typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') {
      // Visual-only lip-sync fallback when Web Speech synthesis isn't mounted
      startLipSyncPulse();
      setTimeout(stopLipSyncPulse, Math.min(4200, Math.max(1000, clean.length * 42)));
      return;
    }

    try {
      window.speechSynthesis.cancel();
      var utter = new window.SpeechSynthesisUtterance(clean);
      var vPrefs = state.snapshot && state.snapshot.voiceStatus ? state.snapshot.voiceStatus : {};
      utter.rate = Number(vPrefs.voiceRate) || 1.0;
      utter.pitch = Number(vPrefs.voicePitch) || 1.05;
      utter.onstart = function () {
        state.speaking = true;
        startLipSyncPulse();
      };
      utter.onboundary = function () {
        var shapes = ['half', 'open', 'wide'];
        setMouthShape(shapes[Math.floor(Math.random() * shapes.length)]);
      };
      utter.onend = function () {
        state.speaking = false;
        stopLipSyncPulse();
      };
      utter.onerror = function () {
        state.speaking = false;
        stopLipSyncPulse();
      };
      startLipSyncPulse();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      stopLipSyncPulse();
    }
  }

  /* ---------- Voice Recognition (Browser Instant Voice + Gemini Live) ---------- */

  function stopVoiceListening() {
    state.listening = false;
    var micBtn = document.getElementById('btnVoiceMic');
    if (micBtn) {
      micBtn.classList.remove('btn-active-mic');
      micBtn.textContent = '🎙️ Speak';
    }
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch (e) {}
      activeRecognition = null;
    }
    if (!state.speaking) setMascotMood('idle', 'Idle');
  }

  function toggleVoiceListening() {
    if (state.listening) {
      stopVoiceListening();
      return;
    }
    var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast('Browser SpeechRecognition unavailable here — type in the quick command bar below');
      var inp = document.getElementById('quickCmdInput');
      if (inp) inp.focus();
      return;
    }

    try {
      var rec = new SpeechRec();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      activeRecognition = rec;
      state.listening = true;
      var micBtn = document.getElementById('btnVoiceMic');
      if (micBtn) {
        micBtn.classList.add('btn-active-mic');
        micBtn.textContent = '⏹ Stop';
      }
      setMascotMood('listening', 'Listening');
      var bubble = document.getElementById('perchBubble');
      if (bubble) bubble.textContent = 'Listening... speak your command.';

      var finalTranscript = '';
      rec.onresult = function (ev) {
        var interim = '';
        for (var i = ev.resultIndex; i < ev.results.length; i += 1) {
          var t = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) finalTranscript += t;
          else interim += t;
        }
        if (bubble) bubble.textContent = (finalTranscript || interim || 'Listening...').trim();
      };
      rec.onerror = function (ev) {
        showToast('Mic notice: ' + (ev && ev.error ? ev.error : 'unavailable'));
        stopVoiceListening();
      };
      rec.onend = function () {
        var spoken = finalTranscript.trim();
        stopVoiceListening();
        if (spoken) {
          submitCoordinatorPrompt(spoken, 'voice');
        }
      };
      rec.start();
    } catch (err) {
      stopVoiceListening();
      showToast('Could not start microphone');
    }
  }

  async function submitCoordinatorPrompt(prompt, source) {
    var clean = String(prompt || '').trim();
    if (!clean) return;
    var modeSel = document.getElementById('voiceModeSelect');
    var mode = modeSel ? modeSel.value : 'browser';
    setMascotMood('thinking', mode === 'gemini-live' ? 'Gemini Live...' : 'Thinking');
    var bubble = document.getElementById('perchBubble');
    if (bubble) bubble.textContent = 'Thinking...';

    try {
      var res = await apiPost('/api/voice/live-turn', {
        prompt: clean,
        source: source || 'text',
        mode: mode,
      });
      if (res && res.snapshot) {
        state.snapshot = res.snapshot;
      }
      var reply = (res && res.reply) || (res && res.error) || 'Done.';
      speakText(reply);
      renderHeaderAndPerch();
      renderActiveTab();
    } catch (err) {
      setMascotMood('idle', 'Idle');
      showToast('Failed to send command');
    }
  }

  /* ---------- Render Header & Perch ---------- */

  function renderHeaderAndPerch() {
    var snap = state.snapshot;
    if (!snap) return;
    var assistantName = (snap.identity && snap.identity.name) || 'Clawy';
    var assistantRole = (snap.identity && snap.identity.role) || 'Multi-Agent Coordinator';
    var sub = document.getElementById('header-sub');
    if (sub) sub.textContent = assistantName + ' · ' + assistantRole;

    var nameLbl = document.getElementById('mascotNameLabel');
    if (nameLbl) nameLbl.textContent = assistantName;

    var vs = snap.voiceStatus || {};
    state.ttsEnabled = vs.ttsEnabled !== false;
    var modeSel = document.getElementById('voiceModeSelect');
    if (modeSel && vs.mode) modeSel.value = vs.mode;

    var ttsBtn = document.getElementById('btnVoiceTts');
    if (ttsBtn) ttsBtn.textContent = state.ttsEnabled ? '🔊 TTS On' : '🔇 Muted';
  }

  /* ---------- Tab 1: Workers ---------- */

  function renderWorkersTab(root) {
    var snap = state.snapshot;
    var ls = snap.lsStatus || {};
    var groups = snap.groups || [];
    var workers = snap.workers || [];

    if (!ls.available) {
      var warn = el('div', 'coord-banner', 'Language Server env vars unavailable (' + (ls.reason || 'offline') + '). Local worker metadata & agentapi dispatch still work.');
      root.appendChild(warn);
    }

    var topRow = el('div', 'coord-row-between');
    var filterBar = el('div', 'coord-row');
    var allBtn = el('button', 'coord-pill-filter' + (state.groupFilter === 'all' ? ' active' : ''), 'All (' + workers.length + ')');
    allBtn.type = 'button';
    allBtn.addEventListener('click', function () { state.groupFilter = 'all'; renderActiveTab(); });
    filterBar.appendChild(allBtn);

    groups.forEach(function (g) {
      var cnt = workers.filter(function (w) { return w.groupId === g.id; }).length;
      var gb = el('button', 'coord-pill-filter' + (state.groupFilter === g.id ? ' active' : ''), g.title + ' (' + cnt + ')');
      gb.type = 'button';
      gb.addEventListener('click', function () { state.groupFilter = g.id; renderActiveTab(); });
      filterBar.appendChild(gb);
    });
    topRow.appendChild(filterBar);

    var spawnToggle = el('button', 'btn btn-primary btn-sm', state.showSpawnForm ? 'Cancel' : '+ Spawn Worker');
    spawnToggle.type = 'button';
    spawnToggle.addEventListener('click', function () {
      state.showSpawnForm = !state.showSpawnForm;
      renderActiveTab();
    });
    topRow.appendChild(spawnToggle);
    root.appendChild(topRow);

    if (state.showSpawnForm) {
      var formCard = el('form', 'coord-card');
      formCard.appendChild(el('div', 'coord-card-title', 'Spawn New Worker Conversation'));
      var titleIn = el('input', 'coord-input coord-input-sm');
      titleIn.placeholder = 'Optional title (e.g., Auth Security Audit)';
      var grpSel = el('select', 'coord-select');
      groups.forEach(function (g) {
        var opt = el('option', '', 'Group: ' + g.title);
        opt.value = g.id;
        grpSel.appendChild(opt);
      });
      var promptIn = el('textarea', 'coord-textarea');
      promptIn.style.minHeight = '70px';
      promptIn.placeholder = 'Task prompt for the new worker...';
      var submitRow = el('div', 'coord-row');
      var goBtn = el('button', 'btn btn-primary btn-sm', 'Dispatch Worker');
      goBtn.type = 'submit';
      submitRow.appendChild(goBtn);
      formCard.appendChild(titleIn);
      formCard.appendChild(grpSel);
      formCard.appendChild(promptIn);
      formCard.appendChild(submitRow);
      formCard.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!promptIn.value.trim()) return;
        goBtn.disabled = true;
        goBtn.textContent = 'Dispatching...';
        var res = await apiPost('/api/workers/spawn', {
          title: titleIn.value.trim(),
          groupId: grpSel.value,
          prompt: promptIn.value.trim(),
        });
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          state.showSpawnForm = false;
          showToast('Spawned worker');
          renderActiveTab();
        } else {
          goBtn.disabled = false;
          goBtn.textContent = 'Dispatch Worker';
          showToast('Spawn failed: ' + ((res && res.error) || 'error'));
        }
      });
      root.appendChild(formCard);
    }

    var filtered = state.groupFilter === 'all'
      ? workers
      : workers.filter(function (w) { return w.groupId === state.groupFilter; });

    if (filtered.length === 0) {
      root.appendChild(el('div', 'coord-card', 'No workers in this group yet. Click "+ Spawn Worker" to launch a conversation.'));
      return;
    }

    filtered.forEach(function (w) {
      var card = el('div', 'coord-card');
      var head = el('div', 'coord-card-head');
      var left = el('div');
      left.appendChild(el('div', 'coord-card-title', (w.pinned ? '📌 ' : '') + (w.title || w.id)));
      left.appendChild(el('div', 'coord-card-sub', w.id.slice(0, 12) + (w.summary ? ' · ' + w.summary.slice(0, 110) : '')));
      head.appendChild(left);

      var stCls = w.status === 'WORKING' ? 'working' : w.status === 'NEEDS_YOU' ? 'needs' : 'idle';
      head.appendChild(el('span', 'coord-badge ' + stCls, w.status || 'ACTIVE'));
      card.appendChild(head);

      var metaRow = el('div', 'coord-row');
      var grpPick = el('select', 'coord-select');
      grpPick.style.width = 'auto';
      grpPick.style.padding = '3px 8px';
      grpPick.style.fontSize = '11px';
      groups.forEach(function (g) {
        var opt = el('option', '', g.title);
        opt.value = g.id;
        if (g.id === w.groupId) opt.selected = true;
        grpPick.appendChild(opt);
      });
      grpPick.addEventListener('change', async function () {
        var res = await apiPost('/api/workers/meta', { convId: w.id, groupId: grpPick.value });
        if (res && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
      });
      metaRow.appendChild(grpPick);

      (w.labels || []).forEach(function (lbl) {
        var lb = el('span', 'coord-badge label', '#' + lbl + ' ×');
        lb.style.cursor = 'pointer';
        lb.title = 'Click to remove label';
        lb.addEventListener('click', async function () {
          var res = await apiPost('/api/workers/meta', { convId: w.id, removeLabel: lbl });
          if (res && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
        });
        metaRow.appendChild(lb);
      });

      var pinBtn = el('button', 'btn btn-secondary btn-sm', w.pinned ? 'Unpin' : 'Pin');
      pinBtn.type = 'button';
      pinBtn.addEventListener('click', async function () {
        var res = await apiPost('/api/workers/meta', { convId: w.id, pinned: !w.pinned });
        if (res && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
      });
      metaRow.appendChild(pinBtn);

      if (window.sidecar && window.sidecar.ui && window.sidecar.ui.toggleConversation) {
        var openBtn = el('button', 'btn btn-secondary btn-sm', 'Open Chat');
        openBtn.type = 'button';
        openBtn.addEventListener('click', function () {
          window.sidecar.ui.toggleConversation(w.id);
        });
        metaRow.appendChild(openBtn);
      }
      card.appendChild(metaRow);

      var relayForm = el('form', 'coord-row');
      var relayIn = el('input', 'coord-input coord-input-sm');
      relayIn.style.flex = '1 1 160px';
      relayIn.placeholder = 'Relay instruction to this worker...';
      var relayBtn = el('button', 'btn btn-primary btn-sm', 'Relay');
      relayBtn.type = 'submit';
      relayForm.appendChild(relayIn);
      relayForm.appendChild(relayBtn);
      relayForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!relayIn.value.trim()) return;
        relayBtn.disabled = true;
        var res = await apiPost('/api/workers/relay', { convId: w.id, message: relayIn.value.trim() });
        relayBtn.disabled = false;
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          relayIn.value = '';
          showToast('Relayed to ' + (w.title || w.id.slice(0, 8)));
          renderActiveTab();
        } else {
          showToast('Relay failed: ' + ((res && res.error) || 'error'));
        }
      });
      card.appendChild(relayForm);

      root.appendChild(card);
    });
  }

  /* ---------- Tab 2: Goals (Strict 2-Level Group -> Goal -> Task) ---------- */

  function renderGoalsTab(root) {
    var snap = state.snapshot;
    var groups = snap.groups || [];
    var goals = snap.goals || [];
    var tasks = snap.tasks || [];

    var addGrpForm = el('form', 'coord-card');
    addGrpForm.appendChild(el('div', 'coord-card-title', '2-Level Group → Goal → Task'));
    var grpRow = el('div', 'coord-row');
    var grpIn = el('input', 'coord-input coord-input-sm');
    grpIn.style.flex = '1 1 180px';
    grpIn.placeholder = 'New Group name (e.g., Release v1.8)...';
    var grpBtn = el('button', 'btn btn-secondary btn-sm', '+ Add Group');
    grpBtn.type = 'submit';
    grpRow.appendChild(grpIn);
    grpRow.appendChild(grpBtn);
    addGrpForm.appendChild(grpRow);
    addGrpForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!grpIn.value.trim()) return;
      var res = await apiPost('/api/groups', { action: 'add', title: grpIn.value.trim() });
      if (res && res.ok && res.snapshot) {
        state.snapshot = res.snapshot;
        showToast('Group created');
        renderActiveTab();
      }
    });
    root.appendChild(addGrpForm);

    groups.forEach(function (g) {
      var gGoals = goals.filter(function (gl) { return gl.groupId === g.id; });
      var gCard = el('div', 'coord-card');
      var gHead = el('div', 'coord-row-between');
      gHead.appendChild(el('div', 'coord-card-title', '📁 ' + g.title + ' (' + gGoals.length + ' goals)'));
      if (g.id !== 'group-default') {
        var delG = el('button', 'btn btn-danger btn-sm', 'Delete Group');
        delG.type = 'button';
        delG.addEventListener('click', async function () {
          var res = await apiPost('/api/groups', { action: 'remove', id: g.id });
          if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
        });
        gHead.appendChild(delG);
      }
      gCard.appendChild(gHead);

      var addGoalForm = el('form', 'coord-row');
      var goalIn = el('input', 'coord-input coord-input-sm');
      goalIn.style.flex = '1 1 180px';
      goalIn.placeholder = 'Add Goal under "' + g.title + '"...';
      var goalBtn = el('button', 'btn btn-primary btn-sm', '+ Goal');
      goalBtn.type = 'submit';
      addGoalForm.appendChild(goalIn);
      addGoalForm.appendChild(goalBtn);
      addGoalForm.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        if (!goalIn.value.trim()) return;
        var res = await apiPost('/api/goals', { action: 'add', groupId: g.id, title: goalIn.value.trim() });
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          renderActiveTab();
        }
      });
      gCard.appendChild(addGoalForm);

      gGoals.forEach(function (gl) {
        var gTasks = tasks.filter(function (t) { return t.goalId === gl.id; });
        var doneCnt = gTasks.filter(function (t) { return t.done; }).length;
        var pct = gTasks.length ? Math.round((doneCnt / gTasks.length) * 100) : (gl.status === 'done' ? 100 : 0);

        var goalBox = el('div', 'coord-card');
        goalBox.style.background = 'var(--coord-surface)';
        var glHead = el('div', 'coord-row-between');
        glHead.appendChild(el('div', 'coord-card-title', '🎯 ' + gl.title));
        var stSel = el('select', 'coord-select');
        stSel.style.width = 'auto';
        stSel.style.padding = '3px 8px';
        stSel.style.fontSize = '11px';
        ['active', 'blocked', 'done'].forEach(function (st) {
          var opt = el('option', '', st);
          opt.value = st;
          if (gl.status === st) opt.selected = true;
          stSel.appendChild(opt);
        });
        stSel.addEventListener('change', async function () {
          var res = await apiPost('/api/goals', { action: 'update', id: gl.id, status: stSel.value });
          if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
        });
        glHead.appendChild(stSel);
        goalBox.appendChild(glHead);

        var track = el('div', 'coord-progress-track');
        var fill = el('div', 'coord-progress-fill');
        fill.style.width = pct + '%';
        track.appendChild(fill);
        goalBox.appendChild(track);

        gTasks.forEach(function (tk) {
          var tRow = el('div', 'coord-task-item' + (tk.done ? ' done' : ''));
          var chk = el('input');
          chk.type = 'checkbox';
          chk.checked = Boolean(tk.done);
          chk.addEventListener('change', async function () {
            var res = await apiPost('/api/tasks', { action: 'toggle', id: tk.id });
            if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
          });
          tRow.appendChild(chk);
          tRow.appendChild(el('span', 'coord-task-title', tk.title));
          var rmT = el('button', 'btn btn-danger btn-sm', '×');
          rmT.type = 'button';
          rmT.addEventListener('click', async function () {
            var res = await apiPost('/api/tasks', { action: 'remove', id: tk.id });
            if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
          });
          tRow.appendChild(rmT);
          goalBox.appendChild(tRow);
        });

        var addTaskForm = el('form', 'coord-row');
        var taskIn = el('input', 'coord-input coord-input-sm');
        taskIn.style.flex = '1 1 150px';
        taskIn.placeholder = 'Add task...';
        var taskBtn = el('button', 'btn btn-secondary btn-sm', '+ Task');
        taskBtn.type = 'submit';
        addTaskForm.appendChild(taskIn);
        addTaskForm.appendChild(taskBtn);
        addTaskForm.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          if (!taskIn.value.trim()) return;
          var res = await apiPost('/api/tasks', { action: 'add', goalId: gl.id, title: taskIn.value.trim() });
          if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
        });
        goalBox.appendChild(addTaskForm);

        gCard.appendChild(goalBox);
      });

      root.appendChild(gCard);
    });
  }

  /* ---------- Tab 3: Chat & Update Board ---------- */

  function renderChatTab(root) {
    var snap = state.snapshot;
    var chatLog = snap.chatLog || [];
    var board = (snap.board || []).slice().reverse();

    var chatCard = el('div', 'coord-card');
    chatCard.appendChild(el('div', 'coord-card-title', 'Coordinator Conversation'));
    chatCard.appendChild(el('div', 'coord-card-sub', 'Tip: Type naturally, or use "spawn: <prompt>" / "relay <idPrefix>: <message>".'));

    var list = el('div', 'coord-chat-list');
    if (chatLog.length === 0) {
      list.appendChild(el('div', 'coord-card-sub', 'No messages yet. Speak or type in the perch bar above!'));
    } else {
      chatLog.slice(-30).forEach(function (m) {
        var msgBox = el('div', 'coord-chat-msg ' + (m.role === 'user' ? 'user' : 'assistant'));
        msgBox.appendChild(el('div', '', m.text));
        msgBox.appendChild(el('div', 'coord-chat-meta', (m.source || 'text') + ' · ' + (m.createdAt ? new Date(m.createdAt).toLocaleTimeString() : '')));
        list.appendChild(msgBox);
      });
    }
    chatCard.appendChild(list);
    root.appendChild(chatCard);

    var boardCard = el('div', 'coord-card');
    var bHead = el('div', 'coord-row-between');
    bHead.appendChild(el('div', 'coord-card-title', 'Worker Update Board (' + board.length + ')'));
    boardCard.appendChild(bHead);

    var postForm = el('form', 'coord-row');
    var bIn = el('input', 'coord-input coord-input-sm');
    bIn.style.flex = '1 1 180px';
    bIn.placeholder = 'Post a 1-line board update...';
    var bBtn = el('button', 'btn btn-secondary btn-sm', 'Post');
    bBtn.type = 'submit';
    postForm.appendChild(bIn);
    postForm.appendChild(bBtn);
    postForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!bIn.value.trim()) return;
      var res = await apiPost('/api/board', { author: 'User', kind: 'progress', summary: bIn.value.trim() });
      if (res && res.ok && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
    });
    boardCard.appendChild(postForm);

    board.slice(0, 15).forEach(function (item) {
      var row = el('div', 'coord-task-item');
      row.appendChild(el('span', 'coord-badge label', item.kind || 'progress'));
      row.appendChild(el('span', 'coord-task-title', (item.author ? item.author + ': ' : '') + item.summary));
      boardCard.appendChild(row);
    });
    root.appendChild(boardCard);
  }

  /* ---------- Tab 4: Identity & Voice ---------- */

  function renderIdentityTab(root) {
    var snap = state.snapshot;
    var id = snap.identity || {};
    var vs = snap.voiceStatus || {};

    var idCard = el('form', 'coord-card');
    idCard.appendChild(el('div', 'coord-card-title', 'Mascot Persona (IDENTITY.md & SOUL.md)'));

    var nameLbl = el('label', 'coord-field-lbl', 'Assistant Name (Default: Clawy)');
    var nameIn = el('input', 'coord-input coord-input-sm');
    nameIn.value = id.name || 'Clawy';
    idCard.appendChild(nameLbl);
    idCard.appendChild(nameIn);

    var idLbl = el('label', 'coord-field-lbl', 'IDENTITY.md');
    var idTa = el('textarea', 'coord-textarea');
    idTa.value = id.identityMd || '';
    idCard.appendChild(idLbl);
    idCard.appendChild(idTa);

    var soulLbl = el('label', 'coord-field-lbl', 'SOUL.md');
    var soulTa = el('textarea', 'coord-textarea');
    soulTa.value = id.soulMd || '';
    idCard.appendChild(soulLbl);
    idCard.appendChild(soulTa);

    var saveIdBtn = el('button', 'btn btn-primary btn-sm', 'Save IDENTITY.md & SOUL.md');
    saveIdBtn.type = 'submit';
    idCard.appendChild(saveIdBtn);
    idCard.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var res = await apiPost('/api/identity', {
        name: nameIn.value.trim(),
        identityMd: idTa.value,
        soulMd: soulTa.value,
      });
      if (res && res.ok && res.snapshot) {
        state.snapshot = res.snapshot;
        renderHeaderAndPerch();
        showToast('Saved persona');
        renderActiveTab();
      }
    });
    root.appendChild(idCard);

    var voiceCard = el('form', 'coord-card');
    voiceCard.appendChild(el('div', 'coord-card-title', 'Dual-Mode Voice Settings'));
    voiceCard.appendChild(
      el(
        'div',
        'coord-card-sub',
        'Auth status: ' + (vs.readyForGeminiLive ? 'Gemini Live ready (' + vs.keySource + ')' : 'Browser Instant Voice active (zero API keys needed)') +
        ' · Stored with 0600 permissions in plugin_data/agy-coordinator/voice_prefs.json'
      )
    );

    var mLbl = el('label', 'coord-field-lbl', 'Default Voice Engine');
    var mSel = el('select', 'coord-select');
    var o1 = el('option', '', 'Browser Instant Voice (Web Speech API — Zero Key)');
    o1.value = 'browser';
    var o2 = el('option', '', 'Gemini Live API Bridge (gemini-3.8-live)');
    o2.value = 'gemini-live';
    mSel.appendChild(o1);
    mSel.appendChild(o2);
    mSel.value = vs.mode || 'browser';
    voiceCard.appendChild(mLbl);
    voiceCard.appendChild(mSel);

    var keyLbl = el('label', 'coord-field-lbl', 'Optional GEMINI_API_KEY (leave blank to keep existing or use env/gcloud ADC)');
    var keyIn = el('input', 'coord-input coord-input-sm');
    keyIn.type = 'password';
    keyIn.placeholder = vs.hasApiKey ? '•••••••• (key saved — type to replace)' : 'AIza... (optional)';
    voiceCard.appendChild(keyLbl);
    voiceCard.appendChild(keyIn);

    var adcRow = el('label', 'coord-row');
    var adcChk = el('input');
    adcChk.type = 'checkbox';
    adcChk.checked = Boolean(vs.useGcloudAdc);
    adcRow.appendChild(adcChk);
    adcRow.appendChild(el('span', '', 'Use keyless gcloud ADC (gcloud auth print-access-token) for Gemini Live'));
    voiceCard.appendChild(adcRow);

    var btnRow = el('div', 'coord-row');
    var saveVoiceBtn = el('button', 'btn btn-primary btn-sm', 'Save Voice Prefs');
    saveVoiceBtn.type = 'submit';
    var testVoiceBtn = el('button', 'btn btn-secondary btn-sm', 'Test Mascot Voice & Lip-Sync');
    testVoiceBtn.type = 'button';
    testVoiceBtn.addEventListener('click', function () {
      speakText('Hello! ' + (id.name || 'Clawy') + ' is online and ready to coordinate your workers.');
    });
    btnRow.appendChild(saveVoiceBtn);
    btnRow.appendChild(testVoiceBtn);
    voiceCard.appendChild(btnRow);

    voiceCard.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var payload = {
        mode: mSel.value,
        useGcloudAdc: adcChk.checked,
      };
      if (keyIn.value.trim()) payload.apiKey = keyIn.value.trim();
      var res = await apiPost('/api/voice/prefs', payload);
      if (res && res.ok && res.snapshot) {
        state.snapshot = res.snapshot;
        keyIn.value = '';
        renderHeaderAndPerch();
        showToast('Saved voice preferences');
        renderActiveTab();
      }
    });
    root.appendChild(voiceCard);
  }

  function renderActiveTab() {
    var root = document.getElementById('view-root');
    if (!root || !state.snapshot) return;
    root.replaceChildren();
    if (state.tab === 'workers') renderWorkersTab(root);
    else if (state.tab === 'goals') renderGoalsTab(root);
    else if (state.tab === 'chat') renderChatTab(root);
    else if (state.tab === 'identity') renderIdentityTab(root);
  }

  async function refreshAll(showNotice) {
    try {
      var data = await apiGet('/api/state');
      if (data && data.ok) {
        state.snapshot = data;
        renderHeaderAndPerch();
        renderActiveTab();
        if (tokenMeter) tokenMeter.refresh();
        if (showNotice) showToast('Refreshed coordinator state');
      }
    } catch (e) {
      if (showNotice) showToast('Refresh failed');
    }
  }

  function init() {
    var actionsEl = document.querySelector('.topbar-actions');
    if (window.AGYTokenPill && actionsEl) {
      tokenMeter = window.AGYTokenPill.mount(actionsEl);
    }

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.tab = btn.getAttribute('data-tab') || 'workers';
        renderActiveTab();
      });
    });

    var refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { refreshAll(true); });
    }

    var micBtn = document.getElementById('btnVoiceMic');
    if (micBtn) micBtn.addEventListener('click', toggleVoiceListening);

    var ttsBtn = document.getElementById('btnVoiceTts');
    if (ttsBtn) {
      ttsBtn.addEventListener('click', async function () {
        state.ttsEnabled = !state.ttsEnabled;
        await apiPost('/api/voice/prefs', { ttsEnabled: state.ttsEnabled });
        ttsBtn.textContent = state.ttsEnabled ? '🔊 TTS On' : '🔇 Muted';
      });
    }

    var modeSel = document.getElementById('voiceModeSelect');
    if (modeSel) {
      modeSel.addEventListener('change', async function () {
        var res = await apiPost('/api/voice/prefs', { mode: modeSel.value });
        if (res && res.snapshot) state.snapshot = res.snapshot;
        showToast('Voice mode: ' + modeSel.value);
      });
    }

    var mascotWrap = document.getElementById('mascotWrap');
    if (mascotWrap) {
      mascotWrap.addEventListener('click', function () {
        var name = (state.snapshot && state.snapshot.identity && state.snapshot.identity.name) || 'Clawy';
        speakText(name + ' reporting in. Ready for your next instruction.');
      });
    }

    var quickForm = document.getElementById('quickCmdForm');
    var quickInput = document.getElementById('quickCmdInput');
    if (quickForm && quickInput) {
      quickForm.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var val = quickInput.value.trim();
        if (!val) return;
        quickInput.value = '';
        submitCoordinatorPrompt(val, 'text');
      });
    }

    startBlinkLoop();
    refreshAll(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
