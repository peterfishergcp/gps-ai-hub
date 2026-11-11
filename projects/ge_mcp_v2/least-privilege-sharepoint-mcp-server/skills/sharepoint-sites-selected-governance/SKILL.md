---
name: sharepoint-sites-selected-governance
description: Zero-trust, strictly read-only SharePoint retrieval scoped to Microsoft Entra ID Sites.Selected permissions and ALLOWED_SHAREPOINT_SITES.
---

# Least-Privilege SharePoint (`Sites.Selected`) Governance Skill

Use this skill when operating `least-privilege-sharepoint-mcp-server` under Microsoft Entra ID `Sites.Selected` (`roles: ["read"]`) governance.

## Operational Rules

1. **Read-Only & Site-Scoped by Design:**
   - All Graph operations are strictly `GET`-only and restricted to `ALLOWED_SHAREPOINT_SITES` (see `references/sites-selected-audit-checklist.md`).
   - Use `query_search_files_lookup` for scoped cross-library search (`Sites.Selected`-compatible traversal).
2. **Visual Scope Verification:**
   - Launch `open_sites_selected_scope_auditor` (`ui://least-privilege-sharepoint-mcp/scope-auditor.html`) to display approved site boundaries and inspect scoped files interactively.
