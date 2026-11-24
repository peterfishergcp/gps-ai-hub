/**
 * AGY Coordinator — Frontend Controller (`app.js`)
 *
 * Pure DOM API construction (`createElement` + `textContent` + `replaceChildren`).
 * Drives:
 *  - Dynamic 3D-feel <canvas> Clawy mascot rig with live mic-RMS listening rings & mouth-seam lip-sync
 *  - True Hold-to-Talk (>=250ms) + Click-to-Toggle (<250ms) MediaRecorder -> Gemini Audio Bridge
 *  - Workers board (LS + Desktop brain/ fallback + window.sidecar.agent dispatch fallback)
 *  - Strict 2-level Group -> Goal -> Task hierarchy (with voice/chat structured actions)
 *  - Coordinator Chat & Board feed
 *  - Editable IDENTITY.md / SOUL.md & Auto-ADC Voice Preferences
 */
(function () {
  'use strict';

  var state = {
    tab: 'agents',
    agentFilter: 'active',
    searchQuery: '',
    expandedAgents: {},
    renamingAgentId: '',
    selectedAgentId: '',
    customBubbleUntil: 0,
    snapshot: null,
    speaking: false,
    listening: false,
    thinking: false,
    clickToggleActive: false,
    ttsEnabled: true,
    showSpawnForm: false,
    micRms: 0,
    mouthOpenness: 0,
    pointerX: 0,
    pointerY: 0,
    blinkFactor: 1,
    lastBubbleText: 'Scanning your active agents...',
  };

  var tokenMeter = null;
  var toastTimer = null;
  var lipSyncTimer = null;
  var mediaRecorder = null;
  var mediaStream = null;
  var audioCtx = null;
  var analyserNode = null;
  var analyserData = null;
  var recordedChunks = [];
  var recordDownAt = 0;
  var recordStartedAt = 0;
  var recordMimeType = 'audio/webm';
  var cancelPendingCapture = false;

  // Offscreen mascot sprite (either processed PNG or 3D-shaded fallback)
  var spriteCanvas = null;
  var spriteReady = false;
  var nextBlinkAt = performance.now() + 2600;
  var blinkEndAt = 0;

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

  function setPerchBubble(text, persistAsIdle) {
    var bubble = document.getElementById('perchBubble');
    var clean = String(text || '').trim();
    if (persistAsIdle && clean) state.lastBubbleText = clean;
    var displayed = clean || state.lastBubbleText;
    if (bubble) bubble.textContent = displayed;

    var guideRow = document.getElementById('perchAuthGuideRow');
    if (guideRow) {
      var modeSel = document.getElementById('voiceModeSelect');
      var isLiveMode = !modeSel || modeSel.value === 'gemini-live';
      var vs = state.snapshot && state.snapshot.voiceStatus ? state.snapshot.voiceStatus : {};
      var hasAuthIssue =
        isLiveMode &&
        (/isn't signed in|session expired|reauth|No ADC credentials|API key not valid|needs sign-in/i.test(displayed) ||
          /expired|reauth|No ADC credentials|API key not valid/i.test(String(vs.lastDiagnostic || '')));
      guideRow.hidden = !hasAuthIssue;
    }
  }

  function setMascotMood(mood, labelText) {
    var perch = document.getElementById('mascotPerch');
    var pill = document.getElementById('mascotMoodPill');
    if (perch) perch.setAttribute('data-mood', mood || 'idle');
    if (pill) {
      pill.textContent =
        labelText ||
        (mood === 'listening'
          ? 'Listening'
          : mood === 'thinking'
            ? 'Thinking'
            : mood === 'speaking'
              ? 'Speaking'
              : 'Idle');
    }
  }

  /* ---------- 3D Canvas Mascot Sprite Loader & White-BG Removal ---------- */

  function removeWhiteBackground(canvasEl) {
    var w = canvasEl.width;
    var h = canvasEl.height;
    var ctx = canvasEl.getContext('2d');
    var img = ctx.getImageData(0, 0, w, h);
    var d = img.data;
    var visited = new Uint8Array(w * h);
    var queue = [];

    function isNearWhite(idx) {
      var r = d[idx];
      var g = d[idx + 1];
      var b = d[idx + 2];
      var a = d[idx + 3];
      return a > 0 && r > 236 && g > 236 && b > 236;
    }

    // Seed flood-fill from image border pixels
    for (var x = 0; x < w; x += 1) {
      queue.push(x, (h - 1) * w + x);
    }
    for (var y = 0; y < h; y += 1) {
      queue.push(y * w, y * w + (w - 1));
    }

    while (queue.length > 0) {
      var pos = queue.pop();
      if (visited[pos]) continue;
      visited[pos] = 1;
      var i4 = pos * 4;
      if (!isNearWhite(i4)) continue;
      d[i4 + 3] = 0;
      var px = pos % w;
      var py = (pos - px) / w;
      if (px > 0) queue.push(pos - 1);
      if (px < w - 1) queue.push(pos + 1);
      if (py > 0) queue.push(pos - w);
      if (py < h - 1) queue.push(pos + w);
    }

    // Soft-feather residual bright edge halo pixels
    for (var p = 0; p < w * h; p += 1) {
      var j = p * 4;
      if (d[j + 3] > 0 && d[j] > 246 && d[j + 1] > 246 && d[j + 2] > 246) {
        d[j + 3] = Math.round(d[j + 3] * 0.25);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function buildFallback3DSprite() {
    var c = document.createElement('canvas');
    c.width = 176;
    c.height = 176;
    var ctx = c.getContext('2d');

    // Antennae
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(68, 44);
    ctx.lineTo(54, 22);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(108, 44);
    ctx.lineTo(122, 22);
    ctx.stroke();

    var orbL = ctx.createRadialGradient(51, 18, 1, 53, 20, 9);
    orbL.addColorStop(0, '#fed7aa');
    orbL.addColorStop(1, '#f97316');
    ctx.fillStyle = orbL;
    ctx.beginPath();
    ctx.arc(53, 20, 8, 0, Math.PI * 2);
    ctx.fill();

    var orbR = ctx.createRadialGradient(121, 18, 1, 123, 20, 9);
    orbR.addColorStop(0, '#a7f3d0');
    orbR.addColorStop(1, '#10b981');
    ctx.fillStyle = orbR;
    ctx.beginPath();
    ctx.arc(123, 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Claws with 3D gradient
    var clawGrad = ctx.createLinearGradient(16, 60, 44, 102);
    clawGrad.addColorStop(0, '#fda4af');
    clawGrad.addColorStop(0.5, '#fb7185');
    clawGrad.addColorStop(1, '#ea580c');
    ctx.fillStyle = clawGrad;
    ctx.beginPath();
    ctx.ellipse(28, 80, 14, 18, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(148, 80, 14, 18, 0.35, 0, Math.PI * 2);
    ctx.fill();

    // 3D Rounded Shell
    var bodyGrad = ctx.createRadialGradient(72, 62, 10, 88, 92, 66);
    bodyGrad.addColorStop(0, '#7dd3fc');
    bodyGrad.addColorStop(0.45, '#2563eb');
    bodyGrad.addColorStop(1, '#312e81');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(38, 42, 100, 92, 36);
    ctx.fill();

    // Specular rim highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.38)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(41, 44, 94, 86, 34);
    ctx.stroke();

    // Glossy Visor
    var visorGrad = ctx.createLinearGradient(50, 60, 50, 114);
    visorGrad.addColorStop(0, '#0f172a');
    visorGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = visorGrad;
    ctx.beginPath();
    ctx.roundRect(49, 60, 78, 52, 22);
    ctx.fill();

    // Cheeks
    ctx.fillStyle = 'rgba(251, 113, 133, 0.72)';
    ctx.beginPath();
    ctx.ellipse(61, 95, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.ellipse(115, 95, 6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();

    spriteCanvas = c;
    spriteReady = true;
  }

  function initMascotSprite() {
    var dataUrl = typeof window.__CLAWY_MASCOT_DATA_URL === 'string' ? window.__CLAWY_MASCOT_DATA_URL : '';
    if (!dataUrl) {
      buildFallback3DSprite();
      return;
    }
    var img = new Image();
    img.onload = function () {
      var off = document.createElement('canvas');
      off.width = 176;
      off.height = 176;
      var octx = off.getContext('2d');
      octx.drawImage(img, 0, 0, 176, 176);
      try {
        removeWhiteBackground(off);
      } catch (e) {}
      spriteCanvas = off;
      spriteReady = true;
    };
    img.onerror = function () {
      buildFallback3DSprite();
    };
    img.src = dataUrl;
  }

  function renderMascotFrame(now) {
    var canvas = document.getElementById('clawyCanvas');
    if (canvas && spriteReady && spriteCanvas) {
      var ctx = canvas.getContext('2d');
      var w = canvas.width;
      var h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Update eye blink state
      if (now >= nextBlinkAt) {
        blinkEndAt = now + 115;
        nextBlinkAt = now + 2600 + Math.random() * 2800;
      }
      state.blinkFactor = now < blinkEndAt ? 0.1 : 1.0;

      // Update live mic RMS if recording
      if (state.listening && analyserNode && analyserData) {
        analyserNode.getByteTimeDomainData(analyserData);
        var sumSq = 0;
        for (var i = 0; i < analyserData.length; i += 1) {
          var v = (analyserData[i] - 128) / 128;
          sumSq += v * v;
        }
        var rms = Math.sqrt(sumSq / analyserData.length);
        state.micRms = state.micRms * 0.6 + Math.min(1, rms * 4.2) * 0.4;
        updateWaveBars(state.micRms);
      } else {
        state.micRms = state.micRms * 0.85;
      }

      var t = now * 0.001;
      var floatY = Math.sin(t * 2.3) * (state.speaking ? 4.2 : 3.2);
      var breath = 1 + Math.sin(t * 2.3 + 0.6) * 0.022;
      var scale = state.listening ? 1.05 + state.micRms * 0.04 : 1.0;
      var tilt = state.thinking
        ? Math.sin(t * 4.5) * 0.06
        : state.listening
          ? 0.035
          : state.pointerX * 0.04;

      var cx = w * 0.5;
      var cy = h * 0.5 + floatY;

      // Concentric listening rings driven by AnalyserNode mic RMS
      if (state.listening) {
        for (var ring = 0; ring < 3; ring += 1) {
          var phase = ((t * 1.4 + ring * 0.33) % 1);
          var rRad = 44 + phase * 34 + state.micRms * 18;
          var rAlpha = Math.max(0, (1 - phase) * (0.28 + state.micRms * 0.45));
          ctx.beginPath();
          ctx.arc(cx, cy, rRad, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, ' + rAlpha.toFixed(3) + ')';
          ctx.lineWidth = 2.6;
          ctx.stroke();
        }
      } else if (state.thinking) {
        ctx.beginPath();
        ctx.arc(cx, cy, 58 + Math.sin(t * 5) * 4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.36)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (state.speaking) {
        ctx.beginPath();
        ctx.arc(cx, cy, 56 + state.mouthOpenness * 14, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.36)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Perch shadow bar
      ctx.fillStyle = 'rgba(100, 116, 139, 0.45)';
      ctx.beginPath();
      ctx.roundRect(w * 0.16, h * 0.87, w * 0.68, 7, 3.5);
      ctx.fill();

      // Sprite transform
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.scale(scale * (2 - breath), scale * breath);
      var drawW = 136;
      var drawH = 136;
      ctx.drawImage(spriteCanvas, -drawW / 2, -drawH / 2, drawW, drawH);

      // Draw expressive eyes when using fallback sprite (no external PNG)
      if (!window.__CLAWY_MASCOT_DATA_URL) {
        var eyeLookX = state.pointerX * 2.5;
        var eyeLookY = state.pointerY * 2.0;
        var eyeR = 6.2;
        [-17, 17].forEach(function (ex) {
          ctx.save();
          ctx.translate(ex + eyeLookX, -6 + eyeLookY);
          ctx.scale(1, state.blinkFactor);
          ctx.fillStyle = state.listening ? '#fb7185' : '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
          ctx.fill();
          if (state.blinkFactor > 0.5) {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(2.1, -2.1, 2.1, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        });
      }

      // Smooth mouth-seam lip-sync overlay anchored at (mouthCenterU: 0.5, mouthSeamV: 0.57)
      var mx = (0.5 - 0.5) * drawW;
      var my = (0.58 - 0.5) * drawH;
      var openAmt = state.speaking ? state.mouthOpenness : 0;
      if (openAmt > 0.04) {
        ctx.fillStyle = '#27120b';
        ctx.beginPath();
        ctx.ellipse(mx, my, 8 + openAmt * 3.8, 2.2 + openAmt * 6.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath();
        ctx.ellipse(mx, my + openAmt * 1.6, 5.2 + openAmt * 2.2, 1.3 + openAmt * 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (!window.__CLAWY_MASCOT_DATA_URL) {
        ctx.strokeStyle = '#451a03';
        ctx.lineWidth = 3.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(mx - 8, my - 1);
        ctx.quadraticCurveTo(mx, my + 4.5, mx + 8, my - 1);
        ctx.stroke();
      }

      ctx.restore();
    }
    requestAnimationFrame(renderMascotFrame);
  }

  function updateWaveBars(rms) {
    var container = document.getElementById('voiceWaveBar');
    if (!container) return;
    var spans = container.querySelectorAll('span');
    var weights = [0.55, 0.85, 1.0, 0.85, 0.55];
    for (var i = 0; i < spans.length; i += 1) {
      var jitter = 0.75 + Math.random() * 0.45;
      var px = Math.round(4 + Math.min(1, rms * weights[i] * jitter) * 11);
      spans[i].style.height = px + 'px';
    }
  }

  /* ---------- Speech Output & Lip-Sync ---------- */

  function startLipSyncPulse() {
    stopLipSyncPulse();
    state.speaking = true;
    setMascotMood('speaking', 'Speaking');
    var phase = 0;
    lipSyncTimer = setInterval(function () {
      phase += 0.65;
      state.mouthOpenness = 0.25 + Math.abs(Math.sin(phase)) * 0.72;
    }, 65);
  }

  function stopLipSyncPulse() {
    if (lipSyncTimer) {
      clearInterval(lipSyncTimer);
      lipSyncTimer = null;
    }
    state.speaking = false;
    state.mouthOpenness = 0;
    if (!state.listening && !state.thinking) setMascotMood('idle', 'Idle');
  }

  var sharedTtsCtx = null;
  var ttsSourceNode = null;
  var ttsGainNode = null;
  var ttsAnalyserTimer = null;

  function getSharedAudioContext() {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    if (!sharedTtsCtx || sharedTtsCtx.state === 'closed') {
      sharedTtsCtx = new AudioCtor();
    }
    if (sharedTtsCtx.state === 'suspended' && typeof sharedTtsCtx.resume === 'function') {
      sharedTtsCtx.resume().catch(function () {});
    }
    return sharedTtsCtx;
  }

  function stopTtsAudioPlayback() {
    if (ttsAnalyserTimer) {
      clearInterval(ttsAnalyserTimer);
      ttsAnalyserTimer = null;
    }
    if (ttsGainNode && sharedTtsCtx) {
      try {
        var now = sharedTtsCtx.currentTime;
        ttsGainNode.gain.cancelScheduledValues(now);
        ttsGainNode.gain.setValueAtTime(ttsGainNode.gain.value, now);
        ttsGainNode.gain.linearRampToValueAtTime(0.0001, now + 0.025);
      } catch (e) {}
    }
    var oldSrc = ttsSourceNode;
    var oldGain = ttsGainNode;
    ttsSourceNode = null;
    ttsGainNode = null;
    if (oldSrc) {
      setTimeout(function () {
        try { oldSrc.stop(); } catch (e) {}
        try { oldSrc.disconnect(); } catch (e) {}
        if (oldGain) {
          try { oldGain.disconnect(); } catch (e) {}
        }
      }, 35);
    }
  }

  function extractPcmSliceFromBinaryString(bin) {
    if (bin.length > 44 && bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WAVE') {
      var pos = 12;
      while (pos + 8 <= bin.length) {
        var chunkId = bin.slice(pos, pos + 4);
        var chunkSize =
          (bin.charCodeAt(pos + 4) & 0xff) |
          ((bin.charCodeAt(pos + 5) & 0xff) << 8) |
          ((bin.charCodeAt(pos + 6) & 0xff) << 16) |
          ((bin.charCodeAt(pos + 7) & 0xff) << 24);
        if (chunkSize < 0) chunkSize = bin.length - (pos + 8);
        if (chunkId === 'data') {
          var start = pos + 8;
          var end = Math.min(bin.length, start + chunkSize);
          return { offset: start, byteLength: Math.max(0, end - start) };
        }
        pos += 8 + chunkSize + (chunkSize % 2);
      }
      return { offset: 44, byteLength: bin.length - 44 };
    }
    return { offset: 0, byteLength: bin.length };
  }

  function playPcm16Base64(ttsAudio) {
    if (!ttsAudio || !ttsAudio.audioBase64) return false;
    var ctx = getSharedAudioContext();
    if (!ctx) return false;
    try {
      stopTtsAudioPlayback();
      if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
      var bin = window.atob(ttsAudio.audioBase64);
      var slice = extractPcmSliceFromBinaryString(bin);
      var pcmOffset = slice.offset;
      var rawSamples = Math.floor(slice.byteLength / 2);
      if (rawSamples < 20) return false;
      var rate = Number(ttsAudio.sampleRate) || 24000;

      // Trim the last ~18ms of raw codec tail (where Gemini TTS sometimes emits an EOS static burst)
      // when clip is longer than 350ms, then apply smooth cosine fade-in/out + 80ms zero-silence pad.
      var trimTailSamples = rawSamples > Math.floor(rate * 0.35) ? Math.floor(rate * 0.018) : 0;
      var activeSamples = Math.max(16, rawSamples - trimTailSamples);
      var padSilentSamples = Math.floor(rate * 0.08); // 80ms clean silence before onended
      var totalSamples = activeSamples + padSilentSamples;

      var audioBuf = ctx.createBuffer(1, totalSamples, rate);
      var ch = audioBuf.getChannelData(0);
      for (var i = 0; i < activeSamples; i += 1) {
        var idx = pcmOffset + i * 2;
        var lo = bin.charCodeAt(idx) & 0xff;
        var hi = bin.charCodeAt(idx + 1) & 0xff;
        var val = (hi << 8) | lo;
        if (val >= 0x8000) val -= 0x10000;
        ch[i] = val / 32768;
      }

      // Remove any residual DC offset on the tail & apply 8ms fade-in + 45ms raised-cosine fade-out
      var fadeInLen = Math.min(Math.floor(rate * 0.008), Math.floor(activeSamples * 0.2));
      for (var fi = 0; fi < fadeInLen; fi += 1) {
        var wIn = 0.5 * (1 - Math.cos((Math.PI * fi) / fadeInLen));
        ch[fi] *= wIn;
      }
      var fadeOutLen = Math.min(Math.floor(rate * 0.045), Math.floor(activeSamples * 0.35));
      var fadeStart = activeSamples - fadeOutLen;
      for (var fo = 0; fo < fadeOutLen; fo += 1) {
        var wOut = 0.5 * (1 + Math.cos((Math.PI * fo) / fadeOutLen));
        ch[fadeStart + fo] *= wOut;
      }
      // Trailing padSilentSamples are already 0.0 in Float32Array

      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(1.0, ctx.currentTime);
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      var timeBuf = new Uint8Array(an.fftSize);
      src.connect(gain);
      gain.connect(an);
      an.connect(ctx.destination);
      ttsSourceNode = src;
      ttsGainNode = gain;
      state.speaking = true;
      setMascotMood('speaking', 'Speaking');
      ttsAnalyserTimer = setInterval(function () {
        an.getByteTimeDomainData(timeBuf);
        var sq = 0;
        for (var k = 0; k < timeBuf.length; k += 1) {
          var dv = (timeBuf[k] - 128) / 128;
          sq += dv * dv;
        }
        var rms = Math.sqrt(sq / timeBuf.length);
        state.mouthOpenness = Math.min(1, rms * 5.2);
      }, 45);
      src.onended = function () {
        if (ttsSourceNode === src) {
          if (ttsAnalyserTimer) {
            clearInterval(ttsAnalyserTimer);
            ttsAnalyserTimer = null;
          }
          ttsSourceNode = null;
          ttsGainNode = null;
          try { src.disconnect(); } catch (e) {}
          try { gain.disconnect(); } catch (e) {}
          try { an.disconnect(); } catch (e) {}
          stopLipSyncPulse();
        }
      };
      src.start(0);
      return true;
    } catch (e) {
      stopTtsAudioPlayback();
      return false;
    }
  }

  async function speakText(text, preloadedTtsAudio, voiceOverride) {
    var clean = String(text || '').trim();
    if (clean) {
      state.customBubbleUntil = Date.now() + 14000;
      setPerchBubble(clean, true);
    }
    if (!clean || !state.ttsEnabled) return;

    if (preloadedTtsAudio && preloadedTtsAudio.audioBase64) {
      if (playPcm16Base64(preloadedTtsAudio)) return;
    }

    var vPrefs = state.snapshot && state.snapshot.voiceStatus ? state.snapshot.voiceStatus : {};
    var modeSel = document.getElementById('voiceModeSelect');
    var activeMode = modeSel ? modeSel.value : (vPrefs.mode || 'gemini-live');
    if (vPrefs.readyForGeminiLive && activeMode === 'gemini-live') {
      try {
        var chosenVoice = voiceOverride || vPrefs.voiceName || 'Kore';
        var ttsRes = await apiPost('/api/voice/tts', { text: clean, voiceName: chosenVoice });
        if (ttsRes && ttsRes.ok && ttsRes.ttsAudio && playPcm16Base64(ttsRes.ttsAudio)) {
          return;
        }
      } catch (e) {}
    }

    if (typeof window.speechSynthesis === 'undefined' || typeof window.SpeechSynthesisUtterance === 'undefined') {
      startLipSyncPulse();
      setTimeout(stopLipSyncPulse, Math.min(4200, Math.max(900, clean.length * 40)));
      return;
    }

    try {
      window.speechSynthesis.cancel();
      var utter = new window.SpeechSynthesisUtterance(clean);
      utter.rate = Number(vPrefs.voiceRate) || 1.0;
      utter.pitch = Number(vPrefs.voicePitch) || 1.05;
      utter.onstart = function () { startLipSyncPulse(); };
      utter.onboundary = function () { state.mouthOpenness = 0.45 + Math.random() * 0.52; };
      utter.onend = function () { stopLipSyncPulse(); };
      utter.onerror = function () { stopLipSyncPulse(); };
      startLipSyncPulse();
      window.speechSynthesis.speak(utter);
    } catch (e) {
      stopLipSyncPulse();
    }
  }

  /* ---------- True Hold-to-Talk + Click-to-Toggle MediaRecorder ---------- */

  function pickRecorderMimeType() {
    if (typeof MediaRecorder === 'undefined') return '';
    var candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < candidates.length; i += 1) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch {}
    }
    return '';
  }

  function cleanupAudioStream() {
    if (mediaStream) {
      try {
        mediaStream.getTracks().forEach(function (tr) { tr.stop(); });
      } catch {}
      mediaStream = null;
    }
    if (audioCtx) {
      try { audioCtx.close(); } catch {}
      audioCtx = null;
    }
    analyserNode = null;
    analyserData = null;
  }

  function resetMicUi(restoreBubble) {
    state.listening = false;
    state.clickToggleActive = false;
    state.micRms = 0;
    var micBtn = document.getElementById('btnVoiceMic');
    if (micBtn) {
      micBtn.classList.remove('btn-active-mic');
      micBtn.textContent = '🎙️ Live';
    }
    var waveWrap = document.getElementById('voiceWaveWrap');
    if (waveWrap) waveWrap.hidden = true;
    if (restoreBubble) setPerchBubble(state.lastBubbleText, false);
    if (!state.thinking && !state.speaking) setMascotMood('idle', 'Idle');
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () {
        var res = String(reader.result || '');
        var comma = res.indexOf(',');
        resolve(comma >= 0 ? res.slice(comma + 1) : res);
      };
      reader.onerror = function () { reject(new Error('Failed to encode audio')); };
      reader.readAsDataURL(blob);
    });
  }

  var browserSpeechRec = null;
  var latestBrowserSpeech = '';

  function startBrowserSpeechParallel() {
    latestBrowserSpeech = '';
    var SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechCtor) return;
    try {
      var rec = new SpeechCtor();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = true;
      rec.onresult = function (ev) {
        var parts = [];
        for (var i = 0; i < ev.results.length; i += 1) {
          if (ev.results[i] && ev.results[i][0]) {
            parts.push(ev.results[i][0].transcript);
          }
        }
        latestBrowserSpeech = parts.join(' ').trim();
      };
      rec.onerror = function () {};
      rec.start();
      browserSpeechRec = rec;
    } catch (e) {
      browserSpeechRec = null;
    }
  }

  function stopBrowserSpeechParallel() {
    if (!browserSpeechRec) return;
    try { browserSpeechRec.stop(); } catch (e) {}
    browserSpeechRec = null;
  }

  async function startMediaRecording() {
    if (state.listening) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Microphone API unavailable here — type in the quick command bar');
      var inp = document.getElementById('quickCmdInput');
      if (inp) inp.focus();
      return;
    }

    cancelPendingCapture = false;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startBrowserSpeechParallel();
      // Wire WebAudio AnalyserNode for live RMS listening rings & waveform
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) {
        audioCtx = new AudioCtor();
        var srcNode = audioCtx.createMediaStreamSource(mediaStream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserData = new Uint8Array(analyserNode.fftSize);
        srcNode.connect(analyserNode);
      }

      var chosenMime = pickRecorderMimeType();
      recordMimeType = chosenMime || 'audio/webm';
      recordedChunks = [];
      mediaRecorder = chosenMime ? new MediaRecorder(mediaStream, { mimeType: chosenMime }) : new MediaRecorder(mediaStream);

      mediaRecorder.ondataavailable = function (ev) {
        if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data);
      };

      mediaRecorder.onstop = async function () {
        stopBrowserSpeechParallel();
        var durationMs = Date.now() - recordStartedAt;
        var chunksCopy = recordedChunks.slice();
        var mimeCopy = (mediaRecorder && mediaRecorder.mimeType) || recordMimeType;
        var capturedSpeech = latestBrowserSpeech;
        cleanupAudioStream();
        mediaRecorder = null;

        if (cancelPendingCapture || durationMs < 150 || chunksCopy.length === 0) {
          resetMicUi(true);
          return;
        }

        var blob = new Blob(chunksCopy, { type: mimeCopy || 'audio/webm' });
        if (blob.size < 200) {
          resetMicUi(true);
          return;
        }

        resetMicUi(false);
        try {
          var b64 = await blobToBase64(blob);
          await submitCoordinatorAudio(b64, blob.type || 'audio/webm', capturedSpeech);
        } catch (err) {
          setPerchBubble(state.lastBubbleText, false);
          showToast('Audio encode failed');
        }
      };

      recordStartedAt = Date.now();
      state.listening = true;
      setMascotMood('listening', 'Listening');
      setPerchBubble('Listening to you...', false);
      var micBtn = document.getElementById('btnVoiceMic');
      if (micBtn) {
        micBtn.classList.add('btn-active-mic');
        micBtn.textContent = '⏹ Release / Done';
      }
      var waveWrap = document.getElementById('voiceWaveWrap');
      var waveLbl = document.getElementById('voiceWaveLabel');
      if (waveWrap) waveWrap.hidden = false;
      if (waveLbl) waveLbl.textContent = 'Listening — release to send';

      mediaRecorder.start(100);
    } catch (err) {
      cleanupAudioStream();
      resetMicUi(true);
      showToast('Mic permission/device error — type command in the box');
    }
  }

  function stopMediaRecording(cancel) {
    cancelPendingCapture = Boolean(cancel);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
        return;
      } catch {}
    }
    cleanupAudioStream();
    resetMicUi(true);
  }

  async function submitCoordinatorAudio(audioBase64, mimeType, browserTranscript) {
    var modeSel = document.getElementById('voiceModeSelect');
    var mode = modeSel ? modeSel.value : 'gemini-live';
    state.thinking = true;
    setMascotMood('thinking', 'Transcribing...');
    setPerchBubble('Processing voice...', false);

    try {
      var res = await apiPost('/api/voice/live-turn', {
        audioBase64: audioBase64,
        mimeType: mimeType,
        browserTranscript: browserTranscript || '',
        source: 'voice',
        mode: mode,
      });
      state.thinking = false;
      if (res && res.snapshot) state.snapshot = res.snapshot;
      var reply = (res && res.reply) || (res && res.error) || 'Done.';
      speakText(reply, res && res.ttsAudio);
      renderHeaderAndPerch();
      renderActiveTab();
    } catch (err) {
      state.thinking = false;
      setMascotMood('idle', 'Idle');
      setPerchBubble(state.lastBubbleText, false);
      showToast('Voice turn failed');
    }
  }

  async function submitCoordinatorPrompt(prompt, source) {
    var clean = String(prompt || '').trim();
    if (!clean) return;
    var modeSel = document.getElementById('voiceModeSelect');
    var mode = modeSel ? modeSel.value : 'gemini-live';
    state.thinking = true;
    setMascotMood('thinking', mode === 'gemini-live' ? 'Gemini...' : 'Thinking');
    setPerchBubble('Thinking...', false);

    try {
      var res = await apiPost('/api/voice/live-turn', {
        prompt: clean,
        source: source || 'text',
        mode: mode,
      });
      state.thinking = false;
      if (res && res.snapshot) state.snapshot = res.snapshot;
      var reply = (res && res.reply) || (res && res.error) || 'Done.';
      speakText(reply, res && res.ttsAudio);
      renderHeaderAndPerch();
      renderActiveTab();
    } catch (err) {
      state.thinking = false;
      setMascotMood('idle', 'Idle');
      setPerchBubble(state.lastBubbleText, false);
      showToast('Failed to send command');
    }
  }

  /* ---------- Render Header & Perch ---------- */

  function formatRelativeTime(iso) {
    if (!iso) return '';
    var ms = Date.parse(iso);
    if (!ms) return '';
    var diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 45) return 'just now';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
    return Math.floor(diffSec / 86400) + 'd ago';
  }

  function statusMeta(status) {
    if (status === 'NEEDS_YOU') return { cls: 'needs', label: 'Needs You' };
    if (status === 'STALLED') return { cls: 'stalled', label: 'Stalled >10m' };
    if (status === 'WORKING') return { cls: 'working', label: 'Working' };
    if (status === 'AWAITING_REPLY') return { cls: 'awaiting', label: 'Ready for Review' };
    if (status === 'READ_LATER') return { cls: 'snoozed', label: 'Read Later' };
    if (status === 'CLOSED') return { cls: 'closed', label: 'Closed' };
    return { cls: 'idle', label: 'Idle' };
  }

  async function openAgentSideBySide(agent) {
    if (!agent || !agent.id) return;
    state.selectedAgentId = agent.id;

    if (agent.needsAttention) {
      apiPost('/api/workers/meta', { convId: agent.id, ack: true, stepCount: agent.stepCount }).then(function (res) {
        if (res && res.snapshot) {
          state.snapshot = res.snapshot;
          renderHeaderAndPerch();
          renderActiveTab();
        }
      });
    }

    if (window.sidecar && window.sidecar.ui && typeof window.sidecar.ui.toggleConversation === 'function') {
      try {
        window.sidecar.ui.toggleConversation(agent.id, { split: true, replace: true });
        renderActiveTab();
        return;
      } catch (e) {
        try {
          window.sidecar.ui.toggleConversation(agent.id);
          return;
        } catch (_) {}
      }
    }

    state.expandedAgents[agent.id] = !state.expandedAgents[agent.id];
    renderActiveTab();
  }

  function syncTabHighlight() {
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === state.tab);
    });
  }

  function renderHeaderAndPerch() {
    var snap = state.snapshot;
    if (!snap) return;
    var assistantName = (snap.identity && snap.identity.name) || 'Clawy';
    var assistantRole = (snap.identity && snap.identity.role) || 'Agent Command Center';
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

    var att = snap.attentionSummary || {};
    var unreadTotal = Number(att.totalUnreadCount || 0);
    var activeCount = Number(att.activeCount || 0);
    var activeGoals = (snap.goals || []).filter(function (g) { return g.status !== 'done'; }).length;

    var hdrPill = document.getElementById('btn-updates-pill');
    var hdrCnt = document.getElementById('hdrNotifCount');
    if (hdrPill && hdrCnt) {
      hdrPill.classList.toggle('has-alerts', unreadTotal > 0);
      hdrCnt.hidden = unreadTotal <= 0;
      hdrCnt.textContent = String(unreadTotal);
    }

    var tabAgCnt = document.getElementById('tabAgentsCount');
    if (tabAgCnt) tabAgCnt.textContent = String(activeCount);

    var tabNotifCnt = document.getElementById('tabNotifCount');
    if (tabNotifCnt) {
      tabNotifCnt.hidden = unreadTotal <= 0;
      tabNotifCnt.textContent = String(unreadTotal);
    }

    var tabGoalsCnt = document.getElementById('tabGoalsCount');
    if (tabGoalsCnt) tabGoalsCnt.textContent = String(activeGoals);

    if (!state.listening && !state.thinking && !state.speaking && Date.now() > state.customBubbleUntil) {
      var triageMsg = '';
      if (att.needsYouCount > 0) {
        triageMsg = '🔴 ' + att.needsYouCount + ' agent' + (att.needsYouCount === 1 ? ' needs' : 's need') + ' your input right now — click its card below to pop the chat open side-by-side.';
      } else if (att.workingCount > 0) {
        triageMsg = '🔵 ' + att.workingCount + ' agent' + (att.workingCount === 1 ? ' is' : 's are') + ' actively working. Click any card to inspect live progress side-by-side.';
      } else if (att.awaitingCount > 0) {
        triageMsg = '🟡 ' + att.awaitingCount + ' agent' + (att.awaitingCount === 1 ? ' finished and is' : 's finished and are') + ' ready for review — click to pop open or ✕ to close.';
      } else {
        triageMsg = 'All caught up! ' + activeCount + ' active agent' + (activeCount === 1 ? '' : 's') + ' — click any card to pop it open side-by-side, or click + New Agent.';
      }
      setPerchBubble(triageMsg, true);
    }

    var footSum = document.getElementById('footerSummaryText');
    if (footSum) {
      footSum.textContent =
        activeCount + ' Active Agent' + (activeCount === 1 ? '' : 's') +
        (att.needsYouCount ? ' · ' + att.needsYouCount + ' Needs You' : '') +
        (att.workingCount ? ' · ' + att.workingCount + ' Working' : '') +
        (att.closedCount ? ' · ' + att.closedCount + ' Closed/History' : '');
    }
    var footTime = document.getElementById('footerSyncTime');
    if (footTime) {
      footTime.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }
  }

  /* ---------- New Agent Composer ---------- */

  function renderNewAgentComposer(root, groups) {
    if (!state.showSpawnForm) return;
    var formCard = el('form', 'coord-card');
    var headRow = el('div', 'coord-row-between');
    headRow.appendChild(el('div', 'coord-card-title', '🚀 Start New Agent Conversation'));
    var cancelBtn = el('button', 'btn btn-secondary btn-sm', 'Cancel');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', function () {
      state.showSpawnForm = false;
      renderActiveTab();
    });
    headRow.appendChild(cancelBtn);
    formCard.appendChild(headRow);

    var row1 = el('div', 'coord-row');
    var titleIn = el('input', 'coord-input coord-input-sm');
    titleIn.style.flex = '2 1 200px';
    titleIn.placeholder = 'Agent title (e.g., FOIA Discovery Check)';
    var grpSel = el('select', 'coord-select');
    grpSel.style.flex = '1 1 140px';
    groups.forEach(function (g) {
      var opt = el('option', '', 'Group: ' + g.title);
      opt.value = g.id;
      grpSel.appendChild(opt);
    });
    row1.appendChild(titleIn);
    row1.appendChild(grpSel);
    formCard.appendChild(row1);

    var promptIn = el('textarea', 'coord-textarea');
    promptIn.style.minHeight = '64px';
    promptIn.placeholder = 'What should this new agent work on? (e.g., /daily-brief Summarize my priorities and open action items)';
    formCard.appendChild(promptIn);

    var submitRow = el('div', 'coord-row');
    var goBtn = el('button', 'btn btn-primary btn-sm', 'Start Agent');
    goBtn.type = 'submit';
    submitRow.appendChild(goBtn);
    formCard.appendChild(submitRow);

    formCard.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var cleanPrompt = promptIn.value.trim();
      var cleanTitle = titleIn.value.trim();
      if (!cleanPrompt) return;
      goBtn.disabled = true;
      goBtn.textContent = 'Starting...';
      var res = await apiPost('/api/workers/spawn', {
        title: cleanTitle,
        groupId: grpSel.value,
        prompt: cleanPrompt,
      });
      if (res && res.ok && res.snapshot) {
        state.snapshot = res.snapshot;
        state.showSpawnForm = false;
        showToast('Started new agent');
        renderHeaderAndPerch();
        renderActiveTab();
        return;
      }
      if (window.sidecar && window.sidecar.agent && window.sidecar.agent.startConversation) {
        try {
          var created = await window.sidecar.agent.startConversation(cleanPrompt, cleanTitle || cleanPrompt.slice(0, 48));
          if (created && created.conversationId) {
            await apiPost('/api/workers/meta', {
              convId: created.conversationId,
              customTitle: cleanTitle,
              groupId: grpSel.value,
              customStatus: 'WORKING',
            });
          }
          state.showSpawnForm = false;
          showToast('Started new agent');
          refreshAll(false);
          return;
        } catch (e) {}
      }
      goBtn.disabled = false;
      goBtn.textContent = 'Start Agent';
      showToast('Could not start agent: ' + ((res && res.error) || 'error'));
    });

    root.appendChild(formCard);
  }

  /* ---------- Tab 1: Agents (Compact Cards + Split Pop-Out + Close/Snooze/Rename) ---------- */

  function renderAgentsTab(root) {
    var snap = state.snapshot;
    var groups = snap.groups || [];
    var goals = snap.goals || [];
    var workers = snap.workers || [];
    var att = snap.attentionSummary || {};

    renderNewAgentComposer(root, groups);

    var groupMap = {};
    groups.forEach(function (g) { groupMap[g.id] = g.title; });
    var goalMap = {};
    goals.forEach(function (gl) { goalMap[gl.id] = gl.title; });

    var attentionTotal = Number(att.needsYouCount || 0) + Number(att.awaitingCount || 0);
    var filterWrap = el('div', 'agent-filter-bar');
    var pills = el('div', 'agent-filter-pills');

    var addPill = function (id, label, extraCls) {
      var b = el('button', 'coord-pill-filter' + (extraCls ? ' ' + extraCls : '') + (state.agentFilter === id ? ' active' : ''), label);
      b.type = 'button';
      b.addEventListener('click', function () {
        state.agentFilter = id;
        renderActiveTab();
      });
      pills.appendChild(b);
    };

    addPill('active', 'Active (' + Number(att.activeCount || 0) + ')');
    if (attentionTotal > 0 || state.agentFilter === 'attention') {
      addPill('attention', '🔴 Needs Review (' + attentionTotal + ')', attentionTotal > 0 ? 'alert-pill' : '');
    }
    if (Number(att.readLaterCount || 0) > 0 || state.agentFilter === 'snoozed') {
      addPill('snoozed', '⏸ Read Later (' + Number(att.readLaterCount || 0) + ')');
    }
    if (groups.length > 1) {
      groups.forEach(function (g) {
        var gCnt = workers.filter(function (w) { return !w.closed && w.groupId === g.id; }).length;
        addPill('group:' + g.id, g.title + ' (' + gCnt + ')');
      });
    }
    addPill('closed', '🗄️ Closed & History (' + Number(att.closedCount || 0) + ')');
    filterWrap.appendChild(pills);

    var rightActions = el('div', 'coord-row');
    if (state.agentFilter !== 'closed' && Number(att.activeCount || 0) > 0) {
      var sweepBtn = el('button', 'btn btn-secondary btn-sm', '✓ Close Idle');
      sweepBtn.type = 'button';
      sweepBtn.title = 'Move unpinned Idle and reviewed agents to Closed & History';
      sweepBtn.addEventListener('click', async function () {
        var res = await apiPost('/api/workers/sweep', {});
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          renderHeaderAndPerch();
          renderActiveTab();
          showToast('Closed ' + (res.closedCount || 0) + ' idle agent(s)');
        }
      });
      rightActions.appendChild(sweepBtn);
    }
    filterWrap.appendChild(rightActions);
    root.appendChild(filterWrap);

    var q = (state.searchQuery || '').trim().toLowerCase();
    var filtered = workers.filter(function (w) {
      if (state.agentFilter === 'active') {
        if (w.closed || w.status === 'READ_LATER') return false;
      } else if (state.agentFilter === 'attention') {
        if (w.closed || !w.needsAttention) return false;
      } else if (state.agentFilter === 'snoozed') {
        if (w.status !== 'READ_LATER') return false;
      } else if (state.agentFilter === 'closed') {
        if (!w.closed) return false;
      } else if (state.agentFilter.indexOf('group:') === 0) {
        var gid = state.agentFilter.slice(6);
        if (w.closed || w.groupId !== gid) return false;
      }
      if (!q) return true;
      return (
        (w.title || '').toLowerCase().indexOf(q) >= 0 ||
        (w.summary || '').toLowerCase().indexOf(q) >= 0 ||
        (groupMap[w.groupId] || '').toLowerCase().indexOf(q) >= 0
      );
    });

    if (filtered.length === 0) {
      var emptyCard = el('div', 'coord-card');
      emptyCard.appendChild(
        el(
          'div',
          'coord-card-sub',
          state.agentFilter === 'closed'
            ? 'No closed or older agent conversations yet.'
            : q
              ? 'No agents match "' + state.searchQuery + '".'
              : 'All clear — zero open agents in this filter! Click "+ New Agent" in the top bar or check "Closed & History" to reopen a past chat.'
        )
      );
      root.appendChild(emptyCard);
      return;
    }

    var listEl = el('div', 'agent-list');
    filtered.forEach(function (w) {
      var sm = statusMeta(w.status);
      var isExpanded = Boolean(state.expandedAgents[w.id]);
      var isRenaming = state.renamingAgentId === w.id;
      var card = el(
        'div',
        'agent-card status-' + sm.cls + (state.selectedAgentId === w.id ? ' selected' : '')
      );

      var top = el('div', 'agent-card-top');
      var left = el('div', 'agent-title-wrap');
      left.appendChild(el('span', 'agent-dot ' + sm.cls));

      if (isRenaming) {
        var renForm = el('form', 'coord-row');
        renForm.style.flex = '1 1 auto';
        var renIn = el('input', 'coord-input coord-input-sm');
        renIn.style.flex = '1 1 200px';
        renIn.value = w.title || '';
        var saveRen = el('button', 'btn btn-primary btn-sm', 'Save');
        saveRen.type = 'submit';
        var cancelRen = el('button', 'btn btn-secondary btn-sm', 'Cancel');
        cancelRen.type = 'button';
        cancelRen.addEventListener('click', function () {
          state.renamingAgentId = '';
          renderActiveTab();
        });
        renForm.appendChild(renIn);
        renForm.appendChild(saveRen);
        renForm.appendChild(cancelRen);
        renForm.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          var res = await apiPost('/api/workers/meta', { convId: w.id, customTitle: renIn.value.trim() });
          state.renamingAgentId = '';
          if (res && res.snapshot) {
            state.snapshot = res.snapshot;
            renderHeaderAndPerch();
            renderActiveTab();
          }
        });
        left.appendChild(renForm);
        setTimeout(function () { renIn.focus(); renIn.select(); }, 20);
      } else {
        var titleBtn = el('button', 'agent-title-btn', (w.pinned ? '📌 ' : '') + (w.title || 'Agent Conversation'));
        titleBtn.type = 'button';
        titleBtn.title = 'Click to pop this conversation open side-by-side';
        titleBtn.addEventListener('click', function () {
          openAgentSideBySide(w);
        });
        left.appendChild(titleBtn);

        var relTime = formatRelativeTime(w.updateTime);
        if (relTime) {
          left.appendChild(el('span', 'agent-time-lbl', '· ' + relTime));
        }
        if (w.groupId && w.groupId !== 'group-default' && groupMap[w.groupId]) {
          left.appendChild(el('span', 'agent-group-chip', groupMap[w.groupId]));
        }
        if (w.goalId && goalMap[w.goalId]) {
          left.appendChild(el('span', 'agent-group-chip', '🎯 ' + goalMap[w.goalId]));
        }
      }
      top.appendChild(left);

      var toolbar = el('div', 'agent-toolbar');
      toolbar.appendChild(el('span', 'agent-status-pill ' + sm.cls, sm.label));

      var popBtn = el('button', 'agent-icon-btn split-btn', '↗ Pop Out');
      popBtn.type = 'button';
      popBtn.title = 'Open live conversation side-by-side next to Clawy';
      popBtn.addEventListener('click', function () {
        openAgentSideBySide(w);
      });
      toolbar.appendChild(popBtn);

      var peekBtn = el('button', 'agent-icon-btn', isExpanded ? '▴' : '▾');
      peekBtn.type = 'button';
      peekBtn.title = isExpanded ? 'Collapse preview & quick reply' : 'Peek at recent turns & quick reply';
      peekBtn.addEventListener('click', function () {
        state.expandedAgents[w.id] = !isExpanded;
        renderActiveTab();
      });
      toolbar.appendChild(peekBtn);

      var editBtn = el('button', 'agent-icon-btn', '✏️');
      editBtn.type = 'button';
      editBtn.title = 'Rename this agent';
      editBtn.addEventListener('click', function () {
        state.renamingAgentId = w.id;
        renderActiveTab();
      });
      toolbar.appendChild(editBtn);

      if (!w.closed) {
        var snoozeBtn = el('button', 'agent-icon-btn', w.snoozed ? '☀️' : '⏸');
        snoozeBtn.type = 'button';
        snoozeBtn.title = w.snoozed ? 'Move back to Active' : 'Snooze / Read Later';
        snoozeBtn.addEventListener('click', async function () {
          var res = await apiPost('/api/workers/meta', { convId: w.id, snoozed: !w.snoozed });
          if (res && res.snapshot) {
            state.snapshot = res.snapshot;
            renderHeaderAndPerch();
            renderActiveTab();
            showToast(w.snoozed ? 'Moved back to Active' : 'Saved to Read Later');
          }
        });
        toolbar.appendChild(snoozeBtn);

        var pinBtn = el('button', 'agent-icon-btn', w.pinned ? '📍' : '📌');
        pinBtn.type = 'button';
        pinBtn.title = w.pinned ? 'Unpin agent' : 'Pin agent to top';
        pinBtn.addEventListener('click', async function () {
          var res = await apiPost('/api/workers/meta', { convId: w.id, pinned: !w.pinned });
          if (res && res.snapshot) {
            state.snapshot = res.snapshot;
            renderActiveTab();
          }
        });
        toolbar.appendChild(pinBtn);

        var closeBtn = el('button', 'agent-icon-btn close-btn', '✕');
        closeBtn.type = 'button';
        closeBtn.title = 'Close / archive this agent';
        closeBtn.addEventListener('click', async function () {
          var res = await apiPost('/api/workers/meta', {
            convId: w.id,
            closed: true,
            stepCount: w.stepCount || 999999,
          });
          if (res && res.snapshot) {
            state.snapshot = res.snapshot;
            renderHeaderAndPerch();
            renderActiveTab();
            showToast('Closed "' + (w.title || 'Agent').slice(0, 32) + '"');
          }
        });
        toolbar.appendChild(closeBtn);
      } else {
        var reopenBtn = el('button', 'agent-icon-btn split-btn', '↺ Reopen');
        reopenBtn.type = 'button';
        reopenBtn.title = 'Move back to Active Agents';
        reopenBtn.addEventListener('click', async function () {
          var res = await apiPost('/api/workers/meta', { convId: w.id, closed: false });
          if (res && res.snapshot) {
            state.snapshot = res.snapshot;
            renderHeaderAndPerch();
            renderActiveTab();
            showToast('Reopened agent');
          }
        });
        toolbar.appendChild(reopenBtn);
      }

      top.appendChild(toolbar);
      card.appendChild(top);

      if (w.attentionReason && !w.closed) {
        card.appendChild(el('div', 'agent-reason-callout', w.attentionReason));
      }

      if (w.summary) {
        card.appendChild(el('div', 'agent-summary-line', w.summary));
      }

      if (isExpanded) {
        var drawer = el('div', 'agent-drawer');
        var turns = w.recentTurns || [];
        if (turns.length > 0) {
          var turnsBox = el('div', 'agent-turns-box');
          turns.forEach(function (t) {
            var row = el('div', 'agent-turn-row ' + (t.role === 'user' ? 'user' : 'agent'));
            row.appendChild(el('span', 'agent-turn-role', t.role === 'user' ? 'You:' : 'Agent:'));
            row.appendChild(el('span', '', t.text));
            turnsBox.appendChild(row);
          });
          drawer.appendChild(turnsBox);
        }

        var metaRow = el('div', 'coord-row');
        var grpPick = el('select', 'coord-select');
        grpPick.style.width = 'auto';
        grpPick.style.padding = '3px 8px';
        grpPick.style.fontSize = '11px';
        groups.forEach(function (g) {
          var opt = el('option', '', 'Group: ' + g.title);
          opt.value = g.id;
          if (g.id === w.groupId) opt.selected = true;
          grpPick.appendChild(opt);
        });
        grpPick.addEventListener('change', async function () {
          var res = await apiPost('/api/workers/meta', { convId: w.id, groupId: grpPick.value });
          if (res && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
        });
        metaRow.appendChild(grpPick);

        if (goals.length > 0) {
          var glPick = el('select', 'coord-select');
          glPick.style.width = 'auto';
          glPick.style.padding = '3px 8px';
          glPick.style.fontSize = '11px';
          var noneOpt = el('option', '', 'No linked Goal');
          noneOpt.value = '';
          glPick.appendChild(noneOpt);
          goals.forEach(function (gl) {
            var gOpt = el('option', '', '🎯 ' + gl.title);
            gOpt.value = gl.id;
            if (gl.id === w.goalId) gOpt.selected = true;
            glPick.appendChild(gOpt);
          });
          glPick.addEventListener('change', async function () {
            var res = await apiPost('/api/workers/meta', { convId: w.id, goalId: glPick.value });
            if (res && res.snapshot) { state.snapshot = res.snapshot; renderActiveTab(); }
          });
          metaRow.appendChild(glPick);
        }
        drawer.appendChild(metaRow);

        var replyForm = el('form', 'coord-row');
        var replyIn = el('input', 'coord-input coord-input-sm');
        replyIn.style.flex = '1 1 180px';
        replyIn.placeholder = 'Send a follow-up message to this agent...';
        var replyBtn = el('button', 'btn btn-primary btn-sm', 'Send Reply');
        replyBtn.type = 'submit';
        replyForm.appendChild(replyIn);
        replyForm.appendChild(replyBtn);
        replyForm.addEventListener('submit', async function (ev) {
          ev.preventDefault();
          var msgText = replyIn.value.trim();
          if (!msgText) return;
          replyBtn.disabled = true;
          var res = await apiPost('/api/workers/relay', { convId: w.id, message: msgText });
          replyBtn.disabled = false;
          if (res && res.ok && res.snapshot) {
            state.snapshot = res.snapshot;
            replyIn.value = '';
            showToast('Sent reply to "' + (w.title || 'Agent').slice(0, 28) + '"');
            renderHeaderAndPerch();
            renderActiveTab();
            return;
          }
          if (window.sidecar && window.sidecar.agent && window.sidecar.agent.sendMessage) {
            try {
              await window.sidecar.agent.sendMessage(msgText, w.id);
              replyIn.value = '';
              showToast('Sent reply to agent');
              refreshAll(false);
              return;
            } catch (e) {}
          }
          showToast('Reply failed: ' + ((res && res.error) || 'error'));
        });
        drawer.appendChild(replyForm);

        card.appendChild(drawer);
      }

      listEl.appendChild(card);
    });
    root.appendChild(listEl);
  }

  /* ---------- Tab 1B: Notifications & Attention Inbox ---------- */

  function renderNotificationsTab(root) {
    var snap = state.snapshot;
    var att = snap.attentionSummary || {};
    var notifs = att.notifications || [];
    var workers = snap.workers || [];
    var workerMap = {};
    workers.forEach(function (w) { workerMap[w.id] = w; });

    var headCard = el('div', 'coord-card');
    var hRow = el('div', 'coord-row-between');
    hRow.appendChild(el('div', 'coord-card-title', '🔔 Agent Attention & Updates (' + notifs.length + ')'));
    if (notifs.length > 0) {
      var ackAllBtn = el('button', 'btn btn-secondary btn-sm', '✓ Mark All Reviewed');
      ackAllBtn.type = 'button';
      ackAllBtn.addEventListener('click', async function () {
        for (var i = 0; i < notifs.length; i += 1) {
          await apiPost('/api/workers/meta', {
            convId: notifs[i].convId,
            ack: true,
            stepCount: notifs[i].stepCount || 999999,
          });
        }
        await refreshAll(false);
        showToast('Marked all notifications reviewed');
      });
      hRow.appendChild(ackAllBtn);
    }
    headCard.appendChild(hRow);
    headCard.appendChild(
      el(
        'div',
        'coord-card-sub',
        notifs.length > 0
          ? 'Agents below either asked a question, stalled, or finished a new response. Click "↗ Open Side-by-Side" to jump right in.'
          : 'Zero unread alerts right now — Clawy will badge the bell whenever an agent finishes or needs an answer.'
      )
    );
    root.appendChild(headCard);

    var nList = el('div', 'agent-list');
    notifs.forEach(function (n) {
      var sm = statusMeta(n.status);
      var card = el('div', 'agent-card status-' + sm.cls);
      var top = el('div', 'agent-card-top');
      var left = el('div', 'agent-title-wrap');
      left.appendChild(el('span', 'agent-dot ' + sm.cls));
      var tBtn = el('button', 'agent-title-btn', n.title || 'Agent Conversation');
      tBtn.type = 'button';
      tBtn.addEventListener('click', function () {
        openAgentSideBySide(workerMap[n.convId] || { id: n.convId, stepCount: n.stepCount, needsAttention: true });
      });
      left.appendChild(tBtn);
      var rel = formatRelativeTime(n.updateTime);
      if (rel) left.appendChild(el('span', 'agent-time-lbl', '· ' + rel));
      top.appendChild(left);

      var bar = el('div', 'agent-toolbar');
      bar.appendChild(el('span', 'agent-status-pill ' + sm.cls, sm.label));
      var openSplit = el('button', 'agent-icon-btn split-btn', '↗ Open Side-by-Side');
      openSplit.type = 'button';
      openSplit.addEventListener('click', function () {
        openAgentSideBySide(workerMap[n.convId] || { id: n.convId, stepCount: n.stepCount, needsAttention: true });
      });
      bar.appendChild(openSplit);

      var dismissBtn = el('button', 'agent-icon-btn', '✓ Dismiss');
      dismissBtn.type = 'button';
      dismissBtn.addEventListener('click', async function () {
        var res = await apiPost('/api/workers/meta', {
          convId: n.convId,
          ack: true,
          stepCount: n.stepCount || 999999,
        });
        if (res && res.snapshot) {
          state.snapshot = res.snapshot;
          renderHeaderAndPerch();
          renderActiveTab();
        }
      });
      bar.appendChild(dismissBtn);
      top.appendChild(bar);
      card.appendChild(top);

      if (n.reason) card.appendChild(el('div', 'agent-reason-callout', n.reason));
      if (n.summary) card.appendChild(el('div', 'agent-summary-line', n.summary));
      nList.appendChild(card);
    });
    root.appendChild(nList);
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
    chatCard.appendChild(el('div', 'coord-card-sub', 'Talk or type in plain English — ask Clawy for a status check, create sprint goals/tasks, or launch a background worker.'));

    var list = el('div', 'coord-chat-list');
    if (chatLog.length === 0) {
      var guideWrap = el('div', 'coord-onboarding-grid');
      [
        {
          title: '1. Check Active Conversations',
          desc: 'See which Antigravity chats are running, idle, or waiting on you.',
          btn: 'Summarize my chats →',
          prompt: 'Summarize my active Antigravity conversations and open priorities.'
        },
        {
          title: '2. Track Goals & Checklists',
          desc: 'Organize agency work into 2-level Group → Goal → Task sprints.',
          btn: 'Create sample goal →',
          prompt: 'Create goal: Q4 Agency Program & FOIA Readiness'
        },
        {
          title: '3. Talk Hands-Free',
          desc: 'Hold the mic button above to talk with Clawy via Gemini Live.',
          btn: 'What can Clawy do? →',
          prompt: 'What can Clawy do? Give me a quick tour of how to use Clawy.'
        }
      ].forEach(function (g) {
        var box = el('div', 'coord-onboarding-step');
        box.appendChild(el('strong', '', g.title));
        box.appendChild(el('span', '', g.desc));
        var tryBtn = el('button', 'btn btn-secondary btn-sm', g.btn);
        tryBtn.type = 'button';
        tryBtn.addEventListener('click', function () {
          submitCoordinatorPrompt(g.prompt, 'starter');
        });
        box.appendChild(tryBtn);
        guideWrap.appendChild(box);
      });
      list.appendChild(guideWrap);
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

    var authGuideCard = el('div', 'coord-auth-guide-card');
    authGuideCard.id = 'authGuideCard';
    authGuideCard.appendChild(el('strong', '', '🔑 Zero-Footprint Sign-In, Voice & Account Logout Guide (No Extra Installs Required)'));
    var guideList = el('ul', '');
    guideList.appendChild(
      el(
        'li',
        '',
        '1. Talk Right Now (Zero Login / Zero Install): Select "Browser Instant Voice" below — works out of the box on every laptop with zero keys or CLI tools.'
      )
    );
    guideList.appendChild(
      el(
        'li',
        '',
        '2. Antigravity App Logout / Re-Auth (Chat & IDE Account): Click ⚙️ Settings (bottom-left corner of Antigravity) -> Account -> Sign Out, then sign back in.'
      )
    );
    guideList.appendChild(
      el(
        'li',
        '',
        '3. Gemini Live Neural Voice (Kore): Paste an optional Gemini API Key below (zero CLI install, never expires every 20h) — or if you already use Google Cloud SDK, refresh your 20h ADC token with "gcloud auth application-default login".'
      )
    );
    authGuideCard.appendChild(guideList);
    root.appendChild(authGuideCard);

    var voiceCard = el('form', 'coord-card');
    voiceCard.appendChild(el('div', 'coord-card-title', 'Google Cloud Project (Vertex AI ADC) & Voice Settings'));
    var statusBanner = el(
      'div',
      'coord-card-sub',
      vs.lastDiagnostic
        ? '⚠️ ' + vs.lastDiagnostic
        : 'Active Auth: ' + (vs.effectiveProjectId ? 'GCP Project "' + vs.effectiveProjectId + '" (' + vs.projectSource + ')' : vs.keySource || 'Auto-detecting GCP Project') +
          ' · Stored with 0600 permissions in plugin_data/agy-coordinator/voice_prefs.json'
    );
    voiceCard.appendChild(statusBanner);

    var projLbl = el(
      'label',
      'coord-field-lbl',
      'Google Cloud Project ID (Vertex AI · Auto-detected: ' +
        (vs.effectiveProjectId ? vs.effectiveProjectId + ' via ' + vs.projectSource : 'none yet — enter your GCP Project ID below') +
        ')'
    );
    var projIn = el('input', 'coord-input coord-input-sm');
    projIn.placeholder = vs.effectiveProjectId || 'YOUR_PROJECT_ID (auto-detected from Antigravity / gcloud / ADC)';
    projIn.value = vs.projectId || '';
    voiceCard.appendChild(projLbl);
    voiceCard.appendChild(projIn);

    var adcRow = el('label', 'coord-row');
    var adcChk = el('input');
    adcChk.type = 'checkbox';
    adcChk.checked = vs.useGcloudAdc !== false;
    adcRow.appendChild(adcChk);
    adcRow.appendChild(el('span', '', 'Use Google Cloud ADC / gcloud login with your GCP Project (Vertex AI)'));
    voiceCard.appendChild(adcRow);

    var adcHelpRow = el('div', 'coord-row');
    var copyAdcBtn = el('button', 'btn btn-secondary btn-sm', '📋 Copy: gcloud auth application-default login');
    copyAdcBtn.type = 'button';
    copyAdcBtn.addEventListener('click', function () {
      var cmd = 'gcloud auth application-default login';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cmd).then(function () {
          showToast('Copied "' + cmd + '" — run in Terminal to refresh ADC');
        });
      } else {
        showToast('Run in Terminal: ' + cmd);
      }
    });
    adcHelpRow.appendChild(copyAdcBtn);
    voiceCard.appendChild(adcHelpRow);

    var mLbl = el('label', 'coord-field-lbl', 'Default Voice Engine');
    var mSel = el('select', 'coord-select');
    var o1 = el('option', '', 'Gemini Live (Vertex AI GCP Project)');
    o1.value = 'gemini-live';
    var o2 = el('option', '', 'Browser Instant Voice (Offline Local)');
    o2.value = 'browser';
    mSel.appendChild(o1);
    mSel.appendChild(o2);
    mSel.value = vs.mode || 'gemini-live';
    voiceCard.appendChild(mLbl);
    voiceCard.appendChild(mSel);

    var vNameLbl = el('label', 'coord-field-lbl', 'Gemini Neural Voice Character');
    var vNameSel = el('select', 'coord-select');
    [
      ['Kore', 'Kore — Confident & Crisp (Default)'],
      ['Zephyr', 'Zephyr — Clear & Friendly'],
      ['Aoede', 'Aoede — Warm & Natural'],
      ['Callirrhoe', 'Callirrhoe — Easy-Going & Smooth'],
      ['Autonoe', 'Autonoe — Bright & Warm'],
      ['Leda', 'Leda — Warm & Engaging'],
      ['Puck', 'Puck — Bright & Upbeat'],
      ['Fenrir', 'Fenrir — Approachable'],
      ['Orus', 'Orus — Steady & Clear'],
      ['Charon', 'Charon — Deep & Velvety']
    ].forEach(function (pair) {
      var vo = el('option', '', pair[1]);
      vo.value = pair[0];
      vNameSel.appendChild(vo);
    });
    vNameSel.value = vs.voiceName || 'Kore';
    voiceCard.appendChild(vNameLbl);
    voiceCard.appendChild(vNameSel);

    var advDetails = el('details', '');
    var advSummary = el('summary', 'coord-field-lbl', 'Advanced: Optional API Key Override' + (vs.hasApiKey ? ' (Saved ✓)' : ''));
    advSummary.style.cursor = 'pointer';
    advDetails.appendChild(advSummary);
    var keyIn = el('input', 'coord-input coord-input-sm');
    keyIn.type = 'password';
    keyIn.style.marginTop = '6px';
    keyIn.placeholder = vs.hasApiKey ? '•••••••• (saved — type to replace)' : 'Optional Vertex Express (AQ...) or AI Studio (AIza...) key';
    advDetails.appendChild(keyIn);
    if (vs.hasApiKey) {
      var clrBtn = el('button', 'btn btn-secondary btn-sm', 'Clear Saved API Key (Use GCP Project ADC Only)');
      clrBtn.type = 'button';
      clrBtn.style.marginTop = '6px';
      clrBtn.addEventListener('click', async function () {
        var r = await apiPost('/api/voice/prefs', { clearApiKey: true });
        if (r && r.snapshot) {
          state.snapshot = r.snapshot;
          showToast('Cleared API key — using GCP Project ADC');
          renderHeaderAndPerch();
          renderActiveTab();
        }
      });
      advDetails.appendChild(clrBtn);
    }
    voiceCard.appendChild(advDetails);

    var collectPrefsPayload = function () {
      var payload = {
        mode: mSel.value,
        voiceName: vNameSel.value,
        projectId: projIn.value.trim(),
        useGcloudAdc: adcChk.checked,
      };
      if (keyIn.value.trim()) payload.apiKey = keyIn.value.trim();
      return payload;
    };

    var btnRow = el('div', 'coord-row');
    var saveVoiceBtn = el('button', 'btn btn-primary btn-sm', '🔌 Save & Verify GCP Connection');
    saveVoiceBtn.type = 'submit';
    var testVoiceBtn = el('button', 'btn btn-secondary btn-sm', '🔊 Save & Test Bear Voice');
    testVoiceBtn.type = 'button';
    testVoiceBtn.addEventListener('click', async function () {
      var saved = await apiPost('/api/voice/prefs', collectPrefsPayload());
      if (saved && saved.snapshot) {
        state.snapshot = saved.snapshot;
        keyIn.value = '';
        renderHeaderAndPerch();
      }
      speakText(
        'Hello! ' + (id.name || 'Clawy') + ' is connected and ready to coordinate your agents.',
        null,
        vNameSel.value || 'Kore'
      );
    });
    btnRow.appendChild(saveVoiceBtn);
    btnRow.appendChild(testVoiceBtn);
    voiceCard.appendChild(btnRow);

    voiceCard.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      saveVoiceBtn.disabled = true;
      saveVoiceBtn.textContent = 'Verifying GCP Project...';
      var res = await apiPost('/api/voice/diagnose', collectPrefsPayload());
      saveVoiceBtn.disabled = false;
      saveVoiceBtn.textContent = '🔌 Save & Verify GCP Connection';
      if (res && res.snapshot) {
        state.snapshot = res.snapshot;
        keyIn.value = '';
        renderHeaderAndPerch();
        renderActiveTab();
      }
      var diagMsg = (res && res.diagnosis && res.diagnosis.summary) || (res && res.error) || 'Saved preferences';
      showToast(diagMsg);
      setPerchBubble(diagMsg, true);
    });
    root.appendChild(voiceCard);
  }

  function renderActiveTab() {
    var root = document.getElementById('view-root');
    if (!root || !state.snapshot) return;
    root.replaceChildren();
    if (state.tab === 'agents' || state.tab === 'workers') renderAgentsTab(root);
    else if (state.tab === 'notifications') renderNotificationsTab(root);
    else if (state.tab === 'goals') renderGoalsTab(root);
    else if (state.tab === 'chat') renderChatTab(root);
    else if (state.tab === 'identity') renderIdentityTab(root);
  }

  function isUserEditingInsideView() {
    var active = document.activeElement;
    if (!active) return false;
    var root = document.getElementById('view-root');
    if (!root || !root.contains(active)) return false;
    var tag = (active.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  async function refreshAll(showNotice, isBackgroundPoll) {
    try {
      var data = await apiGet('/api/state');
      if (data && data.ok) {
        state.snapshot = data;
        renderHeaderAndPerch();
        if (!isBackgroundPoll || (!isUserEditingInsideView() && !state.renamingAgentId)) {
          renderActiveTab();
        }
        if (tokenMeter) tokenMeter.refresh();
        if (showNotice) showToast('Refreshed agents & goals');
      }
    } catch (e) {
      if (showNotice) showToast('Refresh failed');
    }
  }

  function init() {
    var actionsEl = document.getElementById('topbar-token-slot') || document.querySelector('.topbar-actions');
    if (window.AGYTokenPill && actionsEl) {
      tokenMeter = window.AGYTokenPill.mount(actionsEl);
    }

    initMascotSprite();
    requestAnimationFrame(renderMascotFrame);

    window.addEventListener('pointermove', function (ev) {
      var vw = window.innerWidth || 800;
      var vh = window.innerHeight || 600;
      state.pointerX = Math.max(-1, Math.min(1, (ev.clientX / vw) * 2 - 1));
      state.pointerY = Math.max(-1, Math.min(1, (ev.clientY / vh) * 2 - 1));
    });

    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.tab = btn.getAttribute('data-tab') || 'agents';
        syncTabHighlight();
        renderActiveTab();
      });
    });

    var searchIn = document.getElementById('agentSearchInput');
    if (searchIn) {
      searchIn.addEventListener('input', function () {
        state.searchQuery = searchIn.value || '';
        if (state.tab !== 'agents') {
          state.tab = 'agents';
          syncTabHighlight();
        }
        renderActiveTab();
      });
    }

    window.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && searchIn) {
        var tag = (document.activeElement && document.activeElement.tagName || '').toUpperCase();
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          ev.preventDefault();
          searchIn.focus();
        }
      }
    });

    var updatesPill = document.getElementById('btn-updates-pill');
    if (updatesPill) {
      updatesPill.addEventListener('click', function () {
        state.tab = 'notifications';
        syncTabHighlight();
        renderActiveTab();
      });
    }

    var newAgentBtn = document.getElementById('btn-new-agent');
    if (newAgentBtn) {
      newAgentBtn.addEventListener('click', function () {
        state.tab = 'agents';
        state.showSpawnForm = !state.showSpawnForm;
        syncTabHighlight();
        renderActiveTab();
      });
    }

    var refreshBtn = document.getElementById('btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () { refreshAll(true, false); });
    }

    // Hold-to-Talk (>=250ms) + Click-to-Toggle (<250ms) on #btnVoiceMic
    var micBtn = document.getElementById('btnVoiceMic');
    if (micBtn) {
      micBtn.addEventListener('pointerdown', function (ev) {
        if (ev.button !== undefined && ev.button !== 0) return;
        ev.preventDefault();
        if (state.listening && state.clickToggleActive) {
          stopMediaRecording(false);
          return;
        }
        recordDownAt = Date.now();
        state.clickToggleActive = false;
        startMediaRecording();
      });

      var finishPointer = function () {
        if (!state.listening || state.clickToggleActive) return;
        var heldMs = Date.now() - recordDownAt;
        if (heldMs >= 250) {
          stopMediaRecording(false);
        } else {
          state.clickToggleActive = true;
          micBtn.textContent = '⏹ Done Speaking';
          var waveLbl = document.getElementById('voiceWaveLabel');
          if (waveLbl) waveLbl.textContent = 'Listening — click Done when finished';
        }
      };

      micBtn.addEventListener('pointerup', finishPointer);
      micBtn.addEventListener('pointercancel', function () {
        if (state.listening && !state.clickToggleActive) {
          stopMediaRecording(true);
        }
      });
    }

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
        var guideRow = document.getElementById('perchAuthGuideRow');
        if (guideRow && modeSel.value === 'browser') guideRow.hidden = true;
        showToast('Voice mode saved: ' + modeSel.value);
      });
    }

    var switchInstantBtn = document.getElementById('btnSwitchInstantVoice');
    if (switchInstantBtn) {
      switchInstantBtn.addEventListener('click', async function () {
        if (modeSel) modeSel.value = 'browser';
        var res = await apiPost('/api/voice/prefs', { mode: 'browser' });
        if (res && res.snapshot) state.snapshot = res.snapshot;
        var guideRow = document.getElementById('perchAuthGuideRow');
        if (guideRow) guideRow.hidden = true;
        setPerchBubble('Switched to Browser Instant Voice — hold 🎙️ Live or tap any starter below with zero sign-in needed!', true);
        showToast('Active: Browser Instant Voice (Zero Sign-In)');
      });
    }

    var openAuthGuideBtn = document.getElementById('btnOpenAuthGuide');
    if (openAuthGuideBtn) {
      openAuthGuideBtn.addEventListener('click', function () {
        var idTabBtn = document.querySelector('.tab-btn[data-tab="identity"]');
        if (idTabBtn) idTabBtn.click();
        setTimeout(function () {
          var card = document.getElementById('authGuideCard');
          if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      });
    }

    var mascotWrap = document.getElementById('mascotWrap');
    if (mascotWrap) {
      mascotWrap.addEventListener('click', function () {
        var name = (state.snapshot && state.snapshot.identity && state.snapshot.identity.name) || 'Clawy';
        speakText(name + ' reporting in. Hold the mic button or type below to coordinate.');
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

    var startersBar = document.getElementById('starterPromptsBar');
    if (startersBar) {
      var startersCollapsed = false;
      var STARTER_ITEMS = [
        { label: '👋 What can Clawy do?', mode: 'run', prompt: 'What can Clawy do? Give me a quick tour of how to use Clawy.' },
        { label: '📊 Summarize my agents', mode: 'run', prompt: 'Summarize my active agents and tell me what needs my attention.' },
        { label: '✅ Add a follow-up task', mode: 'run', prompt: 'Add task: Review open FOIA redactions & 2 CFR Part 200 grant ledger' },
        { label: '🚀 Draft a new agent', mode: 'prefill', prompt: 'spawn: /daily-brief Summarize my top agency priorities and open Action Items' }
      ];
      var renderStarters = function () {
        startersBar.replaceChildren();
        if (startersCollapsed) {
          var showBtn = el('button', 'coord-starter-toggle', '💡 Show Clawy starter examples');
          showBtn.type = 'button';
          showBtn.addEventListener('click', function () {
            startersCollapsed = false;
            renderStarters();
          });
          startersBar.appendChild(showBtn);
          return;
        }
        startersBar.appendChild(el('span', 'coord-starters-label', 'Try:'));
        STARTER_ITEMS.forEach(function (item) {
          var chip = el('button', 'coord-starter-chip', item.label);
          chip.type = 'button';
          chip.title = item.prompt;
          chip.addEventListener('click', function () {
            if (item.mode === 'prefill' && quickInput) {
              quickInput.value = item.prompt;
              quickInput.focus();
              setPerchBubble('Review or customize that worker task in the box below, then click Send to launch it!', false);
              return;
            }
            submitCoordinatorPrompt(item.prompt, 'starter');
          });
          startersBar.appendChild(chip);
        });
        var hideBtn = el('button', 'coord-starter-toggle', 'Hide');
        hideBtn.type = 'button';
        hideBtn.addEventListener('click', function () {
          startersCollapsed = true;
          renderStarters();
        });
        startersBar.appendChild(hideBtn);
      };
      renderStarters();
    }

    refreshAll(false, false);
    setInterval(function () {
      if (document.visibilityState !== 'hidden') {
        refreshAll(false, true);
      }
    }, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
