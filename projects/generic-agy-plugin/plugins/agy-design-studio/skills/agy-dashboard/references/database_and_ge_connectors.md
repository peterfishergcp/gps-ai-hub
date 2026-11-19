# Feeding `/agy-dashboard` from Federated Gemini Enterprise & BigQuery

## 1. Pulling Metrics from Federated SharePoint, OneDrive, Drive, or Email via GE
When a business user wants a dashboard built from spreadsheets, grant trackers, or status emails stored in **SharePoint, OneDrive, Google Drive, or Outlook**:
1. Call `ge_ask_instance` (`agy-ge-bridge`) to retrieve the latest figures and cite the authoritative source document + last-modified timestamp.
2. Normalize the rows into `<target>/data/snapshot.json` (`rows`, `updatedAt`, `sourceLabel`) and sync `<script id="initial-data" type="application/json">` in `index.html`.
3. Display the verified source document title and timestamp in `dashboard.config.json`'s `subtitle` so executives know exactly which SharePoint/Drive record backs the numbers.

## 2. Connecting Live Read-Only Google BigQuery (`query_connector.mjs`)
- **Default Connector:** `"connector": "bigquery"` in `dashboard.config.json`.
- **Zero-Key Auth:** Uses `gcloud auth application-default login` with the user's Entra-synced Google Cloud Identity—never service-account JSON key files.
- **Cost & Injection Guardrails:**
  - Queries must start with `SELECT` or `WITH` (`DROP`, `DELETE`, `UPDATE`, `INSERT`, `ALTER`, `TRUNCATE`, `MERGE`, `GRANT` are deterministically rejected).
  - Always use named `@parameter` bindings and set `BQ_MAX_BYTES_BILLED` (default `1 GB`).
