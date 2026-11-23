/**
 * AGY Coordinator — Core State, LS Discovery, AgentAPI Relay, Persona & Voice Engine
 *
 * Zero external npm dependencies. Uses only Node built-ins (`node:*`).
 * Persistent state lives strictly under `~/.gemini/config/plugin_data/agy-coordinator/`
 * (or `AGY_COORDINATOR_DATA_DIR` when explicitly overridden). Zero `/tmp` writes.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,120}$/;
export const DEFAULT_VOICE_MODEL = 'gemini-3.8-live';

const DEFAULT_IDENTITY_MD = `# Coordinator Identity

- **Name:** Clawy
- **Role:** Multi-Agent Coordinator
- **Style:** Crisp, encouraging, action-oriented, zero fluff
- **Focus:** Keep parallel agent workers aligned to Groups, Goals, and Tasks
`;

const DEFAULT_SOUL_MD = `# Coordinator Operating Principles (SOUL)

1. Always organize work strictly in 2 levels: **Group -> Goal -> Task**.
2. Keep worker prompts concrete: state what the worker owns, constraints, and what "done" looks like.
3. Never invent statuses or tool results; verify live worker state before relaying.
4. Keep spoken responses concise (1-3 sentences) so voice updates are easy to scan between tasks.
`;

export function getDataDir() {
  const override = process.env.AGY_COORDINATOR_DATA_DIR;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'agy-coordinator');
}

export function ensureDataDir() {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best-effort on platforms that ignore POSIX chmod.
  }
  return dir;
}

function atomicWriteText(filePath, content, mode = 0o600) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stagePath = path.join(
    dir,
    `.stage-${path.basename(filePath)}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`
  );
  fs.writeFileSync(stagePath, content, { encoding: 'utf-8', mode });
  try {
    fs.chmodSync(stagePath, mode);
  } catch {
    // Ignore on Windows.
  }
  fs.renameSync(stagePath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
}

function defaultState() {
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    groups: [
      {
        id: 'group-default',
        title: 'General',
        color: 'blue',
        createdAt: now,
      },
    ],
    goals: [],
    tasks: [],
    workers: {},
    board: [],
    chatLog: [],
  };
}

export function ensureInitialized() {
  const dir = ensureDataDir();
  const statePath = path.join(dir, 'state.json');
  const idPath = path.join(dir, 'IDENTITY.md');
  const soulPath = path.join(dir, 'SOUL.md');
  const voicePath = path.join(dir, 'voice_prefs.json');

  if (!fs.existsSync(statePath)) {
    atomicWriteText(statePath, JSON.stringify(defaultState(), null, 2) + '\n', 0o600);
  }
  if (!fs.existsSync(idPath)) {
    atomicWriteText(idPath, DEFAULT_IDENTITY_MD, 0o600);
  }
  if (!fs.existsSync(soulPath)) {
    atomicWriteText(soulPath, DEFAULT_SOUL_MD, 0o600);
  }
  if (!fs.existsSync(voicePath)) {
    atomicWriteText(
      voicePath,
      JSON.stringify(
        {
          mode: 'browser',
          model: DEFAULT_VOICE_MODEL,
          apiKey: '',
          useGcloudAdc: false,
          ttsEnabled: true,
          voiceRate: 1.0,
          voicePitch: 1.05,
          updatedAt: new Date().toISOString(),
        },
        null,
        2
      ) + '\n',
      0o600
    );
  }
  return dir;
}

export function loadState() {
  const dir = ensureInitialized();
  const statePath = path.join(dir, 'state.json');
  const base = defaultState();
  const raw = readJsonSafe(statePath, base);
  const groups = Array.isArray(raw.groups) && raw.groups.length > 0 ? raw.groups : base.groups;
  return {
    version: 1,
    updatedAt: raw.updatedAt || base.updatedAt,
    groups,
    goals: Array.isArray(raw.goals) ? raw.goals : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    workers: raw.workers && typeof raw.workers === 'object' && !Array.isArray(raw.workers) ? raw.workers : {},
    board: Array.isArray(raw.board) ? raw.board : [],
    chatLog: Array.isArray(raw.chatLog) ? raw.chatLog : [],
  };
}

export function saveState(nextState) {
  const dir = ensureInitialized();
  const statePath = path.join(dir, 'state.json');
  const normalized = {
    version: 1,
    updatedAt: new Date().toISOString(),
    groups: Array.isArray(nextState.groups) && nextState.groups.length > 0 ? nextState.groups : defaultState().groups,
    goals: Array.isArray(nextState.goals) ? nextState.goals : [],
    tasks: Array.isArray(nextState.tasks) ? nextState.tasks : [],
    workers: nextState.workers && typeof nextState.workers === 'object' ? nextState.workers : {},
    board: Array.isArray(nextState.board) ? nextState.board.slice(-120) : [],
    chatLog: Array.isArray(nextState.chatLog) ? nextState.chatLog.slice(-100) : [],
  };
  atomicWriteText(statePath, JSON.stringify(normalized, null, 2) + '\n', 0o600);
  return normalized;
}

export function parseAssistantName(identityMd) {
  const match = String(identityMd || '').match(/\*\*Name:\*\*\s*([^\r\n]+)/i);
  if (match && match[1]) {
    const cleaned = match[1].trim();
    if (cleaned) return cleaned.slice(0, 48);
  }
  return 'Clawy';
}

export function parseAssistantRole(identityMd) {
  const match = String(identityMd || '').match(/\*\*Role:\*\*\s*([^\r\n]+)/i);
  if (match && match[1]) {
    const cleaned = match[1].trim();
    if (cleaned) return cleaned.slice(0, 80);
  }
  return 'Multi-Agent Coordinator';
}

export function loadIdentity() {
  const dir = ensureInitialized();
  const identityMd = fs.readFileSync(path.join(dir, 'IDENTITY.md'), 'utf-8');
  const soulMd = fs.readFileSync(path.join(dir, 'SOUL.md'), 'utf-8');
  return {
    name: parseAssistantName(identityMd),
    role: parseAssistantRole(identityMd),
    identityMd,
    soulMd,
  };
}

export function saveIdentity({ name, role, identityMd, soulMd }) {
  const dir = ensureInitialized();
  let nextIdentity = typeof identityMd === 'string' ? identityMd : fs.readFileSync(path.join(dir, 'IDENTITY.md'), 'utf-8');
  if (typeof name === 'string' && name.trim()) {
    const safeName = name.trim().replace(/[\r\n]/g, ' ').slice(0, 48);
    if (/\*\*Name:\*\*/i.test(nextIdentity)) {
      nextIdentity = nextIdentity.replace(/(\*\*Name:\*\*\s*)([^\r\n]+)/i, `$1${safeName}`);
    } else {
      nextIdentity = `# Coordinator Identity\n\n- **Name:** ${safeName}\n` + nextIdentity;
    }
  }
  if (typeof role === 'string' && role.trim()) {
    const safeRole = role.trim().replace(/[\r\n]/g, ' ').slice(0, 80);
    if (/\*\*Role:\*\*/i.test(nextIdentity)) {
      nextIdentity = nextIdentity.replace(/(\*\*Role:\*\*\s*)([^\r\n]+)/i, `$1${safeRole}`);
    } else {
      nextIdentity = nextIdentity + `\n- **Role:** ${safeRole}\n`;
    }
  }
  atomicWriteText(path.join(dir, 'IDENTITY.md'), nextIdentity.trimEnd() + '\n', 0o600);
  if (typeof soulMd === 'string') {
    atomicWriteText(path.join(dir, 'SOUL.md'), soulMd.trimEnd() + '\n', 0o600);
  }
  return loadIdentity();
}

