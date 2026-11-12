# Customer Hands-On Workshop Playbook — Google Antigravity, Web Portal & ADK (`AGY Website Workshop`)

> **Note**: This `GEMINI.md` mirrors [`AGENTS.md`](./AGENTS.md) so both **Antigravity CLI (`agy`)** and **Antigravity IDE** automatically load the workshop bootstrap and security guardrails on Turn 1. Follow [`AGENTS.md`](./AGENTS.md) as the single source of truth:
> 1. Run `export PATH="$HOME/.local/bin:$PATH" && bash scripts/preflight.sh` first (read-only auto-discovery) and confirm `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` before mutating anything.
> 2. Use keyless Vertex AI Application Default Credentials (`GOOGLE_GENAI_USE_VERTEXAI=TRUE`, model `gemini-3.8-flash`) — never ask for or write API keys into `.env` or chat.
> 3. Keep Lab 1 in `./lab1-mission-portal/` (previewed via `python3 scripts/preview_lab1.py --port 8081` on `127.0.0.1`, zero `innerHTML`) and scaffold Lab 2/3 cleanly from this root into `./briefing-coach/` via `agents-cli` without double-nesting.
