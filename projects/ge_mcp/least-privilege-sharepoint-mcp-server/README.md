# Least-Privilege SharePoint MCP Server (`Sites.Selected` Read-Only)

This module provides a **Least-Privilege, Site-Scoped, Read-Only** Model Context Protocol (MCP) connector bridging Microsoft Graph API with **Gemini Enterprise**.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the Apache License 2.0.

Unlike standard SharePoint connectors that require tenant-wide `Sites.ReadWrite.All` and `Files.ReadWrite.All`, this server is architected specifically for **Microsoft Entra ID `Sites.Selected`** permissions—restricting the AI agent to **read-only (`read`) access on explicitly approved SharePoint sites only**.

---

## Core Enterprise Capabilities

- **True Entra ID Least-Privilege (`Sites.Selected`)**:
  - Uses Microsoft Graph's `Sites.Selected` Application permission rather than tenant-wide `.All` scopes.
  - Access is granted per SharePoint site with `roles: ["read"]`.
- **Fail-Closed Site & Drive Allowlist (`ALLOWED_SHAREPOINT_SITES`)**:
  - Enforces a server-side allowlist of approved SharePoint sites and their document library `driveId`s.
  - Any request targeting a site or drive outside `ALLOWED_SHAREPOINT_SITES` is immediately rejected.
- **Strictly Read-Only Enforcement (7 Tools)**:
  - Exposes 7 read-only tools (`readOnlyHint: true`, `destructiveHint: false`) plus a request-level HTTP interceptor blocking `POST`, `PUT`, `PATCH`, and `DELETE` calls against `graph.microsoft.com`.
- **Multi-Format Extraction**:
  - Extracts clean text from Word (`.docx`), Excel (`.xlsx` via `exceljs`), PowerPoint (`.pptx` slide-ordered XML), PDF (`.pdf` via `unpdf`), and structured text/CSV/Markdown/HTML files with strict `15 MB` file-size and `10 MB` async zip-inflation bounds.
- **Verified OAuth 2.0 Session Handshake**:
  - Rejects unauthenticated requests and `"mock"` tokens (`HTTP 401`).
  - `/auth` enforces an exact-match `redirect_uri` allowlist (`https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html`), and `/token` verifies `client_id` + `client_secret` before issuing an HMAC-SHA256 signed `mcp_st_...` session token.

---

## Supported Read-Only Action Catalog (7 Tools)

1. `query_sharepoint_sites_lookup` — List or filter approved SharePoint sites in `ALLOWED_SHAREPOINT_SITES`.
2. `query_document_libraries_lookup` — List document libraries inside an approved SharePoint site.
3. `query_library_items_lookup` — List files and folders inside an approved library or subfolder.
4. `query_search_files_lookup` — Search files by keyword or filename across approved sites (`Sites.Selected`-compatible traversal).
5. `query_file_metadata_lookup` — Retrieve detailed properties for a file in an approved site (`itemId` required).
6. `query_file_content_lookup` — Extract text from `.docx`, `.xlsx`, `.pptx`, `.pdf`, and text files (`itemId` required).
7. `query_file_download_url_lookup` — Retrieve a short-lived authenticated download URL (`itemId` required).

---

## Step-by-Step Setup: Microsoft Entra ID Least-Privilege (`Sites.Selected`)

### Step 1: Register App & Assign `Sites.Selected`
1. In the [Microsoft Entra Admin Center](https://entra.microsoft.com/) -> **App registrations** -> **New registration**, create a single-tenant app.
2. Under **API permissions** -> **Microsoft Graph** -> **Application permissions**, add **`Sites.Selected`** and grant **Admin consent**.
3. Store the Client Secret in **Google Cloud Secret Manager**:
   ```bash
   printf '%s' "<YOUR_ENTRA_CLIENT_SECRET>" | gcloud secrets create ms-graph-client-secret \
     --data-file=- \
     --project="<YOUR_PROJECT_ID>"
   ```

### Step 2: Grant `read` Permission on Each Approved SharePoint Site
```bash
export ADMIN_BEARER_TOKEN="$(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)"
chmod +x grant_site_permissions.sh

./grant_site_permissions.sh grant \
  "https://<YOUR_TENANT>.sharepoint.com/sites/Finance" \
  "<YOUR_MS_GRAPH_CLIENT_ID>" \
  "Least-Privilege SharePoint MCP Server"
```

---

## Local Smoke Testing & Cloud Run Deployment

1. Copy `.env.example` to `.env`, configure `ALLOWED_SHAREPOINT_SITES=https://<YOUR_TENANT>.sharepoint.com/sites/Finance`, and run local tests:
   ```bash
   cp .env.example .env
   npm install
   chmod +x test_local.sh
   ./test_local.sh
   ```
2. Deploy to Cloud Run (dedicated service account + Secret Manager):
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### Recommended Production Hardening: Switch to `--no-allow-unauthenticated` + `roles/run.invoker`

By default, `deploy.sh` retains `--allow-unauthenticated` for evaluation while enforcing signed OAuth Bearer validation at the application layer. For production deployments, lock down Cloud Run ingress by switching to `--no-allow-unauthenticated` and granting `roles/run.invoker`:

```bash
# 1. Disable public unauthenticated Cloud Run ingress
gcloud run services update least-privilege-sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker strictly to your authorized caller / Discovery Engine service agent
gcloud run services add-iam-policy-binding least-privilege-sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Registering in Gemini Enterprise

| Gemini Enterprise Field | Value |
| :--- | :--- |
| **MCP Server URL** | `https://<YOUR_CLOUD_RUN_URL>/mcp` |
| **Authorization URL** | `https://<YOUR_CLOUD_RUN_URL>/auth` |
| **Token URL** | `https://<YOUR_CLOUD_RUN_URL>/token` |
| **Client ID** | `<YOUR_MS_GRAPH_CLIENT_ID>` (or `MCP_OAUTH_CLIENT_ID`) |
| **Client Secret** | `<YOUR_MS_GRAPH_CLIENT_SECRET>` (or `MCP_OAUTH_CLIENT_SECRET`) |
| **Scopes** | `https://graph.microsoft.com/.default` |
