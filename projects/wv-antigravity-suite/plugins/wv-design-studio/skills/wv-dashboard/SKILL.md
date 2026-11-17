---
name: wv-dashboard
description: Creates, connects, styles, and updates interactive executive and operational dashboards with automatic rendered Side-Pane Artifact preview, 1-click Browser Launch URL cards (via the built-in WV Preview sidecar on 127.0.0.1:4175), Zero-Node Browser Mode, visual drag-and-drop Customize Layout editing, screenshot style emulation, federated Gemini Enterprise data pulls, and optional BigQuery/SQL live queries. Trigger on /wv-dashboard, "build a dashboard", "create a KPI tracker", or "emulate this dashboard screenshot".
---

# WV Dashboard Studio (`/wv-dashboard`)

Create clean, dynamic business dashboards that **render visually right inside Antigravity AND open in Chrome/Edge with 1 click**—never showing raw HTML source code (`</> index.html`) and never requiring terminal `Allow open...` confirmation popups.

## Step 1: Align on Style & Data Source (1 Concise Question If Unspecified)
1. **Visual Style:** Ask whether the user has a **screenshot / brand PDF** to emulate, or wants one of the built-in presets:
   - **`wv-official`** *(Default — WV Navy `#053254`, WV Rust `#C1452C`, WV Gold `#D5A245`, `Fira Sans`)*
   - `clean-executive`, `dark-ops`, or `civic-forest`.
   - If they attach a screenshot, inspect it (or delegate to `wv-design-architect`) and write its exact hex colors into `dashboard.config.json` under `theme`.
2. **Data Source (3 Frictionless Paths):**
   - **Federated Gemini Enterprise (`GE`) Instance (`wv-ge-bridge`):** Pull tables/metrics from SharePoint, OneDrive, Google Sheets/Drive, or Outlook reports via `ge_ask_instance` and populate `data/snapshot.json`!
   - **Google BigQuery (Default Database Connector)** or secondary read-only SQL/CSV (`postgres`, `mysql`, `duckdb`, `csv`) — see `./references/database_and_ge_connectors.md`.
   - **Uploaded CSV / Excel / JSON or Starter Template** (`wv-mountain-state-ready`, `wv-incident-triage`, `executive-kpi`).

## Step 2: Scaffold & Sync the Dashboard (`dashboard-standalone.html` + `index.html`)
1. Run the scaffolder using Antigravity's built-in Node runtime (or `node` on `$PATH`):
   ```bash
   node <skill_dir>/scripts/scaffold_dashboard.mjs --target <target_dir> --template <wv-mountain-state-ready|wv-incident-triage|executive-kpi>
   ```
2. Edit `<target_dir>/dashboard.config.json` and `<target_dir>/data/snapshot.json` to match the user's metrics, KPIs, and West Virginia theme.
3. Re-run with `--sync` so `index.html`, the self-contained single-file `dashboard-standalone.html`, and the `WV Preview` sidecar registry (`~/.gemini/config/plugin_data/wv-design-studio/deliverables.json`) are all updated:
   ```bash
   node <skill_dir>/scripts/scaffold_dashboard.mjs --target <target_dir> --sync
   ```
   Note the `STANDALONE_ARTIFACT_HTML=` path and `LIVE_PREVIEW_URL=http://127.0.0.1:4175/view/<id>` printed by the script.

## Step 3: Mandatory Visual Rendering & 1-Click Browser Launch (NEVER Link Raw Workspace `index.html` as the Preview!)
> **CRITICAL UX RULE:** In Antigravity, clicking a workspace file link like `[index.html](file:///.../dashboard/index.html)` opens the **Code Editor** (`</> index.html` raw source code), NOT a rendered dashboard! And running `open index.html` via `run_command` triggers a terminal confirmation popup.

Instead, you **MUST** always complete both of these native artifact steps before replying:
1. **Write the Rendered Visual HTML Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Read `<target_dir>/dashboard-standalone.html` (which has all CSS, JS, config, and snapshot data inlined into a single file) and write it to `<appDataDir>/brain/<conversation-id>/<dashboard_name>_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Interactive rendered preview of the West Virginia Dashboard (click to view & customize visually in the Side Pane)",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
   - Clicking this Artifact Card in chat opens the **rendered visual dashboard** directly in Antigravity's right-hand Side Pane!
2. **Write the 1-Click Browser Launch URL Artifact (`.url.json`):**
   - Using the `LIVE_PREVIEW_URL` printed by `scaffold_dashboard.mjs` (for example, `http://127.0.0.1:4175/view/dash-...`), use `write_file` to create `<appDataDir>/brain/<conversation-id>/Launch Dashboard in Browser.url.json` with `ArtifactMetadata: { "Summary": "1-click browser launch", "UserFacing": true, "RequestFeedback": false }`:
     ```json
     {
       "url": "http://127.0.0.1:4175/view/<id>",
       "title": "Launch Interactive Dashboard in Browser (Chrome / Edge)",
       "description": "Opens the live rendered dashboard with Customize Layout & Save Changes enabled—zero terminal prompts."
     }
     ```
3. **In Your Reply:** Point the user to:
   - The **Rendered Dashboard Artifact Card** (to view and interact right inside Antigravity's Side Pane),
   - The **Launch Interactive Dashboard in Browser** URL Card (to open `http://127.0.0.1:4175/view/<id>` in Chrome/Edge with 1 click), or
   - The **`WV Preview`** button in Antigravity's left Sidebar / right AuxPane!

## Step 4: Standing Preservation Rule
Always read `dashboard.config.json` from disk immediately before making follow-up edits so visual layout changes saved by the user are preserved.
