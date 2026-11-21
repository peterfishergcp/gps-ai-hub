# Government Services (`public_sector`) Skills — 7 Guided Test Prompts (`v2.0.0`)

These **7 guided test prompts** exercise every skill in the **`Government Services (public_sector) (7)`** category inside **`Extensions → WV Antigravity → Skills`** and **`Extensions → WV Skills`** (bundled inside your existing `wv-state-workflows` plugin—no extra plugin install required).

> [!TIP]
> **New in `v2.0.0` — 1-Click Starter OR Full West Virginia Deep-Test Script:** Open **`Extensions → WV Antigravity → Skills`**, click the **`Government Services (public_sector) (7)`** filter pill, and click **`Run →`** on any card (**Option A** below) with zero copy-paste—or paste **Option B** when you want to test the full West Virginia county and statutory scenarios.

---

## Important Note on MCP Connectors vs. Standalone Testing

In Google Cloud Gemini Enterprise, several `public_sector` skills are designed to call optional **Federal Regulatory MCP servers** (`Federal Register`, `eCFR`, `SAM`, `Data.gov` — currently in preview) or **Enterprise Connectors** (`SharePoint`, `Outlook`, `Drive`, `ServiceNow`, `Salesforce`).

Because **no Federal Regulatory MCP server is attached by default on tester laptops**, both **Option A (1-Click)** and **Option B (West Virginia Deep-Test)** work out of the box—with these expected safety behaviors:

| Prompt & Slash Skill | Works Without an MCP Server? | Expected Behavior When No External MCP Server Is Connected |
| :--- | :--- | :--- |
| **PS-1:** `/document-intake-cleanup-and-validation` | **Yes — 100% Standalone** | Evaluates pasted/uploaded paystubs, leases, and residency proofs directly; runs deterministic gross-income math with zero MCP calls needed. |
| **PS-2:** `/plain-language-notice-generator` | **Yes — 100% Standalone** | Rewrites pasted West Virginia public advisories into plain language while preserving 100% of dates, phone numbers, and regulatory citations. |
| **PS-3:** `/public-records-redaction` | **Yes — 100% Standalone** | Redacts pasted records line-by-line using its bundled Federal + West Virginia statutory guide (**W. Va. Code § 29B-1-4**) with pinpoint citations and officer flags. |
| **PS-4:** `/foia-request-processing` | **Yes (with Pasted Records or `wv-ge-bridge`)** | Treats pasted repository search hits (or `wv-ge-bridge` Federated GE results) as connected search results to build the 3-table officer report, and **correctly logs unconnected systems (e.g., ServiceNow / SMS) in `Gaps`**. |
| **PS-5:** `/rfp-vendor-evaluation` | **Yes — Partial External Flag by Design** | Evaluates pasted vendor proposals against the RFP rubric and builds a cited compliance matrix, while **intentionally marking external database checks (federal debarment / exclusions) as `Cannot Verify — No External Connector`**. |
| **PS-6:** `/expense-auditor` | **Tier-2 `.gov` Web Fallback (or Pasted Rules)** | Looks for a Federal Regulatory MCP (`2 CFR Part 200`) first; when absent, falls back to official `.gov` web lookup if internet search is enabled—or flags unverified rate lookups cleanly while auditing all ledger math. |
| **PS-7:** `/policy-and-statute-assistant` | **Strict Anti-Hallucination Gate (Web Fallback or Timeout Banner)** | Looks for the Federal Regulatory MCP first, then official `.gov` search. **If neither an MCP server nor `.gov` web search is reachable, it intentionally refuses to quote statutes from model memory** and outputs `[⚠️ RETRIEVAL TIMEOUT: Official endpoint unreachable...]` + a drafted Policy Clarification Request (`PCR`). **Seeing that banner offline means the safety gate passed!** |

---

