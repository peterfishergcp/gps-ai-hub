---
name: orchestrator-guide
description: Guides users on how best to select, prompt, and get peak speed and quota efficiency from Google Antigravity's Orchestrator mode—Orchestrator (Neon), Orchestrator (Carbon), and Orchestrator (Argon)—which dynamically pairs a frontier Gemini 4 Planner with fast Gemini 4 Hydrogen execution inside a single conversation (https://antigravity.google/docs/models#orchestrator). Trigger on /orchestrator-guide, "how to use orchestrator", "orchestrator mode", "Orchestrator (Neon)", "Orchestrator (Carbon)", "Orchestrator (Argon)", "Gemini 4 planner and Hydrogen", or "when should I use Orchestrator vs standalone models".
---

# Mastering Orchestrator in Google Antigravity (`/orchestrator-guide`)

Help users get maximum architectural quality, faster completion times, and lower quota consumption from **Orchestrator** (`https://antigravity.google/docs/models#orchestrator`) across the **Antigravity App**, **Antigravity CLI (`agy`)**, and **IDE Extensions**.

---

## 1. What Orchestrator Actually Does (Collaborative Planner + Executor, Not a Simple Router)

Unlike a one-shot prompt router that picks a single model upfront, **Orchestrator** pairs **two Gemini 4 models inside the same conversation** and hands control back and forth automatically within a single turn:

| Selector Option | Planner & Reviewer Model | Implementation Executor | Best Fit |
| :--- | :--- | :--- | :--- |
| **`Orchestrator (Neon)`** | **Gemini 4 Neon** | **Gemini 4 Hydrogen** | **Recommended everyday default** — feature builds, UI updates, dashboards, bug fixes, and multi-file edits. |
| **`Orchestrator (Argon)`** | **Gemini 4 Argon** | **Gemini 4 Hydrogen** | **Deep multi-file refactors & API/data integrations** needing stronger upfront structural planning before fast execution. |
| **`Orchestrator (Carbon)`** | **Gemini 4 Carbon** | **Gemini 4 Hydrogen** | **Highest-complexity system architecture & hard debugging** paired with fast Hydrogen code/test execution (Ultra / supported tiers). |

### The 4-Stage Hand-Off Loop Inside Every Turn
1. **Stage 1 — Read-Only Planning (`Planner`):** Your message starts with the Planner (`Neon`, `Carbon`, or `Argon`) in a **read-only phase**. It explores files, resolves ambiguities, and writes a concrete implementation plan with explicit **re-planning triggers**. *(If you only ask a question, code review, or explanation requiring no edits, the Planner answers directly without spinning up Hydrogen!)*
2. **Stage 2 — Fast Execution (`Gemini 4 Hydrogen`):** Once the plan is set, lightweight **Gemini 4 Hydrogen** takes over to edit files, write code, run builds/tests, and verify results against the plan—finishing faster and burning far less quota than running the frontier planner on every tool loop.
3. **Stage 3 — Automatic Escalation on Friction (`Hydrogen -> Planner`):** If Hydrogen hits an unexpected snag—such as **a verification/test step failing twice**, an API behaving differently than expected, or a design choice the plan didn't settle—it automatically hands control back to the Planner to inspect state, repair the plan, and resume Hydrogen execution.
4. **Stage 4 — Progress Check & Mid-Flight Steering (`Planner`):** On longer tasks—and **whenever you send a follow-up message while Hydrogen is working**—Hydrogen reports progress to the Planner, which checks completed work against the plan and either wraps up, continues, or updates the plan.

---

## 2. How to Select Orchestrator (& Check Live Rollout Availability)

### A. Antigravity App & IDE Extensions
1. Click the **Model Selector** under the conversation prompt box.
2. Select **`Orchestrator (Neon)`**, **`Orchestrator (Argon)`**, or **`Orchestrator (Carbon)`** *(hover over the `New` badge next to any option to confirm which Gemini 4 planner it uses)*.
3. Your choice persists for the rest of the conversation. *(If you switch models while the agent is mid-turn, it finishes the current turn before switching.)*

### B. Antigravity CLI (`agy`)
- **Check Live Availability on Your Account (Especially During Enterprise Rollouts):**
  ```bash
  agy models
  ```
