# Customize SharePoint MCP Server

This repository provides an enterprise-grade Model Context Protocol (MCP) connector bridging Microsoft Graph API with Gemini Enterprise.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

Built specifically to empower AI agents with seamless access to your corporate knowledge base, this connector provides fully autonomous document management across your Entra ID tenant while enforcing strict governance and security compliance through Gemini Enterprise's native Action Approval dialogs.

---

## 🌟 Core Enterprise Capabilities

- **Autonomous Navigation**: AI agents can navigate your SharePoint team sites, document libraries, and nested folders using natural, human-readable names without requiring end users to know complex system IDs or GUIDs.
- **Multi-Format Intelligence**: Supports reading, extracting, and summarizing content across diverse enterprise document formats including Word documents (`.docx`), PowerPoint presentations (`.pptx`), Excel spreadsheets (`.xlsx`), and plain text files.
- **Mandatory Page-Level Citation Links (`#page=N` & `#section=HeadingName`)**:
  - Automatically appends physical PDF page anchors (`#page=N`) or Word document section anchors (`#section=HeadingName`) to document `webUrl` links.
  - Accounts for Table of Contents (TOC) and unnumbered front-matter page offsets by linking to the physical viewer page index.
- **Empty Result Retry Prompting**:
  - Automatically detects when zero search results are returned from Microsoft Graph and prompts the LLM/user with a retry suggestion:
    > *"We didn't receive any query results for your query. Would you try again and be more specific with your query?"*
- **Secure Write Governance**: All data modification actions trigger Gemini Enterprise's built-in Action Approval dialog, ensuring zero data mutations occur without explicit human consent.
- **Performance Optimization**: Native HTTP Keep-Alive agent connection pooling (`keepAlive: true`) for minimal latency.
- **Dual-Layer Authentication Support**:
  - **Delegated OAuth 2.0**: Passes user Bearer tokens directly to Microsoft Graph when available.
  - **Application Client Credentials**: Seamless fallback using Entra ID (Azure AD) Client ID, Secret, and Tenant ID.

---

## 💡 Retrieval & Performance Optimizations (Server Instructions in `index.js`)

To maximize LLM retrieval accuracy and server responsiveness, the following system instructions and optimizations are embedded directly into `index.js`:

1. **Mandatory Page-Level & Section Citations**:
   - Forces the LLM to include direct clickable SharePoint URLs with deep page anchors (`#page=N`) or section anchors (`#section=HeadingName`).
   - Accounts for Table of Contents (TOC) and unnumbered introductory pages by calculating the physical viewer page offset.
2. **HTTP Keep-Alive Connection Pooling**:
   - Uses a global `https.Agent({ keepAlive: true, maxSockets: 50 })` to maintain persistent TLS connections to Microsoft Graph API, eliminating handshake overhead and cutting query latency by up to 60%.
3. **Empty Result Interception & Smart Retry Prompting**:
   - When Microsoft Graph returns zero results, the server injects a user retry prompt asking them to refine or broaden search terms instead of returning empty silence.
4. **Graph API Search Limitations Notice**:
   - Instructs the AI model to include a subtle disclaimer reminding users that Microsoft Graph Search indexing may occasionally miss newly uploaded or re-indexed files.

---

## 🛠️ Supported Action Catalog

This connector empowers your Gemini Enterprise AI with 12 advanced read and write capabilities across your entire SharePoint and OneDrive ecosystem:

### 🔍 Read Actions (Instant, Interruption-Free Streaming)

1. **Search SharePoint Sites (`query_sharepoint_sites_lookup`)**
   Allows the AI agent to discover relevant corporate SharePoint sites across your organization based on keywords or department names.
   - *Example Prompt*: `"Search for SharePoint sites related to Sales and Marketing."`

2. **List Document Libraries (`query_document_libraries_lookup`)**
   Retrieves all available document repositories and drives within a specific SharePoint team site.
   - *Example Prompt*: `"List all document libraries in my Sales site."`

3. **List Library Items (`query_library_items_lookup`)**
   Explores the directory structure, listing all files, subfolders, and metadata within a specific drive or folder location.
   - *Example Prompt*: `"List all files and folders inside my Documents library."`

4. **Get File Metadata (`query_file_metadata_lookup`)**
   Retrieves detailed properties for any specific file, including creation date, last modified time, file size, and web URLs.
   - *Example Prompt*: `"Get the metadata and last modified time for summary.txt."`

