---
name: purview-sdp-enforcement
description: Defense-in-depth server-side Cloud Sensitive Data Protection (SDP) + Microsoft Purview ALLOW/MASK/BLOCK enforcement and non-fabrication compliance rules.
---

# SharePoint Purview & Server-Side Cloud SDP Enforcement Skill

Use this skill with `sharepoint-mcp-server-purview-sdp` when handling regulated SharePoint records subject to real-time Cloud SDP (`dlp.googleapis.com`) and Microsoft Purview `BLOCK` or `MASK` policies.

## Mandatory Compliance Rules

1. **Fail-Closed `BLOCK` Handling (Zero Fabrication):**
   - When a tool returns `blocked: true` (`ACCESS BLOCKED BY SENSITIVE DATA PROTECTION POLICY`), report the restriction transparently and **never guess, infer, or fabricate withheld document contents** (see `references/sdp-verdict-matrix.md`).
2. **Destructive Mutation Protection:**
   - Overwriting, moving, renaming, or deleting a `BLOCK`-classified file is denied server-side.
3. **Interactive SDP Governance Matrix:**
   - Call `open_purview_sdp_governance_matrix` (`ui://sharepoint-purview-sdp-mcp/sdp-governance-matrix.html`) to audit `ALLOW`, `MASK`, and `BLOCK` verdicts inline.
