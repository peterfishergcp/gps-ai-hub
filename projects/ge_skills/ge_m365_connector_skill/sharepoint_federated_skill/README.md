# SharePoint Federated Connector Quality Enhancer Skill (`sharepoint_federated_skill`)

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads. The views, code, and opinions expressed in this repository are those of the author(s) and do not necessarily reflect the position, opinions, or official policy of Google LLC or Google Cloud Platform.

---

## Overview
This directory contains the standalone **SharePoint Federated Connector Quality Enhancer Skill ([`SKILL.md`](./SKILL.md))** (`sharepoint-federated-quality-enhancer`) for **Gemini Enterprise**.

### Key Capabilities
- **Native Browser PDF Deep Links (`#page=N`)**: Strips `?web=1` from `.pdf` SharePoint URLs and applies physical page calculation rules (`+1` Cover Page / 0-index adjustment) so clicking a citation opens the PDF directly to the cited page.
- **Word Online Browser Viewing (`?web=1`)**: Preserves or appends `?web=1` on `.docx`, `.pptx`, and `.xlsx` files so clicking a link opens Word/PowerPoint/Excel Online in the browser instead of triggering a local file download.
- **Section Verification**: Prevents citing Table of Contents (TOC) listings when searching for specific document sections.
