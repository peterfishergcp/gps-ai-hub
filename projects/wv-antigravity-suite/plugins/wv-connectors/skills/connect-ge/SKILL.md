---
name: connect-ge
description: Default enterprise connector wizard for State of West Virginia cohorts—links the user's Gemini Enterprise (GE) instance and Entra-synced Google Identity so Antigravity can query federated Outlook, SharePoint, OneDrive, Teams, Gmail, Drive, and GitHub connectors with zero laptop installs. Trigger on /connect-ge, "connect my Gemini Enterprise instance", "set up connectors", or when a user shares a GE instance link or engine ID.
---

# Connect Your Gemini Enterprise (`GE`) Instance (`/connect-ge`)

In West Virginia's architecture, **Azure / Entra ID** accounts and security groups sync to **Google Cloud Identity**, and **most enterprise connectors are federated inside Gemini Enterprise (`GE`)**. Connecting your GE instance once unlocks **Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, and GitHub** simultaneously—with **zero local runtimes or libraries installed on your laptop**.

## Step 1: Collect or Confirm the User's GE Instance Coordinates
Check whether `ge_instance_status` (`wv-ge-bridge`) is already configured (for example if WV IT ran `install-wv-suite.ps1 -GeInstance ...`).

If not yet configured, ask the user for **any one** of the following:
1. Their **Gemini Enterprise resource path**:
   `projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>`
2. Their **Google Cloud Console Gemini Enterprise URL** (which contains both `project=` and `/engines/<ENGINE_ID>`), OR
3. Separate `PROJECT_ID`, `LOCATION` (`global` or `us`), and `ENGINE_ID` values provided by their agency GE administrator.

Call **`ge_configure_instance`** immediately to save the coordinates in `${PLUGIN_DATA}/ge-instance.json` (which persists across future `/wv-update` upgrades).

## Step 2: Verify Entra-Synced Google Identity Authentication
Call **`ge_instance_status`**.
- **If `ok: true`**: Show the user their connected **GE Engine Display Name**, auth source, and discovered data stores / federated connectors!
- **If authentication is missing**:
  - **Laptop WITHOUT `gcloud` (Standard Business User):** Call `ge_sign_in` (passing their agency's Desktop OAuth `clientId` if provided) and give the user the 1-click Chrome/Edge SSO URL. Signing in with their `@wv.gov` Google Identity redirects seamlessly through West Virginia's **Azure / Entra ID SSO** and stores an auto-refreshing `0600` token locally.
  - **Workstation WITH `gcloud`:** Offer `gcloud auth application-default login` as an alternative 1-command sign-in.
- For IAM or federated token troubleshooting (e.g. `403 PERMISSION_DENIED` or an unlinked 3P federated connector), consult `./references/entra_google_identity_federated_ge.md`.

## Step 3: Run a Live Federated Smoke Test
Once `ge_instance_status` succeeds:
1. Remind the user of the **1-Time Federated Connector Link Rule**:
   > *"Because Outlook, SharePoint, OneDrive, Teams, and GitHub are federated connectors in Gemini Enterprise, make sure you have opened your Gemini Enterprise Web App once and clicked **Authorize** next to each federated app so your 3P token is linked to your Google Identity."*
2. Run a quick read-only test via **`ge_ask_instance`** (e.g. *"List the titles and dates of the 3 most recent documents or emails accessible to me across SharePoint, OneDrive, Drive, or Outlook"*) to prove end-to-end grounded retrieval!
