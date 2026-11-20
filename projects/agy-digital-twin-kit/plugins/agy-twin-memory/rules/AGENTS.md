# Digital Twin Second Brain Vault Routing & Operating Rules

While `agy-twin-memory` is enabled, ground your assistance in the user's local **2-Tier Second Brain Memory Vault** at `~/antigravity-twin/memory/` (or `$AGY_TWIN_VAULT_DIR` if set). Keep context lean by reading only the Tier-2 files needed for the current request rather than loading the entire vault at once.

## 1. 2-Tier Memory Vault Routing Table (`~/antigravity-twin/memory/`)

| User Intent / Trigger | Vault Path (`~/antigravity-twin/memory/`) | Governing Rule |
| :--- | :--- | :--- |
| **Role, timezone, priorities, or writing tone** | `profile/{identity,portfolio,playbooks,voice}.md` | Read `identity.md` and `voice.md` before drafting external comms or onboarding plans. If `profile/identity.md` does not exist yet, offer `/twin-setup`. |
| **Action items, follow-ups, daily priorities** | `gtd_board.md` & `followups/latest_action_plan.md` | **Zero Task Decay Rule:** Format tasks as `- [ ] [Initiative] Verb + Concrete Deliverable [Owner: Name] (Added: YYYY-MM-DD)`. Never delete or auto-expire open `[ ]` tasks; only mark `[x]` when confirmed done or `[-]` when explicitly dropped by the user. |
| **Stakeholders, sponsors, partners, check-ins** | `contacts.md` | Track `Last_Touch_Date` (`YYYY-MM-DD`) and flag key stakeholders with `>21 days` since last contact (`STALE (>21d)`) for a check-in. |
| **Project, program, system, or case workstream** | `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md` | **4-File Initiative Isolation + 4-Tier Recency Compaction:** Keep `0-7d` notes detailed, `8-30d` compacted to 3-5 tactical bullets per session, `31-90d` rolled into dated milestones, and `90d+` distilled into an evergreen baseline. |
| **Weekly accomplishments, 1:1s, QBRs, reviews** | `weekly/YYYY-WXX.md` & `impact/ledger.json` | Record weekly progress at **3 Altitudes**: (1) Executive / Leadership Outcomes, (2) Cross-Team Reusable Assets, and (3) Workstream Velocity. |
| **Reusable domain notes & reference playbooks** | `topics/*.md` | Store durable technical standards, policy summaries, and recurring lessons learned by topic slug. |

## 2. Connector & Standalone Execution Rules

1. **Works Standalone or With Connected MCP Bridges:** If MCP connectors are active (such as `agy-ge-bridge` for federated Gemini Enterprise search across Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, and GitHub, or direct Workspace/GitHub/BigQuery MCP servers), query them with user-scoped permissions to ground briefs and drafts. When no external MCP server is connected, operate directly on the local vault (`~/antigravity-twin/memory/`), workspace files, and pasted text without failing.
2. **Draft-Only Outbound Rule:** Never auto-send emails, chat messages, calendar invites, or external ticket comments without explicit confirmation from the user in the current conversation. Always label drafts clearly (`[Draft: Email -> Recipient | Subject: ...]`, `[Draft: Chat/Teams -> Channel/Person]`, or `[Draft: Memo / Summary]`).
3. **Inspectable Plain Markdown:** Store all memory artifacts as clean UTF-8 Markdown (`.md`) or JSON (`.json`) inside `~/antigravity-twin/memory/` so the user can view, search, and edit every file directly in the **Twin Vault** side panel (`Extensions -> Twin Vault`) or any text editor.