export function loadVoicePrefsRaw() {
  const dir = ensureInitialized();
  const voicePath = path.join(dir, 'voice_prefs.json');
  const raw = readJsonSafe(voicePath, {});
  return {
    mode: raw.mode === 'gemini-live' ? 'gemini-live' : 'browser',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_VOICE_MODEL,
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    useGcloudAdc: Boolean(raw.useGcloudAdc),
    ttsEnabled: raw.ttsEnabled !== false,
    voiceRate: Number.isFinite(Number(raw.voiceRate)) ? Math.min(1.6, Math.max(0.6, Number(raw.voiceRate))) : 1.0,
    voicePitch: Number.isFinite(Number(raw.voicePitch)) ? Math.min(1.5, Math.max(0.7, Number(raw.voicePitch))) : 1.05,
    updatedAt: raw.updatedAt || null,
  };
}

export function saveVoicePrefs(patch) {
  const dir = ensureInitialized();
  const cur = loadVoicePrefsRaw();
  const next = {
    mode: patch.mode === 'gemini-live' ? 'gemini-live' : patch.mode === 'browser' ? 'browser' : cur.mode,
    model: typeof patch.model === 'string' && patch.model.trim() ? patch.model.trim().slice(0, 80) : cur.model,
    apiKey: typeof patch.apiKey === 'string' ? patch.apiKey.trim() : cur.apiKey,
    useGcloudAdc: typeof patch.useGcloudAdc === 'boolean' ? patch.useGcloudAdc : cur.useGcloudAdc,
    ttsEnabled: typeof patch.ttsEnabled === 'boolean' ? patch.ttsEnabled : cur.ttsEnabled,
    voiceRate: patch.voiceRate !== undefined ? Math.min(1.6, Math.max(0.6, Number(patch.voiceRate) || 1.0)) : cur.voiceRate,
    voicePitch: patch.voicePitch !== undefined ? Math.min(1.5, Math.max(0.7, Number(patch.voicePitch) || 1.05)) : cur.voicePitch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.clearApiKey === true) {
    next.apiKey = '';
  }
  atomicWriteText(path.join(dir, 'voice_prefs.json'), JSON.stringify(next, null, 2) + '\n', 0o600);
  return getPublicVoiceStatus();
}

