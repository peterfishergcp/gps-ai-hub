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
    tab: 'workers',
    groupFilter: 'all',
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
    lastBubbleText: 'Ready to coordinate Workers, Groups, and Goals.',
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
    if (bubble) bubble.textContent = clean || state.lastBubbleText;
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
      var my = (0.57 - 0.5) * drawH;
      var openAmt = state.speaking ? state.mouthOpenness : 0;
      if (openAmt > 0.04) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.ellipse(mx, my, 9 + openAmt * 4, 2.5 + openAmt * 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.ellipse(mx, my + openAmt * 1.5, 6.5 + openAmt * 2.5, 1.5 + openAmt * 4.0, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (!window.__CLAWY_MASCOT_DATA_URL) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3.2;
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

  var ttsPlaybackCtx = null;
  var ttsSourceNode = null;
  var ttsAnalyserTimer = null;

  function stopTtsAudioPlayback() {
    if (ttsAnalyserTimer) {
      clearInterval(ttsAnalyserTimer);
      ttsAnalyserTimer = null;
    }
    if (ttsSourceNode) {
      try { ttsSourceNode.stop(); } catch (e) {}
      ttsSourceNode = null;
    }
    if (ttsPlaybackCtx) {
      try { ttsPlaybackCtx.close(); } catch (e) {}
      ttsPlaybackCtx = null;
    }
  }

  function playPcm16Base64(ttsAudio) {
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor || !ttsAudio || !ttsAudio.audioBase64) return false;
    try {
      stopTtsAudioPlayback();
      if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
      var bin = window.atob(ttsAudio.audioBase64);
      var pcmOffset = 0;
      if (bin.length > 44 && bin.slice(0, 4) === 'RIFF' && bin.slice(8, 12) === 'WAVE') {
        pcmOffset = 44;
      }
      var sampleCount = Math.floor((bin.length - pcmOffset) / 2);
      if (sampleCount < 10) return false;
      var rate = Number(ttsAudio.sampleRate) || 24000;
      // Run AudioContext at hardware native rate (e.g., 48kHz in Electron) and specify 24kHz on createBuffer
      var ctx = new AudioCtor();
      if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
        ctx.resume().catch(function () {});
      }
      ttsPlaybackCtx = ctx;
      var audioBuf = ctx.createBuffer(1, sampleCount, rate);
      var ch = audioBuf.getChannelData(0);
      for (var i = 0; i < sampleCount; i += 1) {
        var idx = pcmOffset + i * 2;
        var lo = bin.charCodeAt(idx);
        var hi = bin.charCodeAt(idx + 1);
        var val = (hi << 8) | lo;
        if (val >= 0x8000) val -= 0x10000;
        ch[i] = val / 32768;
      }
      var src = ctx.createBufferSource();
      src.buffer = audioBuf;
      var an = ctx.createAnalyser();
      an.fftSize = 256;
      var timeBuf = new Uint8Array(an.fftSize);
      src.connect(an);
      an.connect(ctx.destination);
      ttsSourceNode = src;
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
        stopTtsAudioPlayback();
        stopLipSyncPulse();
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
    if (clean) setPerchBubble(clean, true);
    if (!clean || !state.ttsEnabled) return;

    if (preloadedTtsAudio && preloadedTtsAudio.audioBase64) {
      if (playPcm16Base64(preloadedTtsAudio)) return;
    }

    var vPrefs = state.snapshot && state.snapshot.voiceStatus ? state.snapshot.voiceStatus : {};
    var modeSel = document.getElementById('voiceModeSelect');
    var activeMode = modeSel ? modeSel.value : (vPrefs.mode || 'gemini-live');
    if (vPrefs.readyForGeminiLive && activeMode === 'gemini-live') {
      try {
        var chosenVoice = voiceOverride || vPrefs.voiceName || 'Zephyr';
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
      micBtn.textContent = '🎙️ Hold / Click to Talk';
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
        var durationMs = Date.now() - recordStartedAt;
        var chunksCopy = recordedChunks.slice();
        var mimeCopy = (mediaRecorder && mediaRecorder.mimeType) || recordMimeType;
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
          await submitCoordinatorAudio(b64, blob.type || 'audio/webm');
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

  async function submitCoordinatorAudio(audioBase64, mimeType) {
    var modeSel = document.getElementById('voiceModeSelect');
    var mode = modeSel ? modeSel.value : 'gemini-live';
    state.thinking = true;
    setMascotMood('thinking', 'Transcribing...');
    setPerchBubble('Processing voice with Gemini...', false);

    try {
      var res = await apiPost('/api/voice/live-turn', {
        audioBase64: audioBase64,
        mimeType: mimeType,
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

  /* ---------- Tab 1: Workers (Desktop Brain Discovery + Sidecar Agent Fallback) ---------- */

  function renderWorkersTab(root) {
    var snap = state.snapshot;
    var ls = snap.lsStatus || {};
    var groups = snap.groups || [];
    var workers = snap.workers || [];

    if (workers.length === 0 && !ls.available) {
      root.appendChild(
        el(
          'div',
          'coord-banner',
          'No active conversations discovered yet. Click "+ Spawn Worker" to start one.'
        )
      );
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
        var cleanPrompt = promptIn.value.trim();
        var cleanTitle = titleIn.value.trim();
        if (!cleanPrompt) return;
        goBtn.disabled = true;
        goBtn.textContent = 'Dispatching...';
        var res = await apiPost('/api/workers/spawn', {
          title: cleanTitle,
          groupId: grpSel.value,
          prompt: cleanPrompt,
        });
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          state.showSpawnForm = false;
          showToast('Spawned worker');
          renderActiveTab();
          return;
        }
        // Desktop fallback: window.sidecar.agent.startConversation
        if (window.sidecar && window.sidecar.agent && window.sidecar.agent.startConversation) {
          try {
            var created = await window.sidecar.agent.startConversation(cleanPrompt, cleanTitle || cleanPrompt.slice(0, 48));
            if (created && created.conversationId) {
              await apiPost('/api/workers/meta', {
                convId: created.conversationId,
                groupId: grpSel.value,
                customStatus: 'WORKING',
              });
            }
            state.showSpawnForm = false;
            showToast('Started worker via Antigravity host');
            refreshAll(false);
            return;
          } catch (e) {}
        }
        goBtn.disabled = false;
        goBtn.textContent = 'Dispatch Worker';
        showToast('Spawn failed: ' + ((res && res.error) || 'error'));
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
        var msgText = relayIn.value.trim();
        if (!msgText) return;
        relayBtn.disabled = true;
        var res = await apiPost('/api/workers/relay', { convId: w.id, message: msgText });
        relayBtn.disabled = false;
        if (res && res.ok && res.snapshot) {
          state.snapshot = res.snapshot;
          relayIn.value = '';
          showToast('Relayed to ' + (w.title || w.id.slice(0, 8)));
          renderActiveTab();
          return;
        }
        // Desktop fallback: window.sidecar.agent.sendMessage
        if (window.sidecar && window.sidecar.agent && window.sidecar.agent.sendMessage) {
          try {
            await window.sidecar.agent.sendMessage(msgText, w.id);
            relayIn.value = '';
            showToast('Relayed via Antigravity host');
            await apiPost('/api/board', { author: 'Coordinator', kind: 'relay', summary: 'Relayed to ' + w.id.slice(0, 8) + ': ' + msgText.slice(0, 100) });
            refreshAll(false);
            return;
          } catch (e) {}
        }
        showToast('Relay failed: ' + ((res && res.error) || 'error'));
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
    chatCard.appendChild(el('div', 'coord-card-sub', 'Say or type naturally (e.g., "Create goal: Ship v1.8", "spawn: ...", or "relay <idPrefix>: ...").'));

    var list = el('div', 'coord-chat-list');
    if (chatLog.length === 0) {
      list.appendChild(el('div', 'coord-card-sub', 'No messages yet. Hold the mic button or type in the perch bar above!'));
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
    voiceCard.appendChild(el('div', 'coord-card-title', 'Dual-Mode Voice & Auto-ADC Settings'));
    voiceCard.appendChild(
      el(
        'div',
        'coord-card-sub',
        'Auth detected: ' + (vs.readyForGeminiLive ? 'Gemini Ready (' + vs.keySource + ')' : 'Local fallback (no API key or ADC file detected)') +
        ' · Stored with 0600 permissions in plugin_data/wv-coordinator/voice_prefs.json'
      )
    );

    var mLbl = el('label', 'coord-field-lbl', 'Default Voice Engine');
    var mSel = el('select', 'coord-select');
    var o1 = el('option', '', 'Gemini Live');
    o1.value = 'gemini-live';
    var o2 = el('option', '', 'Browser Instant Voice (Local Fallback)');
    o2.value = 'browser';
    mSel.appendChild(o1);
    mSel.appendChild(o2);
    mSel.value = vs.mode || 'gemini-live';
    voiceCard.appendChild(mLbl);
    voiceCard.appendChild(mSel);

    var vNameLbl = el('label', 'coord-field-lbl', 'Gemini 3.1 Neural Voice Character');
    var vNameSel = el('select', 'coord-select');
    [
      ['Zephyr', 'Zephyr — Clear & Friendly (Default)'],
      ['Aoede', 'Aoede — Warm & Natural'],
      ['Callirrhoe', 'Callirrhoe — Easy-Going & Smooth'],
      ['Autonoe', 'Autonoe — Bright & Warm'],
      ['Leda', 'Leda — Warm & Engaging'],
      ['Puck', 'Puck — Bright & Upbeat'],
      ['Kore', 'Kore — Confident & Crisp'],
      ['Fenrir', 'Fenrir — Approachable'],
      ['Orus', 'Orus — Steady & Clear'],
      ['Charon', 'Charon — Deep & Velvety']
    ].forEach(function (pair) {
      var vo = el('option', '', pair[1]);
      vo.value = pair[0];
      vNameSel.appendChild(vo);
    });
    vNameSel.value = vs.voiceName || 'Zephyr';
    voiceCard.appendChild(vNameLbl);
    voiceCard.appendChild(vNameSel);

    var projLbl = el(
      'label',
      'coord-field-lbl',
      'Google Cloud Project ID (Default Vertex AI · Auto-detected: ' +
        (vs.effectiveProjectId ? vs.effectiveProjectId + ' via ' + vs.projectSource : 'none yet — enter project or run /connect-ge') +
        ')'
    );
    var projIn = el('input', 'coord-input coord-input-sm');
    projIn.placeholder = vs.effectiveProjectId || 'YOUR_PROJECT_ID (auto-detected from GE / gcloud)';
    projIn.value = vs.projectId || '';
    voiceCard.appendChild(projLbl);
    voiceCard.appendChild(projIn);

    var keyLbl = el('label', 'coord-field-lbl', 'Optional AI Studio GEMINI_API_KEY (only needed if not using Google Cloud Project / ADC)');
    var keyIn = el('input', 'coord-input coord-input-sm');
    keyIn.type = 'password';
    keyIn.placeholder = vs.hasApiKey ? '•••••••• (key saved — type to replace)' : 'AIza... (optional)';
    voiceCard.appendChild(keyLbl);
    voiceCard.appendChild(keyIn);

    var adcRow = el('label', 'coord-row');
    var adcChk = el('input');
    adcChk.type = 'checkbox';
    adcChk.checked = vs.useGcloudAdc !== false;
    adcRow.appendChild(adcChk);
    adcRow.appendChild(el('span', '', 'Auto-use keyless gcloud ADC (application_default_credentials.json / gcloud CLI)'));
    voiceCard.appendChild(adcRow);

    var btnRow = el('div', 'coord-row');
    var saveVoiceBtn = el('button', 'btn btn-primary btn-sm', 'Save Voice Prefs');
    saveVoiceBtn.type = 'submit';
    var testVoiceBtn = el('button', 'btn btn-secondary btn-sm', 'Test Mascot Voice & Lip-Sync');
    testVoiceBtn.type = 'button';
    testVoiceBtn.addEventListener('click', function () {
      speakText(
        'Hello! ' + (id.name || 'Clawy') + ' is online and ready to coordinate your workers.',
        null,
        vNameSel.value || 'Zephyr'
      );
    });
    btnRow.appendChild(saveVoiceBtn);
    btnRow.appendChild(testVoiceBtn);
    voiceCard.appendChild(btnRow);

    voiceCard.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var payload = {
        mode: mSel.value,
        voiceName: vNameSel.value,
        projectId: projIn.value.trim(),
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
        showToast('Voice mode saved: ' + modeSel.value);
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

    refreshAll(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
