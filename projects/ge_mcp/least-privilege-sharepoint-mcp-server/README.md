# Least-Privilege SharePoint MCP Server (`Sites.Selected` Read-Only)

This repository provides a **Least-Privilege, Site-Scoped, Read-Only** Model Context Protocol (MCP) connector bridging Microsoft Graph API with **Gemini Enterprise**.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. It is provided on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE pursuant to Section 7 & Section 8 of the Apache License 2.0.

Unlike standard SharePoint connectors that require tenant-wide `Sites.ReadWrite.All` and `Files.ReadWrite.All`, this server is architected specifically for **Microsoft Entra ID `Sites.Selected`** permissions—restricting the AI agent to **read-only (`read`) access on explicitly approved SharePoint sites only**.

---

## 🌟 Core Enterprise Capabilities

- **True Entra ID Least-Privilege (`Sites.Selected`)**:
  - Uses Microsoft Graph's `Sites.Selected` Application permission rather than tenant-wide `.All` scopes.
  - Access is granted per SharePoint site with `roles: ["read"]`—preventing the app from accessing any unapproved SharePoint site or OneDrive account in the tenant.
- **Server-Side Site & Drive Allowlist Guard (`ALLOWED_SHAREPOINT_SITES`)**:
  - Enforces a fail-closed allowlist of permitted SharePoint sites and their document library `driveId`s.
  - Any request targeting a site or drive outside `ALLOWED_SHAREPOINT_SITES` is immediately rejected.
- **Strictly Read-Only Enforcement**:
  - Exposes 7 read-only tools annotated with `readOnlyHint: true` and `destructiveHint: false`.
  - Includes a request-level HTTP interceptor that blocks any state-modifying HTTP method (`POST`, `PUT`, `PATCH`, `DELETE`) against `graph.microsoft.com`.
- **Autonomous Navigation & Multi-Format Intelligence**:
  - AI agents can search and navigate allowed SharePoint sites, document libraries, and nested folders using human-readable names without requiring end users to know Graph GUIDs.
  - Extracts text content from Word documents (`.docx`), Excel spreadsheets (`.xlsx`), and plain text/Markdown/CSV/JSON files.
- **Mandatory Page-Level Citation Links (`#page=N` & `?web=1`)**:
  - Automatically appends `?web=1` to Office document URLs so links open directly in SharePoint's web viewer, and instructs the LLM to append `#page=N` to PDF links and apply the `+1` Cover Page offset rule.
- **Performance Optimization**:
  - Native HTTP Keep-Alive connection pooling (`keepAlive: true, maxSockets: 50`) for minimal TLS handshake latency.

---

## 🔒 Security Architecture Comparison (`customize-sharepoint-mcp-server` vs. `least-privilege-sharepoint-mcp-server`)

| Capability / Permission | `customize-sharepoint-mcp-server` (Full Access) | `least-privilege-sharepoint-mcp-server` (This Server) |
| :--- | :--- | :--- |
| **Entra ID Graph Permission** | `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `User.Read` | **`Sites.Selected`** (Application permission) |
| **SharePoint Site Scope** | All SharePoint sites & OneDrive accounts in the tenant | **Only specific SharePoint sites** granted `roles: ["read"]` + listed in `ALLOWED_SHAREPOINT_SITES` |
| **Access Level** | Read + Write + Delete (12 tools) | **Strictly Read-Only** (7 read tools; HTTP interceptor blocks `POST`/`PUT`/`PATCH`/`DELETE` to Graph) |
| **Site & Drive Resolution** | Uses `/me/drive`, `/sites?search=*`, `/sites/root/drives` (fails with `403` under `Sites.Selected`) | Resolves configured sites directly via `GET /v1.0/sites/{hostname}:/sites/{sitePath}` and verifies every `siteId` & `driveId` against the allowlist |
| **File Search & Lookup** | Folder-by-folder traversal | `Sites.Selected`-compatible direct path lookup (`/root:/{path}`) and recursive library search (`query_search_files_lookup`) |
| **Gemini Enterprise Citations** | `?web=1` Office viewer links, `#page=N` PDF anchors, +1 Cover Page rule, HTTP Keep-Alive pooling | **Preserved 100%** |

---

