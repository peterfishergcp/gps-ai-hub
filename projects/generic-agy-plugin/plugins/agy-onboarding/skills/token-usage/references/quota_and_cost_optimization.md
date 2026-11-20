# Antigravity Quota Windows, Enterprise Billing & Token Optimization Reference

Companion reference for `/token-usage` covering how local transcript token counts relate to Antigravity plan limits, **Gemini Enterprise** pooled seat credits, **Pay As You Go** GCP project billing, and workspace token hygiene.

---

## 1. Understanding Local Token Fields in `transcript.jsonl`

Each model step in `<appDataDir>/brain/<conversation-id>/.system_generated/logs/transcript.jsonl` logs three token counters:

| Field | What It Measures | Quota & Cost Impact |
| :--- | :--- | :--- |
| **`input_tokens`** | Newly processed (uncached) prompt tokens sent on that step (new user prompt, tool outputs, newly read files, or invalidated context). | **Medium–High** — minimize by keeping tool outputs concise, adding `.antigravityignore`, and avoiding reading multi-megabyte build artifacts. |
| **`cache_read_tokens`** | Prefix tokens served directly from context cache (system instructions, loaded skill/MCP schemas, and prior turns in the same conversation). | **Low per token (typically ~75%–90% cheaper than uncached input)**, *but* once a thread grows past `200K–500K` tokens, cumulative cache reads across dozens of tool loops still add up—run **`/compact`** or start a new conversation at natural milestones. |
| **`output_tokens`** | Generated model completion tokens **plus internal thinking/reasoning tokens**. | **Highest per-token weight** — higher thinking levels (`High`, `Extra` / `xhigh`, `Max`) and parallel subagents (`invoke_subagent`, `/swarm`) multiply output token generation. |

---

## 2. Subscription Tiers vs. Gemini Enterprise vs. Pay As You Go

| Plan / Billing Mode | How Quota & Token Consumption Work | Best Ways to Monitor |
| :--- | :--- | :--- |
| **Google AI Pro / Google AI Ultra** | Rolling **5-hour quota window** + **weekly rate limit** weighted by model compute work. Optional **AI Credit Overages** (`Settings -> AI Credit Overages: Never / Always`). | Model Selector -> **`View Usage`**, `Settings`, CLI **`/usage`** & **`/credits`**, plus `/token-usage` local report. |
| **Gemini Enterprise Standard & Plus** | **1P Gemini models** (`Gemini 4 Neon/Carbon/Argon/Hydrogen`, `Gemini 3.8 Flash`) draw from **pooled organization seat credits** (`$10/mo` Standard, `$15/mo` Plus) with managed overages. **3P Anthropic Claude 5.5** requires admin opt-in and bills per token on consumption. | `/token-usage` local report + **GCP Cloud Billing Reports** & **Cloud Monitoring** on the linked enterprise GCP project (`YOUR_PROJECT_ID`). |
| **Gemini Enterprise Pay-as-you-go / GCP Pay As You Go** | No included flat quota; every request bills directly to the linked Google Cloud Billing account (`aiplatform.googleapis.com` / Agent Platform pricing). | Set **Cloud Billing Budgets & Alerts** at `50%`, `80%`, and `100%` on `YOUR_PROJECT_ID`, and run `/token-usage` weekly to audit heavy threads. |

---

## 3. Ready-to-Use `.antigravityignore` Template for Agency & Dev Workspaces

Drop this `.antigravityignore` into the root of large repositories or data folders to prevent accidental multi-hundred-thousand-token file scans:

```gitignore
# Dependencies & virtual environments
node_modules/
.venv/
venv/
__pycache__/
vendor/
target/

# Build outputs & minified bundles
dist/
build/
out/
.next/
coverage/
*.min.js
*.bundle.js
*.map

# Large data dumps & archives (query with head/scripts instead of full reads)
*.zip
*.tar.gz
*.parquet
*.sqlite
*.db
```
