# Entra ID `Sites.Selected` Security Audit Checklist

- Verify the Entra App Registration holds Application permission `Sites.Selected` (never `Sites.ReadWrite.All`).
- Grant site-level `roles: ["read"]` via `grant_site_permissions.sh` only on approved SharePoint sites.
- Confirm `ALLOWED_SHAREPOINT_SITES` matches the granted sites and `MCP_TOKEN_SIGNING_SECRET` (>=32 chars) is mounted via Secret Manager.
