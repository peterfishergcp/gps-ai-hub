#!/usr/bin/env node
/**
 * Antigravity Local Token Consumption Analyzer (`token_usage_report.mjs`)
 *
 * Zero-dependency Node.js script (runs on Antigravity Desktop's built-in `node` runtime
 * with zero Python or npm installs).
 *
 * Scans `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`
 * across `~/.gemini/antigravity/brain` and `~/.gemini/jetski/brain` (or `--brain-dir`)
 * to retrieve exact per-turn token telemetry:
 *   - `input_tokens` (uncached prompt tokens)
 *   - `cache_read_tokens` (cached context tokens reused)
 *   - `output_tokens` (generated completion + thinking output tokens)
 *   - Rolling windows matching Antigravity's quota meters (Last 5 Hours, Last 24 Hours,
 *     Last 7 Days, and All Local History)
 *   - Top token-consuming conversations, peak single-turn context window size,
 *     prompt cache hit rate, and subagent / background task counts.
 *
 * Optional `--html-out <file.html>` writes a self-contained Antigravity-styled visual
 * dashboard artifact (zero external CDN scripts, safe DOM/escaped output) that renders
 * in the Side Pane and appears automatically in `Extensions -> Preview`.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const MAX_TRANSCRIPT_BYTES = 250 * 1024 * 1024; // 250 MB safety guard per file

function parseArgs(argv) {
  const opts = {
    brainDirs: [],
    convId: '',
    topN: 10,
    json: false,
    htmlOut: '',
    redactPreviews: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--brain-dir' && argv[i + 1]) {
      opts.brainDirs.push(path.resolve(argv[++i]));
    } else if (a === '--conv' && argv[i + 1]) {
      opts.convId = String(argv[++i]).trim();
    } else if (a === '--top' && argv[i + 1]) {
      opts.topN = Math.max(1, Math.min(50, Number(argv[++i]) || 10));
    } else if (a === '--json') {
      opts.json = true;
    } else if (a === '--redact-previews') {
      opts.redactPreviews = true;
    } else if (a === '--html-out' && argv[i + 1]) {
      opts.htmlOut = path.resolve(argv[++i]);
    }
  }
  return opts;
}

function discoverBrainRoots(explicitDirs) {
  const candidates = [...explicitDirs];
  if (candidates.length === 0) {
    if (process.env.ANTIGRAVITY_BRAIN_DIR) {
      candidates.push(process.env.ANTIGRAVITY_BRAIN_DIR);
    }
    candidates.push(path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
    candidates.push(path.join(os.homedir(), '.gemini', 'jetski', 'brain'));
  }

  const seen = new Set();
  const valid = [];
  for (const dir of candidates) {
    try {
      const st = fs.lstatSync(dir);
      if (!st.isDirectory() || st.isSymbolicLink()) continue;
      const real = fs.realpathSync(dir);
      if (seen.has(real)) continue;
      seen.add(real);
      valid.push(real);
    } catch {
      // Skip non-existent brain directories cleanly
    }
  }
  return valid;
}

function emptyBucket() {
  return {
    turns: 0,
    userPrompts: 0,
    subagentsSpawned: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function addStepToBucket(bucket, inp, cacheRead, out, isTurn, isUser, subagentCalls) {
  if (isTurn) bucket.turns += 1;
  if (isUser) bucket.userPrompts += 1;
  bucket.subagentsSpawned += subagentCalls;
  bucket.inputTokens += inp;
  bucket.cacheReadTokens += cacheRead;
  bucket.outputTokens += out;
  bucket.totalTokens += inp + cacheRead + out;
}

async function analyzeTranscript(txPath, convId, nowMs, windows) {
  const convSummary = {
    convId,
    firstAt: '',
    lastAt: '',
    lastMs: 0,
    previewPrompt: '',
    turns: 0,
    userPrompts: 0,
    subagentsSpawned: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    peakContextTokens: 0,
  };

  const stream = fs.createReadStream(txPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

    const createdAt = typeof obj.created_at === 'string' ? obj.created_at : '';
    const stepMs = createdAt ? Date.parse(createdAt) || 0 : 0;
    if (createdAt) {
      if (!convSummary.firstAt) convSummary.firstAt = createdAt;
      if (stepMs >= convSummary.lastMs) {
        convSummary.lastMs = stepMs;
        convSummary.lastAt = createdAt;
      }
    }

    const isUser = obj.type === 'USER_INPUT';
    if (isUser && !convSummary.previewPrompt && typeof obj.content === 'string') {
      const cleaned = obj.content
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned) convSummary.previewPrompt = cleaned.slice(0, 90);
    }

    const inp = Number(obj.input_tokens) || 0;
    const cacheRead = Number(obj.cache_read_tokens) || 0;
    const out = Number(obj.output_tokens) || 0;
    const hasTokens = inp > 0 || cacheRead > 0 || out > 0;
    const isTurn = obj.type === 'PLANNER_RESPONSE' || hasTokens;

    let subagentCalls = 0;
    if (Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        const name = (tc && (tc.name || tc.tool_name || (tc.function && tc.function.name))) || '';
        if (name === 'invoke_subagent') subagentCalls += 1;
      }
    }

    const turnContext = inp + cacheRead;
    if (turnContext > convSummary.peakContextTokens) {
      convSummary.peakContextTokens = turnContext;
    }

    if (isTurn) convSummary.turns += 1;
    if (isUser) convSummary.userPrompts += 1;
    convSummary.subagentsSpawned += subagentCalls;
    convSummary.inputTokens += inp;
    convSummary.cacheReadTokens += cacheRead;
    convSummary.outputTokens += out;
    convSummary.totalTokens += inp + cacheRead + out;

    addStepToBucket(windows.allTime, inp, cacheRead, out, isTurn, isUser, subagentCalls);
    if (stepMs > 0) {
      const ageMs = nowMs - stepMs;
      if (ageMs <= 5 * 3600 * 1000) {
        addStepToBucket(windows.last5h, inp, cacheRead, out, isTurn, isUser, subagentCalls);
      }
      if (ageMs <= 24 * 3600 * 1000) {
        addStepToBucket(windows.last24h, inp, cacheRead, out, isTurn, isUser, subagentCalls);
      }
      if (ageMs <= 7 * 24 * 3600 * 1000) {
        addStepToBucket(windows.last7d, inp, cacheRead, out, isTurn, isUser, subagentCalls);
      }
    }
  }

  return convSummary;
}

function fmtInt(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

function fmtCompact(n) {
  const val = Number(n) || 0;
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'K';
  return String(Math.round(val));
}

function cacheHitPct(bucket) {
  const denom = bucket.inputTokens + bucket.cacheReadTokens;
  if (denom <= 0) return '0.0%';
  return ((bucket.cacheReadTokens / denom) * 100).toFixed(1) + '%';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtmlReport(report) {
  const w5 = report.windows.last5h;
  const w24 = report.windows.last24h;
  const w7 = report.windows.last7d;
  const wall = report.windows.allTime;

  const rowsHtml = report.topConversations
    .map((c) => {
      const needsCompact = c.peakContextTokens >= 150000;
      const badge = needsCompact
        ? '<span class="badge warn">Run /compact (&gt;150K ctx)</span>'
        : '<span class="badge ok">Healthy Context</span>';
      return `<tr>
        <td><div class="conv-id">${escapeHtml(c.convId.slice(0, 8))}...</div><div class="conv-sub">${escapeHtml(c.previewPrompt || 'Interactive / Sidecar session')}</div></td>
        <td class="num">${fmtInt(c.turns)}</td>
        <td class="num">${fmtCompact(c.inputTokens)}</td>
        <td class="num">${fmtCompact(c.cacheReadTokens)}</td>
        <td class="num">${fmtCompact(c.outputTokens)}</td>
        <td class="num strong">${fmtCompact(c.totalTokens)}</td>
        <td class="num">${fmtCompact(c.peakContextTokens)}</td>
        <td>${badge}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Antigravity Token &amp; Quota Consumption Report</title>
  <style>
    :root {
      --bg: #ffffff;
      --surface: #f7f8fa;
      --border: #e5e7eb;
      --fg: #111827;
      --muted: #6b7280;
      --accent: #2563eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 28px 48px;
      font-family: "Google Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      -webkit-font-smoothing: antialiased;
    }
    .shell { max-width: 1060px; margin: 0 auto; }
    .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    h1 { margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; }
    .sub { margin: 4px 0 0; font-size: 12.5px; color: var(--muted); }
    .btn-row { display: flex; gap: 8px; }
    .pill-btn {
      border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--fg);
      padding: 6px 13px; font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .pill-btn.primary { background: var(--fg); color: #fff; border-color: var(--fg); }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 22px; }
    .kpi-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; }
    .kpi-label { font-size: 11.5px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
    .kpi-val { font-size: 24px; font-weight: 700; margin: 6px 0 4px; letter-spacing: -0.02em; }
    .kpi-meta { font-size: 12px; color: var(--muted); line-height: 1.4; }
    .panel { background: var(--bg); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; margin-bottom: 18px; overflow-x: auto; }
    .panel h2 { margin: 0 0 12px; font-size: 15px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th { text-align: left; color: var(--muted); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
    th.num, td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
    td.strong { font-weight: 600; }
    .conv-id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; color: var(--accent); font-weight: 600; }
    .conv-sub { font-size: 11.5px; color: var(--muted); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 11px; font-weight: 600; white-space: nowrap; }
    .badge.warn { background: rgba(245, 158, 11, 0.15); color: #b45309; }
    .badge.ok { background: rgba(16, 185, 129, 0.13); color: #047857; }
    .tips { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px; }
    .tip { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; font-size: 12.5px; line-height: 1.45; }
    .tip strong { display: block; margin-bottom: 3px; font-size: 13px; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div>
        <h1>Antigravity Token &amp; Quota Consumption</h1>
        <p class="sub">Generated ${escapeHtml(report.generatedAt)} · Scanned ${fmtInt(report.conversationsScanned)} local conversations (${escapeHtml(cacheHitPct(wall))} overall prompt cache hit rate)</p>
      </div>
      <div class="btn-row no-print">
        <button type="button" class="pill-btn" id="printBtn">Print / Save PDF</button>
        <button type="button" class="pill-btn primary" id="dlBtn">Open / Download HTML ↗</button>
      </div>
    </header>

    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Last 5 Hours (Rolling Window)</div>
        <div class="kpi-val">${fmtCompact(w5.totalTokens)}</div>
        <div class="kpi-meta">${fmtCompact(w5.inputTokens)} uncached in · ${fmtCompact(w5.cacheReadTokens)} cached · ${fmtCompact(w5.outputTokens)} out (${fmtInt(w5.turns)} turns)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Last 24 Hours</div>
        <div class="kpi-val">${fmtCompact(w24.totalTokens)}</div>
        <div class="kpi-meta">${fmtCompact(w24.inputTokens)} uncached in · ${fmtCompact(w24.cacheReadTokens)} cached · ${fmtCompact(w24.outputTokens)} out (${fmtInt(w24.turns)} turns)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Last 7 Days (Weekly Window)</div>
        <div class="kpi-val">${fmtCompact(w7.totalTokens)}</div>
        <div class="kpi-meta">${fmtCompact(w7.inputTokens)} uncached in · ${fmtCompact(w7.cacheReadTokens)} cached · ${fmtCompact(w7.outputTokens)} out (${fmtInt(w7.turns)} turns)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">All Local History</div>
        <div class="kpi-val">${fmtCompact(wall.totalTokens)}</div>
        <div class="kpi-meta">Cache hit rate: <strong>${escapeHtml(cacheHitPct(wall))}</strong> · ${fmtInt(wall.subagentsSpawned)} subagents spawned</div>
      </div>
    </section>

    <section class="panel">
      <h2>Top Token-Consuming Conversations</h2>
      <table>
        <thead>
          <tr>
            <th>Conversation</th>
            <th class="num">Turns</th>
            <th class="num">Uncached In</th>
            <th class="num">Cache Read</th>
            <th class="num">Output</th>
            <th class="num">Total Tokens</th>
            <th class="num">Peak Context</th>
            <th>Context Health</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="8">No local conversation transcripts found yet.</td></tr>'}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Quick Ways to Check Official Quota Bars &amp; Cut Token Burn</h2>
      <div class="tips">
        <div class="tip"><strong>1. Live 5-Hour &amp; Weekly Limit Bars</strong>Click the <code>Model Selector</code> under the chat box → <code>View Usage</code> (or run <code>/usage</code> and <code>/credits</code> in <code>agy</code> CLI).</div>
        <div class="tip"><strong>2. Use Orchestrator Mode</strong>Select <code>Orchestrator (Neon / Carbon / Argon)</code> so a frontier Gemini 4 model plans once and fast <code>Gemini 4 Hydrogen</code> executes edits at lower quota cost.</div>
        <div class="tip"><strong>3. Compact &gt;150K Threads</strong>Run <code>/compact</code> or start a fresh conversation when switching topics so you stop re-sending 150K+ historical tokens on every turn.</div>
      </div>
    </section>
  </div>
  <script>
    document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
    document.getElementById('dlBtn').addEventListener('click', function () {
      var serialized = new XMLSerializer().serializeToString(document.documentElement);
      var blob = new Blob(['<!doctype html>\\n' + serialized], { type: 'text/html;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'antigravity-token-usage-report.html';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>
`;
}

async function main() {
  const opts = parseArgs(process.argv);
  const roots = discoverBrainRoots(opts.brainDirs);
  const nowMs = Date.now();
  const windows = {
    last5h: emptyBucket(),
    last24h: emptyBucket(),
    last7d: emptyBucket(),
    allTime: emptyBucket(),
  };

  const conversations = [];

  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.isSymbolicLink() || ent.name.startsWith('.')) continue;
      if (opts.convId && ent.name !== opts.convId) continue;

      const txPath = path.join(root, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        const st = fs.lstatSync(txPath);
        if (!st.isFile() || st.isSymbolicLink() || st.size === 0 || st.size > MAX_TRANSCRIPT_BYTES) continue;
        const summary = await analyzeTranscript(txPath, ent.name, nowMs, windows);
        if (summary.totalTokens > 0 || summary.turns > 0) {
          if (opts.redactPreviews) summary.previewPrompt = '[Redacted]';
          conversations.push(summary);
        }
      } catch {
        continue;
      }
    }
  }

  conversations.sort((a, b) => b.totalTokens - a.totalTokens);
  const report = {
    generatedAt: new Date(nowMs).toISOString(),
    brainRoots: roots,
    conversationsScanned: conversations.length,
    windows,
    overallCacheHitRate: cacheHitPct(windows.allTime),
    topConversations: conversations.slice(0, opts.topN),
  };

  if (opts.htmlOut) {
    fs.mkdirSync(path.dirname(opts.htmlOut), { recursive: true });
    fs.writeFileSync(opts.htmlOut, buildHtmlReport(report), 'utf-8');
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('# Antigravity Local Token Consumption Report');
  console.log(`- **Scanned Conversations:** ${fmtInt(report.conversationsScanned)} (${roots.join(', ') || 'none'})`);
  console.log(`- **Overall Prompt Cache Hit Rate:** ${report.overallCacheHitRate}\n`);
  console.log('| Window | Model Turns | Uncached Input | Cache Read | Output Tokens | Total Tokens | Subagents |');
  console.log('| :--- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [label, b] of [
    ['Last 5 Hours (Rolling Quota Window)', windows.last5h],
    ['Last 24 Hours', windows.last24h],
    ['Last 7 Days (Weekly Quota Window)', windows.last7d],
    ['All Local History', windows.allTime],
  ]) {
    console.log(
      `| **${label}** | ${fmtInt(b.turns)} | ${fmtInt(b.inputTokens)} | ${fmtInt(b.cacheReadTokens)} | ${fmtInt(b.outputTokens)} | **${fmtInt(b.totalTokens)}** | ${fmtInt(b.subagentsSpawned)} |`
    );
  }

  if (report.topConversations.length > 0) {
    console.log(`\n## Top ${report.topConversations.length} Conversations by Token Consumption`);
    console.log('| Conversation | Turns | Uncached In | Cache Read | Output | Total Tokens | Peak Context | Prompt Preview |');
    console.log('| :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- |');
    for (const c of report.topConversations) {
      const flag = c.peakContextTokens >= 150000 ? ' ⚠️ `/compact`' : '';
      const preview = (c.previewPrompt || '').replace(/\|/g, '/');
      console.log(
        `| \`${c.convId.slice(0, 8)}\` | ${fmtInt(c.turns)} | ${fmtCompact(c.inputTokens)} | ${fmtCompact(c.cacheReadTokens)} | ${fmtCompact(c.outputTokens)} | **${fmtCompact(c.totalTokens)}** | ${fmtCompact(c.peakContextTokens)}${flag} | ${preview} |`
      );
    }
  }

  if (opts.htmlOut) {
    console.log(`\nWrote interactive HTML dashboard: ${opts.htmlOut}`);
  }
}

main().catch((err) => {
  console.error('Token usage report failed:', err.message);
  process.exit(1);
});
