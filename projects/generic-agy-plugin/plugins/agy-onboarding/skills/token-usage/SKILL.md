---
name: token-usage
description: Retrieves, analyzes, visualizes, and optimizes your exact Antigravity token consumption and quota usage—scanning local conversation transcripts for 5-hour, 24-hour, 7-day, and all-time input, cached, and output tokens, generating an interactive Side-Pane/Preview HTML consumption dashboard, showing where to check official live 5-hour/weekly quota bars and Gemini Enterprise pooled seat credits, and recommending high-impact token-saving actions (/compact, Orchestrator, .antigravityignore, MCP hygiene). Trigger on /token-usage, "check my token usage", "how many tokens have I used", "retrieve my token consumption", "why did I hit a quota limit", or "optimize my token burn".
---

# Token & Quota Consumption Analyzer (`/token-usage`)

Retrieve the user's **exact local token consumption** across their Antigravity conversations, pair it with **official Antigravity App / CLI quota meters**, and surface concrete actions to stretch their **5-hour rolling window**, **weekly limit**, or **Gemini Enterprise pooled seat credits**.

---

## Step 1: Retrieve Exact Local Token Telemetry + Render Visual Dashboard

Every Antigravity conversation records per-step token telemetry (`input_tokens`, `cache_read_tokens`, `output_tokens`, `created_at`, and `invoke_subagent` calls) inside `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`.

### Preferred Path (Bundled Zero-Dependency Node Analyzer — Zero Python Needed)
Run the bundled `token_usage_report.mjs` script using Antigravity's built-in `node` runtime and write the rendered visual dashboard directly to `<appDataDir>/brain/<conversation-id>/token_usage_dashboard_preview.html` so it renders in chat **and** appears automatically in **`Extensions -> Preview`**:

```bash
node <skill_dir>/scripts/token_usage_report.mjs --top 10 --html-out "<appDataDir>/brain/<conversation-id>/token_usage_dashboard_preview.html"
```
*(Add `--conv <conversation-id>` if the user asks only about the current thread, or `--redact-previews` if they want an anonymized report safe to share with an IT lead.)*