## 🛠️ Supported Read-Only Action Catalog (7 Tools)

All tools are annotated with `readOnlyHint: true`, `destructiveHint: false`, and `idempotentHint: true`:

1. **`query_sharepoint_sites_lookup`**
   Lists or filters the specific SharePoint sites configured in `ALLOWED_SHAREPOINT_SITES` that this MCP server is permitted to query.
   - *Example Prompt*: `"Which SharePoint sites do you have access to?"`

2. **`query_document_libraries_lookup`**
   Lists all document libraries (drives) within a specific allowed SharePoint site.
   - *Example Prompt*: `"List all document libraries in the Finance site."`

3. **`query_library_items_lookup`**
   Lists files and folders inside a specific document library or subfolder of an allowed SharePoint site.
   - *Example Prompt*: `"List all files inside the Documents library on the Finance site."`

4. **`query_search_files_lookup`**
   Searches for files and folders by keyword or filename across one specific allowed SharePoint site—or across all allowed SharePoint sites—using `Sites.Selected`-compatible drive traversal.
   - *Example Prompt*: `"Search our allowed SharePoint sites for Master Services Agreement documents."`

5. **`query_file_metadata_lookup`**
   Retrieves detailed properties for a file in an allowed site (author, last modified timestamp, file size, MIME type, and clickable `webUrl`).
   - *Example Prompt*: `"Get the metadata and last modified time for Annual_Report.docx."`

6. **`query_file_content_lookup`**
   Extracts text from Word (`.docx`), Excel (`.xlsx`), text/markdown/CSV/JSON files, and returns viewer/download links for PDFs within an allowed site.
   - *Example Prompt*: `"Read Employee_Handbook.docx and summarize the remote work policy with page citations."`

7. **`query_file_download_url_lookup`**
   Retrieves a temporary pre-authenticated download URL (`@microsoft.graph.downloadUrl`) for a file in an allowed site.

---

## 📋 Step-by-Step Setup: Microsoft Entra ID Least-Privilege (`Sites.Selected`)

