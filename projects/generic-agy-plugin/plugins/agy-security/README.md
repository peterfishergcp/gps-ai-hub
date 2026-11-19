# AGY Security, Assured Workloads & IAM Best Practices (`agy-security`)

Provides **always-on secure coding guardrails** plus on-demand security and IAM auditing for Public Sector builders—requiring **zero local scanner binaries** on corporate laptops.

## Included Customizations
- **Always-On Guardrails (`rules/AGENTS.md`)** — Protects every workspace against hardcoded API keys/secrets, SQL concatenation, `innerHTML` DOM XSS, `0.0.0.0` local dev exposure, ZipSlip path traversal, shared service-account token misuse, and accidental PII leakage.
- **`/security-audit`** — Structured OWASP Top 10 + Google Cloud Well-Architected Security Pillar + Assured Workloads (*FedRAMP Moderate/High, CJIS, HIPAA, IRS 1075*) review with concrete remediation diffs.
- **`/iam-secret-hygiene`** — Replaces primitive IAM roles (`roles/editor`, `roles/owner`, default compute service accounts) and plaintext secrets with least-privilege roles, Entra-synced Google Identity group bindings, and Secret Manager.
