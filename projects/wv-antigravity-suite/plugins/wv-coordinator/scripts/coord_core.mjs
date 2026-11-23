/**
 * AGY Coordinator — Core State, Desktop/Brain Discovery, AgentAPI Relay, Persona & Voice Engine
 *
 * Zero external npm dependencies. Uses only Node built-ins (`node:*`).
 * Persistent state lives strictly under `~/.gemini/config/plugin_data/agy-coordinator/`
 * (or `AGY_COORDINATOR_DATA_DIR` when explicitly overridden). Zero `/tmp` writes.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,120}$/;
export const DEFAULT_VOICE_MODEL = 'gemini-3.8-live';
export const DEFAULT_MULTIMODAL_MODEL = 'gemini-3.8-flash';

const BRAIN_CONV_CACHE = new Map();
let cachedAdcToken = null; // { accessToken, expiresAt, quotaProjectId }

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
  const override = process.env.WV_COORDINATOR_DATA_DIR || process.env.AGY_COORDINATOR_DATA_DIR;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(os.homedir(), '.gemini', 'config', 'plugin_data', 'wv-coordinator');
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
          mode: 'gemini-live',
          model: DEFAULT_VOICE_MODEL,
          apiKey: '',
          useGcloudAdc: true,
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

export const ALLOWED_GEMINI_VOICES = [
  'Zephyr',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Leda',
  'Puck',
  'Kore',
  'Fenrir',
  'Orus',
  'Charon',
];

export function loadVoicePrefsRaw() {
  const dir = ensureInitialized();
  const voicePath = path.join(dir, 'voice_prefs.json');
  const raw = readJsonSafe(voicePath, {});
  const isV2 = Number(raw.prefsSchemaVersion || 0) >= 2;
  const voiceName = ALLOWED_GEMINI_VOICES.includes(raw.voiceName) ? raw.voiceName : 'Zephyr';
  return {
    prefsSchemaVersion: 3,
    mode: isV2 && raw.mode === 'browser' ? 'browser' : 'gemini-live',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_VOICE_MODEL,
    voiceName,
    projectId: typeof raw.projectId === 'string' ? raw.projectId.trim() : '',
    apiKey: typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '',
    useGcloudAdc: isV2 ? raw.useGcloudAdc !== false : true,
    ttsEnabled: raw.ttsEnabled !== false,
    voiceRate: Number.isFinite(Number(raw.voiceRate)) ? Math.min(1.6, Math.max(0.6, Number(raw.voiceRate))) : 1.0,
    voicePitch: Number.isFinite(Number(raw.voicePitch)) ? Math.min(1.5, Math.max(0.7, Number(raw.voicePitch))) : 1.05,
    updatedAt: raw.updatedAt || null,
  };
}

export function saveVoicePrefs(patch) {
  const dir = ensureInitialized();
  const cur = loadVoicePrefsRaw();
  const nextVoice = ALLOWED_GEMINI_VOICES.includes(patch.voiceName) ? patch.voiceName : cur.voiceName;
  const next = {
    prefsSchemaVersion: 3,
    mode: patch.mode === 'gemini-live' ? 'gemini-live' : patch.mode === 'browser' ? 'browser' : cur.mode,
    model: typeof patch.model === 'string' && patch.model.trim() ? patch.model.trim().slice(0, 80) : cur.model,
    voiceName: nextVoice,
    projectId: typeof patch.projectId === 'string' ? patch.projectId.trim().slice(0, 80) : (cur.projectId || ''),
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

export function findAdcCredentialsFile() {
  const candidates = [];
  const envAdc = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();
  if (envAdc) candidates.push(envAdc);
  if (process.platform === 'win32' && process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, 'gcloud', 'application_default_credentials.json'));
  }
  candidates.push(path.join(os.homedir(), '.config', 'gcloud', 'application_default_credentials.json'));

  for (const p of candidates) {
    try {
      if (!p || !fs.existsSync(p)) continue;
      const st = fs.lstatSync(p);
      if (!st.isFile() || st.isSymbolicLink()) continue;
      const parsed = readJsonSafe(p, null);
      if (parsed && parsed.refresh_token && parsed.client_id) {
        return { path: p, creds: parsed };
      }
    } catch {
      // Ignore unreadable candidates.
    }
  }
  return null;
}


let cachedGcloudCliProject = null;

const PLACEHOLDER_PROJECT_IDS = new Set([
  'agency-sandbox-01',
  'your-project-id',
  'your_project_id',
  'my-project-id',
  'example-project',
  'demo-project',
]);

export function getGcloudBinCandidates() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || '';
    const progFiles = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || '';
    return [
      'gcloud.cmd',
      'gcloud',
      localApp ? path.join(localApp, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd') : '',
      progFiles ? path.join(progFiles, 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd') : '',
    ].filter(Boolean);
  }
  return [
    'gcloud',
    path.join(home, 'google-cloud-sdk', 'bin', 'gcloud'),
    '/opt/homebrew/bin/gcloud',
    '/opt/homebrew/share/google-cloud-sdk/bin/gcloud',
    '/usr/local/bin/gcloud',
    '/usr/local/Caskroom/google-cloud-sdk/latest/google-cloud-sdk/bin/gcloud',
    '/usr/bin/gcloud',
    '/snap/bin/gcloud',
  ];
}

export function listCandidateGcpProjectsSync(prefs = null, adcCreds = null) {
  const p = prefs || loadVoicePrefsRaw();
  const VALID_PROJ_RE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/i;
  const found = [];
  const seen = new Set();

  const addCandidate = (id, source, lowPriority = false) => {
    const clean = String(id || '').trim();
    if (!clean || !VALID_PROJ_RE.test(clean) || clean === '(unset)') return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      projectId: clean,
      projectSource: source,
      isPlaceholder: lowPriority || PLACEHOLDER_PROJECT_IDS.has(key),
    });
  };

  if (p.projectId) {
    addCandidate(p.projectId, 'prefs');
  }

  for (const envVar of ['GOOGLE_CLOUD_PROJECT', 'GCLOUD_PROJECT', 'CLOUDSDK_CORE_PROJECT']) {
    if (process.env[envVar]) addCandidate(process.env[envVar], envVar);
  }

  // Check gcloud active configuration file on disk (<1ms, 0 subprocesses) BEFORE ge-instance placeholders
  const home = os.homedir();
  const gcloudRoots = [];
  if (process.platform === 'win32' && process.env.APPDATA) {
    gcloudRoots.push(path.join(process.env.APPDATA, 'gcloud'));
  }
  gcloudRoots.push(path.join(home, '.config', 'gcloud'));

  for (const groot of gcloudRoots) {
    try {
      let activeName = 'default';
      const activeFile = path.join(groot, 'active_config');
      if (fs.existsSync(activeFile) && !fs.lstatSync(activeFile).isSymbolicLink()) {
        const rawName = fs.readFileSync(activeFile, 'utf-8').trim();
        if (/^[a-zA-Z0-9_-]{1,64}$/.test(rawName)) activeName = rawName;
      }
      const cfgFile = path.join(groot, 'configurations', `config_${activeName}`);
      if (fs.existsSync(cfgFile) && !fs.lstatSync(cfgFile).isSymbolicLink()) {
        const ini = fs.readFileSync(cfgFile, 'utf-8');
        const pm = ini.match(/^\s*project\s*=\s*([a-z][a-z0-9-]{4,61}[a-z0-9])\s*$/im);
        if (pm && pm[1]) {
          addCandidate(pm[1], `gcloud-config(${activeName})`);
        }
      }
    } catch {}
  }

  // Check ADC quota_project_id
  const adcObj = adcCreds || findAdcCredentialsFile()?.creds;
  if (adcObj && adcObj.quota_project_id) {
    addCandidate(adcObj.quota_project_id, 'adc-quota-project');
  }

  if (cachedGcloudCliProject) {
    addCandidate(cachedGcloudCliProject, 'gcloud-cli');
  }

  // Check WV & Generic AGY configured Gemini Enterprise instance (ge-instance.json)
  const geCandidates = [
    process.env.ANTIGRAVITY_APP_DATA_DIR
      ? path.join(path.resolve(process.env.ANTIGRAVITY_APP_DATA_DIR), 'plugin_data', 'wv-connectors', 'ge-instance.json')
      : '',
    path.join(home, '.gemini', 'antigravity', 'plugin_data', 'wv-connectors', 'ge-instance.json'),
    path.join(home, '.gemini', 'config', 'plugin_data', 'wv-connectors', 'ge-instance.json'),
    path.join(home, '.gemini', 'config', 'plugin_data', 'agy-connectors', 'ge-instance.json'),
  ].filter(Boolean);

  for (const gpPath of geCandidates) {
    try {
      if (!fs.existsSync(gpPath) || fs.lstatSync(gpPath).isSymbolicLink()) continue;
      const ge = readJsonSafe(gpPath, null);
      if (!ge) continue;
      if (ge.projectId) {
        addCandidate(ge.projectId, 'ge-instance');
      }
      const m = String(ge.rawInput || '').match(/projects\/([a-z][a-z0-9-]{4,61}[a-z0-9])/i);
      if (m && m[1]) {
        addCandidate(m[1], 'ge-instance');
      }
    } catch {}
  }

  // Sort non-placeholder projects ahead of sample/placeholder IDs
  found.sort((a, b) => Number(a.isPlaceholder) - Number(b.isPlaceholder));
  return found;
}

export function detectGcpProjectSync(prefs = null, adcCreds = null) {
  const list = listCandidateGcpProjectsSync(prefs, adcCreds);
  if (list.length > 0) {
    return { projectId: list[0].projectId, projectSource: list[0].projectSource };
  }
  return { projectId: '', projectSource: 'none' };
}

export function getPublicVoiceStatus() {
  const prefs = loadVoicePrefsRaw();
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const effectiveKey = envKey || prefs.apiKey || '';
  const adcFile = findAdcCredentialsFile();
  const keySource = envKey
    ? 'env'
    : prefs.apiKey
      ? 'prefs'
      : adcFile
        ? 'adc-file'
        : prefs.useGcloudAdc
          ? 'gcloud-adc'
          : 'none';
  const projInfo = detectGcpProjectSync(prefs, adcFile?.creds);
  return {
    mode: prefs.mode,
    model: prefs.model,
    voiceName: prefs.voiceName || 'Zephyr',
    projectId: prefs.projectId || '',
    effectiveProjectId: projInfo.projectId,
    projectSource: projInfo.projectSource,
    hasApiKey: Boolean(effectiveKey),
    hasAdcFile: Boolean(adcFile),
    keySource: (adcFile || prefs.useGcloudAdc) && projInfo.projectId ? `vertex-ai(${projInfo.projectId})` : keySource,
    useGcloudAdc: prefs.useGcloudAdc,
    ttsEnabled: prefs.ttsEnabled,
    voiceRate: prefs.voiceRate,
    voicePitch: prefs.voicePitch,
    readyForGeminiLive: Boolean(effectiveKey || adcFile || prefs.useGcloudAdc),
    prefsPath: path.join(getDataDir(), 'voice_prefs.json'),
  };
}

/* ---------- Brain Transcript Discovery (Fast <15ms Desktop Fallback) ---------- */