## Prompt PS-1 — Public Sector Document Intake & Validation (`/document-intake-cleanup-and-validation`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/document-intake-cleanup-and-validation Simulate an intake validation check on two biweekly paystubs ($1,420.50 and $1,485.00 gross) and a residential lease, verifying prospective monthly gross income math and missing proofs.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/document-intake-cleanup-and-validation Act as an intake validation assistant for a West Virginia county constituent benefits & emergency utility assistance portal. Validate these 3 uploaded/OCR'd proof documents submitted by applicant "Marcus Vance (Kanawha County, WV)" and calculate prospective monthly gross income:
1. Uploaded File: `Vance_Paystub_1_Oct2026.pdf` (Bi-weekly pay period: 10/01/2026 – 10/14/2026; Employer: Appalachian Logistics LLC, Charleston, WV; Regular Hours: 80.0 @ $21.50/hr = $1,720.00; Overtime: 4.0 hrs @ $32.25/hr = $129.00; Gross Pay: $1,849.00; YTD Gross: $38,829.00; Optical quality: Clear, all corners visible).
2. Uploaded File: `Vance_Paystub_2_Oct2026.pdf` (Bi-weekly pay period: 10/15/2026 – 10/28/2026; Employer: Appalachian Logistics LLC; Regular Hours: 80.0 @ $21.50/hr = $1,720.00; Overtime: 0.0 hrs; Gross Pay: $1,720.00; YTD Gross: $40,549.00; Optical quality: Clear).
3. Uploaded File: `Vance_Residential_Lease_2026.pdf` (Property: 412 Elk River Rd, Apt B, Charleston, WV 25301; Monthly Rent: $975.00; Term: 07/01/2026 – 06/30/2027; Page 1 of 3 and Page 2 of 3 present — Page 3 of 3 signature block is MISSING; Utility addendum blurred/illegible at bottom margin).
Check math continuity across YTD totals, compute prospective monthly gross income using standard bi-weekly conversion rules, flag all document/signature defects, and format the structured intake validation summary for the caseworker.
```

---

## Prompt PS-2 — Plain Language Notice Generator (`/plain-language-notice-generator`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/plain-language-notice-generator Rewrite a dense agency water-system maintenance advisory into clear Grade-7 plain language while preserving every exact date, phone number, and statutory notice block.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/plain-language-notice-generator Rewrite this dense West Virginia municipal water utility notice into clear, accessible plain language for affected residents, preserving every single street boundary, date, time, contact number, and 40 CFR 141.205 health block requirement without inventing any facts:
"PUBLIC NOTIFICATION OF DISTRIBUTION SYSTEM DEPRESSURIZATION AND PRECAUTIONARY BOIL WATER ADVISORY (PWSID #WV3302011): Pursuant to 40 CFR § 141.205 and West Virginia Bureau for Public Health Rule 64 CSR 3, consumers serviced along Corridor G North between Trace Fork Road and Alum Creek Road in Kanawha/Lincoln Counties are hereby advised that at approximately 03:40 EDT on November 18, 2026, an unscheduled 12-inch transmission main rupture precipitated hydraulic pressure readings below the mandatory 20 psi threshold. Inadequately treated or depressurized water may contain disease-causing organisms. These organisms include bacteria, viruses, and parasites, which can cause symptoms such as nausea, cramps, diarrhea, and associated headaches. Effective immediately and continuing until bacteriological clearance sampling confirms absence of coliform contamination (estimated 17:00 EST November 20, 2026), all potable water utilized for human consumption, infant formula preparation, dentifrice hygiene, culinary washing, or ice manufacture must be brought to a vigorous rolling boil for a minimum duration of one (1) full minute prior to utilization. Potable water tanker distribution has been staged at the Alum Creek Volunteer Fire Department, 2349 Childress Rd, Alum Creek, WV 25003, from 08:00 to 20:00 daily. Direct inquiries to the 24-Hour Water Quality Hotline at 304-555-0148 or TTY 711."
```

---

