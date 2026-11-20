# AGY Second Brain — Memory Vault, Swarm Prep & Anti-Slop (`agy-second-brain`)

Adds a persistent **2-Tier Second Brain Memory Vault** (`~/antigravity-twin/memory/`), interactive **`Twin Vault`** side-pane UI (`Extensions -> Twin Vault`), 4-agent parallel swarm orchestration, adversarial pre-meeting coaching, and deterministic anti-slop / outbound scrubbing to the Public Sector Antigravity suite—with **zero command duplication** alongside `agy-onboarding` (`/agy-onboard`, `/daily-brief`, `/digital-twin`) and `agy-connectors` (`agy-ge-bridge`).

## Included Slash Skills (8)
- **`/twin-memory`** — Initialize, inspect, search, and update `~/antigravity-twin/memory/` (role presets: `public-sector`, `pm`, `developer`, `leader`; Zero-Task-Decay `gtd_board.md`; `>21d` stakeholder staleness in `contacts.md`; and 4-file isolated `initiatives/<slug>/`).
- **`/twin-meeting-notes`** — Ingest call transcripts or notes, strip base64 bloat, apply **4-Tier Recency Compaction** (`0-7d`, `8-30d`, `31-90d`, `90d+`) to `running_notes.md`, extract action items to `gtd_board.md`, and update `Last_Touch_Date` in `contacts.md`.
- **`/twin-jit-prep`** — T-15m 1-card pre-meeting brief plus an **Adversarial Minto Pyramid (SCQA) Critic** (*Situation -> Complication -> Hard Question -> Counter-Move*).
- **`/twin-followup-plan`** — Sweeps open commitments (auditing already-sent replies first), writes `followups/latest_action_plan.md`, syncs `gtd_board.md`, and stages `[Draft-Only]` replies.
- **`/twin-swarm-prep`** — Launches 4 bundled subagents concurrently (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`) for ~60-second 360-degree milestone prep.
- **`/twin-weekly-impact`** — Friday closeout across **3 Altitudes** (Executive Outcomes, Cross-Team Reusable Assets, Workstream Velocity), saving `weekly/YYYY-WXX.md` and `impact/ledger.json`.
- **`/no-ai-slop`** — Hardlined anti-slop editor cutting 17 common LLM clichés, binary-contrast gimmicks, and em-dash clusters while protecting exact figures and citations.
- **`/outbound-scrub`** — Deterministic secret, PII, unresolved-placeholder (`[CONFIRM: ...]`), and clarity audit (`scrub_and_slop_scanner.mjs` + zero-Node inline regex fallback).