Then register/present the visual dashboard cleanly (never create `127.0.0.1` `.url.json` links):
1. Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/token_usage_dashboard_preview.html"></agent-embed>` in your response and link to `[Open Token Usage Report in Side Pane](file:///<appDataDir>/brain/<conversation-id>/token_usage_dashboard_preview.html)` (mentioning it is also saved in **`Extensions -> Preview`**).
2. Summarize the 4 key windows clearly in Markdown:
   - **Last 5 Hours** *(aligns with Antigravity's 5-hour rolling quota refresh window)*
   - **Last 24 Hours**
   - **Last 7 Days** *(aligns with Antigravity's weekly rate limit window)*
   - **Overall Prompt Cache Hit Rate** (`cache_read_tokens / (input_tokens + cache_read_tokens)`) and any conversation exceeding **`150K` peak context tokens**.

### Zero-Terminal Fallback (If Terminal Execution Is Restricted)
If terminal commands are disabled by policy, read `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` directly with `read_file` and sum `input_tokens`, `cache_read_tokens`, and `output_tokens` across `PLANNER_RESPONSE` steps for the active conversation.

---

## Step 2: Show Where to Check Official Live Quota & Credit Meters

Local transcript totals measure **exact token volume**, while Antigravity's server-side **compute quota bars** weight tokens by model cost (for example, frontier reasoning or 3P Claude Opus consumes quota faster than Gemini 4 Hydrogen or Gemini 3.8 Flash). Always give the user the exact 2-click path for their surface:

### A. Antigravity App & IDE Extensions (Visual Quota Bars)
1. Click the **Model Selector** dropdown directly underneath the chat prompt box.
2. Click **`View Usage`** at the bottom of the selector menu to inspect live remaining percentages:
   - **Gemini Models:** `Weekly Limit Remaining (%)` and `Five Hour Limit Remaining (%)`
   - **Claude and GPT Models:** `Weekly Limit Remaining (%)` and `Five Hour Limit Remaining (%)`
3. Open **`Settings`** to check baseline quota across models and verify **`AI Credit Overages`** (`Never` = pause until 5-hour refresh vs. `Always` = draw from purchased/promotional AI credits when baseline refreshes are exhausted).

### B. Antigravity CLI (`agy`)
- **`/usage`** — Displays live quota consumption, model breakdown, and 5-hour / weekly reset timers.
- **`/credits`** — Shows remaining AI credit balance for overages.
- **`/context`** — Inspects active system prompt, rules, and connected MCP server schemas so you can disable unused token-heavy MCPs.
- **`/statusline`** — Customizes the right side of the CLI status bar to keep token/credit indicators visible on every turn.

### C. Gemini Enterprise & Google Cloud Project Billing (Agency Admins & Pay-As-You-Go)
Load `./references/quota_and_cost_optimization.md` when an enterprise user or GCP admin asks how seat credits vs. cloud billing work, and highlight these core facts:
1. **Gemini Enterprise Standard / Plus Seat Licenses:** First-party Google Gemini models (`Gemini 4 Neon/Carbon/Argon/Hydrogen`, `Gemini 3.8 Flash`) draw first from **pooled edition seat credits** (`$10/month` Standard, `$15/month` Plus).
2. **Third-Party Partner Models (`Claude Sonnet 5.5` / `Claude Opus 5.5`):** Require administrator opt-in in Vertex AI Model Garden and are **billed per token on consumption** at list price.
3. **Hybrid Execution Transparency:** Even when **Claude 5.5** is selected as the primary reasoning model, lightweight first-party Gemini models continue to run in the background for high-frequency client-side context management and summaries, consuming small amounts of 1P tokens.
4. **GCP Cloud Billing & Cloud Monitoring:** For **Pay As You Go** or **Gemini Enterprise** host projects (`YOUR_PROJECT_ID`), admins can view exact billed token SKUs in **Google Cloud Console -> Billing -> Reports** (filtered by service *Vertex AI* / *Gemini Enterprise*) and **Cloud Monitoring -> Metrics Explorer** (`aiplatform.googleapis.com` token count metrics).

---

## Step 3: Recommend Top 5 High-Impact Token Savers (Tailored to Their Report)

Based on what `token_usage_report.mjs` found, give 2–4 targeted recommendations:
1. **Compact or Split Conversations `> 150K` Peak Context (`/compact`):** Every turn in a 400K-token thread re-sends that entire history. Run **`/compact`** (or click **+ New Conversation** when switching tasks) to cut per-turn input tokens by `60%–85%`.
2. **Switch Feature/Refactor Work to `Orchestrator` (`/orchestrator-guide`):** Instead of running a heavy frontier model (`Gemini 4 Carbon/Argon/Neon` at `Extra` effort or `Claude Opus 5.5 (Max)`) across 30 file-editing tool calls, select **`Orchestrator (Neon / Carbon / Argon)`** once enabled on your plan so the frontier model plans once and lightweight **`Gemini 4 Hydrogen`** executes edits and test runs at a fraction of the quota cost.
3. **Right-Size Thinking Effort (`Low` / `Medium` vs. `High` / `Extra` / `Max`):** Thinking tokens bill as output tokens. Use `Low` or `Medium` on `Gemini 3.8 Flash`, `Gemini 4 Hydrogen`, or `Claude Sonnet 5.5` for routine edits, docs, and inbox/SharePoint summaries; reserve `High`, `Extra` (`xhigh`), or `Max` for architecture blueprints and hard root-cause bugs.
4. **Add `.antigravityignore` to Code Workspaces:** Exclude `node_modules/`, `dist/`, `build/`, `.venv/`, large `.csv`/`.zip` dumps, and binary assets so workspace searches and file reads never flood context.
5. **Audit Background Automations & Unused MCP Schemas:** Each enabled MCP server injects tool JSON schemas into every turn, and scheduled `/automation` cron jobs draw from rolling quota—keep `agy-twin-automations` or unused MCPs toggled off when not actively needed.
