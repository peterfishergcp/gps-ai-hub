---
name: purview-label-governance
description: 3-tier Microsoft Purview Sensitivity Label extraction (Graph facet, listItem fields, OOXML docProps/custom.xml) and MSIP_Label emission for native connector SDP enforcement.
---

# Microsoft Purview Sensitivity Label Governance Skill

Use this skill with `sharepoint-mcp-server-purview-label` when retrieving SharePoint documents governed by Microsoft Purview Sensitivity Labels and native Sensitive Data Protection (SDP) policies.

## Workflow

1. **Inspect Classification Metadata:**
   - Check `fileLabel`, `purviewSensitivityGuid`, `msip_labels`, and `assigned_sensitivity_labels` on every file response (see `references/msip-label-tiers.md`).
   - Clearly surface classification badges in user-facing summaries.
2. **Interactive Label Inspector:**
   - Launch `open_purview_label_inspector` (`ui://sharepoint-purview-label-mcp/label-inspector.html`) to filter library files by Purview classification and inspect `MSIP_Label` GUIDs visually.
