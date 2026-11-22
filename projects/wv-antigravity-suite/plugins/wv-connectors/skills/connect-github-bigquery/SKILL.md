---
name: connect-github-bigquery
description: Connects Antigravity to GitHub (via Federated Gemini Enterprise search plus direct git/GitHub MCP for pull requests) and Google BigQuery (cost-capped read-only ADC or remote MCP for /wv-dashboard and /bigquery-architect). Trigger on /connect-github-bigquery, "connect GitHub", "connect BigQuery", or "set up database/repo access".
---

# GitHub & BigQuery Connector Setup (`/connect-github-bigquery`)

Guides West Virginia analysts and engineers through the cleanest zero-install patterns for **GitHub** and **Google BigQuery** alongside their **Gemini Enterprise (`GE`)** subscription.

## Part A: GitHub (2 Complementary Paths)

1. **Path 1 — Federated GitHub Search via Your GE Instance (Zero Setup Beyond `/connect-ge`):**
   - Ideal for searching issues, pull requests, READMEs, architecture docs, and code across organization repos already connected to your GE instance:
   - Query your federated GitHub connector via your agency's remote HTTPS GE Gateway or Gemini Enterprise Web App (`StreamAssist`), making sure you clicked **Authorize** on GitHub once inside your GE Web App.
2. **Path 2 — Direct Git / GitHub Remote MCP (For Branching, Commits & Pull Requests):**
   - For developer workstations creating branches and PRs:
     - Prefer `gh auth login` (HTTPS browser flow—no plaintext PATs stored in files) or Antigravity's **GitHub MCP** integration in **Additional Options (...) > MCP Servers**.
     - Always work on feature branches (`feat/...`, `fix/...`), exclude `.env*` and `*credentials*.json` in `.gitignore`, and open pull requests for peer review rather than pushing directly to `main`.

---

## Part B: Google BigQuery (Zero-Library Analytics for `/wv-dashboard` & `/bigquery-architect`)

1. **Keyless Google Identity Auth (Entra-Synced `@wv.gov` Account):**
   - Never download or commit service-account JSON keys to a state laptop!
   - Authenticate once using your synced Google Cloud Identity:
     ```bash
     gcloud auth application-default login
     ```
2. **Cost & Read-Only Safety Guardrails (Mandatory):**
   - Enforce **`SELECT` / `WITH ... SELECT` read-only queries** for dashboards and exploration.
   - Always run a `--dry_run` estimate or set `maximumBytesBilled` (default `1073741824` = `1 GB`) so an unpartitioned scan cannot surprise agency budgets.
   - Use parameterized queries (`@county`, `@start_date`)—never string-concatenated SQL.
3. **Feeding `/wv-dashboard` Without Requiring Local Node Drivers:**
   - Query results can be exported or hydrated directly into `data/snapshot.json` (and `<script id="initial-data" type="application/json">` for **Zero-Node Browser Mode**), or queried live on `127.0.0.1:4173` via `query_connector.mjs` (`https://bigquery.googleapis.com` REST API using built-in Node `https`—zero `@google-cloud/bigquery` npm install required!).