export function getBrainRoots() {
  const candidates = [];
  if (process.env.ANTIGRAVITY_BRAIN_DIR) {
    candidates.push(process.env.ANTIGRAVITY_BRAIN_DIR);
  }
  const appData = (process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim();
  if (appData) {
    candidates.push(path.join(path.resolve(appData), 'brain'));
  }
  const execDir = (process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || '').trim();
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
      // Missing dir; ignore.
    }
  }
  return roots;
}

function cleanSnippet(raw, maxLen) {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_`>\[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

async function parseBrainTranscriptCached(txPath, convId, st) {
  const hit = BRAIN_CONV_CACHE.get(txPath);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
    return hit;
  }

  let firstUserTitle = '';
  let latestUserPrompt = '';
  let latestPlannerSnippet = '';
  let firstTime = null;
  let lastTime = null;
  let lastType = '';

  const stream = fs.createReadStream(txPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let obj;
    try {
      obj = JSON.parse(line.replace(/^\uFEFF/, ''));
    } catch {
      continue;
    }

    const typ = String(obj.type || '');
    if (typ) lastType = typ;
    if (typeof obj.created_at === 'string' && obj.created_at) {
      if (!firstTime) firstTime = obj.created_at;
      lastTime = obj.created_at;
    }

    if (typ === 'USER_INPUT' && typeof obj.content === 'string') {
      const cleaned = cleanSnippet(obj.content, 76);
      if (cleaned) {
        if (!firstUserTitle) firstUserTitle = cleaned;
        latestUserPrompt = cleaned;
      }
    } else if (typ === 'PLANNER_RESPONSE' && typeof obj.content === 'string') {
      const cleaned = cleanSnippet(obj.content, 120);
      if (cleaned) latestPlannerSnippet = cleaned;
    }
  }

  const entry = {
    id: convId,
    mtimeMs: st.mtimeMs,
    size: st.size,
    title: firstUserTitle || latestUserPrompt || `Conversation ${convId.slice(0, 8)}`,
    summary: latestPlannerSnippet || latestUserPrompt || '',
    createTime: firstTime || new Date(st.birthtimeMs || st.mtimeMs).toISOString(),
    updateTime: lastTime || new Date(st.mtimeMs).toISOString(),
    lastType,
  };

  if (BRAIN_CONV_CACHE.size > 320) {
    const oldest = BRAIN_CONV_CACHE.keys().next().value;
    if (oldest) BRAIN_CONV_CACHE.delete(oldest);
  }
  BRAIN_CONV_CACHE.set(txPath, entry);
  return entry;
}

export async function discoverBrainConversations(limit = 40) {
  const roots = getBrainRoots();
  const candidates = [];

  for (const brainRoot of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(brainRoot, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.isSymbolicLink() || ent.name.startsWith('.')) continue;
      if (!SAFE_ID_RE.test(ent.name)) continue;
      const txPath = path.join(brainRoot, ent.name, '.system_generated', 'logs', 'transcript.jsonl');
      try {
        const st = fs.lstatSync(txPath);
        if (!st.isFile() || st.isSymbolicLink() || st.size <= 0) continue;
        const real = fs.realpathSync(txPath);
        if (!real.startsWith(brainRoot + path.sep)) continue;
        candidates.push({ convId: ent.name, txPath: real, st });
      } catch {
        // No transcript.jsonl yet; skip.
      }
    }
  }

  candidates.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const sliced = candidates.slice(0, limit);
  const nowMs = Date.now();
  const out = [];

  for (const item of sliced) {
    try {
      const parsed = await parseBrainTranscriptCached(item.txPath, item.convId, item.st);
      const ageMs = Math.max(0, nowMs - (parsed.mtimeMs || 0));
      const isWorking = ageMs < 90_000 && parsed.lastType === 'USER_INPUT';
      out.push({
        id: parsed.id,
        title: parsed.title,
        summary: parsed.summary,
        runState: isWorking ? 'RUN_STATE_RUNNING' : 'RUN_STATE_IDLE',
        createTime: parsed.createTime,
        updateTime: parsed.updateTime,
        projectId: '',
        archived: false,
        source: 'brain-transcript',
      });
    } catch {
      // Skip malformed transcript safely.
    }
  }

  return out;
}

/* ---------- Language Server Discovery (Safe HTML/JSON Guard) ---------- */

async function safeLsJsonPost(baseUrl, rpcPath, csrfToken, bodyObj) {
  const url = `${baseUrl.replace(/\/$/, '')}${rpcPath}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1',
      'x-codeium-csrf-token': csrfToken,
    },
    body: JSON.stringify(bodyObj || {}),
    signal: AbortSignal.timeout(3500),
  });
  if (!resp.ok) {
    return { ok: false, status: resp.status, reason: `HTTP ${resp.status}`, data: null };
  }
  const ct = String(resp.headers.get('content-type') || '').toLowerCase();
  const rawText = await resp.text();
  const trimmed = rawText.trimStart();
  if (!ct.includes('application/json') || trimmed.startsWith('<')) {
    return { ok: false, status: resp.status, reason: 'Non-JSON HTML response from LS endpoint', data: null };
  }
  try {
    return { ok: true, status: resp.status, reason: '', data: JSON.parse(rawText.replace(/^\uFEFF/, '')) };
  } catch {
    return { ok: false, status: resp.status, reason: 'Invalid JSON payload from LS', data: null };
  }
}

