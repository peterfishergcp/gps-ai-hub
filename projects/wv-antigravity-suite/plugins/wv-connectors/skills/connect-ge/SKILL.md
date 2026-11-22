---
name: connect-ge
description: Default enterprise connector wizard for State of West Virginia cohorts—saves and verifies the user's Gemini Enterprise (GE) instance and Entra-synced @wv.gov Google Identity (via remote HTTPS Cloud Run GE Gateway, Google Identity ADC, or GE Web App Companion Mode) with zero local MCP subprocesses or laptop installs. Trigger on /connect-ge, "connect my Gemini Enterprise instance", "set up connectors", or when a user shares a GE instance link or engine ID.
---

# Connect Your Gemini Enterprise (`GE`) Instance (`/connect-ge`)

In West Virginia's architecture, **Azure / Entra ID** accounts and security groups sync to **Google Cloud Identity**, and **enterprise connectors are federated inside Gemini Enterprise (`GE`)**. Configuring your GE instance unlocks **Outlook, SharePoint, OneDrive, Microsoft Teams, Gmail, Google Drive, and GitHub** workflows with **zero local MCP subprocesses or extra software installed on your state laptop**.

## Step 1: Check or Save the User's GE Instance Coordinates (`ge-instance.json`)
1. Inspect `~/.gemini/config/plugin_data/wv-connectors/ge-instance.json` first (in case WV IT pre-populated it via `install-wv-suite.ps1 -GeInstance ...` or the user saved it in `Extensions -> WV Skills -> GE Connector Hub`).
2. If not yet configured, ask the user for **any one** of the following (or let them paste it into `WV Skills -> GE Connector Hub`):
   - Their **Gemini Enterprise resource path**:
     `projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>`
   - Their **Google Cloud Console Gemini Enterprise URL** (containing `project=` and `/engines/<ENGINE_ID>`), OR
   - Separate `PROJECT_ID`, `LOCATION` (`global` or `us`), and `ENGINE_ID` values from their agency GE administrator.
3. Save the coordinates cleanly as BOM-free UTF-8 JSON in `~/.gemini/config/plugin_data/wv-connectors/ge-instance.json` (which persists across future `/wv-update` upgrades).

## Step 2: Verify the Active Zero-Footprint Connection Tier
Check which of the 3 zero-footprint West Virginia tiers is active for this workstation:
1. **Tier A — Agency Remote Cloud Run Streamable HTTP GE Gateway (Recommended for 500+ Staff):**
   - Check whether IT registered the agency's remote HTTPS `wv-ge-mcp-gateway` URL (`https://...run.app/mcp` from `deploy/cloudrun-ge-gateway/`) in Antigravity's remote **MCP Servers** settings (`HTTPS 443` only, zero local `node` processes). If active, test a read-only federated query!
2. **Tier B — Keyless `@wv.gov` Google Identity ADC (Analysts & Technical Staff with `gcloud`):**
   - Check whether Application Default Credentials exist (`~/.config/gcloud/application_default_credentials.json` or `%APPDATA%\gcloud\application_default_credentials.json`) so read-only HTTPS calls to `discoveryengine.googleapis.com` (`StreamAssist`) authenticate with the user's Entra-synced `@wv.gov` identity.
3. **Tier C — Locked-Down Business Laptop Companion Mode (Zero CLI / Zero MCP Needed):**
   - Give the user a copy-ready federated prompt from `../connect-m365-workspace/references/federated_connector_prompts.md` to run inside their **Gemini Enterprise Web App** in Chrome/Edge (after clicking **Authorize** once next to Outlook, SharePoint, OneDrive, Teams, and GitHub), then paste or attach the grounded output directly into Antigravity for dashboards, slides, FOIA review, or memos!

For IAM or federated connector troubleshooting (`403 PERMISSION_DENIED` or unlinked 3P OAuth tokens), consult `./references/entra_google_identity_federated_ge.md`.
