#!/usr/bin/env node
/**
 * Command-line interface for Antigravity Personal Memory & Action Items (`vault_cli.mjs`).
 *
 * Usage examples:
 *   node vault_cli.mjs init --role pm --name "Alex Rivera" --org "State Digital Service" --seed-demo
 *   node vault_cli.mjs status --json
 *   node vault_cli.mjs gtd-add --initiative "portal-modernization" --priority P0 --task "Send SSO checklist"
 *   node vault_cli.mjs gtd-toggle --line 7
 *   node vault_cli.mjs touch-contact --name "Marcus Chen"
 *   node vault_cli.mjs init-initiative --slug "api-gateway" --title "API Gateway Rollout" --rag GREEN
 *   node vault_cli.mjs ingest-notes --slug "portal-modernization" --title "Design Sync" --file ./notes.md
 */

import fs from 'node:fs';
import {
  ROLE_PRESETS,
  addGtdTask,
  createOrUpdateInitiative,
  getVaultRoot,
  getVaultState,
  ingestMeetingNotes,
  initializeVault,
  toggleGtdTask,
  touchContact,
} from './vault_core.mjs';

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 2) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          flags[key] = next;
          i += 1;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { cmd: positional[0] || 'status', flags };
}

function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  const vaultRoot = getVaultRoot(typeof flags['vault-dir'] === 'string' ? flags['vault-dir'] : '');

  if (cmd === 'help' || flags.help) {
    console.log(
      [
        'Antigravity Personal Memory & Action Items CLI',
        '',
        'Commands:',
        '  init [--role pm|developer|public-sector|leader] [--name "..."] [--role-title "..."] [--org "..."] [--timezone "..."] [--seed-demo|--no-demo] [--force]',
        '  status [--json]',
        '  action-add --task "..." [--initiative "..."] [--priority P0|P1|P2|P3] [--owner "..."]',
        '  action-toggle [--line <N> | --match "..."]',
        '  touch-contact --name "..." [--date YYYY-MM-DD]',
        '  init-initiative --title "..." [--slug "..."] [--rag GREEN|AMBER|RED] [--milestone "..."] [--summary "..."]',
        '  ingest-notes --slug "..." [--title "..."] [--file <path>]',
        '',
        `Available role presets: ${Object.keys(ROLE_PRESETS).join(', ')}`,
      ].join('\n')
    );
    return;
  }

  if (cmd === 'init') {
    const seedDemo = flags['no-demo'] ? false : true;
    const res = initializeVault({
      vaultDir: vaultRoot,
      role: String(flags.role || 'pm'),
      name: typeof flags.name === 'string' ? flags.name : '',
      roleTitle: typeof flags['role-title'] === 'string' ? flags['role-title'] : '',
      org: typeof flags.org === 'string' ? flags.org : '',
      timezone: typeof flags.timezone === 'string' ? flags.timezone : '',
      seedDemo,
      force: Boolean(flags.force),
    });
    if (flags.json) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`Initialized Personal Memory at ${res.vaultRoot} (${res.roleLabel})`);
      console.log(
        `Open Action Items: ${res.summary.gtd.counts.open} | Initiatives: ${res.summary.initiatives.length} | Stale contacts (>21d): ${res.summary.contacts.counts.stale}`
      );
    }
    return;
  }

  if (cmd === 'status') {
    const state = getVaultState(vaultRoot);
    if (flags.json) {
      console.log(JSON.stringify(state, null, 2));
    } else {
      console.log(`Memory Root: ${state.vaultRoot} (${state.initialized ? 'Initialized' : 'Uninitialized'})`);
      console.log(`Profile: ${state.profile.name} - ${state.profile.role} (${state.profile.timezone})`);
      console.log(
        `Action Items: ${state.gtd.counts.open} open (P0: ${state.gtd.counts.p0Open}, P1: ${state.gtd.counts.p1Open}, P2: ${state.gtd.counts.p2Open}) | ${state.gtd.counts.completed} completed`
      );
      console.log(`Initiatives (${state.initiatives.length}):`);
      for (const init of state.initiatives) {
        console.log(`  - [${init.rag}] ${init.slug}: ${init.title} (Next: ${init.nextMilestone || 'TBD'})`);
      }
      const stale = state.contacts.contacts.filter((c) => c.isStale);
      console.log(`Stakeholders: ${state.contacts.counts.total} tracked | ${stale.length} STALE (>21d)`);
      for (const s of stale) {
        console.log(`  - STALE: ${s.name} (${s.role}, last touch ${s.lastTouch})`);
      }
    }
    return;
  }

  if (cmd === 'action-add' || cmd === 'gtd-add') {
    const out = addGtdTask(vaultRoot, {
      initiative: typeof flags.initiative === 'string' ? flags.initiative : 'General',
      task: typeof flags.task === 'string' ? flags.task : '',
      priority: typeof flags.priority === 'string' ? flags.priority : 'P0',
      owner: typeof flags.owner === 'string' ? flags.owner : 'Me',
    });
    console.log(flags.json ? JSON.stringify(out, null, 2) : `Added: ${out.addedLine}`);
    return;
  }

  if (cmd === 'action-toggle' || cmd === 'gtd-toggle') {
    const out = toggleGtdTask(vaultRoot, {
      lineNumber: flags.line ? Number(flags.line) : undefined,
      rawMatch: typeof flags.match === 'string' ? flags.match : undefined,
    });
    console.log(flags.json ? JSON.stringify(out, null, 2) : `Updated line ${out.lineNumber}: ${out.updatedLine}`);
    return;
  }

  if (cmd === 'touch-contact') {
    const out = touchContact(vaultRoot, {
      name: typeof flags.name === 'string' ? flags.name : '',
      date: typeof flags.date === 'string' ? flags.date : '',
    });
    console.log(flags.json ? JSON.stringify(out, null, 2) : `Updated ${out.updatedCount} contact(s) to ${out.date}`);
    return;
  }

  if (cmd === 'init-initiative') {
    const out = createOrUpdateInitiative(vaultRoot, {
      slug: typeof flags.slug === 'string' ? flags.slug : '',
      title: typeof flags.title === 'string' ? flags.title : 'New Initiative',
      rag: typeof flags.rag === 'string' ? flags.rag : 'GREEN',
      milestone: typeof flags.milestone === 'string' ? flags.milestone : 'TBD',
      summary: typeof flags.summary === 'string' ? flags.summary : '',
      force: Boolean(flags.force),
    });
    console.log(flags.json ? JSON.stringify(out, null, 2) : `Created 4-file initiative at ${out.path}`);
    return;
  }

  if (cmd === 'ingest-notes') {
    let rawNotes = '';
    if (typeof flags.file === 'string') {
      rawNotes = fs.readFileSync(flags.file, 'utf-8');
    } else {
      rawNotes = fs.readFileSync(0, 'utf-8');
    }
    const out = ingestMeetingNotes(vaultRoot, {
      slug: typeof flags.slug === 'string' ? flags.slug : '',
      title: typeof flags.title === 'string' ? flags.title : 'Meeting Notes',
      rawNotes,
      date: typeof flags.date === 'string' ? flags.date : '',
      owner: typeof flags.owner === 'string' ? flags.owner : 'Me',
    });
    console.log(
      flags.json
        ? JSON.stringify(out, null, 2)
        : `Ingested notes into ${out.notesPath} (extracted ${out.extractedTasksCount} action items to action_items.md)`
    );
    return;
  }

  throw new Error(`Unknown subcommand: ${cmd}. Run with --help for usage.`);
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
