---
name: sharepoint-federated-quality-enhancer
description: >
  Enhance answer quality, deep-link precision, and browser-viewing UX for the Standard SharePoint
  Federated Connector (Vertex AI Search / Gemini Enterprise OOTB SharePoint Connector) or Graph MCP.
  Enforces two simple, foolproof rules: (1) Strip ?web=1 on PDFs (.pdf#page=N) and add +1 for Cover Page
  / 0-indexed search chunks so PDF links land on the exact physical page (e.g., 7.4 Force Majeure in
  Project Cal-Nexus SOW is Physical Page 4 -> #page=4); (2) Always keep/append ?web=1 on Office files
  (.docx?web=1) so clicking opens Word Online in the browser instead of downloading the file.
---

# SharePoint Federated Connector Quality Enhancer (`sharepoint-federated-quality-enhancer`)

A clean, zero-infrastructure Gemini Enterprise Skill designed to upgrade the **Out-of-the-Box (OOTB) Standard SharePoint Federated Connector** (and custom Graph MCP connectors) with working browser deep links and accurate physical page numbers.

---

## Core SharePoint Citation & Browser Viewing Rules (Simple & Direct)

### 1. File-Type URL Rule (`PDF` vs. `Word / Office`)
Always format SharePoint URLs based on the file extension so clicking a link **always opens in the browser** and **never downloads to disk**:

- **For PDF Files (`.pdf`) — REMOVE `?web=1` & Append `#page=N`**:
  - Browsers have a built-in PDF viewer that jumps to `#page=N`, whereas SharePoint's `?web=1` wrapper ignores `#page=N`.
  - **Rule**: Always strip `?web=1` from `.pdf` URLs and append `#page=N`.
  - ✅ **Correct PDF Link**:
    `https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4`

- **For Word, PowerPoint & Excel Files (`.docx`, `.pptx`, `.xlsx`) — ALWAYS END WITH `?web=1`**:
  - Browsers cannot render raw `.docx` files natively—if `?web=1` is missing, clicking the link **downloads the file to the user's computer**.
  - **Rule**: Always keep or append `?web=1` at the end of `.docx`, `.pptx`, and `.xlsx` URLs (never append `#section=`). Put the exact Section/Clause name inside the clickable link label so the user sees it when Word Online opens.
  - ✅ **Correct Word (`.docx`) Link**:
    `[Master Services Agreement — Section 8: Intellectual Property Rights](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Master%20Services%20Agreement.docx?web=1)`

---

### 2. Simple PDF Page Number Calculation (`#page=N`)
Do not use complicated Table of Contents or Introduction exclusion formulas. Follow this single rule for PDF page numbers:

- **Count Every Physical Page Starting from the Cover Page (Cover Page = Page 1)**:
  - The URL anchor `#page=N` uses the **total sequential page count in the PDF viewer file starting with Page 1 as the Cover/Title sheet**.
  - **The `+1` Cover Page / 0-Index Rule**:
    - Because SharePoint Federated Search chunk metadata is **0-indexed** (`page 0, 1, 2, 3...`) AND documents with a Cover/Title page start their printed footer numbering (`Page 1`) on the **2nd physical page**, the true PDF viewer page is **`Printed Page / Chunk Index + 1`**.
    - **Concrete Calibration Example (*Project Cal-Nexus SOW*)**:
      - Section `7.4 Force Majeure` (*"Neither party shall be liable for any failure to perform its obligations where such failure results from any cause beyond the party’s reasonable control, including acts of God, war, or systemic telecommunications failure"*) has printed footer / chunk index `3`, which means it resides on **Physical PDF Page 4**.
      - You **MUST** cite **`#page=4`** (not `#page=3`):
        ```markdown
        [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4)
        ```

---

### 3. Expected Output Template

Your response **MUST** follow this structure:

```markdown
### 📄 Summary & Answer
<Your detailed answer containing inline clickable citations:
- For PDF files (Strip `?web=1`, apply `+1` physical page rule): "Under [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4), neither party is liable for failure to perform due to acts of God, war, or systemic telecommunications failure."
- For Word `.docx` files (Keep `?web=1` so it opens in Word Online): "Under [Master Services Agreement — Section 8: Intellectual Property Rights](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Master%20Services%20Agreement.docx?web=1), custom IP vests in the Customer.">

### 📚 Sources & Citations
- 🔗 **PDF Document**: [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4)
- 🔗 **Word Document (Opens in Word Online)**: [Master Services Agreement — Section 8: Intellectual Property Rights](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Master%20Services%20Agreement.docx?web=1)

---
*Note: Microsoft SharePoint search results may be paginated or partial. If you suspect missing results, please try again with a more specific document title or query.*
```
