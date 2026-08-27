# 🚀 Universal SharePoint & OneDrive MCP Connector for Gemini Enterprise

This repository provides an enterprise-grade **Model Context Protocol (MCP)** connector bridging Microsoft Graph API with **Gemini Enterprise**. 

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is **NOT** an official Google product or officially supported Google software. It is provided on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE pursuant to Section 7 & Section 8 of the Apache License 2.0.

Built specifically to empower AI agents with seamless access to your corporate knowledge base, this connector provides fully autonomous document management across your Entra ID tenant while enforcing strict governance and security compliance through Gemini Enterprise's native Action Approval dialogs.

---

## 🌟 Core Enterprise Capabilities

- **Autonomous Navigation:** AI agents can navigate your SharePoint team sites, document libraries, and nested folders using natural, human-readable names without requiring end users to know complex system IDs or GUIDs.
- **Multi-Format Intelligence:** Supports reading, extracting, and summarizing content across diverse enterprise document formats including Word documents (`.docx`), PowerPoint presentations (`.pptx`), Excel spreadsheets (`.xlsx`), and plain text files.
- **Secure Write Governance:** All data modification actions trigger Gemini Enterprise's built-in Action Approval dialog, ensuring zero data mutations occur without explicit human consent.

---

## 🛠️ Supported Action Catalog

This connector empowers your Gemini Enterprise AI with 12 advanced read and write capabilities across your entire SharePoint and OneDrive ecosystem:

### 🔍 Read Actions (Instant, Interruption-Free Streaming)

#### 1. Search SharePoint Sites
Allows the AI agent to discover relevant corporate SharePoint sites across your organization based on keywords or department names.
- *Example Prompt:* `"Search for SharePoint sites related to Sales and Marketing."`

#### 2. List Document Libraries
Retrieves all available document repositories and drives within a specific SharePoint team site.
- *Example Prompt:* `"List all document libraries in my Sales site."`

#### 3. List Library Items (Files & Folders)
Explores the directory structure, listing all files, subfolders, and metadata within a specific drive or folder location.
- *Example Prompt:* `"List all files and folders inside my Documents library."`

#### 4. Get File Metadata
Retrieves detailed properties for any specific file, including creation date, last modified time, file size, and web URLs.
- *Example Prompt:* `"Get the metadata and last modified time for summary.txt."`

#### 5. Read Document Content
Streams clean, extracted text directly to the AI agent from Word documents (`.docx`), PowerPoint presentations (`.pptx`), Excel spreadsheets (`.xlsx`), and text files for instant summarization or analysis.
- *Example Prompt:* `"Read the text content of Annual_Report.docx and give me a 3-bullet summary."`

#### 6. Get Secure Download URL
Generates temporary, secure, authenticated direct download URLs for any document in your repository.
- *Example Prompt:* `"Generate a direct download URL for my SharePoint presentation."`

---

### 🚀 Write Actions (Protected by Action Approval Consent Dialog)

#### 7. Create a New Folder
Creates a new subfolder inside any document library or parent folder using natural names.
- *Example Prompt:* `"Create a new folder named 'QuarterlyReports' in Documents."`

#### 8. Create a New Document
Surgically creates new text documents inside specified folders and populates them with AI-generated content.
- *Example Prompt:* `"Create a new document named 'summary.txt' inside my 'Quarterly Meeting notes' folder in Documents with the content 'Q1 meeting notes summary.' "`

#### 9. Update / Overwrite Document Content
Overwrites or updates the text content of an existing document instantly.
- *Example Prompt:* `"Update the content of summary.txt in Documents to say 'Record Q1 performance achieved.' "`

#### 10. Rename an Item
Renames any existing file or folder while preserving its contents and location.
- *Example Prompt:* `"Rename summary.txt in Documents to 'Final_Summary.txt'."`

#### 11. Move an Item
Moves files or folders between different directories or archive locations.
- *Example Prompt:* `"Move Final_Summary.txt from Documents into the Archive folder."`

