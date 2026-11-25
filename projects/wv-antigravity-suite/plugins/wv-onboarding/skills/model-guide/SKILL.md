---
name: model-guide
description: Guides Public Sector staff, developers, and IT admins on selecting, configuring, and switching AI models in Google Antigravity—including how to enable and use Anthropic Claude (Claude Sonnet and Claude Opus) alongside Google Gemini models, tune Thinking/Reasoning effort, run Dual-Model Cross-Reviews, and follow state quota and compliance guardrails. Use when a user says /model-guide, asks "how do I use Claude in Antigravity", "which model should I pick", "Gemini vs Claude", "how do I switch models", or asks how to enable Claude for their agency.
---

# Model Selection & Using Anthropic Claude in Antigravity (`/model-guide`)

Help Public Sector staff, engineers, and agency IT administrators get the best results—and best budget stewardship—from **Google Gemini** and **Anthropic Claude** models inside **Google Antigravity (`AGY`)**.

## Mode Selection
1. **Task-to-Model Recommender & Switcher Guide (Default):** Recommend the exact model + reasoning effort for the user's current task and show them how to switch models in **Antigravity Desktop / IDE** or **Antigravity CLI (`agy`)**.
2. **Dual-Model Cross-Review Mode ("Gemini + Claude Pair"):** When the user wants high-assurance code refactoring, contract redlining, or FOIA/security verification, guide them through a **2-Pass Dual-Model Review** switching between Gemini and Claude in the same conversation.
3. **Agency IT Admin & Enablement Mode:** When an administrator or lead asks *"why don't I see Claude?"*, *"how do we enable Claude on Vertex AI?"*, or asks about **pooled seat quota vs. Pay-As-You-Go billing and compliance**, load `./references/claude_and_gemini_playbook.md` and walk through the exact enablement and governance checklist.

---

## 1. How to Switch Models (Including Anthropic Claude) in Antigravity