export function getPublicVoiceStatus() {
  const prefs = loadVoicePrefsRaw();
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const effectiveKey = envKey || prefs.apiKey || '';
  const keySource = envKey ? 'env' : prefs.apiKey ? 'prefs' : prefs.useGcloudAdc ? 'gcloud-adc' : 'none';
  return {
    mode: prefs.mode,
    model: prefs.model,
    hasApiKey: Boolean(effectiveKey),
    keySource,
    useGcloudAdc: prefs.useGcloudAdc,
    ttsEnabled: prefs.ttsEnabled,
    voiceRate: prefs.voiceRate,
    voicePitch: prefs.voicePitch,
    readyForGeminiLive: Boolean(effectiveKey || prefs.useGcloudAdc),
    prefsPath: path.join(getDataDir(), 'voice_prefs.json'),
  };
}

export async function listLsConversations({ includeArchived = false } = {}) {
  const lsAddr = (process.env.ANTIGRAVITY_LS_ADDRESS || '').trim();
  const csrfToken = (process.env.ANTIGRAVITY_CSRF_TOKEN || '').trim();
  if (!lsAddr || !csrfToken) {
    return {
      ok: false,
      available: false,
      reason: 'ANTIGRAVITY_LS_ADDRESS or ANTIGRAVITY_CSRF_TOKEN is not set in the current environment.',
      conversations: [],
    };
  }

  const baseUrl = /^https?:\/\//i.test(lsAddr) ? lsAddr : `http://${lsAddr}`;
  const url = `${baseUrl.replace(/\/$/, '')}/jetski.product.v1.ConversationService/ListConversations`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'x-codeium-csrf-token': csrfToken,
      },
      body: JSON.stringify({ pageSize: 50 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!resp.ok) {
      return {
        ok: false,
        available: true,
        reason: `Language Server returned HTTP ${resp.status}`,
        conversations: [],
      };
    }
    const data = await resp.json();
    const rawList = Array.isArray(data?.conversations) ? data.conversations : [];
    const conversations = rawList
      .map((c) => {
        const id = String(c?.id || c?.conversationId || '').trim();
        if (!id) return null;
        const annotations = c?.annotations && typeof c.annotations === 'object' ? c.annotations : {};
        const metadata = c?.metadata && typeof c.metadata === 'object' ? c.metadata : {};
        const state = c?.state && typeof c.state === 'object' ? c.state : {};
        const archived = Boolean(annotations.archived);
        if (!includeArchived && archived) return null;
        return {
          id,
          title: String(annotations.title || `Conversation ${id.slice(0, 8)}`).trim(),
          summary: String(state.summary || '').trim(),
          runState: String(state.runState || 'RUN_STATE_UNSPECIFIED'),
          createTime: metadata.createTime || null,
          updateTime: state.updateTime || metadata.createTime || null,
          projectId: metadata.projectId || '',
          archived,
        };
      })
      .filter(Boolean);
    return {
      ok: true,
      available: true,
      reason: '',
      conversations,
    };
  } catch (err) {
    return {
      ok: false,
      available: false,
      reason: err instanceof Error ? err.message : String(err),
      conversations: [],
    };
  }
}

