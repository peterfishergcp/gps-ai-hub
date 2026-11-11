---
name: sharepoint-citation-navigator
description: Navigate Microsoft SharePoint sites and OneDrive libraries with file-type-aware browser citations (?web=1 for Office files and #page=N for PDFs).
---

# SharePoint & OneDrive Citation Navigator Skill

Use this skill when searching, browsing, or summarizing documents stored in Microsoft SharePoint Online and OneDrive via `sharepoint-mcp-server`.

## Workflow

1. **Discover Sites & Libraries:**
   - Call `query_sharepoint_sites_lookup` and `query_document_libraries_lookup` to locate the target library, or launch `open_sharepoint_document_explorer` (`ui://sharepoint-mcp/document-explorer.html`) for visual drill-down.
2. **Extract Content & Cite Accurately:**
   - Read `references/citation-formatting-rules.md` before formatting links.
   - Strip `?web=1` and append `#page=N` on `.pdf` files; retain `?web=1` on `.docx`, `.xlsx`, and `.pptx` files so links open directly in SharePoint Web Viewer.
3. **Destructive Action Gate:**
   - Require explicit user confirmation before calling any create, overwrite, rename, move, or delete tool (`destructiveHint: true`).
