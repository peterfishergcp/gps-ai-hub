---
name: wv-dashboard
description: Creates, connects, styles, and updates interactive executive and operational dashboards with 100% serverless rendered Side-Pane HTML Artifact previews (zero Python, zero Node server, and zero 127.0.0.1 firewall issues), 1-click standalone HTML download for Chrome/Edge, visual drag-and-drop Customize Layout editing, screenshot style emulation, federated Gemini Enterprise data pulls, and optional BigQuery/SQL live queries. Trigger on /wv-dashboard, "build a dashboard", "create a KPI tracker", or "emulate this dashboard screenshot".
---

# WV Dashboard Studio (`/wv-dashboard`)

Create clean, dynamic business dashboards that **render visually right inside Antigravity's Side Pane with zero web server, zero Python, zero Node.js, and zero `127.0.0.1` firewall issues**—and include a built-in **`Open / Download HTML ↗`** button to open directly in Chrome or Edge.

## Step 1: Align on Style & Data Source (1 Concise Question If Unspecified)
1. **Visual Style:** Ask whether the user has a **screenshot / brand PDF** to emulate, or wants one of the built-in presets:
   - **`wv-official`** *(Default — Capitol Command Navy `#0F1A2A`, WV Gold `#D5A245`, WV Rust `#C1452C`, `Fira Sans`, featuring the West Virginia Command Center header, `Ask Gemini Enterprise` search bar, `PROGRAM / SESSION CLOCK` ribbon, numbered tabs `1. TODAY & TRIAGE`, `2. PRIORITY AGENDA`, `3. ANALYTICS & CHARTS`, `4. FULL REGISTER`, green-bordered System Health banner, and dark-navy-header `NEEDS ACTION NOW` + `MY WORK LIST` operational split panels)*
   - `clean-executive`, `dark-ops`, or `civic-forest`.
   - If they attach a screenshot, inspect it (or delegate to `wv-design-architect`) and write its exact hex colors into `dashboard.config.json` under `theme`.
2. **Data Source (3 Frictionless Paths):**
   - **Federated Gemini Enterprise (`GE`) Instance (`wv-ge-bridge`):** Pull tables/metrics from SharePoint, OneDrive, Google Sheets/Drive, or Outlook reports via `ge_ask_instance` and populate `data/snapshot.json`!
   - **Google BigQuery (Default Database Connector)** or secondary read-only SQL/CSV (`postgres`, `mysql`, `duckdb`, `csv`) — see `./references/database_and_ge_connectors.md`.
   - **Uploaded CSV / Excel / JSON or Starter Template** (`wv-mountain-state-ready`, `wv-legislative-command-center`, `wv-incident-triage`, `executive-kpi`).

## Step 2: Scaffold & Sync the Dashboard (`dashboard-standalone.html` + `index.html`)
1. Run the scaffolder using Antigravity's built-in Node runtime:
   ```bash
   node <skill_dir>/scripts/scaffold_dashboard.mjs --target <target_dir> --template <wv-mountain-state-ready|wv-legislative-command-center|wv-incident-triage|executive-kpi>
   ```
2. Edit `<target_dir>/dashboard.config.json` and `<target_dir>/data/snapshot.json` to match the user's metrics, KPIs, and West Virginia theme.
3. Re-run with `--sync` so both `index.html` and the 100% self-contained single-file `dashboard-standalone.html` (which inlines all CSS, JS, config, and snapshot data) are updated:
   ```bash
   node <skill_dir>/scripts/scaffold_dashboard.mjs --target <target_dir> --sync
   ```

## Step 3: Mandatory Serverless Visual Rendering (ZERO `127.0.0.1` `.url.json` Cards & ZERO Workspace `index.html` Code Links!)
> **CRITICAL UX & FIREWALL RULE:**
> - **NEVER create `.url.json` artifacts pointing to `http://127.0.0.1:...` or `http://localhost:...`** (state corporate laptops block local ports or do not have a server running, causing `ERR_CONNECTION_REFUSED`).
> - **NEVER start `python3 -m http.server`** (users do not have Python installed).
> - **NEVER link workspace `[index.html](file:///.../dashboard/index.html)` in chat** (workspace file links open raw source code in the Code Editor!).

Instead, always complete these 2 serverless steps before replying:
1. **Write the Self-Contained Rendered HTML Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Read `<target_dir>/dashboard-standalone.html` and write it directly to `<appDataDir>/brain/<conversation-id>/<dashboard_name>_dashboard_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Interactive rendered West Virginia Dashboard (click to view & customize visually in the Side Pane, or click 'Open / Download HTML' inside the toolbar for Chrome/Edge)",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
2. **In Your Reply (Inline `<agent-embed>` + Artifact Link Only):**
   - Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/<dashboard_name>_dashboard_preview.html"></agent-embed>` in your chat response.
   - Link **ONLY** to `[Open Rendered Dashboard in Side Pane](file:///<appDataDir>/brain/<conversation-id>/<dashboard_name>_dashboard_preview.html)`.
   - Mention that clicking **`Open / Download HTML ↗`** inside the dashboard's top bar downloads a single self-contained `.html` file they can open directly in Chrome or Edge with zero web server required.

## Step 4: Standing Preservation Rule
Always read `dashboard.config.json` from disk immediately before making follow-up edits so visual layout changes saved by the user are preserved.