export async function listLsConversations({ includeArchived = false } = {}) {
  const lsAddr = (process.env.ANTIGRAVITY_LS_ADDRESS || '').trim();
  const csrfToken = (process.env.ANTIGRAVITY_CSRF_TOKEN || '').trim();
  if (!lsAddr || !csrfToken) {
    return {
      ok: false,
      available: false,
      reason: 'LS env vars not set',
      conversations: [],
    };
  }

  const baseUrl = /^https?:\/\//i.test(lsAddr) ? lsAddr : `http://${lsAddr}`;
  try {
    const primary = await safeLsJsonPost(
      baseUrl,
      '/jetski.product.v1.ConversationService/ListConversations',
      csrfToken,
      { pageSize: 50 }
    );
    if (primary.ok && primary.data) {
      const rawList = Array.isArray(primary.data.conversations) ? primary.data.conversations : [];
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
            source: 'live-ls',
          };
        })
        .filter(Boolean);
      return { ok: true, available: true, reason: '', conversations };
    }

    // Desktop Language Server RPC fallback
    const desktop = await safeLsJsonPost(
      baseUrl,
      '/exa.language_server_pb.LanguageServerService/GetAllCascadeTrajectories',
      csrfToken,
      {}
    );
    if (desktop.ok && desktop.data) {
      const summaries = desktop.data.cascadeSummaries || desktop.data.trajectories || {};
      const entries = Array.isArray(summaries)
        ? summaries.map((v, idx) => [String(v?.cascadeId || v?.id || idx), v])
        : Object.entries(summaries);
      const conversations = entries
        .map(([id, item]) => {
          const cleanId = String(item?.cascadeId || item?.id || id || '').trim();
          if (!cleanId) return null;
          const status = String(item?.status || item?.runState || '');
          return {
            id: cleanId,
            title: String(item?.summary || item?.title || `Cascade ${cleanId.slice(0, 8)}`).trim().slice(0, 80),
            summary: String(item?.latestResponse || item?.summary || '').trim().slice(0, 120),
            runState: status.includes('RUNNING') ? 'RUN_STATE_RUNNING' : 'RUN_STATE_IDLE',
            createTime: item?.createdTime || null,
            updateTime: item?.lastModifiedTime || item?.updateTime || null,
            projectId: '',
            archived: false,
            source: 'desktop-ls',
          };
        })
        .filter(Boolean);
      return { ok: true, available: true, reason: '', conversations };
    }

    return {
      ok: false,
      available: false,
      reason: primary.reason || desktop.reason || 'LS endpoint unavailable',
      conversations: [],
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
  const [ls, brainConvs] = await Promise.all([
    listLsConversations({ includeArchived }),
    discoverBrainConversations(40),
  ]);
  const workerMeta = state.workers || {};
  const byId = new Map();

  function upsertConversation(conv) {
    const existing = byId.get(conv.id);
    const meta = workerMeta[conv.id] || {};
    if (meta.removed) return;
    const runState = conv.runState || (existing ? existing.runState : '');
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
      ...(existing || {}),
      ...conv,
      title: conv.title || (existing && existing.title) || meta.title || `Worker ${conv.id.slice(0, 8)}`,
      summary: conv.summary || (existing && existing.summary) || meta.note || '',
      groupId: meta.groupId || 'group-default',
      pinned: Boolean(meta.pinned),
      labels: Array.isArray(meta.labels) ? meta.labels : [],
      customStatus: meta.customStatus || '',
      status: derivedStatus,
      note: meta.note || '',
      source: existing ? existing.source : conv.source,
    });
  }

  for (const conv of ls.conversations) upsertConversation(conv);
  for (const conv of brainConvs) {
    if (!byId.has(conv.id)) {
      upsertConversation(conv);
    } else {
      // Enrich LS entry if brain has a richer summary
      const cur = byId.get(conv.id);
      if (!cur.summary && conv.summary) cur.summary = conv.summary;
    }
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
      status: meta.customStatus || 'TRACKED',
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
      ok: ls.ok || brainConvs.length > 0,
      available: ls.available || brainConvs.length > 0,
      lsLive: ls.ok,
      brainCount: brainConvs.length,
      reason: ls.ok ? '' : brainConvs.length > 0 ? `Synced ${brainConvs.length} local brain transcripts` : ls.reason,
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
  cur.removed = remove === true;
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

/* ---------- Pure Node HTTPS ADC OAuth2 Exchange & Gemini Auth ---------- */

function httpsFormPost(urlString, formParams, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const body = new URLSearchParams(formParams).toString();
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          Accept: 'application/json',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({ status: res.statusCode || 0, json: JSON.parse(text) });
          } catch {
            resolve({ status: res.statusCode || 0, json: null });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('OAuth2 token refresh timed out'));
    });
    req.write(body);
    req.end();
  });
}

