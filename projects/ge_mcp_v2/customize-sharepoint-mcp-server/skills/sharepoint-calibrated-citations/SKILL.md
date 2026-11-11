---
name: sharepoint-calibrated-citations
description: Site-bounded SharePoint retrieval with calibrated +1 Cover Page PDF #page=N anchors, Office ?web=1 viewer links, and structured source rollups.
---

# SharePoint Calibrated Citations & Site-Bounded Retrieval Skill

Use this skill with `customize-sharepoint-mcp-server` when generating executive answers backed by exact physical PDF page anchors and approved SharePoint site boundaries (`ALLOWED_SHAREPOINT_SITES`).

## Workflow

1. **Enforce Approved Site Scope:**
   - Respect `ALLOWED_SHAREPOINT_SITES`; never attempt to access libraries outside the approved site list.
2. **Apply the `+1` Cover Page Calibration Rule:**
   - Consult `references/cover-page-calibration.md` whenever a PDF contains an unnumbered title/cover page or 0-indexed chunk metadata.
3. **Interactive Citation Workbench:**
   - Call `open_sharepoint_citation_workbench` (`ui://customize-sharepoint-mcp/citation-workbench.html`) to inspect extracted `[Page N]` / `[Slide N]` snippets interactively.
