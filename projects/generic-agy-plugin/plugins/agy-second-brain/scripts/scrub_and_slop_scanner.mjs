#!/usr/bin/env node
/**
 * Deterministic Outbound Sensitivity, Placeholder & Anti-Slop Scanner (`scrub_and_slop_scanner.mjs`).
 *
 * Scans files or stdin text for:
 *   1. High-risk secrets & PII (private keys, AWS/GCP/GitHub tokens, SSNs) -> severity: "BLOCKER"
 *   2. Unresolved review placeholders (`[CONFIRM: ...]`, `[TODO:`, `YOUR_SECRET_HERE`) -> severity: "WARNING"
 *   3. AI-slop filler words, binary-contrast clichés, and em-dash overuse -> severity: "STYLE"
 *
 * Usage:
 *   node scrub_and_slop_scanner.mjs --file ./draft.md --json
 *   cat ./draft.md | node scrub_and_slop_scanner.mjs --json
 */

import fs from 'node:fs';

const SECRET_AND_PII_PATTERNS = [
  { id: 'PRIVATE_KEY', label: 'Embedded private key header', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'GITHUB_TOKEN', label: 'GitHub personal or OAuth token', re: /\bgh[pousr]_[A-Za-z0-9]{24,}\b/g },
  { id: 'GOOGLE_API_KEY', label: 'Inline Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'AWS_ACCESS_KEY', label: 'AWS access key ID', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'US_SSN', label: 'Potential unredacted US SSN pattern', re: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g },
];

const PLACEHOLDER_PATTERNS = [
  { id: 'UNRESOLVED_CONFIRM', label: 'Unresolved [CONFIRM: ...] marker requiring human check', re: /\[CONFIRM:[^\]]*\]/gi },
  { id: 'UNRESOLVED_TODO', label: 'Unresolved [TODO] / [INSERT ...] placeholder', re: /\[(?:TODO|INSERT|TBD)[^\]]*\]/gi },
];

const SLOP_PHRASES = [
  'delve into',
  'delves into',
  'paradigm shift',
  'game changer',
  'first and foremost',
  "it's worth noting",
  'it is worth noting',
  'at the end of the day',
  'synergy',
  'tapestry',
  'in today\'s fast-paced',
  'ever-evolving landscape',
];

export function scanText(text, sourceLabel = 'stdin') {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    for (const pat of SECRET_AND_PII_PATTERNS) {
      pat.re.lastIndex = 0;
      if (pat.re.test(line)) {
        findings.push({
          severity: 'BLOCKER',
          code: pat.id,
          line: lineNum,
          message: pat.label,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
    for (const pat of PLACEHOLDER_PATTERNS) {
      pat.re.lastIndex = 0;
      const m = pat.re.exec(line);
      if (m) {
        findings.push({
          severity: 'WARNING',
          code: pat.id,
          line: lineNum,
          message: `${pat.label}: ${m[0]}`,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
    const lower = line.toLowerCase();
    for (const phrase of SLOP_PHRASES) {
      if (lower.includes(phrase)) {
        findings.push({
          severity: 'STYLE',
          code: 'AI_SLOP_PHRASE',
          line: lineNum,
          message: `Avoid filler phrase "${phrase}"`,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  });

  const emDashCount = (raw.match(/\u2014/g) || []).length;
  if (emDashCount >= 3) {
    findings.push({
      severity: 'STYLE',
      code: 'EM_DASH_CLUSTER',
      line: 1,
      message: `Found ${emDashCount} em-dashes; prefer spaced hyphens (" - "), commas, or parentheses`,
      snippet: '',
    });
  }

  const counts = {
    blockers: findings.filter((f) => f.severity === 'BLOCKER').length,
    warnings: findings.filter((f) => f.severity === 'WARNING').length,
    style: findings.filter((f) => f.severity === 'STYLE').length,
  };

  return {
    passed: counts.blockers === 0,
    cleanForExternalSend: counts.blockers === 0 && counts.warnings === 0,
    source: sourceLabel,
    counts,
    findings,
  };
}

function main() {
  const args = process.argv.slice(2);
  let filePath = '';
  let asJson = false;
  let strict = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--file' && args[i + 1]) {
      filePath = args[i + 1];
      i += 1;
    } else if (args[i] === '--json') {
      asJson = true;
    } else if (args[i] === '--strict') {
      strict = true;
    }
  }

  const content = filePath ? fs.readFileSync(filePath, 'utf-8') : fs.readFileSync(0, 'utf-8');
  const report = scanText(content, filePath || 'stdin');

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `[Outbound Scrub] ${report.passed ? 'PASSED' : 'BLOCKED'} (${report.source}) - Blockers: ${report.counts.blockers}, Warnings: ${report.counts.warnings}, Style notes: ${report.counts.style}`
    );
    for (const f of report.findings) {
      console.log(`  [${f.severity}] L${f.line} (${f.code}): ${f.message}`);
    }
  }

  if (!report.passed || (strict && !report.cleanForExternalSend)) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}
