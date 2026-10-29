# Gemini Enterprise + Microsoft Work IQ MCP + Microsoft Purview Encryption Enforcement

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads.

![Reference Architecture](./architecture_diagram.svg)

## 1. Executive Summary

This module demonstrates how to connect **Google Cloud Gemini Enterprise** directly to **Microsoft's Managed Work IQ MCP Server (`https://workiq.svc.cloud.microsoft/mcp`)** as a Bring-Your-Own (BYO) MCP Connector, while enforcing **Microsoft Purview Sensitivity Labels & AES-256 Rights Management (RMS) Encryption** in real time on behalf of the signed-in user.

By combining **Google Cloud Workforce Identity Federation (WIF)** with **OAuth 2.0 Authorization Code (3LO) delegation**, every query from Gemini Enterprise executes under the user's Microsoft Entra ID identity (`On-Behalf-Of` / OBO):
1. **Scenario A — Allowed Path (`Confidential - RMS`)**: When a document in SharePoint Online is protected with a Microsoft Purview Sensitivity Label (`protectionEnabled: true`, AES-256 `MS-OFFCRYPTO` OLE2 container) whose label policy grants the signed-in user `VIEW` and `EXTRACT` rights, Microsoft Purview authorizes access and Work IQ MCP decrypts and summarizes the content in Gemini Enterprise with clickable source citations.
2. **Scenario B — Blocked Path (`SOC - Restricted Block`)**: When a document in the exact same SharePoint site carries a Microsoft Purview Sensitivity Label (`protectionEnabled: true`) that excludes the signed-in user (`0` rights — `VIEW` and `EXTRACT` denied), Work IQ MCP natively prevents the document content from being extracted or summarized in Gemini Enterprise.

---

## 2. End-to-End Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full architecture and sequence diagrams.

### Key Architectural Components
1. **Google Cloud Workforce Identity Federation (WIF)**:
   - Federates Microsoft Entra ID users and security groups into Google Cloud (`https://iam.googleapis.com/locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>/providers/<YOUR_OIDC_PROVIDER_ID>`).
2. **Gemini Enterprise BYO MCP Connector**:
   - Connects directly to Microsoft's zero-infrastructure SaaS MCP endpoint:
     ```text
     https://workiq.svc.cloud.microsoft/mcp
     ```
   - Uses 3-Legged OAuth (`Authorization Code` flow) against your custom Entra ID Application Registration (`<YOUR_ENTRA_CLIENT_ID>`) requesting the global Microsoft Work IQ resource scope:
     ```text
     fdcc1f02-fc51-4226-8753-f668596af7f7/.default offline_access openid profile
     ```
   - Automatically discovers all **11 Work IQ MCP Tools**:
     - `Ask`, `Fetch`, `Fetch Blob`, `List Agents`, `Search Paths`, `Get Schema`, `Call Function`, `Do Action`, `Create Entity`, `Update Entity`, `Delete Entity`.
3. **Microsoft Purview & Azure Rights Management (RMS)**:
   - Evaluates the signed-in user's identity against the file's Purview Sensitivity Label (`EncryptionRightsDefinitions`) before allowing M365 Copilot (`bizchat-as-gpt-scenario`) or SharePoint Online to decrypt the file stream.

---

## 3. Prerequisites & Configuration Checklist

### Step 1: Microsoft 365 & Purview Licensing
Ensure the test user(s) in your Microsoft 365 tenant hold:
- **Microsoft 365 Copilot** license (`MICROSOFT_365_COPILOT_FOR_BUSINESS` or Enterprise equivalent).
- **Microsoft Purview Information Protection** license (e.g., M365 E5 Compliance / Information Protection & Governance) to support Sensitivity Labels with AES-256 encryption.
- **SharePoint Pay-As-You-Go / Metered Graph Billing** linked to an Azure Subscription if using Microsoft Graph `assignSensitivityLabel` programmatically.

### Step 2: Microsoft Entra ID OAuth Client App Registration
1. Register an Application in **Microsoft Entra ID** (`<YOUR_ENTRA_CLIENT_ID>`).
2. Configure **API Permissions** (`requiredResourceAccess`):
   - **Work IQ (`fdcc1f02-fc51-4226-8753-f668596af7f7`)**: Add Delegated permissions (`McpServers.Ask.All`, `McpServers.Fetch.All`, `WorkIQAgent.Ask`) and grant tenant-wide Admin Consent.
   - **Microsoft Graph (`00000003-0000-0000-c000-000000000000`)**: Add `Files.ReadWrite.All` and `Sites.ReadWrite.All`.
   - **Azure Rights Management Services (`00000012-0000-0000-c000-000000000000`)**: Add Delegated `user_impersonation` (used by `verify_azure_rms_templates.py`).