#### 12. Delete an Item
Securely deletes unwanted files or folders from your repository.
- *Example Prompt:* `"Delete my old temporary summary file from Documents."`

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
5. Grant **Admin Consent** for your tenant.
6. Create a **Client Secret** and note your **Client ID** and **Tenant ID**.

---

## 💻 Local Development & Testing

```bash
npm install
```
Create a `.env` file:
```env
MICROSOFT_CLIENT_ID="your-entra-client-id"
MICROSOFT_CLIENT_SECRET="your-entra-client-secret"
MICROSOFT_TENANT_ID="your-entra-tenant-id"
PORT=8080
```
Run locally:
```bash
npm start
```

---

## 🚀 Production Deployment to GCP Cloud Run

Deploy your container to Google Cloud Run for secure, scalable cloud execution:

```bash
chmod +x deploy.sh
./deploy.sh
```
Once deployed, note your live Cloud Run URL (e.g., `https://sharepoint-mcp-server-850431687571.us-central1.run.app`).

---

## 🔗 Connecting to Gemini Enterprise (Official Onboarding Guide)

Follow these official enterprise onboarding steps (modeled after Google-managed MCP standards) to securely register this connector in your Gemini Enterprise environment:

### Step 1: Create OAuth Client for Gemini Enterprise Authentication
1. In Google Cloud Console, go to **APIs & Services** -> **Credentials**.
2. Click **Create credentials** -> **OAuth Client ID**.
3. **Application Type:** `Web Application`.
4. **Authorized redirect URIs:** Add `https://vertexaisearch.cloud.google.com/oauth-redirect`.
5. Click **Create**. Save your generated **Client ID** and **Client Secret**.

### Step 2: Create Data Store from Custom MCP Server
1. Go to **Gemini Enterprise** in Google Cloud Console.
2. Select **Data stores** -> **Create data store**.
3. Type `"MCP"` in the search bar and select **Custom MCP Server**.
4. Fill in the connector connection profile for Microsoft SharePoint:
   - **MCP Server URL:** `https://sharepoint-mcp-server-850431687571.us-central1.run.app/mcp` *(your live Cloud Run deployment URL)*
   - **Authorization URL:** `https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/authorize`
   - **Auth URL Parameters:** `&access_type=offline&prompt=consent`
   - **Token URL:** `https://login.microsoftonline.com/{YOUR_TENANT_ID}/oauth2/v2.0/token`
   - **Client ID:** *(paste Microsoft Entra Client ID)*
   - **Client Secret:** *(paste Microsoft Entra Client Secret)*
   - **Scopes:** `https://graph.microsoft.com/.default`
5. Click **Login** to authenticate with your Microsoft account, then click **Continue**.
6. Under **Advanced Options** (optional), enter `"SharePoint & OneDrive Universal MCP Server"`. Click Continue.
7. Choose your multi-region location (e.g., `global`), enter a Data Connector name, and click **Create**.
8. Wait a few minutes for the connector to initialize. Then go to **Data stores**, click on your newly created MCP datastore, and select **Actions**. 
9. By default, all actions are disabled. Select all 12 read and write actions and click **Enable actions**.

### Step 3: Connect Gemini Enterprise App to the MCP Server
1. Go to **Gemini Enterprise** -> select the app you'd like to connect.
2. Go to **Connected data stores** -> click **Link Existing Datastore**.
3. Select your newly created MCP Server datastore and click **Connect**.

### Step 4: Use the MCP Server within Gemini Enterprise
- **Option A (Directly in Chat):** Open your Gemini Enterprise app URL (`https://vertexaisearch.cloud.google.com/home/cid/...`). Click on the **Connector** icon in the chat bar and authorize the server.
- **Option B (Agent Designer):** In Gemini Enterprise, click `+ New Agent` -> proceed to Builder. Under **Connectors**, click the `+` sign and toggle on `SharePoint & OneDrive MCP Server`. You are fully live!