export async function getMergedWorkers({ includeArchived = false } = {}) {
  const state = loadState();
  const ls = await listLsConversations({ includeArchived });
  const workerMeta = state.workers || {};
  const byId = new Map();

  for (const conv of ls.conversations) {
    const meta = workerMeta[conv.id] || {};
    const runState = conv.runState || '';
    const derivedStatus =
      meta.customStatus ||
      (runState.includes('RUNNING')
        ? 'WORKING'
        : runState.includes('WAITING')
          ? 'NEEDS_YOU'
          : runState.includes('IDLE') || runState.includes('DONE')
            ? 'IDLE'
            : 'ACTIVE');
    byId.set(conv.id, {
      ...conv,
      groupId: meta.groupId || 'group-default',
      pinned: Boolean(meta.pinned),
      labels: Array.isArray(meta.labels) ? meta.labels : [],
      customStatus: meta.customStatus || '',
      status: derivedStatus,
      note: meta.note || '',
      source: 'live-ls',
    });
  }

  for (const [id, meta] of Object.entries(workerMeta)) {
    if (byId.has(id) || meta?.removed) continue;
    byId.set(id, {
      id,
      title: meta.title || `Worker ${id.slice(0, 8)}`,
      summary: meta.note || '',
      runState: 'RUN_STATE_UNSPECIFIED',
      createTime: meta.updatedAt || null,
      updateTime: meta.updatedAt || null,
      projectId: '',
      archived: false,
      groupId: meta.groupId || 'group-default',
      pinned: Boolean(meta.pinned),
      labels: Array.isArray(meta.labels) ? meta.labels : [],
      customStatus: meta.customStatus || '',
      status: meta.customStatus || (ls.available ? 'OFFLINE' : 'TRACKED'),
      note: meta.note || '',
      source: 'local-meta',
    });
  }

  const workers = Array.from(byId.values()).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const ta = Date.parse(a.updateTime || '') || 0;
    const tb = Date.parse(b.updateTime || '') || 0;
    return tb - ta;
  });

  return {
    lsStatus: {
      ok: ls.ok,
      available: ls.available,
      reason: ls.reason,
    },
    workers,
  };
}

export function resolveAgentApiBin() {
  const envBin = (process.env.AGY_AGENTAPI_BIN || '').trim();
  if (envBin && fs.existsSync(envBin)) return envBin;
  const home = os.homedir();
  const candidates = [
    path.join(home, '.gemini', 'jetski', 'bin', 'agentapi'),
    path.join(home, '.gemini', 'antigravity', 'bin', 'agentapi'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      // Ignore missing paths.
    }
  }
  return 'agentapi';
}

export async function runAgentApi(args) {
  const exe = (process.env.ANTIGRAVITY_AGENTAPI_EXE || '').trim();
  const bin = exe || resolveAgentApiBin();
  const finalArgs = exe ? ['agentapi', ...args] : args;
  const cleanEnv = { ...process.env };
  delete cleanEnv.ANTIGRAVITY_SOURCE_METADATA;

  const cmd = process.platform === 'win32' ? bin : 'env';
  const cmdArgs =
    process.platform === 'win32' ? finalArgs : ['-u', 'ANTIGRAVITY_SOURCE_METADATA', bin, ...finalArgs];

  const { stdout, stderr } = await execFileAsync(cmd, cmdArgs, {
    env: cleanEnv,
    timeout: 20000,
    maxBuffer: 1024 * 1024,
  });
  return {
    stdout: String(stdout || '').trim(),
    stderr: String(stderr || '').trim(),
  };
}

function appendBoardEntry(state, { author, kind, summary }) {
  const entry = {
    id: makeId('brd'),
    author: String(author || 'coordinator').slice(0, 60),
    kind: ['progress', 'relay', 'spawn', 'blocker', 'ready'].includes(kind) ? kind : 'progress',
    summary: String(summary || '').trim().slice(0, 500),
    createdAt: new Date().toISOString(),
  };
  if (!entry.summary) return state;
  state.board = [...(state.board || []), entry].slice(-120);
  return state;
}

