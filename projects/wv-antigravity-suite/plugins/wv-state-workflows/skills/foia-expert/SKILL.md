---
name: foia-expert
description: Formulates compliant multi-corpus FOIA / public records discovery queries across Google Vault (MAIL, DRIVE, GROUPS, CHAT), Microsoft Purview eDiscovery KQL (Outlook, SharePoint, OneDrive, Teams), and Federated Gemini Enterprise, and executes statutory segregability redaction (W. Va. Code § 29B-1-4 and 5 U.S.C. § 552) with a 4-part Vaughn Index audit report and sanitized print-to-PDF deliverables. Trigger on /foia-expert, "FOIA request", "public records search", "Vault query", "Purview KQL", or "redact this record / Vaughn Index".
---

# Public Records & FOIA Discovery + Statutory Redaction Expert (`/foia-expert`)

Translate narrative citizen, journalist, or legislative public records requests into **syntax-compliant multi-repository discovery queries**, and execute **line-by-line statutory segregability redactions** with full Vaughn Index traceability.

> **MANDATORY HUMAN-IN-THE-LOOP LEGAL GATE:** Every output is a **Pre-Release Legal Review Draft**. Agency FOIA officers and legal counsel must verify statutory exemptions, segregability, and visual/binary redaction finality before releasing records externally. Note that under **West Virginia FOIA (`W. Va. Code § 29B-1-3(d)`)**, custodians must respond within **5 business days** (excluding Saturdays, Sundays, and legal holidays) of receipt.

---

## 1. Multi-Repository Discovery Query Synthesis

When given an unstructured FOIA request:
1. **Extract Core Scoping Parameters:** Subject/project identifiers (exact phrases), date window, record types (*correspondence/email/chat* vs. *contracts/reports/presentations*), and **internal agency custodians**.
   - **CRITICAL CUSTODIAN ISOLATION RULE:** Custodian filters must **ONLY** contain internal agency accounts (`@wv.gov` / `@agency.gov`). **NEVER** place an external citizen requester's personal email address into internal custodian scopes.
2. **Optional Rapid Pre-Scoping via Federated GE (`wv-ge-bridge`):**
   - If `ge_ask_instance` / `ge_search_records` is active and the officer wants to identify internal project codenames or custodians before running formal Vault/Purview exports, run a read-only scoping query across connected stores.
3. **Generate Compliant Repository Queries:**
   - **A. Google Vault (`MAIL`, `DRIVE`, `GROUPS`, `CHAT`):**
     - **Global Rules:** Enclose exact phrases in double quotes (`"Project BlueSky"`); Boolean operators **MUST BE UPPERCASE** (`AND`, `OR`, `NOT`, `AROUND` — lowercase `and`/`or` are treated as literal words!); group logic with parentheses; exclude trash/drafts where appropriate (`-label:trash`).
     - **`MAIL` Operators:** `subject:"..."`, `from:custodian@wv.gov`, `to:(vendor@example.com OR lead@wv.gov)`, `after:YYYY/MM/DD`, `before:YYYY/MM/DD`, `has:attachment`, `filename:pdf`.
     - **`DRIVE` Operators:** `title:"..."` or `name:"..."`, `type:document` / `type:spreadsheet` / `type:pdf`, `owner:custodian@wv.gov`, `modified_after:YYYY-MM-DD`, `modified_before:YYYY-MM-DD` (exclude FOIA administrative tracking sheets!).
   - **B. Microsoft Purview eDiscovery KQL (For Federated Outlook, SharePoint, OneDrive & Teams):**
     - Use uppercase `AND` / `OR` / `NOT` (or `c:c` condition coupling in Purview UI), ISO date ranges `sent>=YYYY-MM-DD AND sent<=YYYY-MM-DD` (Exchange/Teams) or `lastmodifiedtime>=YYYY-MM-DD` (SharePoint/OneDrive), `participants:custodian@wv.gov`, and `filetype:pdf OR filetype:docx`.

---

## 2. Statutory Segregability & Redaction (`W. Va. Code § 29B-1-4` & `5 U.S.C. § 552(b)`)

Consult `./references/wv_and_federal_foia_exemptions.md` for full statutory mappings. Preserve and release all non-exempt factual text while deterministically masking exempt spans:
- **Personal Privacy / PII (`W. Va. Code § 29B-1-4(a)(2)` / `5 U.S.C. § 552(b)(6)`):**
  - Mask SSNs, personal mobile/home phone numbers, residential street addresses, personal email addresses, dates of birth, emergency contacts, and non-public personnel/medical records -> `[REDACTED: WV § 29B-1-4(a)(2) / (b)(6) - PII]` (or typed markers `[REDACTED - SSN]`, `[REDACTED - PERSONAL PHONE]`, `[REDACTED - HOME ADDRESS]`).
- **Trade Secrets & Confidential Commercial/Financial (`W. Va. Code § 29B-1-4(a)(1)` / `5 U.S.C. § 552(b)(4)`):**
  - Mask vendor bank account numbers, ABA wire routing numbers, proprietary trade-secret formulas, and non-public financial credentials -> `[REDACTED: WV § 29B-1-4(a)(1) / (b)(4) - Trade Secret/Financial]`.
- **Internal Deliberative Memoranda / Security (`W. Va. Code § 29B-1-4(a)(8)` / `(a)(19)`):**
  - Flag pre-decisional legal/policy drafts or cybersecurity infrastructure secrets (`IPs`, credentials, vulnerability paths) for counsel review -> `[REDACTED / COUNSEL REVIEW: WV § 29B-1-4(a)(8) or (a)(19)]`.

---

## 3. Mandatory 4-Part Output (`FOIA Record Processing & Redaction Report`)

For every single-record or batch folder FOIA task, output:
1. **Part 1 — Executive Header & WV 5-Business-Day Statutory Clock:**
   - Record Title(s), Originating Source, Subject Matter, Receipt Date + Calculated 5-Business-Day WV Statutory Due Date (`W. Va. Code § 29B-1-3(d)`), Processing Standard, and Deliverable Path(s) (`./deliverables/<Name>_REDACTED.html`).
2. **Part 2 — Multi-Corpus Discovery Syntax & Custodian Traceability:**
   - Exact copy-ready **Google Vault** (`MAIL` / `DRIVE` / `CHAT`) and/or **Microsoft Purview KQL** queries + Internal Custodian Scope.
3. **Part 3 — Line-by-Line Redaction Audit Log (Vaughn Index Table):**
   - Markdown table with columns: `Document / Location | Data Category Redacted | Redaction Marker Applied | Statutory Basis & Justification`.
4. **Part 4 — Zero-Install Sanitized Deliverable (`./deliverables/<Original_Name>_REDACTED.html`):**
   - Write a clean, print-to-PDF ready HTML document in `./deliverables/` containing **only** the sanitized text with high-contrast `[REDACTED: ...]` badges (ensuring raw PII strings are **completely absent** from the HTML source—never merely hidden with black CSS over selectable text!) plus a counsel sign-off cover block.
