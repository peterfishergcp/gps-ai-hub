# Dashboard Studio — Standing Rules

When creating, updating, or connecting dashboards in a project that uses Dashboard Studio, follow these rules at all times:

## 1. Preserve Visual Edits (`dashboard.config.json` Is Source of Truth)
- Dashboards scaffolded by Dashboard Studio store their layout, card order, column spans (`span`: `4`, `6`, `8`, or `12`), chart types (`bar`, `hbar`, `line`, `donut`, `table`), edited titles, and theme colors inside `dashboard.config.json`.
- Because business users edit `dashboard.config.json` visually in the browser via the **Customize Layout** toolbar, **always read `dashboard.config.json` from disk immediately before editing it** so you never overwrite visual layout or color changes the user saved in their browser.
- Do not hardcode KPI values, colors, or card order inside `index.html` or `app.js`. Update `dashboard.config.json` and `data/snapshot.json` instead.

## 2. Always Ask for a Reference Screenshot on New Dashboards
- When a user asks to create a new dashboard and has not yet shared a visual style preference or image, ask whether they have a **screenshot** (or brand flyer/PDF) of a dashboard they want to emulate—or if they want one of the built-in clean dynamic themes (`wv-official`, `clean-executive`, `dark-ops`, `civic-forest`).
- When the user attaches or points to a screenshot, inspect its palette (background, card surface, primary header/brand color, accent highlight color, border contrast, light vs. dark mode, and KPI card density) and write those exact hex tokens into `dashboard.config.json` under `theme`.

## 3. BigQuery Default & Safe Read-Only Database Queries
- Default to **Google BigQuery** (`"connector": "bigquery"`) unless the user names another database (`postgres`, `mysql`, `duckdb`, or `csv`).
- Always keep a realistic or cached `data/snapshot.json` alongside live queries so the dashboard opens immediately even when offline or before cloud credentials are configured.
- Enforce **read-only SQL** (`SELECT` or `WITH ... SELECT` only; never `DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, or `TRUNCATE`).
- Use **parameterized queries** (for example `@region` or `$1`)—never build SQL strings by concatenating untrusted user input.
- Never hardcode database passwords, service-account JSON keys, or API keys in code or chat. Store connection settings in `.env` (gitignored) and document required variables in `.env.example`.

## 4. Loopback-Only Local Preview
- Always bind the local preview server (`node server.mjs`) to `127.0.0.1` (never `0.0.0.0`).
