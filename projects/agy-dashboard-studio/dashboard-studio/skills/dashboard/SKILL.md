---
name: dashboard
description: >-
  Create, connect, style, and launch interactive business dashboards with visual
  drag-and-drop layout editing, screenshot style emulation, and BigQuery-first
  database connectors (BigQuery default, plus PostgreSQL/Cloud SQL, MySQL,
  DuckDB, and CSV). Use when the user asks to create a dashboard, spin up an
  executive or operational tracker, connect charts to BigQuery or another
  database, emulate a dashboard screenshot, or customize a dashboard layout.
license: Apache-2.0
---

# Dashboard Studio (`/dashboard`)

Build clean, dynamic, spec-driven business dashboards that let business users adjust layout, chart types, colors, and titles **visually in their browser without excessive prompting**, while keeping **Google BigQuery** (and secondary databases) cleanly wired underneath.

---

## Step 1: Guided Discovery (Screenshot Emulation + Data Track)

Before generating files for a **new** dashboard, run a concise discovery check if the user has not already supplied these details:

1. **Reference Screenshot or Brand Style (Always Ask First!)**:
   - Ask: *"Do you have a screenshot (or brand flyer/PDF) of a dashboard whose style and layout you want to emulate? Feel free to drop it into chat—or pick one of our built-in clean themes (`wv-official`, `clean-executive`, `dark-ops`, `civic-forest`)."*
   - **If the user provides a screenshot or PDF**: Inspect the image carefully and extract its visual DNA into `dashboard.config.json` -> `theme`:
     - `bg` (page background hex), `surface` (card background hex), `ink` (primary text hex), `muted` (secondary text hex), `border` (card border hex)
     - `primary` (header / primary chart series hex), `accent` (hero KPI / callout highlight hex), `secondary` (secondary badge / connector hex)
     - `radius` (card border radius in px, e.g. `8`, `12`, or `16`), `density` (`"comfortable"` or `"compact"`), and `mode` (`"light"` or `"dark"`)
   - **If no screenshot is provided**: Default to **`wv-official`** when working on State of West Virginia scenarios (`Fira Sans`, Navy `#053254`, Rust `#C1452C`, Gold `#D5A245`) or **`clean-executive`** for general business dashboards.

2. **Database Connection (BigQuery Default)**:
   - Default to **`bigquery`** (`DASHBOARD_CONNECTOR=bigquery`).
   - Support **`postgres`** (PostgreSQL / Cloud SQL / AlloyDB), **`mysql`**, **`duckdb`**, and **`csv`** when requested—see `references/database_connectors.md`.
   - Always keep a populated `data/snapshot.json` fallback so the dashboard renders immediately even before cloud credentials are active.

3. **Starter Scenario or Custom Schema**:
   - Check if one of the bundled templates fits:
     - `wv-mountain-state-ready`: **$40M Mountain State Ready — Site Readiness & Grants Tracker** ($25M Shell Building Loans + $15M Tier 1–3 Site Readiness Grants across West Virginia counties).
     - `wv-incident-triage`: **Mine & Corrections Incident Report Triage** (alert SLAs, routine filing volume, fail-safe flags, zero-Spam audit).
     - `executive-kpi`: Clean multi-KPI BigQuery business starter.

---

## Step 2: Scaffold the Dashboard Project

Run the bundled zero-dependency scaffolder script from **this skill folder** (`skills/dashboard/`), passing the target project directory and chosen template (`wv-mountain-state-ready`, `wv-incident-triage`, or `executive-kpi`):

```bash
node "<skill-dir>/scripts/scaffold_dashboard.mjs" \
  --target "./" \
  --template "wv-mountain-state-ready"
```

This creates:
- `dashboard.config.json` — Single source of truth for theme colors, KPI cards, chart widgets (`span`, `chartType`, `title`, `datasetKey`), filters, and parameterized read-only SQL queries.
- `data/snapshot.json` — Instant local BigQuery-shaped dataset snapshot (updated whenever `query_connector.mjs` runs against live BigQuery or another database).
- `server.mjs` — Hardened `127.0.0.1` local preview server with per-request CSP nonces, synchronizer CSRF protection, `POST /api/config` (saves visual layout edits back to `dashboard.config.json`), and `POST /api/refresh` (re-runs database queries).
- `index.html`, `styles.css`, `app.js` — Clean, dynamic frontend with interactive filter pills, search, responsive SVG charts, and the built-in **Customize Layout** visual drawer.
- `.env.example` and `.gitignore` — Keeps credentials and `.env` files out of version control.

---

## Step 3: Apply Custom Screenshot Theme or Live Database Queries

1. **Preserve Existing Visual Edits**: If `dashboard.config.json` already exists in the project, **always read `dashboard.config.json` first** before modifying it so you never clobber card reordering, column widths (`span`), chart type switches, or color picks the user saved in their browser!
2. **Test / Refresh Database Queries**:
   ```bash
   node "<skill-dir>/scripts/query_connector.mjs" --project-dir "./"
   ```
   - If `GCP_PROJECT_ID` is set in `.env` and `gcloud auth application-default print-access-token` succeeds, `query_connector.mjs` executes the parameterized read-only BigQuery SQL queries and updates `data/snapshot.json` with `"sourceMode": "live-bigquery"`.
   - If cloud credentials are not yet configured, it cleanly retains the local snapshot (`"sourceMode": "snapshot"`) and prints one-line setup instructions without failing.

---

## Step 4: Start the Live Local Preview & Hand Off

Start `server.mjs` in the background on `127.0.0.1`:

```bash
node server.mjs
```

Give the user:
1. The clickable local preview URL (default `http://127.0.0.1:4173`).
2. A concise reminder of how to edit without prompting:
   - Click **Customize Layout** in the top-right corner of the dashboard to **drag-and-drop cards**, **resize widths (`1/3`, `1/2`, `2/3`, `Full`)**, **flip chart types (`Bar`, `Horizontal Bar`, `Line`, `Donut`, `Table`)**, **click any title to rename it**, or **switch color themes**, then click **Save Changes** to persist directly to `dashboard.config.json`.
