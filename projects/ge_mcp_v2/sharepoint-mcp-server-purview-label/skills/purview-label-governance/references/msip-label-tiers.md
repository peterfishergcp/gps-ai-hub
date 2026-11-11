# 3-Tier Microsoft Purview Label Extraction Reference

1. **Tier 1 — Microsoft Graph `sensitivityLabel` Facet:** Reads `id`, `displayName`, `protectionEnabled`, and `assignmentMethod`.
2. **Tier 2 — SharePoint `listItem.fields`:** Reads `_SensitivityLabelId` and `_ComplianceTag`.
3. **Tier 3 — Bounded Async OOXML `docProps/custom.xml`:** Inflates `MSIP_Label_<GUID>_Enabled` and `MSIP_Label_<GUID>_Name` (`<=10 MB` entry cap, `<=250` ZIP entries) and emits native `msip_labels` strings.
