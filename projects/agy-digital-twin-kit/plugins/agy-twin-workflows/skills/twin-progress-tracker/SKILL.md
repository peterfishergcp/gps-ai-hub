---
name: twin-progress-tracker
description: Live Multi-Step Build & Project Plan Tracker for Google Antigravity. Maintains a structured Plan.md checklist ([x] Done, [~] In Progress, [ ] Queued) and an explicit labelled resource/deliverable manifest across long coding, data pipeline, dashboard, or policy-pack builds so progress is always transparent. Trigger on /twin-progress-tracker, "track this build with Plan.md", or during multi-phase implementation tasks.
---

# Live Build & Project Plan Tracker (`/twin-progress-tracker`)

Keep multi-step engineering, analytics, research, and document builds transparent so the user never has to guess what phase is running or which files and resources were created.

## Operating Cadence

1. **Kickoff (`Plan.md`):**
   - At the start of a multi-phase build, create `Plan.md` in the workspace or artifact directory with:
     - **Objective & Target Deliverables**
     - **Phase Checklist** using `- [x]` (Completed), `- [~]` (In Progress), and `- [ ]` (Queued)
     - **Labelled Resource Manifest** tracking every created or modified artifact with an explicit bracketed type tag (for example `[Source File]`, `[SQL Query]`, `[Config]`, `[Test Suite]`, `[Dashboard HTML]`, `[Vault Note]`).
2. **Milestone Updates:**
   - As each phase completes (or every ~10 minutes on long builds), update the checkboxes and resource manifest in `Plan.md` and give a concise 3-bullet status summary in chat (`X/Y phases complete`, what just finished, and what runs next).
3. **Completion Sign-Off:**
   - Mark all verified phases `[x]` in `Plan.md`, record test/verification results, and log any durable deliverable or reusable pattern into `~/antigravity-twin/memory/`.
