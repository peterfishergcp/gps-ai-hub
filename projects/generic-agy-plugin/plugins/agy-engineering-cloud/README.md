# AGY Engineering — Refactoring, Cloud Run & BigQuery (`agy-engineering-cloud`)

Equips Public Sector application, data, and cloud engineers with Google's stage-gated modernization, serverless deployment, and data-warehouse workflows—without requiring local Docker daemons or heavy third-party toolchains on corporate laptops.

*(Non-technical business staff can optionally toggle this plugin off anytime under **Customizations > Installed** while keeping all business, FOIA, connector, and design skills active.)*

## Included Skills
- **`/modernize-refactor`** — Adapted from [migrate-to-rust](https://github.com/google/skills/tree/main/skills/developers/migrate-to-rust): enforces a 3-stage engineering contract (**Stage 0** Legacy Code Execution Gate -> **Stage 1** 6-Section Blueprint & Latent Bug Audit -> **Stage 2** Bounded Self-Healing Crucible + A/B Output Parity + HTML Migration Infographic) across modern Python, TypeScript, Go, Java, or `#![forbid(unsafe_code)]` Safe Rust.
- **`/deploy-cloudrun`** — Deploys applications to Google Cloud Run directly from source (`gcloud run deploy --source .` via remote Cloud Build—zero local Docker required) with dedicated service accounts, `.gcloudignore`, and Secret Manager.
- **`/bigquery-architect`** — Translates legacy SQL Server, Oracle, DB2, or PostgreSQL queries into partitioned, cost-capped, parameterized BigQuery Standard SQL.
- **`/find-cloud-skill`** — Fetches specialized official skills on demand from [Google Skills](https://github.com/google/skills/tree/main/skills) over HTTPS `443` when touching GKE, AlloyDB, Apigee, Vertex AI Agent Platform, or Cloud Logging/Monitoring.