async function resolveEffectiveProjectId(prefs, adcCreds = null) {
  const candidates = listCandidateGcpProjectsSync(prefs, adcCreds);
  if (candidates.length > 0 && !candidates[0].isPlaceholder) {
    return candidates[0].projectId;
  }
  for (const gcloudBin of getGcloudBinCandidates()) {
    try {
      const { stdout } = await execFileAsync(gcloudBin, ['config', 'get-value', 'project'], { timeout: 4000 });
      const val = String(stdout || '').trim();
      if (/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/i.test(val) && val !== '(unset)') {
        cachedGcloudCliProject = val;
        return val;
      }
    } catch {}
  }
  return candidates[0]?.projectId || '';
}

async function resolveGeminiAuth(prefs) {
  const adc = findAdcCredentialsFile();

  // 1. Default: Google Cloud Project + ADC (Vertex AI — works natively with cloud-platform scope!)
  if (prefs.useGcloudAdc !== false) {
    const projectId = await resolveEffectiveProjectId(prefs, adc?.creds);
    const candidateProjects = Array.from(
      new Set(
        [projectId, ...listCandidateGcpProjectsSync(prefs, adc?.creds).map((c) => c.projectId)].filter(Boolean)
      )
    );

    if (cachedAdcToken && cachedAdcToken.expiresAt > Date.now() && projectId) {
      return {
        type: 'bearer',
        token: cachedAdcToken.accessToken,
        projectId,
        candidateProjects,
        quotaProjectId: cachedAdcToken.quotaProjectId || projectId,
        source: `vertex-adc(${projectId})`,
      };
    }

    if (adc && adc.creds && projectId) {
      try {
        const form = {
          client_id: adc.creds.client_id,
          refresh_token: adc.creds.refresh_token,
          grant_type: 'refresh_token',
        };
        if (adc.creds.client_secret) form.client_secret = adc.creds.client_secret;
        const resp = await httpsFormPost('https://oauth2.googleapis.com/token', form, 10000);
        if (resp.status === 200 && resp.json && resp.json.access_token) {
          cachedAdcToken = {
            accessToken: resp.json.access_token,
            expiresAt: Date.now() + Math.max(60, Number(resp.json.expires_in || 3500) - 60) * 1000,
            quotaProjectId: String(adc.creds.quota_project_id || projectId),
          };
          return {
            type: 'bearer',
            token: cachedAdcToken.accessToken,
            projectId,
            candidateProjects,
            quotaProjectId: cachedAdcToken.quotaProjectId,
            source: `vertex-adc(${projectId})`,
          };
        }
      } catch {
        // Fall through to gcloud CLI token fallback.
      }
    }

    if (projectId) {
      for (const bin of getGcloudBinCandidates()) {
        try {
          const { stdout } = await execFileAsync(bin, ['auth', 'print-access-token'], { timeout: 5000 });
          const tok = String(stdout || '').trim();
          if (tok) {
            cachedAdcToken = {
              accessToken: tok,
              expiresAt: Date.now() + 240_000,
              quotaProjectId: projectId,
            };
            return {
              type: 'bearer',
              token: tok,
              projectId,
              candidateProjects,
              quotaProjectId: projectId,
              source: `vertex-gcloud(${projectId})`,
            };
          }
        } catch {}
      }
    }
  }

  // 2. Fallback: Explicit GEMINI_API_KEY (AI Studio / generativelanguage.googleapis.com)
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  const apiKey = envKey || prefs.apiKey || '';
  if (apiKey) {
    return { type: 'apiKey', token: apiKey, projectId: '', quotaProjectId: '', source: envKey ? 'env-key' : 'prefs-key' };
  }

  return null;
}

