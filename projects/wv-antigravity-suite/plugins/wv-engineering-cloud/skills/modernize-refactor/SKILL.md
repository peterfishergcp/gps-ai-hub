---
name: modernize-refactor
description: Refactors, modernizes, or migrates legacy applications using a stage-gated 3-phase engineering protocol (Stage 0 Untrusted Build Inspection Gate, Stage 1 6-Section Architectural Blueprint & Latent Bug Audit, Stage 2 Bounded 5-Iteration Crucible + A/B Output Parity + HTML Migration Report) across Python, TypeScript, Go, Java, or Safe Rust. Trigger on /modernize-refactor, "refactor this legacy app", "modernize this codebase", or "migrate this code".
---

# Stage-Gated Application Refactoring & Migration (`/modernize-refactor`)

Adapted from Google's **[migrate-to-rust](https://github.com/google/skills/tree/main/skills/developers/migrate-to-rust)** engineering discipline and generalized for State of West Virginia application modernization across **Cloud Run Python/FastAPI, TypeScript/Node, Go, Java, or Safe Rust**.

Never jump straight into rewriting files blindly. Execute these **3 strict stages** in order:

---

## Stage 0: Legacy Build & Execution Safety Gate
1. Inspect existing build/dependency manifests (`package.json`, `requirements.txt`, `pom.xml`, `.csproj`, `Makefile`, `Dockerfile`, `.sql`) **using read-only file reads first** before running any command.
2. Check for suspicious pre/post-install hooks, hardcoded production database strings, or destructive scripts.
3. Ask explicit user confirmation before executing any legacy build/test command—or generate clean synthetic test fixtures if the legacy runtime isn't installed on the state laptop!

---

## Stage 1: 6-Section Modernization Blueprint & Latent Bug Audit
Read `./references/blueprint_and_parity_checklist.md` and present a concise **`BLUEPRINT.md`** (or artifact) for quick alignment before multi-file rewrites:
1. **System Inventory & Entry Points** (routes, CLI flags, batch jobs, DB tables, external APIs).
2. **State, Concurrency & Data Flow Model** (how sessions, transactions, and errors propagate).
3. **Latent Bug & Security Debt Ledger** (SQL concatenation, hardcoded credentials, silent catch blocks, Y2K/timezone bugs, race conditions discovered in the legacy code—tagged `[FIX IN TARGET]` vs. `[PRESERVE FOR PARITY]`).
4. **Target Stack & Module Mapping** (`Legacy File -> Modern Cloud-Ready Module`, idioms, zero-bloat standard-library choices; if migrating to Rust, enforce `#![forbid(unsafe_code)]` at crate root unless FFI is explicitly approved).
5. **12-Factor Cloud Run Readiness** (stateless HTTP, `PORT` env var, structured JSON logging, Secret Manager config, `/healthz` probe).
6. **A/B Parity Verification Plan** (exact golden inputs -> expected outputs).

---

## Stage 2: Bounded Self-Healing Crucible (`<= 5` Iterations) & Parity Summary
1. Implement the refactored modules cleanly, preserving clear module boundaries and unit tests.
2. Run build/lint/tests in a **bounded self-healing loop (max 5 iterations per failure class)**—fixing root causes rather than suppressing compiler/linter warnings.
3. Verify **A/B functional output parity** on representative inputs (explicitly documenting where intentional security/bug fixes alter legacy broken behavior).
4. Generate a zero-install **`migration-summary.html`** executive visual report comparing Before vs. After architecture, fixed vulnerabilities, test coverage, and Cloud Run deployment readiness!
