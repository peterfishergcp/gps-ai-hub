# Outlook MCP Server

A native Node.js Model Context Protocol (MCP) server that connects AI assistants (such as Gemini Enterprise) directly to Microsoft Outlook Mail, Calendar, and Contacts via the Microsoft Graph API.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## 🌟 Key Features & Capabilities

- **Temporal & Date-Aware Email Search (`query_messages_lookup`)**:
  - Dynamically injected system time reference (`Today's Date` and ISO timestamps).
  - Flexible OData date filtering (`fromDate` and `toDate` ISO parameters).
  - Sorting via `sortOrder`: `"desc"` for **latest/most recent** emails (default) or `"asc"` for **oldest/earliest** emails.
  - Native keyword and subject searching via Microsoft Graph `$search`.

- **Full Email Body & Attachment Metadata (`get_message_detail_lookup`)**:
  - Retrieves full message body (HTML/Text), sender, recipients, and conversation IDs by message ID.

- **Multi-Email Batch Retrieval (`get_batch_messages_detail_lookup`)**:
  - Fetches complete content for multiple emails simultaneously in a single tool call—ideal for aggregating information across emails.

- **Conversation Thread Retrieval (`get_email_thread_lookup`)**:
  - Fetches the complete, chronological back-and-forth email conversation thread for a given `messageId` or `conversationId`.

- **Calendar Management (`query_calendar_events_lookup` & `create_event_action_lookup`)**:
  - List and search upcoming or past calendar events with start/end ISO date filtering.
  - Create new Outlook calendar meetings and events with location, body, and timezone support.

- **Contacts Lookup (`query_contacts_lookup`)**:
  - List and search Outlook contacts by name or email.

- **Email Sending (`send_mail_action_lookup`)**:
  - Send emails directly through Microsoft Graph.

- **Performance Optimization**:
  - Native HTTP Keep-Alive agent connection pooling (`keepAlive: true`) for minimal latency.

- **Dual-Layer Authentication Support**:
  - **Delegated OAuth 2.0**: Passes user Bearer tokens directly to Microsoft Graph when available.
  - **Application Client Credentials**: Seamless fallback using Entra ID (Azure AD) Client ID, Secret, and Tenant ID.

---

## 💡 Retrieval & Performance Optimizations (Server Instructions in `index.js`)

To maximize LLM retrieval accuracy and server responsiveness, the following system instructions and optimizations are embedded directly into `index.js`:

1. **Dynamic System Time Anchor Injection**:
   - Automatically injects current UTC date (`Today's Date`) and ISO timestamps into server instructions on every prompt, allowing the LLM to perform accurate date arithmetic for temporal queries ("last week", "yesterday", "earliest", "most recent").
2. **Mandatory Direct Web Link Citations**:
   - Instructs the AI model to always cite emails and calendar events using direct, clickable Outlook `webLink` URLs so users can jump straight to the email or event in Outlook Web.
3. **HTTP Keep-Alive Connection Pooling**:
   - Uses a global `https.Agent({ keepAlive: true, maxSockets: 50 })` to maintain persistent TLS connections to Microsoft Graph API, eliminating handshake overhead and cutting query latency by up to 60%.
4. **Empty Result Interception & Smart Retry Prompting**:
   - When Microsoft Graph returns zero email or calendar results, the server injects a user retry prompt asking them to refine or broaden search terms instead of returning empty silence.
5. **Graph API Search Limitations Notice**:
   - Instructs the AI model to include a subtle disclaimer reminding users that Microsoft Graph Search indexing may occasionally miss newly received or archived messages.

---

## 🛠️ MCP Tools Overview

| Tool Name | Type | Description | Key Parameters |
| :--- | :--- | :--- | :--- |
| `query_messages_lookup` | Read | Search or list Outlook emails in Inbox | `query`, `fromDate`, `toDate`, `sortOrder`, `top` |
| `get_message_detail_lookup` | Read | Fetch full body & details for a single email | `messageId` |
| `get_batch_messages_detail_lookup` | Read | Fetch full content for multiple emails at once | `messageIds` (array) |
| `get_email_thread_lookup` | Read | Fetch full conversation thread | `messageId` or `conversationId` |
| `query_calendar_events_lookup` | Read | Search or list Outlook calendar events | `query`, `startDateTime`, `endDateTime`, `top` |
| `query_contacts_lookup` | Read | Search or list Outlook contacts | `query`, `top` |
| `send_mail_action_lookup` | Write | Send an email via Outlook | `to`, `subject`, `body` |
| `create_event_action_lookup` | Write | Create a calendar event in Outlook | `subject`, `startDateTime`, `endDateTime`, `body`, `location` |

---

## 🚀 Deployment & Local Testing

### Local Validation
Run the provided `test_local.sh` script to launch a local test instance on port `3006`, discover tools, and verify endpoints:

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

# OPTIONAL: Only needed if using Application Client Credentials without a logged-in user context.
# If using Delegated User Tokens (e.g., via Gemini Enterprise OAuth), leave this blank to default to /me.
MS_GRAPH_USER_PRINCIPAL_NAME=user@yourdomain.com
```

Deploy using `deploy.sh`:

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 🔒 Prerequisites & Security Setup

### 1. Override Organization Policy Constraint (Custom MCP Data Stores)
By default, Gemini Enterprise blocks the creation of Custom Model Context Protocol (MCP) data stores using a managed organization policy constraint. Before registering this custom MCP server in Gemini Enterprise, an Organization Policy Administrator must override this restriction.

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
* `<your-cloud-run-url>.run.app`

---

## 🔒 Security Note & Enterprise Authentication

### Why `--allow-unauthenticated` is Used in Cloud Run
The provided `deploy.sh` script deploys Cloud Run using `--allow-unauthenticated`. This is intentional and safe for standard setups because:
* **Dual-Layer Application Authentication**: The MCP server code itself enforces user authentication at the application level via OAuth 2.0 (e.g. Microsoft Entra ID / Google OAuth) before allowing access to downstream APIs like Microsoft Graph.
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
     --set-env-vars "MS_GRAPH_TENANT_ID=$MS_GRAPH_TENANT_ID,MS_GRAPH_CLIENT_ID=$MS_GRAPH_CLIENT_ID"
   ```
3. **Grant Secret Access**: Ensure the Cloud Run service account has the `Secret Manager Secret Accessor` (`roles/secretmanager.secretAccessor`) role.

---

### 3. Required Microsoft Graph Azure AD Permissions

Ensure your Azure App Registration has the following API Permissions granted:
- `Mail.Read` / `Mail.ReadWrite` / `Mail.Send`
- `Calendars.Read` / `Calendars.ReadWrite`
- `Contacts.Read`
