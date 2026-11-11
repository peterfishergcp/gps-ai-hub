# SharePoint MCP Server with Dynamic Cloud SDP & Microsoft Purview Governance

This module deploys a **Fail-Closed Sensitive Data Protection (SDP) + Microsoft Purview** Model Context Protocol (MCP) connector bridging Microsoft SharePoint Online / OneDrive with **Gemini Enterprise**.

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. Provided under the Apache License 2.0.

---

## Core Enterprise Capabilities

- **Dynamic Cloud SDP Content Policy Synchronization**:
  - Automatically resolves the Google Cloud Sensitive Data Protection (`ContentPolicy`) attached to your Discovery Engine MCP data store (or configured via `SDP_CONTENT_POLICY`).
  - Fetches active Microsoft Purview Sensitivity Label GUIDs (`fileLabelInfoType.sensitivityLabel.guid`) and custom regex detectors directly from `https://dlp.googleapis.com/v2/...` on a 5-minute TTL cache.
  - Strictly validates remote policy URLs against `https://dlp.googleapis.com/` and `https://storage.googleapis.com/` before attaching GCP credentials (`CWE-918` SSRF protection).
- **Fail-Closed Server-Side `BLOCK` & `MASK` Enforcement**:
  - Inflates OOXML `docProps/custom.xml` asynchronously (`maxOutputLength: 10 MB`) to detect embedded `MSIP_Label_<GUID>` tags in `.docx`, `.xlsx`, and `.pptx` files.
  - When a restricted Purview label or sensitive InfoType matches a `BLOCK` rule, **withholds 100% of `extractedText` server-side** while still emitting `msip_labels`, `assigned_labels`, and `assigned_sensitivity_labels` so Discovery Engine and BigQuery audit logs capture the exact matched classification.
  - When a rule specifies `MASK` / `REDACT`, scrubs matched tokens in-place (`[REDACTED:<RULE_NAME>]`).
- **Multi-Format Extraction**: Supports `.docx` (`mammoth`), `.xlsx` (`exceljs`), `.pptx` (slide-ordered XML), `.pdf` (`unpdf`), and text/CSV/Markdown/HTML files.
- **Architecture Specification**: See [`ARCHITECTURE.md`](ARCHITECTURE.md) for end-to-end data flow diagrams and BigQuery audit schema details.

---

## Supported MCP Tools (12 Total)

### Read Tools (`readOnlyHint: true`)
1. `query_sharepoint_sites_lookup` — Search SharePoint sites across the tenant.
2. `query_document_libraries_lookup` — List document libraries within a SharePoint site.
3. `query_library_items_lookup` — List files, folders, and descriptive sensitivity labels (5-way bounded concurrency).
4. `query_file_metadata_lookup` — Retrieve file metadata and native `msip_labels` / `assigned_labels` (`itemId` required).
5. `query_file_content_lookup` — Extract document text with fail-closed SDP `BLOCK`/`MASK` enforcement and `msip_labels` (`itemId` required).
6. `query_file_download_url_lookup` — Retrieve pre-authenticated download URLs (withheld when SDP verdict is `BLOCK`, `itemId` required).

### Write Tools (`destructiveHint: true`)
7. `query_create_folder_action_lookup`
8. `query_create_file_action_lookup`
9. `query_update_file_action_lookup`
10. `query_rename_item_action_lookup`
11. `query_move_item_action_lookup`
12. `query_delete_item_action_lookup`

---

## Setup, Smoke Testing & Cloud Run Deployment

1. **Configure `.env` & Secret Manager**:
   ```bash
   cp .env.example .env
   printf '%s' "<YOUR_ENTRA_CLIENT_SECRET>" | gcloud secrets create ms-graph-client-secret \
     --data-file=- \
     --project="<YOUR_PROJECT_ID>"
   ```
   Grant your dedicated Cloud Run service account permission to read the SDP Content Policy (`roles/dlp.reader` or `roles/dlp.user`) and Secret Manager (`roles/secretmanager.secretAccessor`).

2. **Run Local Smoke & DLP Unit Tests**:
   ```bash
   npm install
   chmod +x test_local.sh
   ./test_local.sh
   ```

3. **Deploy to Cloud Run**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### Recommended Production Hardening: Switch to `--no-allow-unauthenticated` + `roles/run.invoker`

By default, `deploy.sh` retains `--allow-unauthenticated` for evaluation while enforcing OAuth Bearer validation at the application layer. For production deployments, lock down Cloud Run network ingress by switching to `--no-allow-unauthenticated` and granting `roles/run.invoker`:

```bash
# 1. Disable public unauthenticated Cloud Run ingress
gcloud run services update sharepoint-mcp-server-purview-sdp \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker strictly to your authorized caller / Discovery Engine service agent
gcloud run services add-iam-policy-binding sharepoint-mcp-server-purview-sdp \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```