### A. Antigravity Desktop & IDE Window (Visual Picker)
1. Look at the **bottom toolbar of the conversation prompt box** (just below where you type your message).
2. Click the **Model Selector dropdown** (shows your active model, such as *Gemini 3.8 Flash* or *Claude Sonnet*).
3. Select your target model family:
   - **Orchestrator (`Orchestrator (Neon)`, `Orchestrator (Argon)`, `Orchestrator (Carbon)`)** — Pairs a frontier **Gemini 4** planner with fast **Gemini 4 Hydrogen** implementation inside one conversation for lower quota burn and faster turnaround *(run **`/orchestrator-guide`** for full prompting & rollout patterns)*.
   - **Google Gemini 4 (`Neon`, `Carbon`, `Argon`, `Hydrogen`)** — Frontier Google DeepMind reasoning (`Neon`, `Carbon`, `Argon`) and fast code execution (`Hydrogen`), supporting `Low`, `Medium`, `High`, and `Extra` (`xhigh` in CLI) on `Neon` and `Hydrogen`.
   - **Anthropic Claude Sonnet 5.5 & Opus 5.5 (`Low`, `Medium`, `High`, `Max`)** — Surgical multi-file refactoring, nuance-heavy contract redlining, and deepest adversarial code/security audits *(note: legacy Claude 4.6 entries retire Nov 30, 2026)*.
   - **Google Gemini 3.8 Flash** (`gemini-3.8-flash`) — Fast 1M-context daily driver for briefings, federated SharePoint/Outlook synthesis, and multimodal screenshots/PDFs.
   - **Google Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`) — Ultra-fast, lowest-cost high-volume classification and formatting.
4. **Adjust Thinking / Reasoning Effort:** Choose **`Low`**, **`Medium`**, **`High`**, **`Extra`** (`xhigh` on Gemini 4 Neon/Hydrogen), or **`Max`** (on Claude 5.5). *(Note: Orchestrator uses a fixed reasoning configuration, so `/effort` does not apply while Orchestrator is selected.)*
5. **Switch Mid-Conversation Anytime:** You can switch from Gemini to Claude (or Claude to Gemini) right in the middle of an existing thread—Antigravity preserves your workspace context and artifacts across turns.

### B. Antigravity CLI (`agy` in Terminal / PowerShell)
- **Interactive Picker:** Type **`/model`** inside an `agy` session:
  - Type to fuzzy-search (for example, type `claude` or `gemini`).
  - Use **`Up` / `Down`** arrows to highlight a model family.
  - Use **`Left` / `Right`** arrows to cycle **Reasoning Effort** (`low` / `medium` / `high`).
  - Press **`Enter`** to switch immediately.
- **Command-Line Launch Flags:** Start a session or one-shot task pinned to a specific model and effort:
  ```bash
  agy --model claude-sonnet-5-5 --effort high
  ```
- **Check Quota, Token Telemetry & Credit Usage:** Run **`/token-usage`** in chat to scan your exact local 5h/24h/7d token consumption (or hover over the live **`in | out | thinking`** pill in **`WV My Hub`**, **`WV Skills`**, or **`WV Preview`**), click **Model Selector -> `View Usage`** in Desktop, or run **`/usage`** and **`/credits`** in `agy` CLI.

---

## 2. Public Sector Workload Routing Matrix (Gemini vs. Claude)

Recommend the right model for the job so agencies maximize both **quality** and **state budget efficiency**:

| State Workflow / Task | Recommended Primary Model | Effort | Why This Choice Wins for Public Sector |
| :--- | :--- | :--- | :--- |
| **Morning Briefings, Inbox Triage & Federated GE Search** (`/daily-brief`, `/inbox-triage`, `/connect-m365-workspace`) | **Gemini 3.8 Flash** | `Low`–`Medium` | Included in **1P pooled subscription quota**; fast synthesis across Outlook, SharePoint, OneDrive, and Teams. |
| **Massive Multi-Document Packets & Multimodal Design** (`/foia-expert` large discovery sets, `/wv-dashboard` from screenshot, PDFs/slides) | **Gemini 3.8 Flash** *(or latest Gemini Pro tier)* | `Medium`–`High` | Native **1M-token context window** and strong multimodal vision for dashboard screenshots, scanned PDFs, and slide decks. |
| **Iterative Application Coding, SQL & Legacy Refactoring** (`/modernize-refactor`, `/deploy-cloudrun`, UI components) | **Claude Sonnet** | `Medium`–`High` | Exceptional instruction-following on multi-file code edits, clean diffs, TypeScript/Python/Rust/Java refactoring, and test generation. |
| **Hardest Debugging, Contract Redlines & Adversarial Audits** (`/legal-procurement-review`, `/security-audit` Pass 2) | **Claude Opus** *(or Dual-Model Gemini + Claude)* | `High` | Deepest edge-case reasoning for sovereign-immunity/indemnity traps, race conditions, and security boundary reviews. |
| **High-Volume Batch Formatting & Simple Checklists** | **Gemini 3.5 Flash-Lite** | `Low` | Instant response time and minimal quota footprint. |

---

## 3. High-Assurance Pattern: Dual-Model Cross-Review (Gemini + Claude)

For high-stakes Public Sector deliverables—such as **Stage 2 legacy code migrations**, **vendor contract reviews**, **FOIA Vaughn Index exemptions**, or **Cloud Run security audits**—offer to run a **2-Pass Dual-Model Cross-Review**:

1. **Pass 1 (Author / Ground):** Build the initial implementation, dashboard, or statutory analysis using **Gemini 3.8 Flash** (especially if ingesting large PDFs/screenshots or federated GE docs) *or* **Claude Sonnet** (for multi-file code).
2. **Pass 2 (Independent Adversarial Verification):** Prompt the user to switch the model picker to the **other model family** (e.g., switch to **Claude Opus / Claude Sonnet** after a Gemini draft, or switch to **Gemini** after a Claude build) and paste this ready-to-run prompt:
   > *"Act as an independent cold-start reviewer. Audit the artifact/code produced above without assuming prior decisions are correct. Flag only concrete bugs, security vulnerabilities, missing edge cases, or statutory/contractual gaps—and distinguish blocking defects from minor style preferences."*

---

## 4. State Budget & Compliance Guardrails (Always Surface Briefly)

Whenever advising Public Sector users on **Anthropic Claude** usage, keep three state governance facts clear:
1. **Why Claude May Not Appear Yet (Admin Enablement):** In enterprise environments, third-party partner models (**Anthropic Claude**) are **off by default** until the agency's Google Cloud / Enterprise Administrator enables **Anthropic Claude in Google Cloud Vertex AI Model Garden** and allows partner models in admin settings. *(Read `./references/claude_and_gemini_playbook.md` if the user needs the step-by-step IT Admin setup.)*
2. **Pooled Seat Quota vs. Pay-As-You-Go Stewardship:**
   - **1P Google Gemini models** draw from your included enterprise **pooled subscription quota**—use Gemini as your everyday workhorse for high-frequency tasks.
   - **3P Anthropic Claude models** run as **Pay-As-You-Go consumption at list price** outside included 1P seat quota (or consume tier credits faster)—use Claude deliberately where its coding, refactoring, and second-opinion review strengths deliver clear value.
3. **Regulated Data Check (`CJIS`, `HIPAA`, `FedRAMP`, `FTI`):** Before sending regulated **CJIS**, **HIPAA PHI**, **IRS FTI**, or **FedRAMP High** records to any third-party partner model, confirm with your Public Sector Agency CISO / IT Administrator that Anthropic Claude on Vertex AI in your configured US region (`us-east5`) is approved under your agency's compliance boundary and BAA. When working with regulated PII/PHI/CJIS and unsure, stay on **1P Google Gemini** inside an approved US region.
