---
name: wv-dashboard
description: Creates, connects, styles, and updates interactive executive and operational dashboards with Zero-Node Browser Mode (runs directly over file:// in Chrome/Edge with zero installs), visual drag-and-drop Customize Layout editing, screenshot style emulation, federated Gemini Enterprise data pulls, and optional BigQuery/SQL live queries. Trigger on /wv-dashboard, "build a dashboard", "create a KPI tracker", or "emulate this dashboard screenshot".
---

# WV Dashboard Studio (`/wv-dashboard`)

Create clean, dynamic business dashboards that work on **every State of West Virginia corporate laptop with zero extra software installs** (*Zero-Node `file://` Browser Mode*), while automatically unlocking live local `127.0.0.1:4173` BigQuery/SQL previews whenever `node` is available.

## Step 1: Align on Style & Data Source (1 Concise Question If Unspecified)
1. **Visual Style:** Ask whether the user has a **screenshot / brand PDF** to emulate, or wants one of the built-in presets:
   - **`wv-official`** *(Default — WV Navy `#053254`, WV Rust `#C1452C`, WV Gold `#D5A245`, `Fira Sans`)*
   - `clean-executive`, `dark-ops`, or `civic-forest`.
   - If they attach a screenshot, inspect it (or delegate to `wv-design-architect`) and write its exact hex colors into `dashboard.config.json` under `theme`.
2. **Data Source (3 Frictionless Paths):**
   - **Federated Gemini Enterprise (`GE`) Instance (`wv-ge-bridge`):** Pull tables/metrics from SharePoint, OneDrive, Google Sheets/Drive, or Outlook reports via `ge_ask_instance` and populate `data/snapshot.json`!
   - **Google BigQuery (Default Database Connector)** or secondary read-only SQL/CSV (`postgres`, `mysql`, `duckdb`, `csv`) — see `./references/database_and_ge_connectors.md`.
   - **Uploaded CSV / Excel / JSON or Starter Template** (`wv-mountain-state-ready`, `wv-incident-triage`, `executive-kpi`).

## Step 2: Scaffold or Hydrate the Dashboard (With OR Without `node` on `$PATH`!)
Check whether `node` is on `$PATH`:
- **If `node` IS on `$PATH`:**
  Run `node <skill_dir>/scripts/scaffold_dashboard.mjs --target <target_dir> --template <wv-mountain-state-ready|wv-incident-triage|executive-kpi>`, customize `dashboard.config.json` + `data/snapshot.json`, re-sync `<script id="initial-data" type="application/json">` in `index.html`, and optionally start `node server.mjs` on `http://127.0.0.1:4173`.
- **If `node` is NOT on `$PATH` (Standard Locked-Down WV Laptop — Zero-Node Mode!):**
  1. Copy `styles.css`, `app.js`, `index.html`, and `server.mjs` from `<skill_dir>/assets/runtime/` into `<target_dir>/`.
  2. Write `<target_dir>/dashboard.config.json` and `<target_dir>/data/snapshot.json` directly using `write_file` (starting from `<skill_dir>/assets/templates/wv-mountain-state-ready.json` or the user's metrics).
  3. Inject `{"config": <config>, "snapshot": <snapshot>}` (with `<` escaped as `\u003c`) into `<script id="initial-data" type="application/json">` inside `<target_dir>/index.html`.
  4. Give the user a clickable `[index.html](file:///.../index.html)` link—they simply open it in **Chrome or Microsoft Edge**, click **Customize Layout** to drag cards, resize widths (`1/3`, `1/2`, `2/3`, `Full`), swap chart types, or tweak colors, and click **Save Changes** (which writes directly back to `dashboard.config.json` via `window.showSaveFilePicker()` with **zero Node.js installed**)!

## Step 3: Standing Preservation Rule
Always read `dashboard.config.json` from disk immediately before making follow-up edits so visual layout changes saved by the user in Chrome/Edge are preserved.
