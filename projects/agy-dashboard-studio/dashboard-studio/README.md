# Dashboard Studio

**Dashboard Studio** makes it effortless for business analysts, program managers, and agency leaders to spin up clean, dynamic data dashboards in **Google Antigravity**—and customize layout, chart types, colors, and titles visually in Chrome without excessive prompting.

## Key Features

- **Screenshot Style Emulation**: Attach or reference a screenshot (or brand flyer) of any dashboard you admire, and Dashboard Studio extracts its color palette, surface contrast, typography feel, and KPI layout directly into your theme.
- **Visual "Customize Layout" Mode (Zero Prompting Required)**: Click **Customize Layout** directly inside your live browser dashboard to:
  - Drag-and-drop cards to reorder widgets
  - Resize any widget between **1/3**, **1/2**, **2/3**, and **Full** grid width
  - Flip chart types in one click (**Vertical Bar**, **Horizontal Bar**, **Trend Line / Area**, **Donut**, or **Sortable Table**)
  - Click any KPI or chart heading to edit labels inline
  - Switch between curated executive palettes (including **West Virginia Official**, **Executive Zinc**, **Midnight Operations**, and **Civic Forest**) or pick custom brand colors
  - Click **Save Changes** to write your edits straight back to `dashboard.config.json` on disk—so future AI data prompts preserve every visual choice you made.
- **BigQuery by Default + Multi-Database Connectors**:
  - **Google BigQuery (Default)**: Connects via `gcloud auth application-default login` with parameterized, read-only SQL queries and a `maximumBytesBilled` cost guardrail—plus automatic offline snapshot fallback so dashboards stay usable anywhere.
  - **Additional Databases**: Built-in support for **PostgreSQL / Cloud SQL / AlloyDB**, **MySQL**, **DuckDB / SQLite**, and **CSV** files.

## Quickstart

### 1. Validate and Install Locally

```bash
agy plugin validate --strict ./dashboard-studio
agy plugin install ./dashboard-studio
agy plugin list
```

### 2. Build Your First Dashboard

Open a project folder in Antigravity and type `/dashboard` (or click one of the starter prompts on the plugin page):

```text
/dashboard Spin up a BigQuery dashboard for our program metrics. Ask me if I have a screenshot to emulate first.
```

### 3. Customize Visually in Your Browser

Open the local preview link (`http://127.0.0.1:4173`), click **Customize Layout** in the top-right bar, arrange your cards and chart types visually, and click **Save Changes**.

## Included Starter Templates

- **`wv-mountain-state-ready`**: Tracks the **$40M Mountain State Ready** site readiness portfolio ($25M Shell Building Loan Program + $15M Tier 1–3 Site Readiness Grant Program across West Virginia counties).
- **`wv-incident-triage`**: Tracks **Mine & Corrections Incident Report Triage** operations (critical alert SLAs, routine filing automation, fail-safe attachment flags, and zero-Spam verification).
- **`executive-kpi`**: Clean general-purpose BigQuery revenue, operations, and service-level executive template.

## Security & Data Hygiene

- Local preview binds exclusively to `127.0.0.1` (loopback only) with per-request Content Security Policy nonces and CSRF protection.
- Database connectors enforce read-only `SELECT` / `WITH` queries with parameterized bindings (`@param`) and `.gitignore` protection for `.env` files.
