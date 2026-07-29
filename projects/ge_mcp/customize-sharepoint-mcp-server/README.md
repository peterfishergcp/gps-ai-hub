# Customize SharePoint MCP Server

This repository provides an enterprise-grade Model Context Protocol (MCP) connector bridging Microsoft Graph API with Gemini Enterprise.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only. This is not an official Google product or officially supported Google Cloud project. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

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

## 📋 Prerequisites: Microsoft Entra ID Setup

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
```

Deploy using `deploy.sh`:

```bash
chmod +x deploy.sh
./deploy.sh
```
