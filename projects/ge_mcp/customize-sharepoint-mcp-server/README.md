# Customize SharePoint MCP Server (File-Type-Aware Citations & Action Approval)

This module deploys a customized **Model Context Protocol (MCP)** connector bridging Microsoft Graph API with **Gemini Enterprise**, adding calibrated PDF (`#page=N`) vs. Office Web Viewer (`?web=1`) citation formatting rules and structured summary templates.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the Apache License 2.0.

---

## Core Enterprise Capabilities

- **File-Type-Aware Citation Formatting (`#page=N` vs. `?web=1`)**:
  - Automatically strips `?web=1` from `.pdf` URLs so `#page=N` anchors open directly on the cited PDF page in the browser's PDF viewer (applying the `+1` Cover Page offset rule when documents include an unnumbered title page).
  - Appends `?web=1` to `.docx`, `.xlsx`, and `.pptx` URLs so clicking a citation opens Word/Excel/PowerPoint Online rather than forcing a raw disk download.
- **Multi-Format Document Extraction**: Extracts clean text from Word (`.docx` via `mammoth`), Excel (`.xlsx` via `exceljs`), PowerPoint (`.pptx` slide-ordered XML), PDF (`.pdf` page-indexed via `unpdf`), and structured text/CSV/Markdown/HTML files with strict `15 MB` file-size and `10 MB` async zip-inflation bounds.
- **Delegated User Identity Enforcement**: Rejects unauthenticated or mock tokens (`HTTP 401`) and forwards the caller's delegated Microsoft Entra OAuth 2.0 Bearer token to Microsoft Graph.
- **Action Approval Governance**: All 6 write/modify/delete tools declare `destructiveHint: true` so Gemini Enterprise prompts for explicit user confirmation before mutating SharePoint content.

---

## Supported Action Catalog (12 Tools)

### Read Tools (`readOnlyHint: true`)
1. `query_sharepoint_sites_lookup` — Search SharePoint sites (optionally filtered by `ALLOWED_SHAREPOINT_SITES`).
2. `query_document_libraries_lookup` — List document libraries within a SharePoint site.
3. `query_library_items_lookup` — List files and folders inside a document library or subfolder.
4. `query_file_metadata_lookup` — Retrieve detailed properties for a file (`itemId` required).
5. `query_file_content_lookup` — Extract text from `.docx`, `.xlsx`, `.pptx`, `.pdf`, and text files (`itemId` required).
6. `query_file_download_url_lookup` — Generate a short-lived authenticated download URL (`itemId` required).

### Write Tools (`destructiveHint: true`)
7. `query_create_folder_action_lookup` — Create a new subfolder.
8. `query_create_file_action_lookup` — Create a new text document.
9. `query_update_file_action_lookup` — Overwrite/update an existing text document.
10. `query_rename_item_action_lookup` — Rename an existing file or folder.
11. `query_move_item_action_lookup` — Move a file or folder into another directory.
12. `query_delete_item_action_lookup` — Delete a file or folder.

---

## Prerequisites: Google Cloud & Microsoft Entra ID Setup

1. **Override Custom MCP Constraint (if enforced)**: See [Override the organization policy for Custom MCP data stores](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores).
2. **Configure Allowed Egress FQDNs (if enforced)**: See [Configure allowed egress FQDNs](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/configure-allowed-egress-fqdns) and allowlist `graph.microsoft.com`, `login.microsoftonline.com`, `<YOUR_TENANT>.sharepoint.com`, and `<YOUR_CLOUD_RUN_URL>`.
3. **Microsoft Entra ID App Registration**:
   - Register a single-tenant Web Application in **Microsoft Entra Admin Center** -> **App registrations**.
   - Add Redirect URI (Web): `https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html`.
   - Add **Microsoft Graph Delegated Permissions**: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`, `offline_access` and grant Admin Consent.
   - Store the Entra Client Secret in **Google Cloud Secret Manager**:
     ```bash
     printf '%s' "<YOUR_ENTRA_CLIENT_SECRET>" | gcloud secrets create ms-graph-client-secret \
       --data-file=- \
       --project="<YOUR_PROJECT_ID>"
     ```

---

## Local Validation & Deployment

### Local Smoke Testing
```bash
cp .env.example .env
npm install
chmod +x test_local.sh
./test_local.sh
```

### Deploying to Google Cloud Run
Populate `GCP_PROJECT`, `MS_GRAPH_TENANT_ID`, and `MS_GRAPH_CLIENT_ID` in `.env`, then run:

```bash
chmod +x deploy.sh
./deploy.sh
```

### Recommended Production Hardening: Switch to `--no-allow-unauthenticated` + `roles/run.invoker`

By default, `deploy.sh` retains `--allow-unauthenticated` so Gemini Enterprise can forward end-user Microsoft Entra Bearer tokens without proxy header stripping, while the Node.js server enforces `Authorization: Bearer` validation at the application layer.

For production environments, lock down Cloud Run network ingress by switching to `--no-allow-unauthenticated` (or placing Cloud Run behind an External HTTPS Load Balancer with IAP) and granting `roles/run.invoker` exclusively to your authorized caller service account:

```bash
# 1. Disable public unauthenticated Cloud Run ingress
gcloud run services update customize-sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker strictly to your authorized caller / Discovery Engine service agent
gcloud run services add-iam-policy-binding customize-sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```
