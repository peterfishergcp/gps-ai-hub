---
name: m365-sharepoint-outlook-quality
description: >
  Elevate retrieval accuracy, citation precision, browser-viewing UX, and temporal reasoning for
  Microsoft SharePoint (Standard Federated Connector or Graph MCP) and Microsoft Outlook Mail &
  Calendar connectors. Enforces simple, foolproof citation rules: strip ?web=1 on PDFs (.pdf#page=N)
  and add +1 for Cover Page / 0-indexed search chunks so PDF links land on the exact physical page;
  keep/append ?web=1 on Office files (.docx?web=1) so they open in Word Online instead of downloading;
  and enforce strict temporal date arithmetic and clickable webLink citations for Outlook.
---

# Microsoft 365 SharePoint & Outlook Quality Enhancer (`m365-sharepoint-outlook-quality`)

A clean, high-precision citation and retrieval framework for **Standard Federated SharePoint Connectors**, **Standard Outlook Connectors**, and **Custom Microsoft Graph MCP Servers** in Gemini Enterprise.

---

## Part I: SharePoint Citation & Browser Viewing Rules (Simple & Direct)

### 1. File-Type URL Rule (`PDF` vs. `Word / Office`)
Always format SharePoint URLs based on the file extension so clicking a link **always opens in the browser** and **never downloads to disk**:

- **For PDF Files (`.pdf`) — REMOVE `?web=1` & Append `#page=N`**:
  - Browsers have a built-in PDF viewer that jumps to `#page=N`, but SharePoint's `?web=1` wrapper breaks `#page=N`.
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
      - Section `7.4 Force Majeure` (*"Neither party shall be liable for any failure to perform its obligations where such failure results from any cause beyond the party’s reasonable control..."*) has printed footer / chunk index `3`, which means it resides on **Physical PDF Page 4**.
      - You **MUST** cite **`#page=4`** (not `#page=3`):
        ```markdown
        [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4)
        ```

---

## Part II: Microsoft Outlook Connector Rules & Temporal Reasoning

### 1. Dynamic System Time & Relative Date Guidelines
Anchor all relative time expressions to the current system clock (`Today's Date: ${currentDateStr}` / `Current ISO Timestamp: ${currentIsoTime}`):
- **"Today"**: Use `fromDate: "${currentDateStr}T00:00:00Z"`.
- **"Latest" / "Most Recent" / "Newest"**: Set `sortOrder: "desc"` (default).
- **"Oldest" / "Earliest"**: Set `sortOrder: "asc"`.
- **"Last Week" / "Past 7 Days"**: Calculate the exact ISO date range subtracting 7 calendar days from Today's Date (`${currentDateStr}`).

### 2. Conversation Threads & Multi-Email Aggregation
- **Thread Context**: Use `get_email_thread_lookup` (or group federated emails by `conversationId` chronologically) to synthesize full back-and-forth email threads rather than isolated replies.
- **Batch Retrieval**: Use `get_batch_messages_detail_lookup` when summarizing multiple emails at once.

### 3. Mail & Calendar Citation Requirement
- Every email or calendar event referenced in your response **MUST** include a clickable citation link:
  ```markdown
  [Subject - Sender Name (YYYY-MM-DD)](webLink)
  ```

---

## Part III: Expected Output Template

Every response **MUST** follow this structure:

```markdown
### 📄 Summary & Answer
<Your clear, detailed answer with inline clickable citations:
- PDF Example (Strip `?web=1`, apply `+1` physical page rule): "Under [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4), neither party is liable for delays caused by acts of God, war, or systemic telecommunications failure."
- Word `.docx` Example (Keep `?web=1` so it opens in Word Online): "Per [Master Services Agreement — Section 8: Intellectual Property Rights](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Master%20Services%20Agreement.docx?web=1), custom IP vests in the Customer."
- Outlook Example: "Confirmed in [Q3 Budget Sign-off - CFO Office (2026-09-14)](https://outlook.office365.com/owa/?ItemID=AAMk...), final allocations lock on Friday.">

### 📚 Sources & Citations
- 🔗 **SharePoint PDF**: [Statement of Work: Project Cal-Nexus — Section 7.4 Force Majeure (Page 4)](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf#page=4)
- 🔗 **SharePoint Word Document**: [Master Services Agreement — Section 8: Intellectual Property Rights](https://demoalto.sharepoint.com/sites/peterf2ndsite/Shared%20Documents/Master%20Services%20Agreement.docx?web=1)
- 🔗 **Outlook Communication**: [Subject - Sender (Date)](webLink)

---
*Note: Microsoft SharePoint and Outlook search results may be paginated or reflect recent indexing intervals. If you suspect missing results, please retry with a more specific document title or query.*
```
