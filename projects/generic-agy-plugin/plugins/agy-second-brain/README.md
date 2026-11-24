# My Antigravity — Action Items, Personal Memory & Swarm Prep (`agy-second-brain`)

Adds persistent **Personal Memory** (`~/.gemini/config/plugin_data/my-antigravity/memory/`), the interactive **`My Antigravity`** side-pane UI (`Extensions -> My Antigravity` with an AI Inbox **`Action Items`** view, `Suggested to-dos`, `Topics to catch up on`, and a top-right **`Customize`** slider icon), 4-agent parallel swarm orchestration, adversarial pre-meeting coaching, and deterministic anti-slop / outbound scrubbing—with **zero command duplication** alongside `agy-onboarding` (`/agy-onboard`, `/daily-brief`, `/my-voice`) and `agy-connectors` (`agy-ge-bridge`).

## Included Slash Skills (8)
- **`/memory`** — Initialize, inspect, search, and update `~/.gemini/config/plugin_data/my-antigravity/memory/` (role presets: `public-sector`, `pm`, `developer`, `leader`; `action_items.md`; `>21d` stakeholder staleness in `contacts.md`; and 4-file isolated `initiatives/<slug>/`).
- **`/meeting-notes`** — Ingest call transcripts or notes, strip base64 bloat, apply **4-Tier Recency Compaction** (`0-7d`, `8-30d`, `31-90d`, `90d+`) to `running_notes.md`, extract action items to `action_items.md`, and update `Last_Touch_Date` in `contacts.md`.
- **`/meeting-prep`** — T-15m 1-card pre-meeting brief plus an **Adversarial Minto Pyramid (SCQA) Critic** (*Situation -> Complication -> Hard Question -> Counter-Move*).
- **`/followup-plan`** — Sweeps open commitments (auditing already-sent replies first), writes `followups/latest_action_plan.md`, syncs `action_items.md`, and stages `[Draft-Only]` replies.
- **`/swarm-prep`** — Launches 4 bundled subagents concurrently (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`) for ~60-second 360-degree milestone prep.
- **`/weekly-impact`** — Friday closeout across **3 Altitudes** (Executive Outcomes, Cross-Team Reusable Assets, Workstream Velocity), saving `weekly/YYYY-WXX.md` and `impact/ledger.json`.
- **`/no-ai-slop`** — Hardlined anti-slop editor cutting 17 common LLM clichés, binary-contrast gimmicks, and em-dash clusters while protecting exact figures and citations.
- **`/outbound-scrub`** — Deterministic secret, PII, unresolved-placeholder (`[CONFIRM: ...]`), and clarity audit (`scrub_and_slop_scanner.mjs` + zero-Node inline regex fallback).
