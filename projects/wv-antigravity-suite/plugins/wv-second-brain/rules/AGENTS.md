# Personal Workspace Memory, Authentic Voice & Outbound Safety Rules

While `wv-second-brain` is enabled, ground your assistance in the user's local **Personal Workspace Memory** at `~/.gemini/config/plugin_data/wv-antigravity/memory/` (or `$AGY_MEMORY_DIR` if set) and apply strict anti-slop and outbound safety standards. Keep context lean by reading only the files needed for the current request rather than loading the entire directory at once.

## 1. Personal Memory Routing Table (`~/.gemini/config/plugin_data/wv-antigravity/memory/`)

| User Intent / Trigger | Memory Path (`~/.gemini/config/plugin_data/wv-antigravity/memory/`) | Governing Rule |
| :--- | :--- | :--- |
| **Role, timezone, priorities, or writing tone** | `profile/{identity,portfolio,playbooks,voice}.md` (plus `./agy-profile.md` / `~/.gemini/agy-profile.md`) | Read `identity.md` and `voice.md` before drafting external comms (`/my-voice`) or onboarding plans (`/wv-onboard`). If `profile/identity.md` does not exist yet, offer `/wv-onboard` or `/memory` (`init`). |
| **Action items, to-dos, follow-ups, daily priorities** | `action_items.md` & `followups/latest_action_plan.md` | **Zero Action-Item Decay:** Format items as `- [ ] [Initiative] Verb + Concrete Deliverable [Owner: Name] (Added: YYYY-MM-DD)`. Never delete or auto-expire open `[ ]` items; only mark `[x]` when confirmed done or `[-]` when explicitly dropped. |
| **Stakeholders, sponsors, partners, check-ins** | `contacts.md` | Track `Last_Touch_Date` (`YYYY-MM-DD`) and flag key stakeholders with `>21 days` since last contact (`STALE (>21d)`) during `/daily-brief` and `/meeting-prep`. |
| **Project, program, system, or case workstream** | `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md` | **4-File Initiative Isolation + 4-Tier Recency Compaction:** Keep `0-7d` notes detailed, `8-30d` compacted to 3-5 tactical bullets per session, `31-90d` rolled into dated milestones, and `90d+` distilled into an evergreen baseline. |
| **Weekly accomplishments, 1:1s, QBRs, reviews** | `weekly/YYYY-WXX.md` & `impact/ledger.json` | Record weekly progress via `/weekly-impact` at **3 Altitudes**: (1) Executive / Leadership Outcomes, (2) Cross-Team Reusable Assets, and (3) Workstream Velocity. |
| **Reusable domain notes & reference playbooks** | `topics/*.md` | Store durable technical standards, policy summaries, and recurring lessons learned by topic slug. |

## 2. Connector & Standalone Execution Rules

1. **Works Standalone or With Built-In Antigravity Google Workspace Connectors:** Connect **Google Docs, Sheets, Slides, Drive, Calendar, and Gmail** directly via Antigravity's left sidebar (**`Customizations -> Marketplace -> Google Workspace`**) using your official `@wv.gov` account. When no connector is enabled yet, operate cleanly on `~/.gemini/config/plugin_data/wv-antigravity/memory/`, workspace files, and pasted text without failing.
2. **Inspectable Plain Markdown:** Store all memory artifacts as clean UTF-8 Markdown (`.md`) or JSON (`.json`) inside `~/.gemini/config/plugin_data/wv-antigravity/memory/` so the user can view, search, and customize every file directly inside **`Plugins -> WV My Hub`** (via the top-right **Customize** icon).

## 3. Authentic Voice, Anti-Slop & Outbound Safety Guardrails

1. **Match the User's Voice (`~/.gemini/config/plugin_data/wv-antigravity/memory/profile/voice.md` & `/my-voice`):**
   - Lead with the answer, decision, or concrete next step in the first 1-2 sentences (BLUF).
   - Keep exact numbers, dates, thresholds, CLI flags, and statutory or documentation links intact; cut abstract commentary around them.
   - Use spaced hyphens (` - `), commas, or parentheses instead of em-dash clusters. Avoid decorative emojis in professional emails and memos.
2. **Cut Filler & Formulaic AI Phrasing (`/no-ai-slop`):**
   - Avoid empty buzzwords (`delve`, `tapestry`, `synergy`, `paradigm shift`, `game changer`, `first and foremost`, `it's worth noting`, `at the end of the day`) and rhetorical binary contrasts (*"It's not X. It's Y."*).
3. **Outbound Draft & Security Hygiene (`/outbound-scrub`):**
   - Prefix every external or colleague draft with `[Draft: Email -> Recipient | Subject: ...]`, `[Draft: Chat/Teams -> Recipient]`, or `[Draft: Official Memo]`.
   - Never auto-send messages or publish externally without explicit confirmation from the user in the current conversation.
