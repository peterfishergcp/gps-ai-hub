# Customer Hands-On Workshop Playbook — Google Antigravity, Web Portal & ADK (`AGY Website Workshop`)

When a workshop participant, engineer, or facilitator asks Google Antigravity (`agy` CLI or Antigravity IDE) to set up this workshop, run preflight checks, build **Lab 1 (Mission Web Portal)**, build **Lab 2 (Single ADK Agent on Vertex AI)**, or build **Lab 3 (Multi-Agent Specialist Team)**, follow this deterministic runbook.

---

## 1. Zero-Guessing Rule & Read-Only Environment Auto-Discovery (Always Run First)

Before asking the participant to look up Google Cloud Project IDs, install packages, or edit `.env` files by hand, **run the read-only preflight discovery script first** and present what you found for confirmation:

```bash
export PATH="$HOME/.local/bin:$PATH"
bash scripts/preflight.sh
```

### Confirm These 3 Values with the Participant Before Mutating Anything
After `scripts/preflight.sh` finishes, summarize the discovered environment and confirm:
1. **`GOOGLE_CLOUD_PROJECT`**: Target Google Cloud project with `aiplatform.googleapis.com` enabled (e.g., `YOUR_PROJECT_ID`).
2. **`GOOGLE_CLOUD_LOCATION`**: Vertex AI region (default: `us-central1`).
3. **`WORKSHOP_SURFACE`**: Whether they are running on **Google Cloud Workstations / Cloud Shell** (use Web Preview on ports `8081` and `8080`) or a **Local Workstation** (open `http://127.0.0.1:8081` and `http://127.0.0.1:8080` in Chrome).

### If Any Prerequisite Is Flagged `[WARN]` by `scripts/preflight.sh`
- **Missing `agents-cli` or `.agents/skills/`**: Run `bash scripts/bootstrap_tools.sh` (which installs `google-agents-cli` via `uv tool install` and vendors ADK skills into `./.agents/skills` via `agents-cli setup --workspace --skip-auth`).
- **Missing or expired Vertex AI ADC**: Ask the participant to run `gcloud auth application-default login` in their terminal (or `gcloud config set project YOUR_PROJECT_ID` if unset). **Never ask the participant to paste an API key into chat or `.env`.**
- **Disabled Vertex AI API**: Offer to run `gcloud services enable aiplatform.googleapis.com --project="$GOOGLE_CLOUD_PROJECT"`.

---

## 2. Non-Negotiable Security & Workspace Guardrails

