# OWASP, Google Cloud WAF & Public-Sector Assured Workloads Audit Checklist

Adapted from `google-cloud-waf-security` and `assured-workloads-basics` in [Google Skills](https://github.com/google/skills/tree/main/skills).

## 1. Web, API & MCP Code Verification Checks
- **DOM & Template Safety (`CWE-79`):** Zero unescaped HTML string concatenation; zero `innerHTML`/`outerHTML`/`insertAdjacentHTML`; `<script type="application/json">` escapes `<` as `\u003c`; strict `Content-Security-Policy` header without `'unsafe-eval'`.
- **SQL & Data Layer (`CWE-89`):** 100% parameterized queries; read-only DB credentials/modes on reporting endpoints; bounded `LIMIT` and `maximumBytesBilled`.
- **Filesystem & Archive Handling (`CWE-22`):** `path.resolve()` verified against `baseDir + path.sep` (with trailing separator so `/app-evil` never matches `/app`); archive extractors reject `..`, leading `/`, Windows `\`, and symlinks before writing bytes.
- **SSRF (`CWE-918`):** Outbound `https.request` / `fetch` validates parsed `url.protocol === 'https:'` and matches `url.hostname` against a strict allowlist (blocking RFC1918, `169.254.169.254` metadata server, and localhost in prod).
- **State-Changing Endpoints (`CWE-352`):** Verify `Origin`/`Host`, `SameSite` cookies, and cryptographic CSRF tokens on local/cookie-authenticated POST/PUT/DELETE routes.

## 2. Google Cloud & Public-Sector Assured Workloads Checks
- **Identity & Groups:** Bind IAM roles to **Azure/Entra-synced Google Cloud Identity groups** (`group:wv-agency-analysts@wv.gov`) rather than individual user emails so Entra offboarding revokes GCP & Gemini Enterprise access automatically.
- **Assured Workloads Folders:** Place regulated workloads (*CJIS, HIPAA, FedRAMP Moderate/High, IRS 1075*) inside an **Assured Workloads folder** enforcing `gcp.resourceLocations` (`us-locations` / `us-east4`), CMEK (`Cloud KMS`), Access Transparency, and Access Approval.
- **Guardrails for Enterprise AI:** Add **Model Armor** prompt-injection/data-loss filters and **Sensitive Data Protection (SDP)** de-identification templates (configured **fail-closed** on inspection error) in front of external or citizen-facing AI workflows.
