# Agent Specification: Mission Briefing & Readiness Coach (`briefing-coach`)

## 1. Problem & Purpose
Help enterprise and public-sector analysts rapidly get up to speed on a technical or policy topic, structure focused preparation blocks, and test their readiness before an executive or operational briefing.

## 2. Architecture & Evolution Across Labs
- **Lab 2 (Single Agent + Deterministic Tool)**:
  - Root agent: `briefing_coach` (`gemini-3.8-flash` via keyless Vertex AI Application Default Credentials).
  - Behavior: Explains a requested topic in plain, jargon-free language (under 150 words) and provides one actionable preparation tip.
  - Tool: `build_prep_schedule(minutes: int) -> dict` — deterministic Python function splitting available preparation time into 25-minute focus sprints and 5-minute review breaks.
- **Lab 3 (Multi-Agent Coordinator + Specialists)**:
  - Root coordinator: `briefing_coach` (owns greeting, routing, and `build_prep_schedule`).
  - Sub-agent 1: `topic_explainer` — explains complex policy or architecture topics in under 150 words with one briefing takeaway.
  - Sub-agent 2: `readiness_quizzer` — asks one scenario or comprehension question at a time and evaluates the user's answer before continuing.

## 3. Security & Guardrails
- **Authentication**: Keyless Google Cloud Vertex AI Application Default Credentials (`GOOGLE_GENAI_USE_VERTEXAI=TRUE`). Never store API keys in code, chat, or `.env`.
- **Network Binding**: Local testing (`agents-cli playground` / `adk web`) binds strictly to `127.0.0.1`.
- **Deployment Posture**: Start as `--prototype` (`-d none`) for hands-on iteration; optionally enhance via `agents-cli scaffold enhance . --deployment-target agent_runtime` when promoting to Google Cloud.