export async function spawnWorker({ prompt, title = '', model = '', groupId = 'group-default' }) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) {
    throw new Error('Prompt is required to spawn a worker.');
  }
  const args = ['new-conversation'];
  if (title && String(title).trim()) {
    args.push(`--title=${String(title).trim().slice(0, 120)}`);
  }
  if (model && String(model).trim()) {
    args.push(`--model=${String(model).trim().slice(0, 60)}`);
  }
  args.push(cleanPrompt);

  const res = await runAgentApi(args);
  const idMatch = res.stdout.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  const convId = idMatch ? idMatch[0] : '';

  const state = loadState();
  if (convId) {
    state.workers[convId] = {
      ...(state.workers[convId] || {}),
      title: String(title || '').trim() || cleanPrompt.slice(0, 64),
      groupId: groupId || 'group-default',
      pinned: false,
      labels: state.workers[convId]?.labels || [],
      customStatus: 'WORKING',
      updatedAt: new Date().toISOString(),
    };
  }
  appendBoardEntry(state, {
    author: 'Coordinator',
    kind: 'spawn',
    summary: `Spawned worker${convId ? ` (${convId.slice(0, 8)})` : ''}: ${title || cleanPrompt.slice(0, 80)}`,
  });
  saveState(state);

  return {
    ok: true,
    conversationId: convId,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

export async function relayToWorker({ convId, message, title = '' }) {
  const cleanId = String(convId || '').trim();
  const cleanMsg = String(message || '').trim();
  if (!SAFE_ID_RE.test(cleanId)) {
    throw new Error('Invalid worker conversation ID.');
  }
  if (!cleanMsg) {
    throw new Error('Relay message cannot be empty.');
  }
  const args = ['send-message'];
  if (title && String(title).trim()) {
    args.push(`--title=${String(title).trim().slice(0, 120)}`);
  }
  args.push(cleanId, cleanMsg);

  const res = await runAgentApi(args);
  const state = loadState();
  appendBoardEntry(state, {
    author: 'Coordinator',
    kind: 'relay',
    summary: `Relayed to ${cleanId.slice(0, 8)}: ${cleanMsg.slice(0, 120)}`,
  });
  saveState(state);

  return {
    ok: true,
    conversationId: cleanId,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

export function updateWorkerMeta({ convId, groupId, pinned, addLabel, removeLabel, customStatus, note, remove }) {
  const cleanId = String(convId || '').trim();
  if (!SAFE_ID_RE.test(cleanId)) {
    throw new Error('Invalid worker conversation ID.');
  }
  const state = loadState();
  const cur = state.workers[cleanId] || { groupId: 'group-default', pinned: false, labels: [] };
  if (remove === true) {
    cur.removed = true;
  } else {
    cur.removed = false;
  }
  if (typeof groupId === 'string' && groupId.trim()) cur.groupId = groupId.trim();
  if (typeof pinned === 'boolean') cur.pinned = pinned;
  if (typeof customStatus === 'string') cur.customStatus = customStatus.trim().slice(0, 32);
  if (typeof note === 'string') cur.note = note.trim().slice(0, 280);
  const labelSet = new Set(Array.isArray(cur.labels) ? cur.labels : []);
  if (typeof addLabel === 'string' && addLabel.trim()) {
    for (const part of addLabel.split(',')) {
      const clean = part.trim().replace(/^#/, '').slice(0, 32);
      if (clean) labelSet.add(clean);
    }
  }
  if (typeof removeLabel === 'string' && removeLabel.trim()) {
    labelSet.delete(removeLabel.trim().replace(/^#/, ''));
  }
  cur.labels = Array.from(labelSet);
  cur.updatedAt = new Date().toISOString();
  state.workers[cleanId] = cur;
  saveState(state);
  return cur;
}

export function mutateGroups({ action, id, title, color }) {
  const state = loadState();
  if (action === 'add') {
    const cleanTitle = String(title || '').trim().slice(0, 80);
    if (!cleanTitle) throw new Error('Group title is required.');
    const group = {
      id: makeId('grp'),
      title: cleanTitle,
      color: String(color || 'blue').slice(0, 24),
      createdAt: new Date().toISOString(),
    };
    state.groups.push(group);
    saveState(state);
    return { group, state };
  }
  if (action === 'rename') {
    const cleanTitle = String(title || '').trim().slice(0, 80);
    const target = state.groups.find((g) => g.id === id);
    if (!target) throw new Error('Group not found.');
    if (cleanTitle) target.title = cleanTitle;
    if (color) target.color = String(color).slice(0, 24);
    saveState(state);
    return { group: target, state };
  }
  if (action === 'remove') {
    if (id === 'group-default') throw new Error('Cannot remove the default General group.');
    state.groups = state.groups.filter((g) => g.id !== id);
    for (const goal of state.goals) {
      if (goal.groupId === id) goal.groupId = 'group-default';
    }
    for (const meta of Object.values(state.workers)) {
      if (meta && meta.groupId === id) meta.groupId = 'group-default';
    }
    saveState(state);
    return { removedId: id, state };
  }
  throw new Error(`Unsupported group action: ${action}`);
}

export function mutateGoals({ action, id, groupId, title, status, note }) {
  const state = loadState();
  const now = new Date().toISOString();
  if (action === 'add') {
    const cleanTitle = String(title || '').trim().slice(0, 140);
    if (!cleanTitle) throw new Error('Goal title is required.');
    const targetGroup = state.groups.some((g) => g.id === groupId) ? groupId : 'group-default';
    const goal = {
      id: makeId('goal'),
      groupId: targetGroup,
      title: cleanTitle,
      status: ['active', 'blocked', 'done'].includes(status) ? status : 'active',
      note: String(note || '').trim().slice(0, 400),
      createdAt: now,
      updatedAt: now,
    };
    state.goals.push(goal);
    appendBoardEntry(state, {
      author: 'Coordinator',
      kind: 'progress',
      summary: `Added goal: ${cleanTitle}`,
    });
    saveState(state);
    return { goal, state };
  }
  if (action === 'update') {
    const target = state.goals.find((g) => g.id === id);
    if (!target) throw new Error('Goal not found.');
    if (typeof title === 'string' && title.trim()) target.title = title.trim().slice(0, 140);
    if (typeof groupId === 'string' && state.groups.some((g) => g.id === groupId)) target.groupId = groupId;
    if (['active', 'blocked', 'done'].includes(status)) target.status = status;
    if (typeof note === 'string') target.note = note.trim().slice(0, 400);
    target.updatedAt = now;
    saveState(state);
    return { goal: target, state };
  }
  if (action === 'remove') {
    state.goals = state.goals.filter((g) => g.id !== id);
    state.tasks = state.tasks.filter((t) => t.goalId !== id);
    saveState(state);
    return { removedId: id, state };
  }
  throw new Error(`Unsupported goal action: ${action}`);
}

export function mutateTasks({ action, id, goalId, title, done }) {
  const state = loadState();
  const now = new Date().toISOString();
  if (action === 'add') {
    const cleanTitle = String(title || '').trim().slice(0, 160);
    if (!cleanTitle) throw new Error('Task title is required.');
    const parentGoal = state.goals.find((g) => g.id === goalId);
    if (!parentGoal) throw new Error('Valid goalId is required (strict 2-level Group -> Goal -> Task hierarchy).');
    const task = {
      id: makeId('task'),
      goalId: parentGoal.id,
      title: cleanTitle,
      done: Boolean(done),
      createdAt: now,
      updatedAt: now,
    };
    state.tasks.push(task);
    saveState(state);
    return { task, state };
  }
  if (action === 'toggle' || action === 'update') {
    const target = state.tasks.find((t) => t.id === id);
    if (!target) throw new Error('Task not found.');
    if (action === 'toggle') {
      target.done = !target.done;
    } else {
      if (typeof done === 'boolean') target.done = done;
      if (typeof title === 'string' && title.trim()) target.title = title.trim().slice(0, 160);
    }
    target.updatedAt = now;
    saveState(state);
    return { task: target, state };
  }
  if (action === 'remove') {
    state.tasks = state.tasks.filter((t) => t.id !== id);
    saveState(state);
    return { removedId: id, state };
  }
  throw new Error(`Unsupported task action: ${action}`);
}

export function postBoardItem({ author = 'Coordinator', kind = 'progress', summary }) {
  const state = loadState();
  const cleanSummary = String(summary || '').trim();
  if (!cleanSummary) throw new Error('Board summary cannot be empty.');
  appendBoardEntry(state, { author, kind, summary: cleanSummary });
  saveState(state);
  return state.board[state.board.length - 1];
}

export function appendChatTurn({ role, text, source = 'text', action = null }) {
  const state = loadState();
  const entry = {
    id: makeId('msg'),
    role: role === 'assistant' ? 'assistant' : 'user',
    text: String(text || '').trim().slice(0, 2000),
    source,
    action: action || undefined,
    createdAt: new Date().toISOString(),
  };
  state.chatLog = [...(state.chatLog || []), entry].slice(-100);
  saveState(state);
  return entry;
}

async function resolveGeminiAuth(prefs) {
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const apiKey = envKey || prefs.apiKey || '';
  if (apiKey) {
    return { type: 'apiKey', token: apiKey };
  }
  if (prefs.useGcloudAdc) {
    try {
      const { stdout } = await execFileAsync('gcloud', ['auth', 'print-access-token'], {
        timeout: 5000,
      });
      const tok = String(stdout || '').trim();
      if (tok) return { type: 'bearer', token: tok };
    } catch {
      return null;
    }
  }
  return null;
}

function buildCoordinatorSystemContext({ identity, state, workers }) {
  const activeGoals = state.goals.filter((g) => g.status !== 'done');
  const openTasks = state.tasks.filter((t) => !t.done);
  const workerLines = (workers || []).slice(0, 8).map((w) => `- [${w.status}] ${w.title} (id: ${w.id.slice(0, 8)})`);
  const goalLines = activeGoals.slice(0, 8).map((g) => `- [${g.status}] ${g.title} (id: ${g.id})`);
  return [
    identity.identityMd.trim(),
    identity.soulMd.trim(),
    `Current Coordinator Snapshot (${new Date().toISOString()}):`,
    `- Groups: ${state.groups.length}, Active Goals: ${activeGoals.length}, Open Tasks: ${openTasks.length}, Tracked Workers: ${(workers || []).length}`,
    workerLines.length ? `Workers:\n${workerLines.join('\n')}` : 'Workers: none active yet.',
    goalLines.length ? `Goals:\n${goalLines.join('\n')}` : 'Goals: none created yet.',
    'Respond in 1-3 crisp sentences suitable for voice playback.',
  ].join('\n\n');
}

function buildLocalCoordinatorReply(prompt, { identity, state, workers }) {
  const lower = String(prompt || '').toLowerCase();
  const name = identity.name || 'Clawy';
  const activeGoals = state.goals.filter((g) => g.status !== 'done');
  const openTasks = state.tasks.filter((t) => !t.done);
  const runningWorkers = (workers || []).filter((w) => w.status === 'WORKING');

  if (/\b(status|summary|overview|what('?s| is) happening|workers?)\b/.test(lower)) {
    return (
      `${name} reporting: you have ${(workers || []).length} worker conversation(s) ` +
      `(${runningWorkers.length} working), ${state.groups.length} group(s), ` +
      `${activeGoals.length} active goal(s), and ${openTasks.length} open task(s).`
    );
  }
  if (/\b(goal|goals|task|tasks)\b/.test(lower)) {
    if (activeGoals.length === 0) {
      return `${name} here: no active goals yet. Open the Goals tab or tell me a goal title to create one under a Group.`;
    }
    const top = activeGoals[0];
    const topOpen = openTasks.filter((t) => t.goalId === top.id).length;
    return `${name} tracking ${activeGoals.length} active goal(s). Top focus: "${top.title}" with ${topOpen} open task(s).`;
  }
  return (
    `${name} received: "${String(prompt || '').trim().slice(0, 120)}". ` +
    `Currently tracking ${(workers || []).length} worker(s) and ${activeGoals.length} active goal(s). ` +
    `Use "relay <id>: <msg>" or "spawn: <prompt>" to dispatch directly.`
  );
}

async function runGeminiLiveBidi({ auth, model, systemPrompt, userPrompt }) {
  if (typeof WebSocket !== 'function') {
    throw new Error('WebSocket not available in this Node runtime');
  }
  const wsUrl =
    auth.type === 'apiKey'
      ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(auth.token)}`
      : 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  const wsOpts = auth.type === 'bearer' ? { headers: { Authorization: `Bearer ${auth.token}` } } : undefined;
  const fullModel = model.startsWith('models/') ? model : `models/${model}`;

  return await new Promise((resolve, reject) => {
    let settled = false;
    let textOut = '';
    const ws = wsOpts ? new WebSocket(wsUrl, wsOpts) : new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {}
        if (textOut.trim()) {
          resolve(textOut.trim());
        } else {
          reject(new Error('Gemini Live WebSocket timed out'));
        }
      }
    }, 9000);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: fullModel,
            generationConfig: {
              responseModalities: ['TEXT'],
            },
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
          },
        })
      );
    });

    ws.addEventListener('message', async (ev) => {
      try {
        const rawText =
          typeof ev.data === 'string'
            ? ev.data
            : ev.data instanceof Blob
              ? await ev.data.text()
              : Buffer.from(ev.data).toString('utf-8');
        const msg = JSON.parse(rawText);
        if (msg.setupComplete) {
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: userPrompt }],
                  },
                ],
                turnComplete: true,
              },
            })
          );
          return;
        }
        const parts = msg?.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (typeof p?.text === 'string') {
            textOut += p.text;
          }
        }
        if (msg?.serverContent?.turnComplete) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            try {
              ws.close();
            } catch {}
            resolve(textOut.trim());
          }
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          reject(err);
        }
      }
    });

    ws.addEventListener('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(err?.message || 'Gemini Live WebSocket error'));
      }
    });

    ws.addEventListener('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        if (textOut.trim()) {
          resolve(textOut.trim());
        } else {
          reject(new Error('Gemini Live WebSocket closed before response'));
        }
      }
    });
  });
}

async function runGeminiRestFallback({ auth, model, systemPrompt, userPrompt }) {
  const cleanModel = model.replace(/^models\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;
  const headers = { 'Content-Type': 'application/json' };
  if (auth.type === 'apiKey') {
    headers['x-goog-api-key'] = auth.token;
  } else {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    throw new Error(`Gemini REST returned HTTP ${resp.status}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text || '').join('').trim();
  if (!text) throw new Error('Empty response from Gemini API');
  return text;
}

export async function processCoordinatorTurn({ prompt, source = 'text', requestedMode = '' }) {
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Prompt cannot be empty.');

  const identity = loadIdentity();
  const state = loadState();
  const { workers } = await getMergedWorkers();
  const prefs = loadVoicePrefsRaw();
  const mode = requestedMode || prefs.mode;

  appendChatTurn({ role: 'user', text: cleanPrompt, source });

  // Built-in quick command routing: "spawn: <prompt>" or "relay <idPrefix>: <msg>"
  const spawnMatch = cleanPrompt.match(/^\/?spawn\s*:\s*(.+)$/i);
  if (spawnMatch) {
    try {
      const spawned = await spawnWorker({ prompt: spawnMatch[1].trim() });
      const replyText = `${identity.name} dispatched a new worker${spawned.conversationId ? ` (${spawned.conversationId.slice(0, 8)})` : ''}.`;
      const assistantMsg = appendChatTurn({
        role: 'assistant',
        text: replyText,
        source,
        action: { type: 'spawn', conversationId: spawned.conversationId },
      });
      return { ok: true, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
    } catch (err) {
      const replyText = `Could not spawn worker via agentapi: ${err instanceof Error ? err.message : String(err)}`;
      const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
      return { ok: false, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
    }
  }

  const relayMatch = cleanPrompt.match(/^\/?relay\s+([a-zA-Z0-9_-]{4,80})\s*:\s*(.+)$/i);
  if (relayMatch) {
    const idQuery = relayMatch[1].toLowerCase();
    const matchWorker = workers.find((w) => w.id.toLowerCase().startsWith(idQuery));
    if (!matchWorker) {
      const replyText = `No worker found matching prefix "${relayMatch[1]}". Check the Workers tab for active IDs.`;
      const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
      return { ok: false, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
    }
    try {
      await relayToWorker({ convId: matchWorker.id, message: relayMatch[2].trim() });
      const replyText = `${identity.name} relayed your instruction to "${matchWorker.title}".`;
      const assistantMsg = appendChatTurn({
        role: 'assistant',
        text: replyText,
        source,
        action: { type: 'relay', conversationId: matchWorker.id },
      });
      return { ok: true, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
    } catch (err) {
      const replyText = `Relay failed: ${err instanceof Error ? err.message : String(err)}`;
      const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
      return { ok: false, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
    }
  }

  let replyText = '';
  let modeUsed = 'browser-local';
  let liveError = '';

  if (mode === 'gemini-live') {
    const auth = await resolveGeminiAuth(prefs);
    if (!auth) {
      liveError = 'No GEMINI_API_KEY or gcloud ADC token configured; answered locally.';
    } else {
      const systemPrompt = buildCoordinatorSystemContext({ identity, state, workers });
      try {
        replyText = await runGeminiLiveBidi({
          auth,
          model: prefs.model || DEFAULT_VOICE_MODEL,
          systemPrompt,
          userPrompt: cleanPrompt,
        });
        modeUsed = `gemini-live-ws:${prefs.model || DEFAULT_VOICE_MODEL}`;
      } catch (wsErr) {
        try {
          replyText = await runGeminiRestFallback({
            auth,
            model: prefs.model || DEFAULT_VOICE_MODEL,
            systemPrompt,
            userPrompt: cleanPrompt,
          });
          modeUsed = `gemini-rest:${prefs.model || DEFAULT_VOICE_MODEL}`;
        } catch (restErr) {
          liveError = `${wsErr.message}; fallback: ${restErr.message}`;
        }
      }
    }
  }

  if (!replyText) {
    replyText = buildLocalCoordinatorReply(cleanPrompt, { identity, state, workers });
    if (liveError) {
      replyText += ` (${liveError})`;
    }
  }

  const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source: modeUsed });
  return {
    ok: true,
    modeUsed,
    liveError,
    reply: replyText,
    assistantMsg,
  };
}