3. Under **Authentication**:
   - Register the Google Cloud WIF / Gemini Enterprise OAuth Redirect URI (Web):
     ```text
     https://auth.cloud.google/signin-callback/locations/global/workforcePools/<YOUR_WORKFORCE_POOL_ID>/providers/<YOUR_OIDC_PROVIDER_ID>
     ```
   - Enable **Allow public client flows** (`isFallbackPublicClient = true`) if running the local verification scripts via **MSAL OAuth 2.0 Device Code flow** (`MS_AUTH_FLOW="device_code"`).
4. Ensure the App Manifest sets `"requestedAccessTokenVersion": 2`.

### Step 3: Grant Downstream On-Behalf-Of (`oauth2PermissionGrants`) to the First-Party Work IQ Service Principal
In a new Microsoft 365 tenant, grant the first-party **Work IQ Service Principal** (`appId: fdcc1f02-fc51-4226-8753-f668596af7f7`) delegated `oauth2PermissionGrants` (`AllPrincipals`):
- **Microsoft Graph (`00000003-0000-0000-c000-000000000000`)**:
  `Sites.Read.All Files.Read.All Files.ReadWrite.All Mail.Read User.Read Calendars.Read Chat.Read.All ChannelMessage.Read.All People.Read.All OnlineMeetingTranscript.Read.All Tasks.ReadWrite Group.Read.All InformationProtectionPolicy.Read`
- **Azure Rights Management Services (`00000012-0000-0000-c000-000000000000`)**:
  `user_impersonation`
- **Microsoft Information Protection Sync Service (`00000014-0000-0000-c000-000000000000`)**:
  `UnifiedPolicy.User.Read user_impersonation`
- **SharePoint Online (`00000003-0000-0ff1-ce00-000000000000`)**:
  `AllSites.Read AllFiles.Read AllSites.Write AllFiles.Write`

### Step 4: Enable Purview Co-Authoring & SharePoint IRM
1. In **Purview Compliance PowerShell** (`Connect-IPPSSession`), enable co-authoring for encrypted sensitivity labels:
   ```powershell
   Set-PolicyConfig -EnableLabelCoauth $true
   ```
2. Ensure Azure Rights Management (`AIPService`) is enabled in your tenant and **SharePoint Online IRM** is enabled in the SharePoint Admin Center (`TenantSettings.aspx`) so SharePoint can process encrypted Office files (`d0cf11e0a1b11ae1` OLE2 Compound File format).

### Step 5: Configure Two Purview Sensitivity Labels for Side-by-Side Testing
1. **Allowed Label (e.g., `Confidential - RMS`)**:
   - Enable Encryption (`EncryptionEnabled: $true`).
   - Grant your test user (or tenant domain) `VIEW` and `EXTRACT` rights.
2. **Blocked Label (e.g., `SOC - Restricted Block`)**:
   - Enable Encryption (`EncryptionEnabled: $true`).
   - Restrict permissions (`EncryptionRightsDefinitions`) strictly to a dedicated security group (`secops-restricted@<YOUR_TENANT_DOMAIN>:VIEW,OWNER`) so your standard test user holds **`0` rights** (`VIEW` and `EXTRACT` denied).
   - Apply the restricted label via an **Application Service Principal** (X.509 certificate in `test_soc_purview_block.py`) or separate admin account so the test user is not stamped as `ISSUER / OWNER`.

---

## 4. Running the MFA-Compatible Verification Scripts

All Python verification scripts use **MSAL (`msal.PublicClientApplication`)** with Entra v2.0 Device Code or Interactive Browser flows (and local `0600` token cache reuse)—never deprecated ROPC plaintext password grants—ensuring full compatibility with FedRAMP, DoD Conditional Access, and MFA policies.

1. Install dependencies and configure `.env`:
   ```bash
   pip install -r requirements.txt
   cp .env.example .env
   ```
2. Export your environment variables and run the three verification scripts:
   ```bash
   set -a && source .env && set +a

   # 1. Inspect tenant Azure RMS FunctionalState, AES-256 templates, and MS-OFFCRYPTO file headers
   python3 verify_azure_rms_templates.py

   # 2. Verify Scenario A (Allowed Path: Confidential - RMS decryption & summarization via Work IQ MCP)
   python3 test_purview_encryption_and_workiq.py

   # 3. Verify Scenario B (Blocked Path: SOC - Restricted Block native Purview denial via Work IQ MCP)
   python3 test_soc_purview_block.py
   ```
3. Follow [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) for the 5-step interactive walkthrough in **Gemini Enterprise**.