function buildCoordinatorSystemContext({ identity, state, workers }) {
  const activeGoals = state.goals.filter((g) => g.status !== 'done');
  const openTasks = state.tasks.filter((t) => !t.done);
  const groupLines = state.groups.map((g) => `- ${g.title} (groupId: ${g.id})`);
  const workerLines = (workers || []).slice(0, 10).map((w) => `- [${w.status}] ${w.title} (id: ${w.id.slice(0, 8)})`);
  const goalLines = activeGoals.slice(0, 10).map((g) => `- [${g.status}] ${g.title} (goalId: ${g.id}, groupId: ${g.groupId})`);
  return [
    identity.identityMd.trim(),
    identity.soulMd.trim(),
    `Current Coordinator Snapshot (${new Date().toISOString()}):`,
    `- Groups: ${state.groups.length}, Active Goals: ${activeGoals.length}, Open Tasks: ${openTasks.length}, Tracked Workers: ${(workers || []).length}`,
    `Groups:\n${groupLines.join('\n')}`,
    workerLines.length ? `Workers:\n${workerLines.join('\n')}` : 'Workers: none active yet.',
    goalLines.length ? `Goals:\n${goalLines.join('\n')}` : 'Goals: none created yet.',
    [
      'Return ONLY valid JSON with this exact shape:',
      '{',
      '  "transcript": "<exact user utterance if audio was provided, else user text>",',
      '  "reply": "<1-3 crisp spoken sentences from the coordinator>",',
      '  "action": {',
      '    "type": "none | create_group | create_goal | add_task | spawn | relay",',
      '    "groupTitle": "<if create_group>",',
      '    "groupId": "<optional existing groupId for create_goal>",',
      '    "goalTitle": "<if create_goal>",',
      '    "goalId": "<existing goalId for add_task>",',
      '    "taskTitle": "<if add_task>",',
      '    "convId": "<worker id or prefix for relay>",',
      '    "prompt": "<if spawn>",',
      '    "message": "<if relay>"',
      '  }',
      '}',
    ].join('\n'),
  ].join('\n\n');
}

function parseStructuredCoordinatorJson(rawText, fallbackTranscript = '') {
  const txt = String(rawText || '').trim();
  const stripped = txt.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const obj = JSON.parse(stripped);
    if (obj && typeof obj === 'object') {
      return {
        transcript: typeof obj.transcript === 'string' && obj.transcript.trim() ? obj.transcript.trim() : fallbackTranscript,
        reply: typeof obj.reply === 'string' && obj.reply.trim() ? obj.reply.trim() : stripped,
        action: obj.action && typeof obj.action === 'object' ? obj.action : null,
      };
    }
  } catch {
    // Non-JSON text fallback.
  }
  return {
    transcript: fallbackTranscript,
    reply: txt,
    action: null,
  };
}

async function executeCoordinatorAction(action, { workers, state }) {
  if (!action || !action.type || action.type === 'none') return null;
  const typ = String(action.type).toLowerCase();

  if (typ === 'create_group' && action.groupTitle) {
    const res = mutateGroups({ action: 'add', title: String(action.groupTitle) });
    return { type: 'create_group', ok: true, group: res.group };
  }

  if (typ === 'create_goal' && action.goalTitle) {
    let targetGroupId = action.groupId && state.groups.some((g) => g.id === action.groupId) ? action.groupId : 'group-default';
    if (!action.groupId && action.groupTitle) {
      const matchGrp = state.groups.find((g) => g.title.toLowerCase() === String(action.groupTitle).toLowerCase());
      if (matchGrp) targetGroupId = matchGrp.id;
    }
    const res = mutateGoals({ action: 'add', groupId: targetGroupId, title: String(action.goalTitle) });
    return { type: 'create_goal', ok: true, goal: res.goal };
  }

  if (typ === 'add_task' && action.taskTitle) {
    const targetGoalId =
      action.goalId && state.goals.some((g) => g.id === action.goalId)
        ? action.goalId
        : state.goals.find((g) => g.status !== 'done')?.id || state.goals[0]?.id;
    if (!targetGoalId) {
      const createdGoal = mutateGoals({
        action: 'add',
        groupId: 'group-default',
        title: action.goalTitle || 'Active Sprint',
      });
      const tRes = mutateTasks({ action: 'add', goalId: createdGoal.goal.id, title: String(action.taskTitle) });
      return { type: 'add_task', ok: true, task: tRes.task, goal: createdGoal.goal };
    }
    const tRes = mutateTasks({ action: 'add', goalId: targetGoalId, title: String(action.taskTitle) });
    return { type: 'add_task', ok: true, task: tRes.task };
  }

  if (typ === 'spawn' && action.prompt) {
    const spawned = await spawnWorker({ prompt: String(action.prompt), groupId: action.groupId || 'group-default' });
    return { type: 'spawn', ok: true, conversationId: spawned.conversationId };
  }

  if (typ === 'relay' && action.convId && action.message) {
    const q = String(action.convId).toLowerCase();
    const hit = (workers || []).find((w) => w.id.toLowerCase().startsWith(q));
    if (!hit) return { type: 'relay', ok: false, error: `Worker "${action.convId}" not found` };
    await relayToWorker({ convId: hit.id, message: String(action.message) });
    return { type: 'relay', ok: true, conversationId: hit.id };
  }

  return null;
}

