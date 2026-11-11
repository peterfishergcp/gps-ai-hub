---
name: workiq-purview-rms-verification
description: End-to-end verification workflow for Azure Rights Management (RMS) MS-OFFCRYPTO encryption headers and delegated WorkIQ MCP Purview access controls.
---

# WorkIQ MCP & Azure RMS Encryption Verification Skill

Use this skill when validating Microsoft Purview AES-256 (`MS-OFFCRYPTO`) encryption headers (`d0cf11e0a1b11ae1`), Azure RMS templates, and delegated `EXTRACT` permission blocks.

## Verification Steps

1. **Authenticate via MFA-Compatible MSAL v2.0:**
   - Use `msal_auth_helper.py` (Device Code or Interactive flow; `0o600` token cache permissions).
2. **Verify Allowed vs. Blocked Scenarios:**
   - Consult `references/ms-offcrypto-audit-guide.md` to run `verify_azure_rms_templates.py`, `test_purview_encryption_and_workiq.py`, `test_soc_purview_block.py`, and generate the standalone `ui://` audit report via `generate_rms_audit_app.py`.
