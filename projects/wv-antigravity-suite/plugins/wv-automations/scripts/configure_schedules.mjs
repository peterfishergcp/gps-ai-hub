#!/usr/bin/env node
/**
 * Updates IANA `CRON_TZ` across all bundled `agy-twin-automations` schedule sidecars.
 *
 * Usage:
 *   node configure_schedules.mjs --timezone America/Chicago
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIDECARS_DIR = path.resolve(__dirname, '..', 'sidecars');
const IANA_TZ_RE = /^[A-Za-z_]+\/[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)?$/;

function main() {
  const args = process.argv.slice(2);
  let tz = '';
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--timezone' && args[i + 1]) {
      tz = args[i + 1].trim();
      i += 1;
    }
  }
  if (!tz || !IANA_TZ_RE.test(tz)) {
    throw new Error('Provide a valid IANA timezone such as --timezone America/New_York or --timezone America/Chicago');
  }

  const updated = [];
  for (const dir of fs.readdirSync(SIDECARS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const scPath = path.join(SIDECARS_DIR, dir.name, 'sidecar.json');
    if (!fs.existsSync(scPath)) continue;
    const spec = JSON.parse(fs.readFileSync(scPath, 'utf-8'));
    if (Array.isArray(spec.args) && typeof spec.args[0] === 'string') {
      spec.args[0] = spec.args[0].replace(/^CRON_TZ=[^\s]+\s+/, `CRON_TZ=${tz} `);
      fs.writeFileSync(scPath, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
      updated.push({ id: dir.name, cron: spec.args[0] });
    }
  }
  console.log(JSON.stringify({ ok: true, timezone: tz, updated }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