function buildLocalActionOrReply(prompt, { identity, state, workers }) {
  const text = String(prompt || '').trim();
  const goalMatch = text.match(/^\/?(?:create|add)\s+goal\s*[:\-]\s*(.+)$/i);
  if (goalMatch) {
    return {
      transcript: text,
      reply: `${identity.name} created goal "${goalMatch[1].trim()}".`,
      action: { type: 'create_goal', goalTitle: goalMatch[1].trim(), groupId: 'group-default' },
    };
  }
  const grpMatch = text.match(/^\/?(?:create|add)\s+group\s*[:\-]\s*(.+)$/i);
  if (grpMatch) {
    return {
      transcript: text,
      reply: `${identity.name} created group "${grpMatch[1].trim()}".`,
      action: { type: 'create_group', groupTitle: grpMatch[1].trim() },
    };
  }
  const taskMatch = text.match(/^\/?(?:create|add)\s+task\s*[:\-]\s*(.+)$/i);
  if (taskMatch) {
    return {
      transcript: text,
      reply: `${identity.name} added task "${taskMatch[1].trim()}".`,
      action: { type: 'add_task', taskTitle: taskMatch[1].trim() },
    };
  }

  const lower = text.toLowerCase();
  const name = identity.name || 'Clawy';
  const activeGoals = state.goals.filter((g) => g.status !== 'done');
  const openTasks = state.tasks.filter((t) => !t.done);
  const runningWorkers = (workers || []).filter((w) => w.status === 'WORKING');

  let reply = '';
  if (/\b(status|summary|overview|what('?s| is) happening|workers?)\b/.test(lower)) {
    reply =
      `${name} reporting: you have ${(workers || []).length} worker conversation(s) ` +
      `(${runningWorkers.length} working), ${state.groups.length} group(s), ` +
      `${activeGoals.length} active goal(s), and ${openTasks.length} open task(s).`;
  } else if (/\b(goal|goals|task|tasks)\b/.test(lower)) {
    if (activeGoals.length === 0) {
      reply = `${name} here: no active goals yet. Say "Create goal: <title>" or use the Goals tab.`;
    } else {
      const top = activeGoals[0];
      const topOpen = openTasks.filter((t) => t.goalId === top.id).length;
      reply = `${name} tracking ${activeGoals.length} active goal(s). Top focus: "${top.title}" with ${topOpen} open task(s).`;
    }
  } else {
    reply =
      `${name} received: "${text.slice(0, 120)}". ` +
      `Tracking ${(workers || []).length} worker(s) and ${activeGoals.length} active goal(s).`;
  }

  return { transcript: text, reply, action: null };
}

async function runGeminiLiveBidi({ auth, model, systemPrompt, userPrompt }) {
  if (typeof WebSocket !== 'function') {
    throw new Error('WebSocket not available in this Node runtime');
  }
  const wsUrl =
    auth.type === 'apiKey'
      ? `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(auth.token)}`
      : 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

  const headers = {};
  if (auth.type === 'bearer') headers.Authorization = `Bearer ${auth.token}`;
  if (auth.quotaProjectId) headers['x-goog-user-project'] = auth.quotaProjectId;
  const wsOpts = Object.keys(headers).length ? { headers } : undefined;
  const fullModel = model.startsWith('models/') ? model : `models/${model}`;

  return await new Promise((resolve, reject) => {
    let settled = false;
    let textOut = '';
    const ws = wsOpts ? new WebSocket(wsUrl, wsOpts) : new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch {}
        if (textOut.trim()) resolve(textOut.trim());
        else reject(new Error('Gemini Live WebSocket timed out'));
      }
    }, 8500);

    ws.addEventListener('open', () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: fullModel,
            generationConfig: { responseModalities: ['TEXT'] },
            systemInstruction: { parts: [{ text: systemPrompt }] },
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
                turns: [{ role: 'user', parts: [{ text: userPrompt }] }],
                turnComplete: true,
              },
            })
          );
          return;
        }
        const parts = msg?.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (typeof p?.text === 'string') textOut += p.text;
        }
        if (msg?.serverContent?.turnComplete && !settled) {
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
          resolve(textOut.trim());
        }
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch {}
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
        if (textOut.trim()) resolve(textOut.trim());
        else reject(new Error('Gemini Live WebSocket closed before response'));
      }
    });
  });
}

