---
name: outbound-scrub
description: Runs deterministic outbound safety, PII/secret, unresolved-placeholder, and anti-slop checks on any external email, memo, code sample, or customer/constituent deliverable before sharing. Includes both scrub_and_slop_scanner.mjs and an inline zero-Node regex fallback for locked-down corporate Windows laptops. Trigger on /outbound-scrub, "scrub this before sending", or "check this deliverable for sensitive data".
---

# Outbound Deliverable Safety & Scrubbing Audit (`/outbound-scrub`)

Verify that any externally shared email, report, deck, or code snippet is clean before it leaves the user's workstation.

## Audit Execution (Node CLI First -> Zero-Node Inline Regex Fallback)

1. **Option A — Run the Deterministic Scanner (When `node` Is on `PATH`):**
   ```bash
   node ~/.gemini/config/plugins/wv-second-brain/scripts/scrub_and_slop_scanner.mjs --file <path> --json
   ```
2. **Option B — Zero-Node Inline Regex Fallback (Locked-Down Corporate Windows/macOS Laptops Without `node` on `PATH`):**
   Never fail or block if `node` is unavailable in the user's shell! Read the target text or file directly and evaluate every line against these exact deterministic patterns:
   - **BLOCKER — Secrets & PII (`0` Allowed):**
     - Private key headers: `/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/`
     - GitHub tokens: `/\bgh[pousr]_[A-Za-z0-9]{24,}\b/`
     - Inline Google API keys: `/\bAIza[0-9A-Za-z_-]{35}\b/`
     - AWS access key IDs: `/\bAKIA[0-9A-Z]{16}\b/`
     - Unredacted US SSNs: `/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/`
     - Also replace internal sandbox/environment IDs, database passwords, or internal hostnames in shareable snippets with `YOUR_PROJECT_ID` / `YOUR_ORG_ID`.
   - **WARNING — Unresolved Placeholders (`0` Before Final Send):**
     - `/\[CONFIRM:[^\]]*\]/i` and `/\[(?:TODO|INSERT|TBD)[^\]]*\]/i` — flag line numbers so the human author resolves them before sending.
   - **STYLE — AI-Slop Clichés & Em-Dash Clusters:**
     - Flag banned phrases (`delve into`, `delves into`, `paradigm shift`, `game changer`, `first and foremost`, `it's worth noting`, `it is worth noting`, `at the end of the day`, `synergy`, `tapestry`, `in today's fast-paced`, `ever-evolving landscape`), binary-contrast gimmicks (*"It's not X. It's Y."*), and `>= 3` em-dashes (`—`).

## Output Scorecard

Return a concise `PASSED / ACTION NEEDED` table (`Severity | Line | Code | Finding & Fix`) followed by a clean, ready-to-share `[Draft: ...]` version.
