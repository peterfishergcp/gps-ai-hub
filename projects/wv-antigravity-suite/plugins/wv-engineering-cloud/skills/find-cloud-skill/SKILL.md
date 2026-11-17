---
name: find-cloud-skill
description: Dynamically locates and fetches specialized official Google Cloud and developer skills from github.com/google/skills over HTTPS 443 on demand (covering GKE, AlloyDB, Cloud SQL, Spanner, Apigee, Vertex AI Agent Platform, Cloud Logging/Monitoring, Firebase, and Assured Workloads) without bloating laptop installs. Trigger on /find-cloud-skill or when a task needs deep product-specific Google Cloud patterns beyond Cloud Run and BigQuery.
---

# On-Demand Google Cloud Skill Loader (`/find-cloud-skill`)

Instead of pre-installing 80+ specialized cloud skills on every laptop, fetch the exact official skill from **[Google Skills](https://github.com/google/skills/tree/main/skills)** on demand whenever an engineering task touches a specialized Google Cloud service.

## Predictable Official Catalog Families (`github.com/google/skills/tree/main/skills`)
- **Cloud Compute & Containers:** `cloud-run-basics`, `gke-*` (networking, scaling, cost, AI inference, troubleshooting)
- **Databases & Analytics:** `bigquery-*`, `alloydb-*`, `cloud-sql-*`, `spanner-*`, `bigtable-*`, `firestore-*`
- **AI & Agent Platform:** `agent-platform-*` (RAG, tuning, evaluation, endpoints), `gemini-*`, `genkit-*`
- **Security, Compliance & Architecture:** `assured-workloads-basics`, `google-cloud-waf-*` (Well-Architected Framework pillars), `iam-helper-*`, `cloud-logging-*`, `cloud-monitoring-*`
- **Language & Code Modernization:** `developers/migrate-to-rust`

## How to Load a Skill Cleanly on Locked-Down Laptops
1. Identify the matching skill folder under `skills/cloud/` or `skills/developers/` on `github.com/google/skills`.
2. Fetch its `SKILL.md` read-only over standard HTTPS `443` (or via web search if direct raw fetch is proxy-filtered)—never execute remote scripts uninspected—and apply its official patterns to the user's architecture or code!
