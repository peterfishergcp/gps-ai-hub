/**
 * Fast Memoized Local Token & TokenEconomics Telemetry Engine (`token_meter.mjs`)
 *
 * Scans `<appDataDir>/brain/<conv-id>/.system_generated/logs/transcript.jsonl`
 * across 5h, 24h, 7d, and 30d (monthly billing cycle) windows, caching parsed
 * records by `(realPath, mtimeMs, size)` so subsequent hover/tab loads return in <10ms.
 *
 * Also computes:
 * - Plan Spending Cap & Pooled `$` Quota estimates (`Standard $30`, `Plus $45`, `Enterprise $60`, `Custom`)
 * - Prompt Cache Dollar Savings
 * - Orchestrator / Subagent / Workflow / Swarm execution mix
 * - Personalized telemetry-driven optimization suggestions
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const __parseJsonNoBom = (s) =>
  JSON.parse(
    typeof s === 'string'
      ? s.replace(/^\uFEFF/, '')
      : Buffer.isBuffer(s)
        ? s.toString('utf-8').replace(/^\uFEFF/, '')
        : s
  );

const SAFE_CONV_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/;
const MAX_TX_BYTES = 250 * 1024 * 1024;
const FIVE_HOURS_MS = 5 * 3600 * 1000;
const ONE_DAY_MS = 24 * 3600 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 3600 * 1000;

export const PLAN_TIERS = {
  standard: { id: 'standard', label: 'Standard ($30/mo Pooled Quota)', capUsd: 30 },
  plus: { id: 'plus', label: 'Plus ($45/mo Pooled Quota)', capUsd: 45 },
  enterprise: { id: 'enterprise', label: 'Enterprise / Gov ($60/mo Pooled Quota)', capUsd: 60 },
  custom: { id: 'custom', label: 'Custom Monthly Cap ($)', capUsd: 50 },
};

// Blended effective per-1M-token rates (USD) for transparent local spend estimation
export const RATE_PROFILES = {
  orchestrator: {
    id: 'orchestrator',
    label: 'Orchestrator (Argon/Neon Planner + Hydrogen)',
    inPerM: 0.55,
    cachedInPerM: 0.08,
    outPerM: 2.2,
    includesPooledQuota: true,
  },
  gemini_standard: {
    id: 'gemini_standard',
    label: '1P Gemini Standard Mix (Flash + Pro)',
    inPerM: 0.9,
    cachedInPerM: 0.12,
    outPerM: 3.8,
    includesPooledQuota: true,
  },
  claude_paygo: {
    id: 'claude_paygo',
    label: '3P Anthropic Claude 5.5 (PayGo Outside Pooled Quota)',
    inPerM: 3.0,
    cachedInPerM: 0.3,
    outPerM: 15.0,
    includesPooledQuota: false,
  },
};

// Map<txPath, { mtimeMs, size, convId, preview, peakContext, subagentCalls, workflowCalls, swarmCalls, hasSubagentsDir, steps }>
const FILE_CACHE = new Map();
const SUMMARY_MEMO = new Map();

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

export function getTokenPrefsPath(stateDir = '') {
  const base =
    stateDir ||
    process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR ||
    path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'my-antigravity', 'token-telemetry');
  return path.join(path.resolve(base), 'token-prefs.json');
}

export function readTokenPrefs(stateDir = '') {
  const p = getTokenPrefsPath(stateDir);
  const defaults = {
    planTier: 'standard',
    customCapUsd: 30,
    rateProfile: 'orchestrator',
  };
  try {
    if (fs.existsSync(p) && fs.lstatSync(p).isFile()) {
      const raw = __parseJsonNoBom(fs.readFileSync(p, 'utf-8'));
      const tier = PLAN_TIERS[raw.planTier] ? raw.planTier : 'standard';
      const profile = RATE_PROFILES[raw.rateProfile] ? raw.rateProfile : 'orchestrator';
      const customCap = Math.max(5, Math.min(10000, Number(raw.customCapUsd) || 30));
      return { planTier: tier, customCapUsd: customCap, rateProfile: profile };
    }
  } catch {}
  return defaults;
}

export function writeTokenPrefs(nextPrefs = {}, stateDir = '') {
  const cur = readTokenPrefs(stateDir);
  const tier = nextPrefs.planTier && PLAN_TIERS[nextPrefs.planTier] ? nextPrefs.planTier : cur.planTier;
  const profile = nextPrefs.rateProfile && RATE_PROFILES[nextPrefs.rateProfile] ? nextPrefs.rateProfile : cur.rateProfile;
  const customCap =
    nextPrefs.customCapUsd !== undefined
      ? Math.max(5, Math.min(10000, Number(nextPrefs.customCapUsd) || 30))
      : cur.customCapUsd;
  const payload = {
    planTier: tier,
    customCapUsd: customCap,
    rateProfile: profile,
    updatedAt: new Date().toISOString(),
  };
  const p = getTokenPrefsPath(stateDir);
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, p);
  SUMMARY_MEMO.clear();
  return payload;
}

async function parseTranscriptCached(txPath, convId, st) {
  const hit = FILE_CACHE.get(txPath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit;
  }
  const real = txPath;

  const steps = [];
  let preview = '';
  let peakContext = 0;
  let subagentCalls = 0;
  let workflowCalls = 0;
  let swarmCalls = 0;

  let hasSubagentsDir = false;
  try {
    const subDir = path.join(path.dirname(path.dirname(real)), 'subagents');
    if (fs.existsSync(subDir) && fs.lstatSync(subDir).isDirectory()) {
      hasSubagentsDir = fs.readdirSync(subDir).length > 0;
    }
  } catch {}

  const stream = fs.createReadStream(real, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let obj;
    try {
      obj = __parseJsonNoBom(line);
    } catch {
      continue;
    }

    if (!preview && obj.type === 'USER_INPUT' && typeof obj.content === 'string') {
      const cleaned = obj.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleaned) preview = cleaned.slice(0, 64);
    }

    if (Array.isArray(obj.tool_calls)) {
      for (const tc of obj.tool_calls) {
        const nm = String((tc && (tc.name || tc.tool_name || (tc.function && tc.function.name))) || '');
        if (nm === 'invoke_subagent') subagentCalls += 1;
        else if (nm === 'run_workflow') workflowCalls += 1;
        else if (nm === 'swarm') swarmCalls += 1;
      }
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
    subagentCalls,
    workflowCalls,
    swarmCalls,
    hasSubagentsDir,
    steps,
  };

  if (FILE_CACHE.size > 320) {
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
    cacheHitRatio: 0,
    estUsd: 0,
    cacheSavedUsd: 0,
  };
}

function estimateCostUsd(w, rate) {
  const uncachedCost = (w.inputTokens / 1_000_000) * rate.inPerM;
  const cachedCost = (w.cacheReadTokens / 1_000_000) * rate.cachedInPerM;
  const outAndThinkTokens = w.outputTokens + Math.max(0, w.thinkingTokens - w.outputTokens);
  const outCost = (outAndThinkTokens / 1_000_000) * rate.outPerM;
  const cacheSaved = Math.max(0, (w.cacheReadTokens / 1_000_000) * (rate.inPerM - rate.cachedInPerM));
  return {
    estUsd: Number((uncachedCost + cachedCost + outCost).toFixed(2)),
    cacheSavedUsd: Number(cacheSaved.toFixed(2)),
  };
}

function finalizeWindow(w, rate) {
  w.totalTokens = w.inputTokens + w.cacheReadTokens + w.outputTokens;
  const denom = w.inputTokens + w.cacheReadTokens;
  w.cacheHitRatio = denom > 0 ? w.cacheReadTokens / denom : 0;
  w.cacheHitPct = denom > 0 ? (w.cacheHitRatio * 100).toFixed(1) + '%' : '0.0%';
  const costs = estimateCostUsd(w, rate);
  w.estUsd = costs.estUsd;
  w.cacheSavedUsd = costs.cacheSavedUsd;
  return w;
}

function buildOptimizationSuggestions({
  last5h,
  last30d,
  prefs,
  capUsd,
  capUsedPct,
  highContextConvs,
  orchestrationStats,
  activeThread,
}) {
  const suggestions = [];

  if (activeThread && activeThread.peakContextTokens >= 160000) {
    suggestions.push({
      id: 'compact-active',
      severity: 'amber',
      badge: 'High Impact · Save ~60%',
      title: `Active thread context is heavy (${Math.round(activeThread.peakContextTokens / 1000)}k tokens)`,
      detail:
        'Every follow-up turn re-sends your conversation history. Run /compact or start a fresh + New Conversation when switching topics to slash per-turn input burn.',
      actionLabel: 'Copy /compact Tip',
      prompt:
        'Summarize our current state and key decisions in 8 concise bullets so I can run /compact or continue in a fresh context window.',
    });
  } else if (highContextConvs >= 2) {
    suggestions.push({
      id: 'compact-habit',
      severity: 'amber',
      badge: `${highContextConvs} Heavy Threads`,
      title: `${highContextConvs} recent threads exceeded 160k peak context`,
      detail:
        'Long multi-topic chats compound input token burn. Use /compact at natural milestones and delegate broad file searches to stateless subagents so noisy logs stay out of your main thread.',
      actionLabel: 'Learn Context Hygiene →',
      prompt:
        '/orchestrator-guide Give me a 5-point Context & Token Hygiene checklist (when to use /compact, when to spawn a subagent, and when to start a new thread).',
    });
  }

  if (prefs.rateProfile === 'claude_paygo') {
    suggestions.push({
      id: 'claude-paygo-guardrail',
      severity: 'amber',
      badge: 'PayGo Alert',
      title: '3P Anthropic Claude bills Pay-As-You-Go outside included pooled quota',
      detail:
        '1P Gemini 4 and Orchestrator draw from your included monthly pooled $ quota. Reserve Claude Sonnet/Opus for targeted Pass-2 adversarial reviews or tricky diffs rather than Pass-1 scaffolding.',
      actionLabel: 'Run Dual-Model Routing Guide →',
      prompt:
        '/model-guide Show me how to run Pass-1 builds on Gemini 4 / Orchestrator inside my pooled quota and reserve Anthropic Claude for surgical Pass-2 review.',
    });
  } else if (prefs.rateProfile === 'gemini_standard' && last30d.turns >= 15) {
    suggestions.push({
      id: 'switch-orchestrator',
      severity: 'green',
      badge: 'Save 50–65% Quota',
      title: 'Switch multi-step builds to Orchestrator (Argon/Neon + Hydrogen)',
      detail:
        'Orchestrator plans once with a frontier Gemini 4 model (Argon or Neon) and executes iterative file reads, edits, and tests on fast Hydrogen workers—cutting quota burn by ~50–65%.',
      actionLabel: 'Try Orchestrator →',
      prompt:
        '/orchestrator-guide Show me how to select Orchestrator (Argon or Neon) in the model picker and structure prompts so Hydrogen workers handle the heavy lifting.',
    });
  }

  if (orchestrationStats.workflowCalls === 0 && last30d.turns >= 10) {
    suggestions.push({
      id: 'use-workflows',
      severity: 'blue',
      badge: 'Zero Thinking Waste',
      title: 'Offload batch checks & repetitive transforms to Deterministic Workflows',
      detail:
        'Instead of asking an LLM to manually inspect 20 files turn-by-turn, use deterministic Python/Node scripts or run_workflow pipelines to fan out structured tasks and aggregate results cleanly.',
      actionLabel: 'Design a Workflow →',
      prompt:
        'Help me identify 2 repetitive multi-step tasks in my role that we should convert into a deterministic workflow or reusable skill script to save tokens and time.',
    });
  }

  if (capUsedPct >= 80) {
    suggestions.push({
      id: 'cap-headroom',
      severity: 'red',
      badge: `${Math.round(capUsedPct)}% of $${capUsd} Cap`,
      title: 'Approaching your monthly pooled quota threshold',
      detail:
        'Prioritize Gemini Flash / Orchestrator Hydrogen for routine drafting and triage, keep SKILL.md rules stable to preserve your prompt-cache hit rate, and avoid quota-heavy /swarm unless needed.',
      actionLabel: 'Audit My Top Threads →',
      prompt:
        '/token-usage Analyze my highest-burn conversations this week and give me 3 immediate steps to stretch my remaining monthly quota.',
    });
  } else if (last30d.cacheHitRatio >= 0.7 && last30d.cacheSavedUsd > 0) {
    suggestions.push({
      id: 'cache-win',
      severity: 'green',
      badge: `Saved ~$${last30d.cacheSavedUsd.toFixed(2)}`,
      title: `Strong ${last30d.cacheHitPct} prompt-cache hit rate`,
      detail:
        'Your cached context reads saved an estimated $' +
        last30d.cacheSavedUsd.toFixed(2) +
        ' over the last 30 days. Avoid editing standing rules mid-conversation so Antigravity reuses cached prefixes.',
      actionLabel: 'View Full Report →',
      prompt:
        '/token-usage Retrieve my exact Antigravity token consumption across 5-hour, 24-hour, and 7-day windows and render the interactive Token Consumption report.',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: 'healthy-baseline',
      severity: 'green',
      badge: 'Quota Healthy',
      title: 'Your token velocity and context sizes look healthy',
      detail:
        'Keep pairing Orchestrator (Argon/Neon + Hydrogen) for multi-step builds, 1-Click Skills for repeatable workflows, and /compact whenever a thread passes ~150k tokens.',
      actionLabel: 'Explore Orchestrator →',
      prompt:
        '/orchestrator-guide Show me 3 pro patterns for combining Orchestrator, Personal Skills, and Workflows.',
    });
  }

  return suggestions.slice(0, 4);
}

export async function getTokenMeterSummary(rawConvId = '', stateDir = '') {
  const activeConvId = SAFE_CONV_RE.test(String(rawConvId || '').trim()) ? String(rawConvId).trim() : '';
  const nowMs = Date.now();
  const memoKey = `${activeConvId}|${stateDir || ''}`;
  const memoHit = SUMMARY_MEMO.get(memoKey);
  if (memoHit && nowMs - memoHit.atMs < 2500) {
    return memoHit.data;
  }
  const roots = getBrainRoots();
  const prefs = readTokenPrefs(stateDir);
  const tierDef = PLAN_TIERS[prefs.planTier] || PLAN_TIERS.standard;
  const rate = RATE_PROFILES[prefs.rateProfile] || RATE_PROFILES.orchestrator;
  const capUsd = prefs.planTier === 'custom' ? prefs.customCapUsd : tierDef.capUsd;

  const last5h = emptyWindow();
  const last24h = emptyWindow();
  const last7d = emptyWindow();
  const last30d = emptyWindow();

  // 14-day daily bucket map YYYY-MM-DD -> window
  const dailyMap = new Map();
  for (let i = 13; i >= 0; i -= 1) {
    const dIso = new Date(nowMs - i * ONE_DAY_MS).toISOString().slice(0, 10);
    dailyMap.set(dIso, emptyWindow());
  }

  let activeConversation = null;
  let newestConversation = null;
  const recentConvs = [];
  let highContextConvs = 0;
  const orchestrationStats = {
    totalConversations30d: 0,
    delegatedSubagentThreads: 0,
    subagentCalls: 0,
    workflowCalls: 0,
    swarmCalls: 0,
  };

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
      if (!isTargetActive && nowMs - st.mtimeMs > THIRTY_DAYS_MS) continue;

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
        if (age <= THIRTY_DAYS_MS) {
          last30d.turns += turns;
          last30d.inputTokens += inp;
          last30d.cacheReadTokens += cacheRead;
          last30d.outputTokens += out;
          last30d.thinkingTokens += think;

          const dayKey = new Date(stepMs).toISOString().slice(0, 10);
          const dayBucket = dailyMap.get(dayKey);
          if (dayBucket) {
            dayBucket.turns += turns;
            dayBucket.inputTokens += inp;
            dayBucket.cacheReadTokens += cacheRead;
            dayBucket.outputTokens += out;
            dayBucket.thinkingTokens += think;
          }

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
      }

      finalizeWindow(convTotals, rate);
      if (convTotals.turns === 0) continue;

      orchestrationStats.totalConversations30d += 1;
      if (parsed.hasSubagentsDir || parsed.subagentCalls > 0) {
        orchestrationStats.delegatedSubagentThreads += 1;
      }
      orchestrationStats.subagentCalls += parsed.subagentCalls;
      orchestrationStats.workflowCalls += parsed.workflowCalls;
      orchestrationStats.swarmCalls += parsed.swarmCalls;
      if (parsed.peakContext >= 160000) {
        highContextConvs += 1;
      }

      const convRecord = {
        convId: cid,
        preview: parsed.preview || 'Conversation ' + cid.slice(0, 8),
        mtimeMs: st.mtimeMs,
        peakContextTokens: parsed.peakContext,
        subagentCalls: parsed.subagentCalls,
        workflowCalls: parsed.workflowCalls,
        swarmCalls: parsed.swarmCalls,
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

  finalizeWindow(last5h, rate);
  finalizeWindow(last24h, rate);
  finalizeWindow(last7d, rate);
  finalizeWindow(last30d, rate);

  const dailySeries = [];
  for (const [date, bucket] of dailyMap.entries()) {
    finalizeWindow(bucket, rate);
    dailySeries.push({
      date,
      label: date.slice(5),
      turns: bucket.turns,
      totalTokens: bucket.totalTokens,
      estUsd: bucket.estUsd,
    });
  }

  recentConvs.sort((a, b) => b.estUsd - a.estUsd || b.totalTokens - a.totalTokens);

  const estSpend30dUsd = last30d.estUsd;
  const capUsedPct = capUsd > 0 ? Math.min(999, Number(((estSpend30dUsd / capUsd) * 100).toFixed(1))) : 0;
  const remainingUsd = Number(Math.max(0, capUsd - estSpend30dUsd).toFixed(2));
  const avgDaily7dUsd = last7d.estUsd / 7;
  const projected30dUsd = Number(Math.max(estSpend30dUsd, avgDaily7dUsd * 30).toFixed(2));

  const focusThread = activeConversation || newestConversation;
  const suggestions = buildOptimizationSuggestions({
    last5h,
    last30d,
    prefs,
    capUsd,
    capUsedPct,
    highContextConvs,
    orchestrationStats,
    activeThread: focusThread,
  });

  const resultObj = {
    ok: true,
    generatedAt: new Date(nowMs).toISOString(),
    prefs,
    planTiers: Object.values(PLAN_TIERS),
    rateProfiles: Object.values(RATE_PROFILES),
    spendingCap: {
      planTier: prefs.planTier,
      planLabel: tierDef.label,
      rateProfile: prefs.rateProfile,
      rateLabel: rate.label,
      includesPooledQuota: rate.includesPooledQuota,
      capUsd,
      estSpend30dUsd,
      remainingUsd,
      capUsedPct,
      projected30dUsd,
      cacheSaved30dUsd: last30d.cacheSavedUsd,
      status: capUsedPct >= 90 ? 'red' : capUsedPct >= 70 ? 'amber' : 'green',
    },
    orchestrationStats: {
      ...orchestrationStats,
      highContextConvs,
    },
    activeConversation,
    newestConversation,
    windows: {
      last5h,
      last24h,
      last7d,
      last30d,
    },
    dailySeries,
    suggestions,
    topRecentConversations: recentConvs.slice(0, 6),
  };
  SUMMARY_MEMO.set(memoKey, { atMs: nowMs, data: resultObj });
  return resultObj;
}
