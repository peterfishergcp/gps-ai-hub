# Database Connectors Reference

Dashboard Studio uses **Google BigQuery** by default and supports four additional data sources through `scripts/query_connector.mjs` and `.env` configuration. Every connector writes normalized query results to `data/snapshot.json` so your dashboard renders instantaneously and works offline when needed.

## 1. Google BigQuery (`bigquery` — Default)

### Authentication (Recommended: Keyless ADC)
Run once in Terminal (Mac/Linux) or PowerShell (Windows):

```bash
gcloud auth application-default login
gcloud config set project YOUR_GCP_PROJECT_ID
```

Set in `.env`:
```ini
DASHBOARD_CONNECTOR=bigquery
GCP_PROJECT_ID=your-gcp-project-id
BQ_LOCATION=US
BQ_MAX_BYTES_BILLED=1073741824
```

### How Query Execution Works
1. `query_connector.mjs` checks that every SQL statement in `dashboard.config.json` (`queries`) begins with `SELECT` or `WITH` and contains zero DDL/DML keywords.
2. It acquires a short-lived OAuth2 token from `gcloud auth application-default print-access-token` (no JSON key files on disk) and calls the BigQuery `jobs.query` REST endpoint over HTTPS with `useLegacySql: false`, `maximumBytesBilled`, and typed `queryParameters`.
3. If `gcloud` or `GCP_PROJECT_ID` is not configured (for example during a zero-setup workshop dry run), `query_connector.mjs` preserves the bundled `data/snapshot.json` dataset and marks `"sourceMode": "snapshot"` so the user is never blocked.

### Sample Public Dataset Query (Works on Any GCP Project)
```sql
SELECT
  state AS category,
  COUNT(*) AS value
FROM `bigquery-public-data.usa_names.usa_1910_current`
WHERE year >= @min_year
GROUP BY state
ORDER BY value DESC
LIMIT 12
```

---

## 2. PostgreSQL / Cloud SQL / AlloyDB (`postgres`)

Set in `.env`:
```ini
DASHBOARD_CONNECTOR=postgres
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=analytics
PGUSER=readonly_analyst
# Pass PGPASSWORD in your local .env or OS keychain — never commit .env
PGSSLMODE=require
```

- Uses `psql --csv --no-psqlrc --set=ON_ERROR_STOP=1` with read-only transaction enforcement (`SET default_transaction_read_only = on;`).
- For Google Cloud SQL or AlloyDB, run the Cloud SQL Auth Proxy or AlloyDB Auth Proxy on `127.0.0.1:5432` using IAM authentication.

---

## 3. MySQL / Cloud SQL for MySQL (`mysql`)

Set in `.env`:
```ini
DASHBOARD_CONNECTOR=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=analytics
MYSQL_USER=readonly_analyst
```

- Executes read-only `SELECT` / `WITH` queries via `mysql --batch --raw` over TLS (`--ssl-mode=REQUIRED` for remote hosts).

---

## 4. DuckDB / Local Parquet & SQLite (`duckdb`)

Set in `.env`:
```ini
DASHBOARD_CONNECTOR=duckdb
DUCKDB_PATH=./data/warehouse.duckdb
```

- Executes `duckdb -readonly -json` against local `.duckdb`, `.parquet`, or `.sqlite` files—ideal for fast local analytics before loading into BigQuery.

---

## 5. CSV / Spreadsheet Exports (`csv`)

Set in `.env`:
```ini
DASHBOARD_CONNECTOR=csv
CSV_PATH=./data/input.csv
```

- Parses header-row CSV files directly in Node.js (handling quoted commas and numeric columns) and maps rows into `data/snapshot.json` with zero external dependencies.
