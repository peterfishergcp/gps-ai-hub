# Gemini Enterprise: Microsoft 365 Connector Quality Skills Suite

This directory contains three modular **Gemini Enterprise Skills (`SKILL.md`)** organized into dedicated subfolders so customers can deploy either a unified Microsoft 365 skill or standalone SharePoint / Outlook connector skills.

---

## 📁 Available Skill Folders

| Folder Name | Skill Name | Target Connector(s) | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **[`m365_combined_skill/`](m365_combined_skill/)** | `m365-sharepoint-outlook-quality` | **Combined SharePoint & Outlook** (Standard Federated or Graph MCP) | Complete M365 suite: strips `?web=1` on PDFs for native `#page=N` links (`+1` physical page rule), keeps `?web=1` on `.docx` files so they open in Word Online without downloading, and enforces Outlook temporal search & thread synthesis. |
| **[`sharepoint_federated_skill/`](sharepoint_federated_skill/)** | `sharepoint-federated-quality-enhancer` | **Standard SharePoint Federated Connector** (Zero-Infrastructure Upgrade) | Standalone SharePoint quality enhancer: resolves PDF physical page numbers (`#page=N`), prevents `.docx` file downloads by enforcing `?web=1` for Word Online, and formats executive citations. |
| **[`outlook_connector_skill/`](outlook_connector_skill/)** | `outlook-connector-temporal-enhancer` | **Microsoft Outlook Connector** (Mail & Calendar) | Standalone Outlook skill: anchors relative dates (`today`, `latest`, `oldest`, `past 7 days`) to system time, aggregates full email conversation threads, and mandates clickable `webLink` citations. |
