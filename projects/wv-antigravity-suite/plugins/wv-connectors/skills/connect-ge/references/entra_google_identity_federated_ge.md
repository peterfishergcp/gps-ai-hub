# Entra ID -> Google Cloud Identity & Federated Gemini Enterprise Runbook

Reference architecture and troubleshooting guide for West Virginia cohorts using **Azure / Entra ID synced to Google Cloud Identity** with **Federated Gemini Enterprise (`GE`) Connectors**.

## How Identity & ACLs Flow End-to-End
1. **Identity & Group Sync:** Microsoft Azure / Entra ID provisions users and replicates security groups into **Google Cloud Identity** (via Google Cloud Directory Sync / Entra provisioning + SAML/OIDC SSO).
2. **GCP IAM Binding:** Agency admins grant the replicated Google Identity group(s) access to the Gemini Enterprise app (`roles/discoveryengine.viewer` or Gemini Enterprise user access on the host GCP project).
3. **Federated Connector Per-User OAuth:** Federated sources (*Microsoft Outlook, SharePoint Online, OneDrive, Microsoft Teams, GitHub*) do **not** bulk-copy raw files into Google storage—instead, `AssistantService.StreamAssist` fans out live queries at request time using each user's authorized 3P connector token and enforces source-system ACLs in real time.

## Fast Troubleshooting Matrix

| Symptom | Root Cause | 60-Second Fix |
| :--- | :--- | :--- |
| `HTTP 403 PERMISSION_DENIED` on `:streamAssist` | Either Discovery Engine API IAM role is not yet bound to the user's Entra-synced Google group, or `quotaProjectId` needs `serviceusage.services.use`. | Verify the user signed in with their synced `@wv.gov` Google Identity (not a personal Gmail), and confirm their synced group has Gemini Enterprise / Discovery Engine user access on `GE_PROJECT_ID`. Meanwhile, use **GE Web App Companion Mode** in Chrome/Edge. |
| Federated query succeeds, but returns **zero results** from Outlook, Teams, OneDrive, or SharePoint | The user has not completed the 1-time 3P **Authorize** handshake inside the Gemini Enterprise Web App for that federated connector. | Have the user open their **Gemini Enterprise Web App** in Chrome/Edge, check **Sources / Connectors**, click **Authorize** next to Outlook / SharePoint / OneDrive / Teams / GitHub, then re-run the query. |
| User has only a `/home/cid/<ID>` Web App URL and doesn't know `GE_PROJECT_ID` | Web App short URLs hide the underlying GCP project ID/number for unprivileged viewers. | Ask the agency GE admin once for the `projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>` string—and pass `-GeInstance` in `install-wv-suite.ps1` so the entire cohort gets it automatically! |
| Agency IT wants zero per-laptop configuration for `500+` staff | Large non-technical state cohort on locked-down Windows 11 laptops. | Deploy `deploy/cloudrun-ge-gateway/` once to Cloud Run (`us-east4`) and register its remote HTTPS Streamable MCP URL (`https://...run.app/mcp`) centrally—zero local subprocesses on employee laptops. |
