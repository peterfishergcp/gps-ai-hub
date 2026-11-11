# Architecture: Gemini Enterprise Token Consumption & WIF Usage Telemetry

## 1. Design Philosophy

Organizations such as universities (e.g., Colorado School of Mines) and enterprise FinOps teams often ask:
> *"How can we track input and output token consumption per user (Workforce Identity or Google Workspace), per model, and per Gemini Enterprise app instance?"*

Unlike full legal eDiscovery (which requires harvesting raw uploaded/generated binary files from private user sessions via Cloud KMS WIF token exchange), **token consumption and usage metrics** can be captured 100% natively using two Google Cloud telemetry streams that Discovery Engine emits when `observabilityEnabled=true`:

1. **Cloud Trace (`_Trace` Bucket -> BigQuery Linked Dataset `trace_link._AllSpans`)**:
   - Captures every `generate_content` model invocation span across Gemini Enterprise chat, Deep Research, and custom Agents.
   - Records `attributes['gen_ai.usage.input_tokens']`, `attributes['gen_ai.usage.output_tokens']`, `attributes['gen_ai.request.model']`, and `attributes['gen_ai.conversation.id']` (`/engines/{engine_id}/sessions/{session_id}`).
2. **Cloud Logging (`discoveryengine.googleapis.com/gemini_enterprise_user_activity` & `notebooklm_enterprise_user_activity`)**:
   - Records `trace` (`trace_id`), `jsonPayload.userIamPrincipal` (the authenticated WIF subject or Workspace email), `session_id`, `engine_id`, and `methodName`.

By joining `trace_link._AllSpans` with the partitioned BigQuery activity log table on `trace_id` and `session_id`, we achieve exact per-user, per-engine, and per-model token attribution with **zero polling jobs, zero KMS keys, and zero Cloud Storage buckets**.

---

## 2. Component Inventory

| File | Responsibility |
| :--- | :--- |
| `enable_ge_observability.py` | Iterates across `global`, `us`, and `eu` to enable `observabilityEnabled=true` (and configurable `sensitiveLoggingEnabled`) on all Gemini Enterprise engines, custom agents, and NotebookLM Enterprise. |
| `setup_bigquery_token_tracking.py` | Provisions the BigQuery dataset (`ge_token_analytics`), the partitioned Cloud Logging sink (`ge-token-tracking-bq-sink`), the Cloud Trace BigQuery link (`trace_link`), and the SQL views (`v_ge_activity_logs`, `v_gemini_token_usage_by_user`, `v_token_usage_summary_by_principal`). |
| `dashboard/app.py` | Flask + Chart.js web application serving the KPI cards, Token Usage by Model chart, Token Usage by WIF Principal chart, Daily Token Consumption Trend chart, WIF Principal Attribution table, CSV export (`/api/export-csv`), and standalone HTML export (`/api/export-html`). |
| `deploy_dashboard.py` | Provisions a least-privilege read-only service account (`ge-token-dashboard-sa`) with `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` and deploys `dashboard/` to Cloud Run with `--no-allow-unauthenticated` and `--iap`. |
| `dashboard/test_app.py` | Automated `pytest` suite validating endpoints, engine filtering, CSP nonces, HTTP security headers, CSV export, and HTML report generation. |

---

## 3. Security Architecture

- **Strict Content Security Policy (CSP) & Nonce Enforcement**: Every HTTP response generates a cryptographic per-request nonce (`secrets.token_urlsafe(16)`) applied to `<script>` and `<style>` tags without `'unsafe-inline'`.
- **DOM-Safe Frontend Rendering**: The client table and selectors use `document.createElement()`, `textContent`, and `replaceChildren()` exclusively—zero `innerHTML` assignments exist in the codebase.
- **Parameterized BigQuery SQL**: All user-supplied filter parameters (`engine_id`) are bound using `bigquery.ScalarQueryParameter("engine_id", "STRING", engine_id)` and validated against strict allow-list regular expressions.
- **Least-Privilege Cloud Run Identity**: The Cloud Run service runs as a non-root container user (`appuser`) under a dedicated service account (`ge-token-dashboard-sa`) granted only BigQuery read/query roles (`roles/bigquery.dataViewer`, `roles/bigquery.jobUser`), protected by Cloud Run Identity-Aware Proxy (`--iap`).
