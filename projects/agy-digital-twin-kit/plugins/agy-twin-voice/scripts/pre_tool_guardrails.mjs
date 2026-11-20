#!/usr/bin/env node
/**
 * Fast (<50ms) PreToolUse Guardrail Hook for Google Antigravity (`pre_tool_guardrails.mjs`).
 *
 * Blocks:
 *   1. Whole-directory unauthenticated HTTP file servers (`python -m http.server` on 0.0.0.0)
 *   2. Public Cloud Run deploys using `--allow-unauthenticated` without an explicit `--service-account`
 *   3. Writing raw private keys into workspace files
 */

import fs from 'node:fs';

function deny(reason) {
  console.log(
    JSON.stringify({
      decision: 'block',
      reason,
    })
  );
  process.exit(0);
}

function main() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf-8');
  } catch {
    process.exit(0);
  }
  if (!raw.trim()) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolName = String(payload.tool_name || payload.toolName || '');
  const input = payload.tool_input || payload.toolInput || {};
  const cmd = String(input.CommandLine || input.command || '');
  const content = String(input.Content || input.Replacement || input.content || '');

  if (toolName === 'run_command' && cmd) {
    if (/http\.server\b/.test(cmd) && /0\.0\.0\.0/.test(cmd)) {
      deny('Blocked binding python http.server to 0.0.0.0 (exposes directory contents on network interfaces). Bind to 127.0.0.1 or use an explicit static handler.');
    }
    if (/gcloud\s+run\s+deploy\b/.test(cmd) && /--allow-unauthenticated\b/.test(cmd) && !/--service-account\b/.test(cmd)) {
      deny('Blocked public Cloud Run deploy without a dedicated --service-account (prevents exposing the Default Compute Service Account).');
    }
  }

  if ((toolName === 'write_file' || toolName === 'edit_file') && content) {
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
      deny('Blocked writing a raw private key into a file. Store secrets in Secret Manager or an ignored local credential store.');
    }
  }

  process.exit(0);
}

main();