async function runGeminiRestGenerate({ auth, model, systemPrompt, userPrompt, audioBase64 = '', mimeType = '' }) {
  const userParts = [];
  if (audioBase64) {
    userParts.push({
      inlineData: {
        mimeType: mimeType || 'audio/webm',
        data: audioBase64,
      },
    });
    userParts.push({
      text: userPrompt || 'Transcribe this audio command accurately into "transcript", execute any requested coordinator action, and answer concisely in "reply".',
    });
  } else {
    userParts.push({ text: userPrompt });
  }

  const reqBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  if (auth.type === 'bearer') {
    const projectList =
      Array.isArray(auth.candidateProjects) && auth.candidateProjects.length
        ? auth.candidateProjects
        : auth.projectId
          ? [auth.projectId]
          : [];
    if (!projectList.length) {
      throw new Error('No Google Cloud Project ID detected for Vertex AI. Set your GCP Project ID in Identity & Voice or run /connect-ge.');
    }
    let lastErr = '';
    for (const proj of projectList) {
      const pid = encodeURIComponent(proj);
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'x-goog-user-project': proj,
      };
      const vertexTargets = [
        `https://aiplatform.googleapis.com/v1beta1/projects/${pid}/locations/global/publishers/google/models/gemini-3.8-flash:generateContent`,
        `https://aiplatform.googleapis.com/v1beta1/projects/${pid}/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`,
        `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${pid}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`,
      ];
      for (const endpoint of vertexTargets) {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: reqBody,
          signal: AbortSignal.timeout(14000),
        });
        if (!resp.ok) {
          const errText = await resp.text().catch(() => '');
          lastErr = `Vertex AI HTTP ${resp.status}${errText ? ': ' + errText.slice(0, 140) : ''}`;
          if (resp.status === 403 || resp.status === 404 || resp.status === 429) continue;
          break;
        }
        const data = await resp.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p) => p?.text || '').join('').trim();
        if (text) return text;
      }
    }
    throw new Error(lastErr || 'Empty response from Vertex AI');
  }

  const cleanModel = (model || DEFAULT_MULTIMODAL_MODEL).replace(/^models\//, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': auth.token },
    body: reqBody,
    signal: AbortSignal.timeout(14000),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Gemini API HTTP ${resp.status}${errText ? ': ' + errText.slice(0, 140) : ''}`);
  }
  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text || '').join('').trim();
  if (!text) throw new Error('Empty response from Gemini API');
  return text;
}

export async function processCoordinatorTurn({
  prompt = '',
  audioBase64 = '',
  mimeType = '',
  source = 'text',
  requestedMode = '',
}) {
  const cleanPrompt = String(prompt || '').trim();
  const cleanAudio = String(audioBase64 || '').trim();
  if (!cleanPrompt && !cleanAudio) {
    throw new Error('Prompt or audio payload is required.');
  }

  const identity = loadIdentity();
  const state = loadState();
  const { workers } = await getMergedWorkers();
  const prefs = loadVoicePrefsRaw();
  const mode = requestedMode || prefs.mode;

  // Deterministic prefix commands for text mode
  if (cleanPrompt && !cleanAudio) {
    const spawnMatch = cleanPrompt.match(/^\/?spawn\s*:\s*(.+)$/i);
    if (spawnMatch) {
      appendChatTurn({ role: 'user', text: cleanPrompt, source });
      try {
        const spawned = await spawnWorker({ prompt: spawnMatch[1].trim() });
        const replyText = `${identity.name} dispatched a new worker${spawned.conversationId ? ` (${spawned.conversationId.slice(0, 8)})` : ''}.`;
        const assistantMsg = appendChatTurn({
          role: 'assistant',
          text: replyText,
          source,
          action: { type: 'spawn', conversationId: spawned.conversationId },
        });
        return { ok: true, transcript: cleanPrompt, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
      } catch (err) {
        const replyText = `Could not spawn worker via agentapi: ${err instanceof Error ? err.message : String(err)}`;
        const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
        return { ok: false, transcript: cleanPrompt, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
      }
    }

    const relayMatch = cleanPrompt.match(/^\/?relay\s+([a-zA-Z0-9_-]{4,80})\s*:\s*(.+)$/i);
    if (relayMatch) {
      appendChatTurn({ role: 'user', text: cleanPrompt, source });
      const idQuery = relayMatch[1].toLowerCase();
      const matchWorker = workers.find((w) => w.id.toLowerCase().startsWith(idQuery));
      if (!matchWorker) {
        const replyText = `No worker found matching prefix "${relayMatch[1]}".`;
        const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
        return { ok: false, transcript: cleanPrompt, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
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
        return { ok: true, transcript: cleanPrompt, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
      } catch (err) {
        const replyText = `Relay failed: ${err instanceof Error ? err.message : String(err)}`;
        const assistantMsg = appendChatTurn({ role: 'assistant', text: replyText, source });
        return { ok: false, transcript: cleanPrompt, modeUsed: 'local-dispatch', reply: replyText, assistantMsg };
      }
    }
  }

  let parsed = null;
  let modeUsed = 'browser-local';
  let liveError = '';

  if (mode === 'gemini-live' || cleanAudio) {
    const auth = await resolveGeminiAuth(prefs);
    if (!auth) {
      liveError = 'No GEMINI_API_KEY or ADC credentials detected';
    } else {
      const systemPrompt = buildCoordinatorSystemContext({ identity, state, workers });
      if (cleanAudio) {
        // Multimodal audio input via fast Gemini Flash REST endpoint
        try {
          const rawResp = await runGeminiRestGenerate({
            auth,
            model: DEFAULT_MULTIMODAL_MODEL,
            systemPrompt,
            userPrompt: cleanPrompt,
            audioBase64: cleanAudio,
            mimeType: mimeType || 'audio/webm',
          });
          parsed = parseStructuredCoordinatorJson(rawResp, '(Voice Command)');
          modeUsed = `gemini-audio:${DEFAULT_MULTIMODAL_MODEL}(${auth.source})`;
        } catch (err) {
          liveError = err instanceof Error ? err.message : String(err);
        }
      } else if (auth.type === 'bearer') {
        try {
          const rawRest = await runGeminiRestGenerate({
            auth,
            model: DEFAULT_MULTIMODAL_MODEL,
            systemPrompt,
            userPrompt: cleanPrompt,
          });
          parsed = parseStructuredCoordinatorJson(rawRest, cleanPrompt);
          modeUsed = `vertex-ai(${auth.source})`;
        } catch (restErr) {
          liveError = restErr instanceof Error ? restErr.message : String(restErr);
        }
      } else {
        try {
          const rawWs = await runGeminiLiveBidi({
            auth,
            model: prefs.model || DEFAULT_VOICE_MODEL,
            systemPrompt,
            userPrompt: cleanPrompt,
          });
          parsed = parseStructuredCoordinatorJson(rawWs, cleanPrompt);
          modeUsed = `gemini-live-ws:${prefs.model || DEFAULT_VOICE_MODEL}(${auth.source})`;
        } catch (wsErr) {
          try {
            const rawRest = await runGeminiRestGenerate({
              auth,
              model: DEFAULT_MULTIMODAL_MODEL,
              systemPrompt,
              userPrompt: cleanPrompt,
            });
            parsed = parseStructuredCoordinatorJson(rawRest, cleanPrompt);
            modeUsed = `gemini-rest:${DEFAULT_MULTIMODAL_MODEL}(${auth.source})`;
          } catch (restErr) {
            liveError = `${wsErr.message}; ${restErr.message}`;
          }
        }
      }
    }
  }

  if (!parsed) {
    if (cleanAudio) {
      const msg = liveError
        ? `Voice audio could not reach Gemini (${liveError}). Add a GEMINI_API_KEY or ADC credentials in Identity & Voice, or type your command.`
        : 'Voice audio requires Gemini credentials (GEMINI_API_KEY or ADC).';
      appendChatTurn({ role: 'user', text: '(Voice audio clip)', source });
      const assistantMsg = appendChatTurn({ role: 'assistant', text: msg, source: 'voice-notice' });
      return { ok: false, transcript: '', reply: msg, liveError, modeUsed: 'none', assistantMsg };
    }
    parsed = buildLocalActionOrReply(cleanPrompt, { identity, state, workers });
    if (liveError) {
      parsed.reply += ` (Local fallback: ${liveError})`;
    }
  }

  const userText = parsed.transcript || cleanPrompt || '(Voice command)';
  appendChatTurn({ role: 'user', text: userText, source });

  let actionResult = null;
  if (parsed.action) {
    try {
      actionResult = await executeCoordinatorAction(parsed.action, { workers, state });
    } catch (actErr) {
      parsed.reply += ` (Action error: ${actErr instanceof Error ? actErr.message : String(actErr)})`;
    }
  }

  const assistantMsg = appendChatTurn({
    role: 'assistant',
    text: parsed.reply,
    source: modeUsed,
    action: actionResult,
  });

  let ttsAudio = null;
  if (prefs.ttsEnabled !== false && mode === 'gemini-live') {
    try {
      ttsAudio = await synthesizeGeminiTtsAudio({ text: parsed.reply, voiceName: prefs.voiceName });
    } catch {
      ttsAudio = null;
    }
  }

  return {
    ok: true,
    transcript: userText,
    reply: parsed.reply,
    ttsAudio,
    action: actionResult,
    modeUsed,
    liveError,
    assistantMsg,
  };
}

export async function synthesizeGeminiTtsAudio({ text, voiceName = '' } = {}) {
  const cleanText = String(text || '').trim().slice(0, 900);
  if (!cleanText) return null;
  const prefs = loadVoicePrefsRaw();
  if (prefs.ttsEnabled === false) return null;
  const auth = await resolveGeminiAuth(prefs);
  if (!auth) return null;

  const chosenVoice = ALLOWED_GEMINI_VOICES.includes(voiceName) ? voiceName : (prefs.voiceName || 'Zephyr');
  const ttsPayload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: cleanText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: chosenVoice },
        },
      },
    },
  });

  if (auth.type === 'bearer' && auth.projectId) {
    const projectList =
      Array.isArray(auth.candidateProjects) && auth.candidateProjects.length
        ? auth.candidateProjects
        : [auth.projectId];

    for (const proj of projectList) {
      const pid = encodeURIComponent(proj);
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'x-goog-user-project': proj,
      };
      const vertexTtsModels = [
        ['global', 'gemini-3.1-flash-tts-preview'],
        ['global', 'gemini-2.5-flash-tts'],
        ['global', 'gemini-2.5-flash-preview-tts'],
        ['us-central1', 'gemini-2.5-flash-tts'],
      ];
      for (const [loc, modelId] of vertexTtsModels) {
        const host = loc === 'global' ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
        const endpoint = `https://${host}/v1beta1/projects/${pid}/locations/${loc}/publishers/google/models/${modelId}:generateContent`;
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: ttsPayload,
            signal: AbortSignal.timeout(9000),
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          for (const p of parts) {
            if (p?.inlineData?.data) {
              const m = String(p.inlineData.mimeType || 'audio/L16;rate=24000');
              const rateMatch = m.match(/rate=(\d+)/i);
              return {
                audioBase64: p.inlineData.data,
                mimeType: m,
                sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
                voiceName: chosenVoice,
                modelUsed: `vertex:${modelId}`,
              };
            }
          }
        } catch {}
      }

      // Cloud Text-to-Speech Chirp3-HD fallback on the same GCP project
      try {
        const cResp = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            input: { text: cleanText },
            voice: { languageCode: 'en-US', name: `en-US-Chirp3-HD-${chosenVoice}` },
            audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24000 },
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (cResp.ok) {
          const cData = await cResp.json();
          if (cData?.audioContent) {
            const wavBuf = Buffer.from(cData.audioContent, 'base64');
            const pcmBuf = wavBuf.length > 44 && wavBuf.subarray(0, 4).toString('ascii') === 'RIFF' ? wavBuf.subarray(44) : wavBuf;
            return {
              audioBase64: pcmBuf.toString('base64'),
              mimeType: 'audio/L16;rate=24000',
              sampleRate: 24000,
              voiceName: chosenVoice,
              modelUsed: 'cloud-tts:chirp3-hd',
            };
          }
        }
      } catch {}
    }
    return null;
  }

  if (auth.type === 'apiKey') {
    for (const ttsModel of ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts']) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ttsModel)}:generateContent`;
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': auth.token },
          body: ttsPayload,
          signal: AbortSignal.timeout(9000),
        });
        if (!resp.ok) continue;
        const data = await resp.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        for (const p of parts) {
          if (p?.inlineData?.data) {
            const m = String(p.inlineData.mimeType || 'audio/L16;rate=24000');
            const rateMatch = m.match(/rate=(\d+)/i);
            return {
              audioBase64: p.inlineData.data,
              mimeType: m,
              sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
              voiceName: chosenVoice,
              modelUsed: ttsModel,
            };
          }
        }
      } catch {}
    }
  }
  return null;
}