- **Interactive Picker:** Run **`/model`**, select `Orchestrator (Neon)`, `Orchestrator (Argon)`, or `Orchestrator (Carbon)`, and press **`Enter`**.
- **Launch or Headless Flag (Always Quote the Model Name):**
  ```bash
  agy --model "Orchestrator (Neon)"
  agy -p "Add input validation to the intake form and run the unit tests." --model "Orchestrator (Argon)"
  ```

### Crucial Gotcha: Fixed Reasoning Configuration (`/effort` Does Not Apply)
- **Orchestrator uses a fixed reasoning configuration**—you cannot set `Low`/`Medium`/`High`/`Extra` on it, and running `/effort` or `--effort` reports: `Effort isn't adjustable for Orchestrator (Argon).`
- **If Orchestrator Isn't Visible Yet on Your Enterprise License:** While Enterprise rollout completes (or if your org policy restricts selector entries), you can replicate the exact workflow manually in 2 turns: run **`/plan`** on **`Gemini 4 Neon`** (or `Argon` / `Carbon`), approve the plan, and switch the picker to **`Gemini 4 Hydrogen`** to execute!

---

## 3. Decision Matrix: When to Use Orchestrator vs. Standalone Models vs. Swarms

| Workload Pattern | Best Choice in Antigravity | Why |
| :--- | :--- | :--- |
| **Day-to-day feature work, bug fixes, `/agy-dashboard` builds, multi-file refactoring & test repair** | **`Orchestrator (Neon)`** or **`Orchestrator (Argon)`** *(Recommended Default)* | Frontier planning + review quality with Hydrogen execution speed and significantly lower quota burn (`/token-usage`). |
| **Designing distributed systems from scratch, subtle concurrency race conditions, or statutory/security audits where every step needs frontier depth** | **Standalone `Gemini 4 Carbon / Argon / Neon`** *(with `High` or `Extra` / `xhigh` effort)* or **`Claude Opus 5.5 (High)`** | Every intermediate deduction stays on the frontier model, and you control exact thinking effort (`--effort xhigh`). |
| **Well-defined edits needing zero planning phase** (package bumps, boilerplate, doc updates, unit tests for clean functions, `/daily-brief` summaries) | **Standalone `Gemini 4 Hydrogen`** or **`Gemini 3.8 Flash`** | Skips the read-only Planner phase completely for instant single-model execution. |
| **Parallel multi-perspective work or cold-start adversarial verification** (`/twin-swarm-prep`, 4-angle security/code review) | **Subagents, `/swarm`, `/boost`, or `/teamwork`** | Orchestrator runs sequentially inside **one single agent**; use subagents/Swarm when multiple agents must work **in parallel** or review blind. |

---

## 4. Five Rules for Prompting Orchestrator Like an Expert

Load `./references/orchestrator_prompt_patterns.md` when the user wants copy-paste starter prompts for their task, and apply these 5 high-leverage habits:

1. **Include a Concrete Verification Command or Acceptance Criterion:** Because Hydrogen automatically escalates back to the Planner **when a verification check fails twice**, naming the exact test, build, or validation check upfront (for example, *"run `npm test` and verify zero TypeScript errors"*) turns Stage 3 self-healing into a deterministic safety net.
2. **Front-Load Constraints & Non-Goals in Message 1:** The Planner starts every turn in a **read-only exploration phase**. Stating architectural boundaries upfront (*"keep existing DB schema untouched; only edit `src/intake/`"*) prevents Hydrogen from wasting tool loops on out-of-scope files.
3. **Steer Mid-Flight Instead of Canceling:** If you spot a requirement tweak while `Gemini 4 Hydrogen` is editing files, **just send a short message**—Orchestrator automatically routes your mid-run message + Hydrogen's progress back to the **Planner** to update the plan cleanly without losing work!
4. **Don't Over-Decompose Into Micro-Prompts:** Sending 12 tiny one-line prompts forces 12 separate read-only Planner phases. Give Orchestrator a cohesive feature slice (3–8 files + verification) so 1 Planner pass drives 15 fast Hydrogen execution steps.
5. **Pair with `/compact` Between Milestones:** After Orchestrator finishes and verifies a major feature, run **`/compact`** (or check **`/token-usage`**) before starting the next milestone so future Planner read-only phases stay fast and lean.