### Step 1: Register a Dedicated App in Microsoft Entra ID
1. Open the [Microsoft Entra Admin Center](https://entra.microsoft.com/) → **Identity** → **Applications** → **App registrations** → **+ New registration**.
2. **Name**: `Least-Privilege SharePoint MCP Server`
3. **Supported account types**: *Accounts in this organizational directory only (Single tenant)*.
4. Click **Register** and copy the **Application (client) ID** (`MS_GRAPH_CLIENT_ID`) and **Directory (tenant) ID** (`MS_GRAPH_TENANT_ID`).
5. Navigate to **Certificates & secrets** → **+ New client secret** → copy the secret **Value** (`MS_GRAPH_CLIENT_SECRET`).

### Step 2: Assign ONLY `Sites.Selected` (Application Permission) in API Permissions
1. In your new App Registration, go to **API permissions** → **+ Add a permission** → **Microsoft Graph** → **Application permissions** *(not Delegated permissions)*.
2. Search for `Sites.Selected`, expand **Sites**, and check **only**:
   - `Sites.Selected` (*Access selected site collections*)
3. Click **Add permissions**, then click **✓ Grant admin consent for [Your Organization]**.
   > At this point, the application has access to **zero** SharePoint sites until you explicitly grant it `read` permission on each target site in Step 3.

### Step 3: Grant `read` Permission on Each Target SharePoint Site
Because `Sites.Selected` starts with zero site access, a **SharePoint Administrator** or **Global Administrator** must grant your app `roles: ["read"]` on each specific SharePoint site you want the MCP server to query.

#### Option A: Using the Included `grant_site_permissions.sh` Script (Microsoft Graph REST API)
1. Obtain a temporary admin Graph token from [Microsoft Graph Explorer](https://developer.microsoft.com/en-us/graph/graph-explorer) (signed in as a SharePoint Admin with `Sites.FullControl.All` consented) or via Azure CLI:
   ```bash
   export ADMIN_BEARER_TOKEN=$(az account get-access-token --resource-type ms-graph --query accessToken -o tsv)
   ```
2. Run `./grant_site_permissions.sh` for each SharePoint site you want to allow:
   ```bash
   chmod +x grant_site_permissions.sh

   # Grant READ-ONLY ('read') access to a specific SharePoint site:
   ./grant_site_permissions.sh grant \
     "https://your-tenant.sharepoint.com/sites/Finance" \
     "<YOUR_MS_GRAPH_CLIENT_ID>" \
     "Least-Privilege SharePoint MCP Server"

   # Verify the site permissions:
   ./grant_site_permissions.sh list "https://your-tenant.sharepoint.com/sites/Finance"
   ```

#### Option B: Using PnP PowerShell
```powershell
Connect-PnPOnline -Url "https://your-tenant.sharepoint.com/sites/Finance" -Interactive
Grant-PnPAzureADAppSitePermission `
  -AppId "<YOUR_MS_GRAPH_CLIENT_ID>" `
  -DisplayName "Least-Privilege SharePoint MCP Server" `
  -Site "https://your-tenant.sharepoint.com/sites/Finance" `
  -Permissions Read
```

---

## ⚙️ Step 4: Configure `.env` and Test Locally

1. Copy `.env.example` to `.env` (which is git-ignored) and fill in your Entra ID credentials, GCP project ID, and the exact SharePoint sites you granted `read` access to:
   ```bash
   cp .env.example .env
   ```
   ```ini
   MS_GRAPH_TENANT_ID=your-entra-tenant-id
   MS_GRAPH_CLIENT_ID=your-least-privilege-app-client-id
   MS_GRAPH_CLIENT_SECRET=your-least-privilege-app-client-secret
   SHAREPOINT_HOSTNAME=your-tenant.sharepoint.com
   ALLOWED_SHAREPOINT_SITES=https://your-tenant.sharepoint.com/sites/Finance,https://your-tenant.sharepoint.com/sites/HR
   GCP_PROJECT=<INSERT_YOUR_PROJECT_ID>
   ```
2. Install dependencies and run the local verification suite:
   ```bash
   npm install
   ./test_local.sh
   ```

---

## ☁️ Step 5: Deploy to Google Cloud Run

Run `./deploy.sh` to build and deploy `least-privilege-sharepoint-mcp-server` to Cloud Run:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔗 Step 6: Register as a Custom (BYO) MCP Connector in Gemini Enterprise

In the Google Cloud Console (**Gemini Enterprise** → **Data Stores / Connectors** → **Create Data Store** → **Custom MCP Server**), configure the following fields using your deployed Cloud Run base URL (`https://least-privilege-sharepoint-mcp-server-<PROJECT_NUMBER>.<REGION>.run.app`):

| Gemini Enterprise Field | Value |
| :--- | :--- |
| **MCP Server URL (Endpoint)** | `https://least-privilege-sharepoint-mcp-server-<PROJECT_NUMBER>.<REGION>.run.app/mcp` |
| **Authentication Type** | **OAuth 2.0** |
| **Authorization URL** | `https://least-privilege-sharepoint-mcp-server-<PROJECT_NUMBER>.<REGION>.run.app/auth` |
| **Token URL** | `https://least-privilege-sharepoint-mcp-server-<PROJECT_NUMBER>.<REGION>.run.app/token` |
| **Client ID** | `<YOUR_MS_GRAPH_CLIENT_ID>` (or any non-empty identifier) |
| **Client Secret** | `<YOUR_MS_GRAPH_CLIENT_SECRET>` (or any non-empty secret) |
| **Scopes** | `https://graph.microsoft.com/.default` (optional) |

### How Gemini Enterprise Authentication & Transport Work
- **Built-in `/auth` and `/token` OAuth Helper Endpoints**: Satisfy Gemini Enterprise's OAuth 2.0 connector registration handshake and return a server-managed placeholder token (`mock`). When Gemini Enterprise invokes `/mcp`, the server automatically swaps the placeholder token for a live Microsoft Entra ID **`Sites.Selected` Client Credentials** token (`grant_type=client_credentials`) cached in memory.
- **Transport & Header Normalization**: Automatically normalizes `Accept: application/json, text/event-stream` across both `req.headers` and `req.rawHeaders` (for `@hono/node-server` and `python-httpx` compatibility), returns JSON responses (`enableJsonResponse: true`), and strips accidental trailing spaces (`%20`) or slashes from request URLs.

