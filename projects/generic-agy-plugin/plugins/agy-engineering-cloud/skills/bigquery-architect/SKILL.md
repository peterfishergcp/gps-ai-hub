---
name: bigquery-architect
description: Translates legacy SQL (SQL Server T-SQL, Oracle PL/SQL, DB2, PostgreSQL) to BigQuery Standard SQL, designs partitioned/clustered schemas, enforces dry-run and maximumBytesBilled cost guardrails, and authors parameterized queries for analytics and /agy-dashboard. Trigger on /bigquery-architect, "translate this SQL to BigQuery", "optimize this BigQuery query", or "design a BigQuery schema".
---

# BigQuery SQL Migration, Schema Design & Cost Optimization (`/bigquery-architect`)

Help Public Sector data engineers and analysts design, migrate, and optimize **Google BigQuery** workloads safely and cost-effectively.

## Core BigQuery Engineering Rules
1. **Always Preview Scan Cost (`--dry_run` & `maximumBytesBilled`):**
   - Before running analytical queries on large tables, estimate bytes scanned (`bq query --use_legacy_sql=false --dry_run '...'`) and set `--maximum_bytes_billed=1073741824` (`1 GB` default cap, adjustable with user approval).
2. **Eliminate `SELECT *` on Columnar Tables:**
   - Project only needed columns, push `WHERE` predicates onto partition columns (`DATE(_PARTITIONTIME)` or ingestion/event date column) and cluster keys (e.g. `county`, `agency_id`, `program_code`), and avoid wrapping partition columns in functions (`WHERE DATE(created_ts) = ...` -> prefer range `WHERE created_ts >= TIMESTAMP('2026-01-01') AND created_ts < TIMESTAMP('2026-02-01')`).
3. **Legacy Dialect Translation Cheatsheet (T-SQL / Oracle / Postgres -> BigQuery Standard SQL):**
   - `ISNULL(a, b)` / `NVL(a, b)` -> `COALESCE(a, b)`
   - `TOP 100` / `ROWNUM <= 100` -> `LIMIT 100`
   - `GETDATE()` / `SYSDATE` -> `CURRENT_TIMESTAMP()` or `CURRENT_DATE('America/New_York')`
   - `DATEADD(day, -30, col)` -> `DATE_SUB(col, INTERVAL 30 DAY)` / `TIMESTAMP_SUB(...)`
   - `VARCHAR` / `NVARCHAR` -> `STRING`; `MONEY` / `DECIMAL(18,2)` -> `NUMERIC` (exact 38-digit decimal—never `FLOAT64` for state dollars!)
   - `OUTER APPLY` / correlated subqueries -> `LEFT JOIN UNNEST(...)` or `QUALIFY ROW_NUMBER() OVER (...) = 1` (use `QUALIFY` cleanly instead of nested CTEs for deduplication!).
4. **Parameterized Queries & Row-Level / Policy Tag Hygiene:**
   - Always write `@parameter` placeholders (`@county_name`, `@fiscal_year`)—never string interpolation. Recommend Dataplex / BigQuery **Policy Tags** and `SESSION_USER()` row-level access policies (backed by Entra-synced Google Identity groups!) when tables contain PII, HIPAA, or CJIS attributes.
