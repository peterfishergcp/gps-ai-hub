# Customize SharePoint MCP Server

A native Node.js Model Context Protocol (MCP) server that connects AI assistants (such as Gemini Enterprise) directly to Microsoft SharePoint Document Libraries and Sites via the Microsoft Graph API.

---

## 🌟 Key Features & Capabilities

- **Mandatory Page-Level Citation Links (`#page=N` & `#section=HeadingName`)**:
  - Automatically appends physical PDF page anchors (`#page=N`) or Word document section anchors (`#section=HeadingName`) to document `webUrl` links.
  - Accounts for Table of Contents (TOC) and unnumbered front-matter page offsets by linking to the physical viewer page index.

- **Empty Result Retry Prompting**:
  - Automatically detects when zero search results are returned from Microsoft Graph and prompts the LLM/user with a retry suggestion:
    > *"We didn't receive any query results for your query. Would you try again and be more specific with your query?"*

- **Fast Direct GUID Resolution**:
  - Automatically resolves human-readable drive/folder names to alphanumeric GUIDs with zero extra API overhead when a valid GUID is supplied.

- **Universal Document Content Extraction**:
  - High-speed Word document (`.docx`) text extraction via Mammoth.
  - Native zero-dependency XML stripping for PowerPoint (`.pptx`), Excel (`.xlsx`), and binary streams.

- **Full Document Lifecycle Actions**:
  - Create, update, rename, move, and delete files and folders inside SharePoint document libraries.

- **Performance Optimization**:
  - Native HTTP Keep-Alive agent connection pooling (`keepAlive: true`) for minimal latency.

- **Dual-Layer Authentication Support**:
  - **Delegated OAuth 2.0**: Passes user Bearer tokens directly to Microsoft Graph when available.
  - **Application Client Credentials**: Seamless fallback using Entra ID (Azure AD) Client ID, Secret, and Tenant ID.

---

## 🛠️ MCP Tools Overview

| Tool Name | Type | Description | Key Parameters |
| :--- | :--- | :--- | :--- |
| `query_sharepoint_sites_lookup` | Read | Search or list SharePoint sites across the tenant | `query` |
| `query_document_libraries_lookup` | Read | List document library drives inside a site | `siteId` |
| `query_library_items_lookup` | Read | List files and folders inside a document library | `driveId`, `folderId` |
| `query_file_metadata_lookup` | Read | Query metadata (created date, size, webUrl) for a file | `driveId`, `itemId` |
| `query_file_content_lookup` | Read | Download and extract text content from Word, PPT, Excel, or text files | `driveId`, `itemId` |
| `query_file_download_url_lookup` | Read | Retrieve secure direct binary download URL | `driveId`, `itemId` |
| `query_create_file_action_lookup` | Write | Create a new document in a document library | `driveId`, `parentId`, `fileName`, `content` |
| `query_update_file_action_lookup` | Write | Update or overwrite an existing document | `driveId`, `itemId`, `content` |
| `query_create_folder_action_lookup` | Write | Create a new folder inside a document library | `driveId`, `folderName`, `parentFolderId` |
| `query_rename_item_action_lookup` | Write | Rename a file or folder | `driveId`, `itemId`, `newName` |
| `query_delete_item_action_lookup` | Write | Delete a file or folder | `driveId`, `itemId` |
| `query_move_item_action_lookup` | Write | Move an item to another folder | `driveId`, `itemId`, `destinationFolderId` |

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

---

## 🔒 Required Microsoft Graph Azure AD Permissions

Ensure your Azure App Registration has the following API Permissions granted:
- `Sites.Read.All` / `Sites.ReadWrite.All`
- `Files.Read.All` / `Files.ReadWrite.All`
