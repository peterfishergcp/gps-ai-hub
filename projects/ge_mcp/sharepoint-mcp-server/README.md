# Universal SharePoint & OneDrive MCP Connector for Gemini Enterprise

This module deploys an enterprise-grade **Model Context Protocol (MCP)** connector bridging the Microsoft Graph API with **Gemini Enterprise**.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the Apache License 2.0.

---

## Core Enterprise Capabilities

- **Autonomous Navigation**: Navigate SharePoint team sites, document libraries, and nested folders using human-readable names without requiring Graph GUIDs.
- **Multi-Format Document Extraction**: Extracts clean text from Word (`.docx`), Excel (`.xlsx` via `exceljs`), PowerPoint (`.pptx` slide-ordered XML), PDF (`.pdf` page-indexed via `unpdf`), and structured text/CSV/Markdown/HTML files with strict `15 MB` file-size and `10 MB` async zip-inflation bounds.
- **Delegated User Identity Enforcement**: Rejects unauthenticated or mock tokens (`HTTP 401`) and forwards the caller's delegated Microsoft Entra OAuth 2.0 Bearer token to Microsoft Graph so SharePoint user ACLs are preserved.
- **Action Approval Governance**: All 6 write/modify/delete tools declare `destructiveHint: true` so Gemini Enterprise prompts for human confirmation before mutating SharePoint content.

---

## Supported MCP Tools (12 Total)

### Read Tools (`readOnlyHint: true`)
1. `query_sharepoint_sites_lookup` — Search SharePoint sites across your organization.
2. `query_document_libraries_lookup` — List document libraries (drives) in a SharePoint site.
3. `query_library_items_lookup` — List files and folders inside a document library or subfolder.
4. `query_file_metadata_lookup` — Retrieve detailed properties for a file (`itemId` required).
5. `query_file_content_lookup` — Extract text from `.docx`, `.xlsx`, `.pptx`, `.pdf`, and text files (`itemId` required).
6. `query_file_download_url_lookup` — Generate a short-lived authenticated download URL (`itemId` required).

### Write Tools (`destructiveHint: true`)
7. `query_create_folder_action_lookup` — Create a new subfolder.
8. `query_create_file_action_lookup` — Create a new text document.
9. `query_update_file_action_lookup` — Update/overwrite an existing text document.
10. `query_rename_item_action_lookup` — Rename an existing file or folder.
11. `query_move_item_action_lookup` — Move a file or folder into another directory.
12. `query_delete_item_action_lookup` — Delete a file or folder.

---

## Prerequisites: Google Cloud & Microsoft Entra ID Setup

1. **Override Custom MCP Constraint (if enforced)**: See [Override the organization policy for Custom MCP data stores](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores).
2. **Configure Allowed Egress FQDNs (if enforced)**: See [Configure allowed egress FQDNs](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/configure-allowed-egress-fqdns) and allowlist `graph.microsoft.com`, `login.microsoftonline.com`, `<YOUR_TENANT>.sharepoint.com`, and `<YOUR_CLOUD_RUN_URL>`.
3. **Microsoft Entra ID App Registration**:
   - Register a single-tenant Web Application in **Microsoft Entra Admin Center** -> **App registrations**.
   - Add Redirect URI (Web):
     ```text
     https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html
     ```
     (and `https://vertexaisearch.cloud.google.com/oauth-redirect` if using legacy connector flows).
   - Add **Microsoft Graph Delegated Permissions**: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`, `offline_access` and grant Admin Consent.
   - Store the Entra Client Secret in **Google Cloud Secret Manager**:
     ```bash
     printf '%s' "<YOUR_ENTRA_CLIENT_SECRET>" | gcloud secrets create ms-graph-client-secret \
       --data-file=- \
       --project="<YOUR_PROJECT_ID>"
     ```

---

## Local Development & Smoke Testing

1. Copy `.env.example` to `.env` and populate `GCP_PROJECT`, `MS_GRAPH_TENANT_ID`, and `MS_GRAPH_CLIENT_ID`:
   ```bash
   cp .env.example .env
   npm install
   ```
   ```ini
   MS_GRAPH_TENANT_ID="your-entra-tenant-id"
   MS_GRAPH_CLIENT_ID="your-entra-client-id"
   PORT=8080
   ```
2. Run the automated loopback (`127.0.0.1`) smoke tests:
   ```bash
   chmod +x test_local.sh
   ./test_local.sh
   ```

---

## Cloud Run Deployment & Production Hardening (`--no-allow-unauthenticated`)

Deploy to Cloud Run using a dedicated service account and Secret Manager (`--set-secrets`):

```bash
chmod +x deploy.sh
./deploy.sh
```

### Recommended Production Hardening: Switch to `--no-allow-unauthenticated` + `roles/run.invoker`

By default, `deploy.sh` retains `--allow-unauthenticated` so Gemini Enterprise can forward end-user Microsoft Entra Bearer tokens without proxy header stripping, while the Node.js server enforces `Authorization: Bearer` validation at the application layer.

For production environments, lock down Cloud Run network ingress by switching to `--no-allow-unauthenticated` (or placing Cloud Run behind an External HTTPS Load Balancer with IAP) and granting `roles/run.invoker` exclusively to your authorized caller service account:

```bash
# 1. Disable public unauthenticated Cloud Run ingress
gcloud run services update sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker strictly to your authorized caller / Discovery Engine service agent
gcloud run services add-iam-policy-binding sharepoint-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Connecting to Gemini Enterprise

1. In Google Cloud Console -> **Gemini Enterprise** -> **Data stores** -> **Create data store** -> **Custom MCP Server**:
   - **MCP Server URL:** `https://<YOUR_CLOUD_RUN_URL>/mcp`
   - **Authorization URL:** `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/authorize`
   - **Auth URL Parameters:** `&prompt=consent`
   - **Token URL:** `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/token`
   - **Client ID:** `<YOUR_MS_GRAPH_CLIENT_ID>`
   - **Client Secret:** `<YOUR_MS_GRAPH_CLIENT_SECRET>`
   - **Scopes:** `https://graph.microsoft.com/Files.ReadWrite.All https://graph.microsoft.com/Sites.ReadWrite.All https://graph.microsoft.com/User.Read offline_access`
2. Enable the desired read/write actions on the created MCP data store and attach it to your Gemini Enterprise app or agent.
