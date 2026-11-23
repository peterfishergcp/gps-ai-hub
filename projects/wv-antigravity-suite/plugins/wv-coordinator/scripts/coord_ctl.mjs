#!/usr/bin/env node
/**
 * AGY Coordinator CLI (`coord_ctl.mjs`)
 *
 * Zero-dependency Node CLI for managing Workers, 2-level Group -> Goal -> Task
 * hierarchy, Update Board, IDENTITY.md / SOUL.md persona, and Voice preferences
 * strictly inside `~/.gemini/config/plugin_data/agy-coordinator/`.
 */

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
  updateWorkerMeta,
} from './coord_core.mjs';

function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const eqIdx = arg.indexOf('=');
    if (eqIdx > 2) {
      const k = arg.slice(2, eqIdx);
      flags[k] = arg.slice(eqIdx + 1);
      continue;
    }
    const k = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[k] = next;
      i += 1;
    } else {
      flags[k] = true;
    }
  }
  return { positionals, flags };
}

function printJson(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function usage() {
  process.stdout.write(`AGY Coordinator CLI (coord_ctl.mjs)

Usage:
  coord_ctl.mjs status
  coord_ctl.mjs workers list [--include-archived]
  coord_ctl.mjs workers spawn --prompt "<text>" [--title "<title>"] [--model "<id>"] [--group "<groupId>"]
  coord_ctl.mjs workers relay --id "<convId>" --message "<text>" [--title "<title>"]
  coord_ctl.mjs workers meta --id "<convId>" [--group "<groupId>"] [--pin] [--unpin] [--add-label "<lbl>"] [--status "<st>"]
  coord_ctl.mjs groups list | add --title "<title>" [--color "<c>"] | rename --id "<id>" --title "<title>" | remove --id "<id>"
  coord_ctl.mjs goals list | add --group "<groupId>" --title "<title>" [--note "<n>"] | update --id "<id>" [--status active|blocked|done] | remove --id "<id>"
  coord_ctl.mjs tasks list [--goal "<goalId>"] | add --goal "<goalId>" --title "<title>" | toggle --id "<id>" | remove --id "<id>"
  coord_ctl.mjs board list | post "<summary>" [--kind progress|relay|spawn|blocker|ready] [--author "<name>"]
  coord_ctl.mjs identity get | set [--name "<name>"] [--role "<role>"]
  coord_ctl.mjs voice status | set [--mode browser|gemini-live] [--model "<model>"] [--gcloud-adc true|false] [--tts true|false]
  coord_ctl.mjs chat --prompt "<message>" [--mode browser|gemini-live]
`);
}

async function main() {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const [cmd, sub, rest] = positionals;

  if (!cmd || cmd === 'help' || flags.help) {
    usage();
    return;
  }

  if (cmd === 'status') {
    const state = loadState();
    const identity = loadIdentity();
    const workersRes = await getMergedWorkers();
    const voice = getPublicVoiceStatus();
    printJson({
      ok: true,
      dataDir: getDataDir(),
      assistant: { name: identity.name, role: identity.role },
      lsStatus: workersRes.lsStatus,
      counts: {
        workers: workersRes.workers.length,
        groups: state.groups.length,
        goals: state.goals.length,
        tasks: state.tasks.length,
        board: state.board.length,
      },
      voice,
    });
    return;
  }

  if (cmd === 'workers') {
    if (!sub || sub === 'list') {
      const res = await getMergedWorkers({ includeArchived: Boolean(flags['include-archived']) });
      printJson({ ok: true, ...res });
      return;
    }
    if (sub === 'spawn') {
      const res = await spawnWorker({
        prompt: flags.prompt || rest,
        title: flags.title || '',
        model: flags.model || '',
        groupId: flags.group || 'group-default',
      });
      printJson(res);
      return;
    }
    if (sub === 'relay') {
      const res = await relayToWorker({
        convId: flags.id,
        message: flags.message || rest,
        title: flags.title || '',
      });
      printJson(res);
      return;
    }
    if (sub === 'meta') {
      const pinned = flags.pin ? true : flags.unpin ? false : undefined;
      const res = updateWorkerMeta({
        convId: flags.id,
        groupId: flags.group,
        pinned,
        addLabel: flags['add-label'],
        removeLabel: flags['remove-label'],
        customStatus: flags.status,
        note: flags.note,
      });
      printJson({ ok: true, workerMeta: res });
      return;
    }
  }

  if (cmd === 'groups') {
    if (!sub || sub === 'list') {
      printJson({ ok: true, groups: loadState().groups });
      return;
    }
    if (sub === 'add' || sub === 'rename' || sub === 'remove') {
      const res = mutateGroups({ action: sub, id: flags.id, title: flags.title || rest, color: flags.color });
      printJson({ ok: true, ...res });
      return;
    }
  }

  if (cmd === 'goals') {
    if (!sub || sub === 'list') {
      printJson({ ok: true, goals: loadState().goals });
      return;
    }
    if (sub === 'add' || sub === 'update' || sub === 'remove') {
      const res = mutateGoals({
        action: sub,
        id: flags.id,
        groupId: flags.group,
        title: flags.title || rest,
        status: flags.status,
        note: flags.note,
      });
      printJson({ ok: true, ...res });
      return;
    }
  }

  if (cmd === 'tasks') {
    if (!sub || sub === 'list') {
      const all = loadState().tasks;
      const tasks = flags.goal ? all.filter((t) => t.goalId === flags.goal) : all;
      printJson({ ok: true, tasks });
      return;
    }
    if (sub === 'add' || sub === 'toggle' || sub === 'update' || sub === 'remove') {
      const res = mutateTasks({
        action: sub,
        id: flags.id,
        goalId: flags.goal,
        title: flags.title || rest,
      });
      printJson({ ok: true, ...res });
      return;
    }
  }

  if (cmd === 'board') {
    if (!sub || sub === 'list') {
      printJson({ ok: true, board: loadState().board });
      return;
    }
    if (sub === 'post') {
      const entry = postBoardItem({
        author: flags.author || 'Worker',
        kind: flags.kind || 'progress',
        summary: flags.summary || rest,
      });
      printJson({ ok: true, entry });
      return;
    }
  }

  if (cmd === 'identity') {
    if (!sub || sub === 'get') {
      printJson({ ok: true, identity: loadIdentity() });
      return;
    }
    if (sub === 'set') {
      const updated = saveIdentity({ name: flags.name, role: flags.role });
      printJson({ ok: true, identity: updated });
      return;
    }
  }

  if (cmd === 'voice') {
    if (!sub || sub === 'status') {
      printJson({ ok: true, voice: getPublicVoiceStatus() });
      return;
    }
    if (sub === 'set') {
      const updated = saveVoicePrefs({
        mode: flags.mode,
        model: flags.model,
        useGcloudAdc: flags['gcloud-adc'] !== undefined ? flags['gcloud-adc'] === 'true' : undefined,
        ttsEnabled: flags.tts !== undefined ? flags.tts === 'true' : undefined,
      });
      printJson({ ok: true, voice: updated });
      return;
    }
  }

  if (cmd === 'chat') {
    const res = await processCoordinatorTurn({
      prompt: flags.prompt || sub || rest,
      source: 'cli',
      requestedMode: flags.mode || '',
    });
    printJson(res);
    return;
  }

  usage();
  process.exitCode = 2;
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }) + '\n');
  process.exitCode = 1;
});