1. **Keyless Vertex AI Authentication Only (Zero API Keys)**:
   - Every ADK agent in this workshop authenticates via **Google Cloud Application Default Credentials (ADC)** against Vertex AI (`GOOGLE_GENAI_USE_VERTEXAI=TRUE`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION=us-central1`).
   - Never ask for, generate, or write `GEMINI_API_KEY` or `GOOGLE_API_KEY` secrets into `.env`, source files, or chat messages.
2. **GA Gemini Model Standard**:
   - Use `gemini-3.8-flash` across all workshop agents unless the participant explicitly requests another GA Vertex AI model.
3. **Flat Child Directories — Never Double-Nest ADK Projects**:
   - All commands run relative to this workshop root (`AGY Website Workshop/`):
     - **Lab 1** lives in `./lab1-mission-portal/` (`index.html`, `styles.css`, `script.js`).
     - **Lab 2 & Lab 3** live in `./briefing-coach/` (created directly from this root via `agents-cli create briefing-coach ...`).
   - **CRITICAL**: Never run `mkdir briefing-coach` before `agents-cli create`, and never run `agents-cli create briefing-coach` *inside* `./briefing-coach/` (which creates a broken `briefing-coach/briefing-coach/app` nesting).
4. **Always Resolve `agents-cli` with `$HOME/.local/bin` on `PATH`**:
   - GUI-launched IDEs on macOS and Windows often do not inherit `~/.local/bin` if `uv` was installed in the same session. Prefix shell invocations with `export PATH="$HOME/.local/bin:$PATH"` and **never** run `pip install google-agents-cli` if a sandbox dry-run exits `127`.
5. **Loopback-Only (`127.0.0.1`) & Sandboxed Static Preview**:
   - Never run `python3 -m http.server` (which binds to `0.0.0.0` and can expose repository `.env` files if started in the wrong folder).
   - Always preview Lab 1 using `python3 scripts/preview_lab1.py --port 8081` (bound strictly to `127.0.0.1`, realpath-jailed to `./lab1-mission-portal/`, with strict Content-Security-Policy headers).
   - Reserve port `8080` (`127.0.0.1:8080`) for `agents-cli playground` (`adk web`).
6. **Secure Frontend DOM Rendering**:
   - When generating or editing JavaScript in `./lab1-mission-portal/script.js`, never use `innerHTML`, `outerHTML`, `document.write`, or `insertAdjacentHTML`. Always construct DOM nodes with `document.createElement()`, `setAttribute()`, and `textContent`. Always quote HTML attributes.

---

## 3. Turnkey Lab Runbooks

### Bootstrap Step (Replaces Manual Pre-Workshop Setup)
Once the participant confirms `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`:
```bash
export PATH="$HOME/.local/bin:$PATH"
bash scripts/bootstrap_tools.sh
cp templates/briefing-coach.agents-cli-spec.md .agents-cli-spec.md
```
*Why `.agents-cli-spec.md` is copied*: Pre-seeding the validated agent spec satisfies Phase 0 of `google-agents-cli-workflow` immediately, preventing multi-minute planning stalls during live workshops while preserving `/plan` review cards.

*Optional — Launch the Interactive Visual Lab Portal (`127.0.0.1:8082`)*:
If the participant or facilitator asks to open the visual step-by-step lab guide (with screenshot callouts, 1-click Copy buttons, Role Chooser tabs, and `?review` facilitator notes), run:
```bash
python3 scripts/preview_lab1.py --guide --port 8082
```
and share `http://127.0.0.1:8082/` (or `http://127.0.0.1:8082/?review` for facilitators).

---

### Lab 1: Plan, Review & Build a Mission Web Portal (`./lab1-mission-portal/`)
1. **Plan First**: When the participant asks to build Lab 1 (or runs `/plan`), propose a concise 3-file plan creating `./lab1-mission-portal/index.html`, `./lab1-mission-portal/styles.css`, and `./lab1-mission-portal/script.js` with:
   - Responsive header (participant or team name, mission role, time-of-day greeting)
   - Mission Summary card
   - 3 Priority Initiative cards with interactive status filtering (`All Initiatives` vs. `Active Pilot`)
   - Point-of-contact footer
   - Zero external build tools, zero CDN scripts (so strict `default-src 'self'` CSP passes cleanly), and zero `innerHTML` calls (`createElement` + `textContent` only).
2. **Preview Safely**: Start the hardened loopback preview server:
   ```bash
   python3 scripts/preview_lab1.py --dir ./lab1-mission-portal --port 8081
   ```
   Direct the participant to `http://127.0.0.1:8081/` (or **Web Preview → Port 8081** in Cloud Workstations / Cloud Shell).
3. **Personalize & Verify Facts**: When the participant customizes names or initiatives, update **only** the facts they stated—do not invent unrequested technologies, metrics, or claims.
4. **Catch-Up Option**: If a participant joins late, copy `./starters/lab1-mission-portal/` to `./lab1-mission-portal/` (`cp -R starters/lab1-mission-portal lab1-mission-portal`) and start `preview_lab1.py`.

---

### Lab 2: Build & Test a Keyless Vertex AI ADK Agent (`./briefing-coach/`)
1. **Scaffold Cleanly from the Workshop Root**:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   agents-cli create briefing-coach \
     --prototype \
     -d none \
     --agent-guidance-filename AGENTS.md
   cd briefing-coach
   agents-cli install
   ```
   *(If your installed `agents-cli` version uses `agents-cli scaffold create`, check `agents-cli --help` first and pass the matching non-interactive flags.)*
2. **Configure Keyless Vertex AI `.env` (`./briefing-coach/.env`)**:
   Write `./briefing-coach/.env` using the confirmed Google Cloud project and region (no API keys):
   ```dotenv
   GOOGLE_GENAI_USE_VERTEXAI=TRUE
   GOOGLE_CLOUD_PROJECT=<CONFIRMED_PROJECT_ID>
   GOOGLE_CLOUD_LOCATION=us-central1
   ```
3. **Implement `briefing_coach` (`./briefing-coach/app/agent.py`)**:
   - Keep `MODEL = "gemini-3.8-flash"`.
   - Include a **Mandatory Sensitive Data & PII Guardrail** in `root_agent`'s `instruction`: if user input contains personal identifiers or case-level PII (such as names/initials paired with a Case ID, SSN, DOB, or address), halt immediately before calling any tool, list the detected identifiers, and ask the user to replace them with `[REDACTED]`.
   - Replace sample placeholder tools with a deterministic Python tool `build_prep_schedule(minutes: int) -> dict` with a clear docstring explaining that it divides available preparation time into 25-minute focus blocks and 5-minute review breaks.
   - Configure `root_agent` (`name="briefing_coach"`) as a concise executive & operational briefing coach: once clean of PII, explain any topic in plain language in under 150 words, give one actionable briefing tip, and call `build_prep_schedule` whenever the user shares how much prep time they have.
4. **Terminal Smoke Test + `adk web` Playground**:
   ```bash
   export PATH="$HOME/.local/bin:$PATH"
   cd briefing-coach
   agents-cli run "Explain Zero Trust networking in plain English. I have 60 minutes to prepare."
   ```
   Then launch the interactive playground (`adk web`) on `127.0.0.1:8080`:
   ```bash
   agents-cli playground --port 8080
   ```
   Guide the participant to inspect the `build_prep_schedule(60)` event and execution graph in `http://127.0.0.1:8080/dev-ui/?app=app` (or **Web Preview → Port 8080**).

---

### Lab 3: Upgrade to a Multi-Agent Specialist Team (`./briefing-coach/app/agent.py`)
1. **Refactor into Coordinator + 2 Specialists**:
   Keep `briefing_coach` as `root_agent` (retaining `build_prep_schedule` and greeting/routing duties) and add `sub_agents=[topic_explainer, readiness_quizzer]`:
   - `topic_explainer`: `description` routes requests asking to explain, summarize, or clarify a concept (under 150 words + 1 briefing takeaway).
   - `readiness_quizzer`: `description` routes requests asking to test, quiz, or practice scenario questions (asks one question at a time and evaluates the participant's response).
   - Use `gemini-3.8-flash` across all three agents.
2. **Verify `transfer_to_agent` Handoffs**:
   Run a quick smoke test or restart `agents-cli playground --port 8080`, start a **New Session**, and test:
   1. `"Quiz me on Zero Trust architecture before my briefing."` (`briefing_coach` → `readiness_quizzer`)
   2. `"I'm fuzzy on micro-segmentation—can you explain it simply?"` (`readiness_quizzer` → `topic_explainer`)
   3. `"I have 55 minutes left before the meeting—build my prep schedule."` (`topic_explainer` → `briefing_coach` → `build_prep_schedule(55)`)
3. **Routing Experiment**: Show how narrowing `readiness_quizzer`'s `description` changes `root_agent` delegation behavior, then restore the full description.

---

### Optional Level-Ups (Evaluation & Cloud Deployment)
- **Automated Evaluation**: Load `google-agents-cli-eval` from `./.agents/skills/` and run `agents-cli eval run` inside `./briefing-coach/`.
- **Production Scaffolding**: Enhance the prototype for managed Vertex AI Agent Runtime or Cloud Run:
  ```bash
  cd briefing-coach
  agents-cli scaffold enhance . --deployment-target agent_runtime
  ```

---

## 4. Enterprise & Customer Site Troubleshooting

| Symptom | Root Cause | Resolution |
| :--- | :--- | :--- |
| **`agents-cli: command not found` (exit `127`) on first attempt** | Antigravity's restricted sandbox runs first without `~/.local/bin`, or IDE launched before `uv` updated `PATH`. | Approve host execution and prefix with `export PATH="$HOME/.local/bin:$PATH"`. Never `pip install google-agents-cli` into system Python. |
| **`DefaultCredentialsError` in `adk web` or `agents-cli run`** | Local Application Default Credentials are missing or expired. | Have the participant run `gcloud auth application-default login` in their terminal, then retry. |
| **`PERMISSION_DENIED` on `aiplatform.googleapis.com`** | Vertex AI API is disabled or principal lacks `roles/aiplatform.user`. | Enable via `gcloud services enable aiplatform.googleapis.com --project="$GOOGLE_CLOUD_PROJECT"` or request `roles/aiplatform.user` on the workshop project. |
| **`agents-cli playground` fails to find project manifest** | Command was executed from the parent `AGY Website Workshop/` directory instead of `./briefing-coach/`. | `cd briefing-coach` before running `agents-cli playground` or `agents-cli run`. |
| **Port `8080` or `8081` already in use** | Previous playground or preview server process is still listening. | Pass an alternate loopback port (`--port 8082`) or stop the prior background task. |
