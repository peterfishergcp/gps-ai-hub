/**
 * Fast Memoized Local Token Telemetry Meter (`token_meter.mjs`)
 *
 * Scans `<appDataDir>/brain/<conv-id>/.system_generated/logs/transcript.jsonl`
 * for recent conversations (last 7 days + optional active `convId`), caching
 * parsed step records by `(realPath, mtimeMs, size)` so subsequent hover/refresh
 * queries return in <5ms.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const SAFE_CONV_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/;
const MAX_TX_BYTES = 250 * 1024 * 1024;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const FIVE_HOURS_MS = 5 * 3600 * 1000;
const ONE_DAY_MS = 24 * 3600 * 1000;

// Map<realPath, { mtimeMs, size, convId, preview, peakContext, steps: Array<[stepMs, inp, cacheRead, out, think, isTurn]> }>
const FILE_CACHE = new Map();

function getBrainRoots() {
  const candidates = [];
  if (process.env.ANTIGRAVITY_BRAIN_DIR) {
    candidates.push(process.env.ANTIGRAVITY_BRAIN_DIR);
  }
  const execDir = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '';
  if (execDir) {
    const marker = path.sep + 'sidecar_data' + path.sep;
    const idx = execDir.indexOf(marker);
    if (idx > 0) {
      candidates.push(path.join(execDir.slice(0, idx), 'brain'));
    }
  }
  if (process.env.ANTIGRAVITY_BRAIN_ISOLATED !== '1') {
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
    candidates.push(path.join(os.homedir(), '.gemini', 'jetski', 'brain'));
  }

  const seen = new Set();
  const roots = [];
  for (const raw of candidates) {
    if (!raw) continue;
    try {
      const st = fs.lstatSync(raw);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
      const real = fs.realpathSync(raw);
      if (seen.has(real)) continue;
      seen.add(real);
      roots.push(real);
    } catch {
      // ignore missing dirs
    }
  }
  return roots;
}

async function parseTranscriptCached(txPath, convId, st) {
  const real = fs.realpathSync(txPath);
  const hit = FILE_CACHE.get(real);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit;
  }

  const steps = [];
  let preview = '';
  let peakContext = 0;

  const stream = fs.createReadStream(real, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    if (!preview && obj.type === 'USER_INPUT' && typeof obj.content === 'string') {
      const cleaned = obj.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned) preview = cleaned.slice(0, 64);
    }

    const inp = Number(obj.input_tokens) || 0;
    const cacheRead = Number(obj.cache_read_tokens) || 0;
    const out = Number(obj.output_tokens) || 0;
    const isTurn = obj.type === 'PLANNER_RESPONSE' || inp > 0 || cacheRead > 0 || out > 0;
    if (!isTurn) continue;

    let think = Number(obj.thinking_output_tokens || obj.thinking_tokens) || 0;
    if (!think && typeof obj.thinking === 'string' && obj.thinking.length > 0) {
      think = Math.min(out, Math.ceil(obj.thinking.length / 4));
    }

    const ctx = inp + cacheRead;
    if (ctx > peakContext) peakContext = ctx;

    const stepMs = typeof obj.created_at === 'string' ? Date.parse(obj.created_at) || st.mtimeMs : st.mtimeMs;
    steps.push([stepMs, inp, cacheRead, out, think, 1]);
  }

  const entry = {
    mtimeMs: st.mtimeMs,
    size: st.size,
    convId,
    preview,
    peakContext,
    steps,
  };

  if (FILE_CACHE.size > 220) {
    const oldestKey = FILE_CACHE.keys().next().value;
    if (oldestKey) FILE_CACHE.delete(oldestKey);
  }
  FILE_CACHE.set(real, entry);
  return entry;
}

function emptyWindow() {
  return {
    turns: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    cacheHitPct: '0.0%',
  };
}

function finalizeWindow(w) {
  w.totalTokens = w.inputTokens + w.cacheReadTokens + w.outputTokens;
  const denom = w.inputTokens + w.cacheReadTokens;
  w.cacheHitPct = denom > 0 ? ((w.cacheReadTokens / denom) * 100).toFixed(1) + '%' : '0.0%';
  return w;
}

export async function getTokenMeterSummary(rawConvId = '') {
  const activeConvId = SAFE_CONV_RE.test(String(rawConvId || '').trim()) ? String(rawConvId).trim() : '';
  const nowMs = Date.now();
  const roots = getBrainRoots();

  const last5h = emptyWindow();
  const last24h = emptyWindow();
  const last7d = emptyWindow();

  let activeConversation = null;
  let newestConversation = null;
  const recentConvs = [];

  for (const root of roots) {
    let dirs = [];
    try {
      dirs = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const d of dirs) {
      if (!d.isDirectory() || d.isSymbolicLink() || d.name.startsWith('.')) continue;
      const cid = d.name;
      const txPath = path.join(root, cid, '.system_generated', 'logs', 'transcript.jsonl');
      let st;
      try {
        st = fs.lstatSync(txPath);
      } catch {
        continue;
      }
      if (!st.isFile() || st.isSymbolicLink() || st.size === 0 || st.size > MAX_TX_BYTES) continue;

      const isTargetActive = activeConvId && cid === activeConvId;
      if (!isTargetActive && nowMs - st.mtimeMs > SEVEN_DAYS_MS) continue;

      let parsed;
      try {
        parsed = await parseTranscriptCached(txPath, cid, st);
      } catch {
        continue;
      }

      const convTotals = emptyWindow();
      for (const [stepMs, inp, cacheRead, out, think, turns] of parsed.steps) {
        convTotals.turns += turns;
        convTotals.inputTokens += inp;
        convTotals.cacheReadTokens += cacheRead;
        convTotals.outputTokens += out;
        convTotals.thinkingTokens += think;

        const age = nowMs - stepMs;
        if (age <= SEVEN_DAYS_MS) {
          last7d.turns += turns;
          last7d.inputTokens += inp;
          last7d.cacheReadTokens += cacheRead;
          last7d.outputTokens += out;
          last7d.thinkingTokens += think;
          if (age <= ONE_DAY_MS) {
            last24h.turns += turns;
            last24h.inputTokens += inp;
            last24h.cacheReadTokens += cacheRead;
            last24h.outputTokens += out;
            last24h.thinkingTokens += think;
            if (age <= FIVE_HOURS_MS) {
              last5h.turns += turns;
              last5h.inputTokens += inp;
              last5h.cacheReadTokens += cacheRead;
              last5h.outputTokens += out;
              last5h.thinkingTokens += think;
            }
          }
        }
      }

      finalizeWindow(convTotals);
      if (convTotals.turns === 0) continue;

      const convRecord = {
        convId: cid,
        preview: parsed.preview || 'Conversation ' + cid.slice(0, 8),
        mtimeMs: st.mtimeMs,
        peakContextTokens: parsed.peakContext,
        ...convTotals,
      };

      recentConvs.push(convRecord);
      if (isTargetActive) {
        activeConversation = convRecord;
      }
      if (!newestConversation || st.mtimeMs > newestConversation.mtimeMs) {
        newestConversation = convRecord;
      }
    }
  }

  recentConvs.sort((a, b) => b.totalTokens - a.totalTokens);

  return {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    activeConversation,
    newestConversation,
    windows: {
      last5h: finalizeWindow(last5h),
      last24h: finalizeWindow(last24h),
      last7d: finalizeWindow(last7d),
    },
    topRecentConversations: recentConvs.slice(0, 4),
  };
}