## Prompt PS-3 — Public Records Redaction (`/public-records-redaction`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/public-records-redaction Demonstrate a first-pass segregability and redaction table on a sample incident intake memo containing constituent SSNs, personal cell numbers, and pre-decisional legal advice.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/public-records-redaction Prepare first-pass public records redactions on this uploaded West Virginia agency incident & grant site inspection memo before public release under the West Virginia Freedom of Information Act (W. Va. Code § 29B-1-1 et seq.):
Uploaded file: `WVDED_Site_Visit_Memo_Putnam_2026-11-04.txt`
MEMORANDUM — WEST VIRGINIA DEPARTMENT OF ECONOMIC DEVELOPMENT
Date: November 4, 2026
To: Site Readiness Review File (Putnam County Industrial Park — Lot 7)
From: J. Miller, Senior Field Engineer (Work Email: j.miller@wv.gov | Work Desk: 304-555-0110)
1. Factual Inspection Summary: On November 3, 2026, WVDED engineers inspected the 38-acre graded pad in Putnam County. Three-phase electric service and a 10-inch municipal water line are confirmed at the eastern parcel boundary.
2. Property Owner / Witness Contact Info: Adjacent landowner Sarah Jenkins (Home Address: 1842 Teays Valley Rd, Hurricane, WV 25526; Personal Cell: 304-555-0192; Personal Email: sjenkins84@example.org; SSN on W-9 easement intake form: 234-00-8891; DOB: 04/19/1984) signed the temporary right-of-entry log. Minor child present during boundary walk: Lucas Jenkins (age 9, Hurricane Elementary).
3. Vendor Financial & Proprietary Attachment: Prospective tenant Appalachian Battery Systems Inc. submitted confidential unit-cost cell chemistry yields (proprietary trade secret formula RX-9) and wire refund instructions (Routing ABA #051900395, Account #8849201143).
4. Cybersecurity Telemetry Note: Temporary SCADA water-pressure telemetry gateway on site is reachable at internal admin IP 10.44.18.92 (root credential vault ID: WV-OT-PROD-KEY-77).
5. Draft Pre-Decisional Counsel Note: Deputy General Counsel recommends holding $250,000 in contingency escrow pending updated wetland delineation.
```

---

## Prompt PS-4 — FOIA Request Processing (`/foia-request-processing`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/foia-request-processing Walk through a structured three-table first-pass FOIA officer report for a request seeking broadband grant scoring rubrics and correspondence from the last 90 days.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/foia-request-processing We are public records staff at the West Virginia Infrastructure and Jobs Development Council (IJDC). Today (November 18, 2026) we received FOIA Request #WV-IJDC-2026-118 from reporter Dana Hollis asking for:
"All emails, SharePoint engineering memos, and ServiceNow change tickets between October 1, 2026 and November 15, 2026 referencing 'Corridor H Water Extension' or Contract #IJDC-2026-44."
Here are the search results returned from the repositories currently available in this session (SharePoint & Outlook export; note that ServiceNow and text/SMS archives are NOT connected in this environment):
- Result 1 [Uploaded file: Corridor_H_Engineering_Review_Oct2026.pdf]: Dated 2026-10-19 in IJDC SharePoint (`/sites/ijdc/Shared Documents/`). Engineering review of Contract #IJDC-2026-44 ($2.4M Grant County water main extension). Contains contractor bid tables plus home phone number and SSN of sole-proprietor surveyor R. Trent on page 4.
- Result 2 [Uploaded file: Outlook_Msg_8821_Counsel_Advice.eml]: Dated 2026-11-02 from Legal Counsel to IJDC Director, Subject: "PRIVILEGED DRAFT — Legal advice on Contract #IJDC-2026-44 liquidated damages dispute."
- Result 3 [Uploaded file: Corridor_G_Paving_2025.pdf]: Dated 2025-08-11 in IJDC SharePoint. Unrelated 2025 paving summary for Corridor G (outside date range and wrong project).
Confirm the governing West Virginia law, evaluate each record (in-scope vs. out-of-scope), flag items needing redaction or privilege review, and produce the complete 3-table first-pass report—including logging the unconnected ServiceNow and SMS repositories in Gaps.
```

---

## Prompt PS-5 — RFP Vendor Evaluation (`/rfp-vendor-evaluation`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/rfp-vendor-evaluation Build a structured RFP vendor evaluation matrix template comparing 3 bidder proposals across Mandatory Pass/Fail Gates, Technical Approach, Security/Compliance, and Cost.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/rfp-vendor-evaluation Act as procurement evaluation support for the West Virginia Office of Technology on Solicitation #CRFP-OT27004 ("Cloud Contact Center Modernization"). Do NOT assign numeric scores or rank vendors—compile the page-cited Mandatory Pass/Fail Compliance Matrix, cross-document contradiction flags, and Scored Criterion Evidence table for our human evaluation committee:
GOVERNING RFP REQUIREMENTS (`CRFP-OT27004_Master.pdf`):
- Mandatory M1 (Pass/Fail): Signed West Virginia Purchasing Affidavit & Addendum Acknowledgement Form (must be attached).
- Mandatory M2 (Pass/Fail): FedRAMP Moderate (or higher) Authorization in the FedRAMP Marketplace + CONUS-only data residency.
- Mandatory M3 (External Check): Active federal SAM registration with zero federal debarment/exclusion records.
- Scored Criterion S1 (Max 40 pts): 99.99% uptime SLA with automated IVR failover under 60 seconds.
- Scored Criterion S2 (Max 30 pts): Named Project Manager with >= 5 years of state-government contact center migration experience.
SUBMITTED VENDOR PACKAGES:
1. Vendor A — BlueRidge Cloud Solutions (`BlueRidge_TechProposal.pdf`):
   - Page 2: Attaches signed WV Purchasing Affidavit & Addendum Acknowledgement.
   - Page 5: Cites FedRAMP Moderate Package ID #FR2209114; Page 6 states primary hosting is `us-east4` (Virginia), BUT Page 19 Appendix B disaster-recovery diagram lists failover storage in `northamerica-northeast1` (Montreal, Canada)!
   - Page 11: Commits to 99.99% uptime SLA and 30-second automated IVR failover.
   - Page 14: Names PM Elena Rostova (7 years leading VA and KY state contact center migrations).
2. Vendor B — Kanawha Voice Systems (`KanawhaVoice_Bid.pdf`):
   - Page 1: Cover letter states "WV Purchasing Affidavit will be provided upon contract award" (NOT attached in bid package).
   - Page 4: FedRAMP High authorized (`us-east4` and `us-central1` CONUS-only).
   - Page 8: Executive summary claims "99.99% uptime," while Page 22 Standard SLA Terms limit guaranteed uptime to "99.5% excluding scheduled maintenance."
   - Page 12: Names PM Derek Hall (3 years commercial retail call center experience; 0 state-government projects listed).
```

---

## Prompt PS-6 — Expense Auditor (`/expense-auditor`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/expense-auditor Audit a sample 5-line federal grant expenditure voucher against 2 CFR Part 200 Uniform Guidance—flagging unallowable entertainment/refreshment costs, missing itemized receipts, and undocumented T&M hours.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/expense-auditor Audit this quarterly subrecipient grant expenditure ledger for West Virginia Rural Broadband Training Subgrant #WV-BB-2026-09 against 2 CFR Part 200 (Uniform Guidance) and our Grant Award Terms, calculate total Allowable vs. Questioned Costs, and produce the 3-part Audit Dossier:
GRANT AWARD TERMS:
- Period of Performance: July 1, 2026 – June 30, 2027
- Approved Budget Cap: $120,000 | Prior-Approval Equipment Threshold: $5,000 per unit (no capital equipment pre-approved in award)
- Travel Rule: Standard GSA FY2026 WV lodging cap ($110/night Charleston, WV) & M&IE ($68/day); zero alcohol or entertainment allowable.
SUBMITTED Q1 LEDGER (`Subrecipient_Q1_Ledger.csv`):
| Line | Invoice Date | Service Date | Vendor / Payee | Description | Amount | Receipt Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 101 | 2026-08-14 | 2026-08-10 | Mountain State Fiber Lab | Fiber-splicing instructor fee (40 hrs @ $85/hr) | $3,400.00 | Signed invoice + timesheet attached |
| 102 | 2026-08-19 | 2026-06-18 | Tri-State Print Shop | Training manuals printed 12 days BEFORE grant start date | $1,250.00 | Paid receipt attached |
| 103 | 2026-09-05 | 2026-09-03 | Capitol Steak & Spirits | Advisory dinner ($410 food + $165 wine/cocktails) & live music ($150) | $725.00 | Itemized restaurant tab |
| 104 | 2026-09-12 | 2026-09-10 | OpticalTest Gear Inc. | 1x OTDR Rugged Spectrum Analyzer unit (no grantor prior approval on file) | $8,900.00 | Vendor invoice #9941 |
| 105 | 2026-09-22 | 2026-09-19 | Marriott Charleston | 2 nights hotel for trainer @ $185/night ($370 total vs. $110/night cap) | $370.00 | Hotel folio attached |
| 106 | 2026-09-28 | 2026-08-10 | Mountain State Fiber Lab | Duplicate submission of Invoice #101 (40 hrs @ $85/hr) | $3,400.00 | Copy of Line 101 invoice |
```

---

## Prompt PS-7 — Policy and Statute Assistant (`/policy-and-statute-assistant`)

### Option A — 1-Click Starter (In `WV Antigravity → Skills` — No Copy-Paste)

```markdown
/policy-and-statute-assistant Explain the authority hierarchy and pinpoint 2 CFR Part 200 citations governing emergency noncompetitive procurement vs. competitive sealed bids.
```

### Option B — Full West Virginia Scenario (Optional Copy-Paste)

```markdown
/policy-and-statute-assistant A West Virginia Department of Human Services policy analyst needs the controlling federal-versus-state regulatory hierarchy (as of November 2026) on two SNAP eligibility questions:
1. Under federal SNAP regulations (7 CFR § 273.9), how are non-recurring lump-sum payments (such as a one-time insurance settlement or tax refund) treated—as countable monthly income in the month received, or as a resource?
2. Under 7 CFR § 273.12(a), what is the federal baseline reporting threshold that triggers a simplified-reporting household's duty to report a mid-certification increase in gross monthly income (130% of the Federal Poverty Level), and where may a state agency's administrative manual set state-specific verification procedures without overriding the federal gross-income threshold?
Follow your strict retrieval hierarchy (use official `.gov` fallback sources if no Federal Regulatory MCP connector is attached in this session, and emit your standard `[⚠️ RETRIEVAL TIMEOUT]` + Policy Clarification Request for any citation whose live official text cannot be retrieved).
```
