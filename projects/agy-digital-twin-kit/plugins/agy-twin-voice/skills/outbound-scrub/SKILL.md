---
name: outbound-scrub
description: Runs deterministic outbound safety, PII/secret, unresolved-placeholder, and anti-slop checks on any external email, memo, code sample, or customer/constituent deliverable before sharing. Trigger on /outbound-scrub, "scrub this before sending", or "check this deliverable for sensitive data".
---

# Outbound Deliverable Safety & Scrubbing Audit (`/outbound-scrub`)

Verify that any externally shared email, report, deck, or code snippet is clean before it leaves the user's workstation.

## Audit Execution (Locked-Down Windows Laptop Safe)

1. **Check `node` Availability Before Invoking CLI:**
   - On locked-down corporate Windows laptops where `node` is **not** on `PATH`, do **not** fail on a missing `node` binary - read the target file/draft directly and execute the exact deterministic line-by-line regex, placeholder, and anti-slop scan in Step 2 yourself.
   - Only when `node` is available on `PATH`, run the bundled scanner CLI:
     ```bash
     node ~/.gemini/config/plugins/agy-twin-voice/scripts/scrub_and_slop_scanner.mjs --file <path> --json
     ```

2. **Deterministic Scan Rules (Identical Across CLI & Direct Agent Execution):**
   Evaluate every line (`1..N`) against the exact ruleset enforced by `scrub_and_slop_scanner.mjs` plus the 4-point outbound rubric:
   - **`BLOCKER` - Secrets, Credentials & Unredacted PII (`0` Allowed):**
     - `PRIVATE_KEY`: `/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/`
     - `GITHUB_TOKEN`: `/\bgh[pousr]_[A-Za-z0-9]{24,}\b/`
     - `GOOGLE_API_KEY`: `/\bAIza[0-9A-Za-z_-]{35}\b/`
     - `AWS_ACCESS_KEY`: `/\bAKIA[0-9A-Z]{16}\b/`
     - `US_SSN`: `/\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/`
     - Also flag any OAuth bearer tokens, database connection passwords, internal hostnames/IPs, personal phone numbers, home addresses, financial account numbers, or raw project/environment IDs (replace with `YOUR_PROJECT_ID` / `YOUR_ORG_ID`).
   - **`WARNING` - Unresolved Placeholders (`0` Before Final Send):**
     - `UNRESOLVED_CONFIRM`: `/\[CONFIRM:[^\]]*\]/i`
     - `UNRESOLVED_TODO`: `/\[(?:TODO|INSERT|TBD)[^\]]*\]/i`
   - **`STYLE` - Anti-AI-Slop & Clarity Check:**
     - Flag banned filler phrases (case-insensitive): `delve into`, `delves into`, `paradigm shift`, `game changer`, `first and foremost`, `it's worth noting`, `it is worth noting`, `at the end of the day`, `synergy`, `tapestry`, `in today's fast-paced`, `ever-evolving landscape`.
     - `EM_DASH_CLUSTER`: Flag when total em-dashes (`\u2014`) across the document is `>= 3` (prefer spaced hyphens `" - "`, commas, or parentheses).
     - Verify every external URL is complete and accurate.

3. **Output Scorecard:**
   Return a short `PASS / ACTION NEEDED` table listing exact line numbers, severity (`BLOCKER` / `WARNING` / `STYLE`), and rule code for any findings alongside a clean, ready-to-share version.
