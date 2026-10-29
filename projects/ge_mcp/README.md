# Gemini Enterprise Custom MCP Connectors (`ge_mcp`)

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the [Apache License 2.0](../../LICENSE).

This directory contains **7 hardened Streamable HTTP Model Context Protocol (MCP) servers** for **Google Cloud Run** and **Gemini Enterprise**, plus **1 Microsoft Purview / Azure RMS verification harness** (`workiq-mcp-purview`).

---

## Module Catalog & Architecture Decision Matrix

| Directory | Target System | Tools | Auth & Security Model | When to Deploy |
| :--- | :--- | :--- | :--- | :--- |
| [`claude_mcp_sonnet`](./claude_mcp_sonnet) | Vertex AI Anthropic Claude | 2 | Inbound OAuth/Bearer or IAM + Dedicated Cloud Run SA (`max_tokens <= 8192`) | Expose Claude on Vertex AI as a custom reasoning tool inside Gemini Enterprise. |
| [`customize_outlook_mcp`](./customize_outlook_mcp) | Microsoft 365 Outlook Mail & Calendar | 6 | Delegated Microsoft Entra OAuth 2.0 (`Mail.ReadWrite`, `Calendars.ReadWrite`) | Read/search/draft/send Outlook mail and query/create Calendar events (`/calendarView` date-bounded) with human confirmation (`destructiveHint: true`). |
| [`sharepoint-mcp-server`](./sharepoint-mcp-server) | SharePoint Online & OneDrive | 12 | Delegated Microsoft Entra OAuth 2.0 | Baseline SharePoint & OneDrive read/write connector (`?web=1` Office viewer links + `#page=N` PDF anchors). |
| [`customize-sharepoint-mcp-server`](./customize-sharepoint-mcp-server) | SharePoint Online & OneDrive | 12 | Delegated Microsoft Entra OAuth 2.0 + Optional `ALLOWED_SHAREPOINT_SITES` | Adds calibrated `+1` Cover Page PDF anchor rules, structured citation templates, and optional site filtering. |
| [`least-privilege-sharepoint-mcp-server`](./least-privilege-sharepoint-mcp-server) | SharePoint Online (Selected Sites Only) | 7 (Read-Only) | Entra ID **`Sites.Selected`** (`roles: ["read"]`) + Signed OAuth Session Token | **Recommended when tenant-wide `Sites.ReadWrite.All` is prohibited.** Strictly read-only (`GET`-only Graph interceptor) and fail-closed on `ALLOWED_SHAREPOINT_SITES`. |
| [`sharepoint-mcp-server-purview-label`](./sharepoint-mcp-server-purview-label) | SharePoint + Gemini Enterprise Native SDP | 12 | Delegated Microsoft Entra OAuth 2.0 + Bounded Async `docProps/custom.xml` | Emits `msip_labels`, `assigned_labels`, and `assigned_sensitivity_labels` so **Gemini Enterprise's native connector-level SDP Content Policy** enforces `ALLOW`/`BLOCK` verdicts without calling DLP from Cloud Run. |
| [`sharepoint-mcp-server-purview-sdp`](./sharepoint-mcp-server-purview-sdp) | SharePoint + Server-Side Cloud SDP Enforcement | 12 | Delegated Microsoft Entra OAuth 2.0 + Dynamic Cloud DLP Sync (`dlp.googleapis.com`) | Synchronizes Purview GUIDs and custom regex rules from Cloud SDP at runtime and **withholds `BLOCK`-classified text inside the MCP server itself** (`blocked: true`) while still emitting `msip_labels` for audit logging. |
| [`workiq-mcp-purview`](./workiq-mcp-purview) | Microsoft WorkIQ MCP + Azure RMS / Purview | Python Harness | MFA-compatible `msal` Device Code / Interactive OAuth (`v2.0`) | End-to-end verification suite proving delegated Purview RMS decryption (`MS-OFFCRYPTO`) and SOC `EXTRACT` restriction enforcement. |

---

## Which SharePoint MCP Server Should I Deploy?

