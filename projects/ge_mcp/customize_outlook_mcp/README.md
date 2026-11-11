# Custom Microsoft Outlook MCP Server for Gemini Enterprise

This module deploys a **Model Context Protocol (MCP)** server onto Google Cloud Run (`StreamableHTTPServerTransport`) that connects **Gemini Enterprise** to **Microsoft Outlook** (Mail, Calendar, and Contacts/People) via the Microsoft Graph API.

---

## Exposed MCP Tools

| Tool Name | Mode | Description |
| :--- | :--- | :--- |
| `query_recent_emails_lookup` | Read-Only | Search or list recent Outlook emails by keyword, folder (`inbox`, `sentitems`, `drafts`, `archive`), or unread status. |
| `query_email_content_lookup` | Read-Only | Read the full body (HTML stripped to clean text), recipients, and attachment metadata for a `messageId`. |
| `send_mail_action_lookup` | Destructive / Write | Send an email via Outlook on behalf of the authenticated user (`destructiveHint: true`). |
| `query_calendar_events_lookup` | Read-Only | List or filter calendar events using `/me/calendarView` when bounded by `startDateTime` and `endDateTime`, or `/me/events` otherwise. |
| `create_event_action_lookup` | Destructive / Write | Create an Outlook calendar meeting with optional attendees and Microsoft Teams online meeting link (`destructiveHint: true`). |
| `query_contacts_lookup` | Read-Only | Search personal Outlook contacts and the Microsoft 365 People directory with OData quote escaping. |

---

## Step 1: Microsoft Entra ID App Registration

1. Open the [Microsoft Entra Admin Center](https://entra.microsoft.com) -> **Identity** -> **Applications** -> **App registrations** -> **New registration**.
2. Set the **Redirect URI** (Web) to:
   ```text
   https://vertexaisearch.cloud.google.com/console/oauth/default_oauth.html
   ```
3. Under **API permissions** -> **Add a permission** -> **Microsoft Graph** -> **Delegated permissions**, add:
   - `openid`, `profile`, `offline_access`, `User.Read`
   - `Mail.Read`, `Mail.Send`
   - `Calendars.Read`, `Calendars.ReadWrite`
   - `Contacts.Read`, `People.Read`
4. Under **Certificates & secrets**, create a new client secret and store it in **Google Cloud Secret Manager** (never pass secrets inline in `--set-env-vars`):
   ```bash
   printf '%s' "<YOUR_ENTRA_CLIENT_SECRET>" | gcloud secrets create ms-graph-client-secret \
     --data-file=- \
     --project="<YOUR_PROJECT_ID>"
   ```

---

## Step 2: Deploy to Google Cloud Run

1. Copy `.env.example` to `.env` and populate `GCP_PROJECT`, `MS_GRAPH_TENANT_ID`, and `MS_GRAPH_CLIENT_ID` (`.env` is excluded from builds via `.gcloudignore` and `.dockerignore`):
   ```bash
   cp .env.example .env
   ```
2. Deploy via `deploy.sh`:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

---

## Production Hardening: Enforce Cloud Run IAM (`--no-allow-unauthenticated`)

By default, `deploy.sh` uses `--allow-unauthenticated` for streamlined sandbox testing while requiring a valid Microsoft Entra `Authorization: Bearer <JWT>` at the application layer (`HTTP 401` on missing/mock tokens).

**Recommended for Production:** Lock down Cloud Run ingress with `--no-allow-unauthenticated` and grant `roles/run.invoker` only to your authorized caller or Gemini Enterprise / Discovery Engine service agent:

```bash
# 1. Remove public unauthenticated ingress
gcloud run services update outlook-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --no-allow-unauthenticated

# 2. Grant Cloud Run Invoker only to your authorized service account
gcloud run services add-iam-policy-binding outlook-mcp-server \
  --project="${GCP_PROJECT}" \
  --region="${GCP_REGION:-us-central1}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-discoveryengine.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

---

## Step 3: Register in Gemini Enterprise Agent Designer

Configure a **Custom MCP Server** in Gemini Enterprise:

- **MCP Server Endpoint:** `https://<YOUR_CLOUD_RUN_URL>/mcp`
- **Authorization URL:** `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/authorize`
- **Token URL:** `https://login.microsoftonline.com/<YOUR_TENANT_ID>/oauth2/v2.0/token`
- **Scopes:** `https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/People.Read offline_access`

Example prompts:
- *"Check my unread Outlook emails from today and summarize action items."*
- *"Send an email to `user@example.com` summarizing next week's architecture review."*

---

## Local Smoke Tests

```bash
chmod +x test_local.sh
./test_local.sh
```
