# Outlook MCP Server

A native Node.js Model Context Protocol (MCP) server that connects AI assistants (such as Gemini Enterprise) directly to Microsoft Outlook Mail, Calendar, and Contacts via the Microsoft Graph API.

> **Acknowledgements & Attribution**: Based on original work and reference architecture by **Upasana Pati** ([upasana1105/UP_Demos/byomcp](https://github.com/upasana1105/UP_Demos/tree/main/byomcp)).

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only. This is not an official Google product or officially supported Google Cloud project. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

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

## 🔒 Required Microsoft Graph Azure AD Permissions

Ensure your Azure App Registration has the following API Permissions granted:
- `Mail.Read` / `Mail.ReadWrite` / `Mail.Send`
- `Calendars.Read` / `Calendars.ReadWrite`
- `Contacts.Read`