1. **Need strict read-only access to 1–5 specific SharePoint sites (`Sites.Selected`)?**
   -> Deploy [`least-privilege-sharepoint-mcp-server`](./least-privilege-sharepoint-mcp-server).
2. **Enforcing Microsoft Purview Sensitivity Labels via Gemini Enterprise's native Connector SDP Policy?**
   -> Deploy [`sharepoint-mcp-server-purview-label`](./sharepoint-mcp-server-purview-label).
3. **Need defense-in-depth server-side DLP redaction/blocking before tool output leaves Cloud Run?**
   -> Deploy [`sharepoint-mcp-server-purview-sdp`](./sharepoint-mcp-server-purview-sdp).
4. **Standard delegated SharePoint & OneDrive collaboration with calibrated PDF/Office citations?**
   -> Deploy [`customize-sharepoint-mcp-server`](./customize-sharepoint-mcp-server) (or [`sharepoint-mcp-server`](./sharepoint-mcp-server)).

---

## Security Controls Applied Across All 7 Cloud Run MCP Servers

- **Authenticated `/mcp` Access (`HTTP 401` Fail-Closed)**: Unauthenticated calls and placeholder `"mock"` tokens are rejected at `/mcp`.
- **Exact-Match OAuth `redirect_uri` Allowlist (`CWE-601`)**: Built-in `/auth` endpoints validate `redirect_uri` against `https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html` (plus `ALLOWED_OAUTH_REDIRECT_URIS`).
- **Cloud Secret Manager & Least-Privilege Runtime (`CWE-526` / `CWE-250`)**:
  - Every `deploy.sh` mounts secrets via `--set-secrets` (never plaintext `--set-env-vars`), binds a dedicated Cloud Run `--service-account`, and excludes local `.env*` files via `.gcloudignore` and `.dockerignore`.
  - Every `Dockerfile` copies only explicit runtime source files (`package*.json`, entrypoint, and helper modules) and executes under non-root `USER node`.
- **Safe Multi-Format Document Extraction & Zip-Bomb Protection (`CWE-409` / `CWE-400`)**:
  - All 5 SharePoint servers extract `.docx` (`mammoth`), `.xlsx` (`exceljs`), `.pptx` (slide-ordered XML), `.pdf` (`unpdf`), and plain-text formats with `0` known npm advisories.
  - OOXML ZIP decompression uses asynchronous `zlib.inflateRaw` capped at `maxOutputLength: 10 MB` per XML entry (`25 MB` cumulative, `<=250` entries) and 5-way bounded concurrency.

---

## Recommended Production Hardening: Switch to `--no-allow-unauthenticated` + `roles/run.invoker`

Each server's `deploy.sh` retains `--allow-unauthenticated` by default so Gemini Enterprise can forward delegated OAuth Bearer headers without proxy stripping during initial evaluation, while the application layer enforces Bearer token validation.

For **production** deployments, lock down Cloud Run network ingress to `--no-allow-unauthenticated` (or front Cloud Run with an External HTTPS Load Balancer + Identity-Aware Proxy) and grant `roles/run.invoker` strictly to your authorized caller service account:

```bash
# 1. Disable public unauthenticated Cloud Run ingress
gcloud run services update "<SERVICE_NAME>" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker strictly to your authorized caller / Discovery Engine service agent
gcloud run services add-iam-policy-binding "<SERVICE_NAME>" \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Running Local Smoke Tests & Clean Repository Export

Every MCP server ships with an automated loopback (`127.0.0.1`) verification suite (`test_local.sh`):

```bash
for srv in \
  claude_mcp_sonnet \
  customize_outlook_mcp \
  sharepoint-mcp-server \
  customize-sharepoint-mcp-server \
  least-privilege-sharepoint-mcp-server \
  sharepoint-mcp-server-purview-label \
  sharepoint-mcp-server-purview-sdp; do
  (cd "$srv" && npm ci && ./test_local.sh)
done
```

To stage a clean, single-commit export of `ge_mcp` free of prior development commit history:

```bash
chmod +x prepare_clean_gtm_export.sh
./prepare_clean_gtm_export.sh /tmp/ge_mcp_clean_export
```