5. **Read Document Content (`query_file_content_lookup`)**
   Streams clean, extracted text directly to the AI agent from Word documents (`.docx`), PowerPoint presentations (`.pptx`), Excel spreadsheets (`.xlsx`), and text files for instant summarization or analysis.
   - *Example Prompt*: `"Read the text content of Annual_Report.docx and give me a 3-bullet summary."`

6. **Get Secure Download URL (`query_file_download_url_lookup`)**
   Generates temporary, secure, authenticated direct download URLs for any document in your repository.
   - *Example Prompt*: `"Generate a direct download URL for my SharePoint presentation."`

---

### 🚀 Write Actions (Protected by Action Approval Consent Dialog)

7. **Create a New Folder (`query_create_folder_action_lookup`)**
   Creates a new subfolder inside any document library or parent folder using natural names.
   - *Example Prompt*: `"Create a new folder named 'QuarterlyReports' in Documents."`

8. **Create a New Document (`query_create_file_action_lookup`)**
   Surgically creates new text documents inside specified folders and populates them with AI-generated content.
   - *Example Prompt*: `"Create a new document named 'summary.txt' inside my 'Quarterly Meeting notes' folder in Documents with the content 'Q1 meeting notes summary.' "`

9. **Update / Overwrite Document Content (`query_update_file_action_lookup`)**
   Overwrites or updates the text content of an existing document instantly.
   - *Example Prompt*: `"Update the content of summary.txt in Documents to say 'Record Q1 performance achieved.' "`

10. **Rename an Item (`query_rename_item_action_lookup`)**
    Renames any existing file or folder while preserving its contents and location.
    - *Example Prompt*: `"Rename summary.txt in Documents to 'Final_Summary.txt'."`

11. **Move an Item (`query_move_item_action_lookup`)**
    Moves files or folders between different directories or archive locations.
    - *Example Prompt*: `"Move Final_Summary.txt from Documents into the Archive folder."`

12. **Delete an Item (`query_delete_item_action_lookup`)**
    Securely deletes unwanted files or folders from your repository.
    - *Example Prompt*: `"Delete my old temporary summary file from Documents."`

---

## 🛡️ Google Sensitive Data Protection (SDP) & Microsoft Purview Policy Integration

This enhanced version (`customize-sharepoint_mcp_w_sdp`) bridges **Google Cloud Sensitive Data Protection (SDP)** policies with **Microsoft Purview Sensitivity Labels**.

### 1. SDP to Microsoft Purview Mapping Architecture

When requests pass through Google Cloud infrastructure, API Gateways, or Gemini Enterprise, SDP headers or content policies (e.g., `X-Goog-Sdp-Policy`, `X-Goog-Sdp-Label`, or `X-Sdp-Label`) are automatically inspected and mapped to Microsoft Purview Sensitivity Label GUIDs:

* **Google SDP Content Policy**: `projects/ai-hub-459714/locations/us/contentPolicies/purview_cepf`
* **SDP Policy Tag / Source**: `purview_cepf` / `CUSTOM_CEPF_LABEL`
* **Microsoft Purview Sensitivity Label GUID**: `27c86af4-afb5-4c50-9816-2f0e144288d0`

```
  [ Incoming HTTP Request / MCP Tool Call ]
                     │
                     ▼
  [ Extract X-Goog-Sdp-Policy Header ]
                     │
                     ▼
  [ Translate Policy -> Purview Label GUID ]
                     │
                     ├──► Non-Restricted Policy ──► Execute SharePoint Action
                     │
                     └──► Restricted Policy (e.g. 27c86af4-afb5-4c50-9816-2f0e144288d0)
                          └──► Block Document Reading / Downloading
                               └──► Return HTTP 403 ACCESS_DENIED_BY_SDP_POLICY
```

---

### 2. Active Block Policy Enforcement

Whenever a tool request targets sensitive document reading (`query_file_content_lookup`) or binary downloads (`query_file_download_url_lookup`) under the `CUSTOM_CEPF_LABEL` policy, the server enforces an immediate access denial:

**Block Response Payload**:
```json
{
  "error": "ACCESS_DENIED_BY_SDP_POLICY",
  "message": "Access to tool 'query_file_content_lookup' is blocked under Google SDP Content Policy 'purview_cepf' (Microsoft Purview Sensitivity Label GUID: 27c86af4-afb5-4c50-9816-2f0e144288d0).",
  "securityMetadata": {
    "sdpContentPolicy": "projects/ai-hub-459714/locations/us/contentPolicies/purview_cepf",
    "sdpPolicySource": "purview_cepf",
    "microsoftPurviewSensitivityLabelGuid": "27c86af4-afb5-4c50-9816-2f0e144288d0",
    "labelDisplayName": "CUSTOM_CEPF_LABEL",
    "policyAction": "BLOCKED"
  }
}
```

