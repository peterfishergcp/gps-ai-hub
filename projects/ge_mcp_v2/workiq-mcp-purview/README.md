# WorkIQ MCP + Azure RMS / Purview Encryption Verifier v2.0

> **Disclaimer**: Provided for illustration and educational purposes only under the Apache License 2.0.

Includes MFA-compatible MSAL v2.0 verification scripts (`verify_azure_rms_templates.py`, `test_purview_encryption_and_workiq.py`, `test_soc_purview_block.py`), a portable SEP-2640 skill (`skills/workiq-purview-rms-verification/SKILL.md`), and `generate_rms_audit_app.py` to generate a standalone SEP-1865 `text/html;profile=mcp-app` encryption posture dashboard.

```bash
./test_local.sh
```
