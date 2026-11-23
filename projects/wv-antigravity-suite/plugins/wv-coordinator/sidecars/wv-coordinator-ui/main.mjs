#!/usr/bin/env node
/**
 * AGY Coordinator — Antigravity UI Sidecar Backend (`main.mjs`)
 *
 * Runs on Antigravity's built-in Node runtime (`sidecar_sdk`) over 127.0.0.1 loopback.
 * Zero external npm dependencies. Zero `/tmp` writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { buildInlinedSidecarHtml } from './sidecar_html_inliner.mjs';
import { getTokenMeterSummary } from './token_meter.mjs';
import {
  getDataDir,
  getMergedWorkers,
  getPublicVoiceStatus,
  loadIdentity,
  loadState,
  mutateGoals,
  mutateGroups,
  mutateTasks,
  postBoardItem,
  processCoordinatorTurn,
  relayToWorker,
  saveIdentity,
  saveVoicePrefs,
  spawnWorker,
  synthesizeGeminiTtsAudio,
  updateWorkerMeta,
} from '../../scripts/coord_core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function buildSnapshotPayload() {
  const state = loadState();
  const identity = loadIdentity();
  const { lsStatus, workers } = await getMergedWorkers();
  const voiceStatus = getPublicVoiceStatus();
  return {
    ok: true,
    dataDir: getDataDir(),
    lsStatus,
    workers,
    groups: state.groups,
    goals: state.goals,
    tasks: state.tasks,
    board: state.board,
    chatLog: state.chatLog,
    identity,
    voiceStatus,
  };
}

function safeErr(err) {
  return {
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  };
}

const app = new SidecarApp();

app.page('/', () => buildInlinedSidecarHtml(__dirname, ['token_pill_ui.js', 'app.js']));

app.api('/styles.css', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8'), {
    contentType: 'text/css; charset=utf-8',
  });
}, 'GET');

app.api('/app.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'app.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/token_pill_ui.js', () => {
  return new Response(fs.readFileSync(path.join(__dirname, 'token_pill_ui.js'), 'utf-8'), {
    contentType: 'application/javascript; charset=utf-8',
  });
}, 'GET');

app.api('/api/token-summary', async (data) => {
  try {
    return await getTokenMeterSummary((data && data.convId) || '');
  } catch (err) {
    return safeErr(err);
  }
}, 'GET');

app.api('/api/state', async () => {
  try {
    return await buildSnapshotPayload();
  } catch (err) {
    return safeErr(err);
  }
}, 'GET');

app.api('/api/workers/spawn', async (data) => {
  try {
    const res = await spawnWorker({
      prompt: data?.prompt || '',
      title: data?.title || '',
      model: data?.model || '',
      groupId: data?.groupId || 'group-default',
    });
    const snapshot = await buildSnapshotPayload();
    return { ...res, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/workers/relay', async (data) => {
  try {
    const res = await relayToWorker({
      convId: data?.convId || data?.id || '',
      message: data?.message || '',
      title: data?.title || '',
    });
    const snapshot = await buildSnapshotPayload();
    return { ...res, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/workers/meta', async (data) => {
  try {
    const workerMeta = updateWorkerMeta({
      convId: data?.convId || data?.id || '',
      groupId: data?.groupId,
      pinned: typeof data?.pinned === 'boolean' ? data.pinned : undefined,
      addLabel: data?.addLabel,
      removeLabel: data?.removeLabel,
      customStatus: data?.customStatus,
      note: data?.note,
      remove: data?.remove === true,
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, workerMeta, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/groups', async (data) => {
  try {
    const res = mutateGroups({
      action: data?.action || 'add',
      id: data?.id || '',
      title: data?.title || '',
      color: data?.color || 'blue',
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, group: res.group, removedId: res.removedId, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/goals', async (data) => {
  try {
    const res = mutateGoals({
      action: data?.action || 'add',
      id: data?.id || '',
      groupId: data?.groupId || 'group-default',
      title: data?.title || '',
      status: data?.status,
      note: data?.note,
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, goal: res.goal, removedId: res.removedId, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/tasks', async (data) => {
  try {
    const res = mutateTasks({
      action: data?.action || 'add',
      id: data?.id || '',
      goalId: data?.goalId || '',
      title: data?.title || '',
      done: data?.done,
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, task: res.task, removedId: res.removedId, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/board', async (data) => {
  try {
    const entry = postBoardItem({
      author: data?.author || 'Coordinator',
      kind: data?.kind || 'progress',
      summary: data?.summary || '',
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, entry, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/identity', async (data) => {
  try {
    const identity = saveIdentity({
      name: data?.name,
      role: data?.role,
      identityMd: data?.identityMd,
      soulMd: data?.soulMd,
    });
    const snapshot = await buildSnapshotPayload();
    return { ok: true, identity, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/voice/status', async () => {
  try {
    return { ok: true, voiceStatus: getPublicVoiceStatus() };
  } catch (err) {
    return safeErr(err);
  }
}, 'GET');

app.api('/api/voice/prefs', async (data) => {
  try {
    const voiceStatus = saveVoicePrefs(data || {});
    const snapshot = await buildSnapshotPayload();
    return { ok: true, voiceStatus, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/voice/live-turn', async (data) => {
  try {
    const res = await processCoordinatorTurn({
      prompt: data?.prompt || '',
      audioBase64: data?.audioBase64 || '',
      mimeType: data?.mimeType || '',
      source: data?.source || 'text',
      requestedMode: data?.mode || '',
    });
    const snapshot = await buildSnapshotPayload();
    return { ...res, snapshot };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

app.api('/api/voice/tts', async (data) => {
  try {
    const ttsAudio = await synthesizeGeminiTtsAudio({
      text: data?.text || '',
      voiceName: data?.voiceName || '',
    });
    return { ok: Boolean(ttsAudio), ttsAudio };
  } catch (err) {
    return safeErr(err);
  }
}, 'POST');

// Auto-reload sidecar when plugin files are updated on disk (`restart_policy: "always"` respawns cleanly)
const WATCHED_FILES = [
  fileURLToPath(import.meta.url),
  path.join(__dirname, 'app.js'),
  path.join(__dirname, '..', '..', 'scripts', 'coord_core.mjs'),
];
const BOOT_MTIMES = new Map(
  WATCHED_FILES.map((fp) => {
    try {
      return [fp, fs.statSync(fp).mtimeMs];
    } catch {
      return [fp, 0];
    }
  })
);
setInterval(() => {
  for (const [fp, bootMtime] of BOOT_MTIMES.entries()) {
    try {
      const cur = fs.statSync(fp).mtimeMs;
      if (bootMtime > 0 && cur !== bootMtime) {
        process.exit(0);
      }
    } catch {}
  }
}, 2500).unref();

app.run();