---

### 3. Alternative Architecture: Direct Call to Google Cloud SDP REST API (Cloud DLP)

Instead of header-based mapping (Option 1), an MCP server can be configured to dynamically call the **Google Cloud Sensitive Data Protection REST API** (`dlp.googleapis.com`) to inspect document text in real time before returning content to the client:

#### Configuration Steps
1. **Install Auth & Client Dependencies**:
   ```bash
   npm install @google-cloud/dlp google-auth-library
   ```

2. **Invoke Google Cloud DLP Inspection Endpoint**:
   ```javascript
   import { DlpServiceClient } from '@google-cloud/dlp';
   const dlpClient = new DlpServiceClient();

   async function inspectExtractedText(extractedText, projectId = "ai-hub-459714") {
       const [response] = await dlpClient.inspectContent({
           parent: `projects/${projectId}/locations/us`,
           inspectConfig: {
               infoTypes: [{ name: 'EMAIL_ADDRESS' }, { name: 'US_SOCIAL_SECURITY_NUMBER' }],
               minLikelihood: 'POSSIBLE'
           },
           item: { value: extractedText }
       });

       if (response.result?.findings?.length > 0) {
           throw new Error("ACCESS_DENIED_BY_SDP_POLICY: Sensitive data findings detected in document.");
       }
   }
   ```

---

### 4. Enterprise Implementation Gotchas & Edge Cases

When deploying SDP and Purview policies across custom MCP servers, be aware of the following critical gotchas:

1. **Header Stripping by Reverse Proxies / Load Balancers**:
   * *Issue*: Cloud Run, API Gateways, or HTTPS Load Balancers often strip custom `X-Goog-*` or `X-Sdp-*` HTTP headers if they are not explicitly allowed in CORS / Access-Control-Allow-Headers.
   * *Fix*: The server's CORS configuration MUST include `X-Goog-Sdp-Policy, X-Goog-Sdp-Label, X-Sdp-Label` in `Access-Control-Allow-Headers`.

2. **Entra ID Delegated vs Application Permissions for Sensitivity Labels**:
   * *Issue*: Accessing or modifying Microsoft Purview Sensitivity Labels via Microsoft Graph API requires specific Entra ID permissions (`InformationProtectionPolicy.Read.All` or `Files.ReadWrite.All`).
   * *Fix*: Ensure Admin Consent is granted in the Microsoft Entra ID portal for the app registration.

3. **Latency Impact of Real-Time Scanning**:
   * *Issue*: Making synchronous REST calls to `dlp.googleapis.com` for large Word or Excel files can add $200\text{ms} - 800\text{ms}$ of latency per document request.
   * *Fix*: Use the lightweight header-based context mapping (Option 1) for fast policy evaluation, or cache inspection results by file hash.

4. **Multi-Region Location Mismatch**:
   * *Issue*: Calling GCP SDP endpoints in `us-central1` when the content policy is registered under location `us` or `global` will return HTTP `404 Policy Not Found`.
   * *Fix*: Explicitly align the location parameter (`locations/us`) in the GCP resource path.

---

## 📋 Prerequisites: Google Cloud & Microsoft Entra ID Setup

### 1. Override Organization Policy Constraint (Custom MCP Data Stores)
By default, Gemini Enterprise blocks the creation of Custom Model Context Protocol (MCP) data stores using a managed organization policy constraint. Before deploying and registering this custom MCP server, an Organization Policy Administrator must override this restriction.

> 📖 **Official Documentation**: See [Override the organization policy for Custom MCP data stores](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/override-constraint-for-custom-mcp-data-stores) for complete GCP details.

> **Role Required:** Ensure you have the **Organization Policy Administrator** role (`roles/orgpolicy.policyAdmin`).

1. In the Google Cloud console, navigate to the **Organization Policies** page.
2. In the project selector at the top, select the specific project for which you want to change enforcement (do **not** apply at org level unless intended for all projects).
3. In the **Filter** field, enter: `Disable custom MCP server connector for Gemini Enterprise`.
4. Click the policy name to navigate to policy details.
5. Click **Manage Policy**.
6. Select **Override parent's policy**.
7. Add a new rule and set enforcement toggle to **OFF**.
8. Click **Set Policy**.
9. Verify status is updated to **Not enforced**.

---

### 2. Configure Allowed Egress FQDNs (`allowedDataSources` Constraint)
If your organization enforces the **Restrict egress domains for data connectors** managed organization policy constraint, you must allowlist the target domains (FQDNs) under `allowedDataSources` before provisioning the data store in Gemini Enterprise.

