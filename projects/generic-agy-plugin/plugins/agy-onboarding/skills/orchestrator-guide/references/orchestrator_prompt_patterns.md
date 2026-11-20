# Orchestrator Prompt Patterns & Public Sector / Engineering Recipes

Companion reference for `/orchestrator-guide` (`https://antigravity.google/docs/models#orchestrator`). Every template below is structured specifically to maximize **Stage 1 Read-Only Planner** clarity and trigger **Stage 3 Hydrogen -> Planner** automatic recovery whenever a verification check fails.

---

## Pattern 1 — Multi-File Feature Build + Deterministic Test Gate (`Orchestrator (Neon)`)

> **Why this works with Orchestrator:** Gives the Planner clear file boundaries + invariants for its read-only pass, and gives `Gemini 4 Hydrogen` an explicit command whose failure triggers automatic Planner re-planning.

```text
Implement [FEATURE DESCRIPTION] in [TARGET DIRECTORY / MODULE].

Constraints & Invariants:
- Preserve existing public API signatures in [FILE/INTERFACE].
- Do not add external dependencies or hardcode secrets/URLs.
- Follow existing error-handling and validation patterns in this repo.

Verification Gate:
- Add unit/integration tests covering happy path + invalid input edge cases.
- Run [TEST COMMAND, e.g., npm test / pytest / go test ./...] until 100% green before wrapping up.
```

---

## Pattern 2 — Legacy Module Refactoring with A/B Parity (`Orchestrator (Argon)` or `Orchestrator (Carbon)`)

> **Why this works with Orchestrator:** `Gemini 4 Argon` / `Carbon` maps cross-file couplings during Stage 1 read-only inspection, while `Gemini 4 Hydrogen` performs mechanical extraction and parity test runs rapidly.

```text
Refactor [LEGACY FILE / SERVICE] into modular components under [TARGET PATH] without changing external behavior.

1. First inspect all callers, shared state, and edge cases, and establish baseline behavior.
2. Execute the extraction incrementally so the build stays green after each module move.
3. Verify A/B input-output parity by running [TEST / GOLDEN SCRIPT] and confirm zero regressions.
```

---

## Pattern 3 — Public Sector Executive Dashboard / Branded App (`Orchestrator (Neon)`)

> **Why this works with Orchestrator:** The Planner designs the KPI schema, layout hierarchy, and compliance scrubbing rules once; Hydrogen scaffolds the HTML/CSS/JS and runs validation checks quickly.

```text
/agy-dashboard Build an interactive Public Sector executive dashboard for [PROGRAM / INITIATIVE] using [DATA SOURCE / UPLOADED CSV].

Requirements:
- Include top-line KPI cards, regional/category breakdown charts, and an action-item register.
- Render as a 100% self-contained HTML artifact in the Side Pane and Preview panel (zero local TCP ports, zero external unpinned scripts, pure safe DOM APIs).
- Verify all JavaScript passes `node --check` and contains zero internal placeholders or broken links.
```

---

## Pattern 4 — Root-Cause Bug Triage & Fix (`Orchestrator (Argon)`)

```text
Diagnose and fix the root cause of this issue: [PASTE ERROR / SYMPTOM].

- During planning, trace the exact call path and confirm the root cause before editing code (do not apply speculative workarounds).
- Write a minimal regression test that fails before the fix and passes after the fix.
- Run the full affected test suite to verify no side effects.
```

---

## Pattern 5 — Mid-Flight Steering (While `Gemini 4 Hydrogen` Is Running)

When Orchestrator is mid-implementation and you want to refine scope **without** canceling and losing progress, send a concise steering note—Hydrogen will immediately report its progress to the Planner to adjust the plan:

```text
Keep the database layer changes you just finished, and also make sure empty date strings return a 400 validation error with a test case before wrapping up.
```