> 📖 **Official Documentation**: See [Configure allowed egress FQDNs](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/configure-allowed-egress-fqdns) for complete GCP details.

The domains you need to allowlist in your `allowedDataSources` policy typically include:
* `graph.microsoft.com`
* `login.microsoftonline.com`
* `bigquery.googleapis.com`
* `accounts.google.com`
* `oauth2.googleapis.com`
* `googleapis.com`
* `<yourtenant>.sharepoint.com`
* `<your-cloud-run-url>.run.app`

---

## 🔒 Security Note & Enterprise Authentication

### Why `--allow-unauthenticated` is Used in Cloud Run
The provided `deploy.sh` script deploys Cloud Run using `--allow-unauthenticated`. This is intentional and safe for standard setups because:
* **Dual-Layer Application Authentication**: The MCP server code itself enforces user authentication at the application level via OAuth 2.0 (e.g. Microsoft Entra ID / Google OAuth) before allowing access to downstream APIs like Microsoft Graph or BigQuery.
* **Header Preservation**: Gemini Enterprise passes end-user OAuth Bearer tokens directly to the connector. Unauthenticated ingress ensures Cloud Run does not strip or reject these authorization headers at the network boundary.

### Restricting Access via HTTPS Load Balancer & IAP (Enterprise Pattern)
If your organization's compliance policy prohibits public Cloud Run endpoints:
1. Deploy Cloud Run with `--no-allow-unauthenticated` or `--ingress=internal-and-cloud-load-balancing`.
2. Place an **External Application Load Balancer (HTTPS)** in front of your Cloud Run service.
3. Enable **Identity-Aware Proxy (IAP)** on the Load Balancer to enforce Zero-Trust Google IAM access control before traffic reaches the Cloud Run instance.

### Secret Management Best Practices (Google Secret Manager)
The default `deploy.sh` script passes sensitive values (such as `MS_GRAPH_CLIENT_SECRET`) using environment variables via `--set-env-vars`. For production workloads, it is strongly recommended to store sensitive credentials in **Google Secret Manager**:

1. **Create the secret in Secret Manager**:
   ```bash
   gcloud secrets create ms-graph-client-secret --data-file=- <<< "$MS_GRAPH_CLIENT_SECRET"
   ```
2. **Mount the secret in Cloud Run**:
   Replace `--set-env-vars` in `deploy.sh` with `--set-secrets`:
   ```bash
   gcloud run deploy "$SERVICE_NAME" \
     --set-secrets "MS_GRAPH_CLIENT_SECRET=ms-graph-client-secret:latest" \
     --set-env-vars "MS_GRAPH_TENANT_ID=$MS_GRAPH_TENANT_ID,MS_GRAPH_CLIENT_ID=$MS_GRAPH_CLIENT_ID,SHAREPOINT_INSTANCE_URL=$SHAREPOINT_INSTANCE_URL"
   ```
3. **Grant Secret Access**: Ensure the Cloud Run service account has the `Secret Manager Secret Accessor` (`roles/secretmanager.secretAccessor`) role.

---

### 3. Microsoft Entra ID Setup

Before deploying the server, register a Microsoft Entra ID OAuth application:

1. Go to the **Microsoft Entra Admin Center** -> **App registrations** -> **New registration**.
2. Name your app (e.g., `Gemini-Enterprise-SharePoint-MCP`).
3. Choose **Accounts in this organizational directory only**.
4. Under **API permissions**, add Delegated permissions: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read`.
5. **Grant Admin Consent** for your tenant.
6. Create a **Client Secret** and note your **Client ID** and **Tenant ID**.

---

## 🚀 Deployment & Local Testing

### Local Validation
Run the provided `test_local.sh` script to launch a local test instance on port `3005`, discover tools, and verify endpoints:

```bash
chmod +x test_local.sh
./test_local.sh
```

### Deploying to Google Cloud Run
Set your Azure AD environment variables in a local `.env` file or export them:

```env
MS_GRAPH_TENANT_ID=your_tenant_id
MS_GRAPH_CLIENT_ID=your_client_id
MS_GRAPH_CLIENT_SECRET=your_client_secret
SHAREPOINT_INSTANCE_URL=https://yourtenant.sharepoint.com
SDP_CONTENT_POLICY=projects/ai-hub-459714/locations/us/contentPolicies/purview_cepf
```

Deploy using `deploy.sh`:

```bash
chmod +x deploy.sh
./deploy.sh
```

