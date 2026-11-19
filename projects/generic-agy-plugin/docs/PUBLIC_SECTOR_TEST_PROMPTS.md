# Government Services Prompts — 7 Role-Based Workflows (`v1.0.1`)

These 7 tests are built for common government tasks: checking applicant documents, rewriting public notices in plain language, redacting records, reviewing vendor bids, auditing expenses, and answering policy questions. Pick the ones that match your work.

> [!NOTE]
> **Heads up: some tests may show a warning, and that's OK.**
>
> All 7 tests below work right out of the box using the sample information included inside each prompt.
>
> A few tests (`PS-4`, `PS-5`, `PS-6`, and `PS-7`) also check whether optional government databases or official `.gov` websites are reachable online. If an external system isn't connected on your computer, Antigravity will display a clear warning banner or mark that check `Cannot Verify` instead of guessing. **That warning means the safety check is working—please don't report it as a bug.** *(IT teams can view the full connector matrix in [`IT_AND_TECHNICAL_APPENDIX.md`](./IT_AND_TECHNICAL_APPENDIX.md).)*

---

## Prompt PS-1 — Check Applicant Documents & Calculate Monthly Income

- **What you'll try:** Screen two sample bi-weekly paystubs and an incomplete residential lease for a county utility-assistance applicant, and calculate monthly gross income.
- **What success looks like:** Antigravity verifies the paystub math and year-to-date totals, calculates prospective monthly gross income from the two complete paystubs, and flags the missing signature page (`Page 3 of 3`) and blurry utility addendum on the lease for caseworker follow-up.
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

```text
/document-intake-cleanup-and-validation Act as an intake validation assistant for a county constituent benefits & emergency utility assistance portal. Validate these 3 uploaded/OCR'd proof documents submitted by applicant "Marcus Vance (Riverbend County)" and calculate prospective monthly gross income:

1. Uploaded File: `Vance_Paystub_1_Oct2026.pdf` (Bi-weekly pay period: 10/01/2026 – 10/14/2026; Employer: Regional Logistics LLC, Metro City; Regular Hours: 80.0 @ $21.50/hr = $1,720.00; Overtime: 4.0 hrs @ $32.25/hr = $129.00; Gross Pay: $1,849.00; YTD Gross: $38,829.00; Optical quality: Clear, all corners visible).
2. Uploaded File: `Vance_Paystub_2_Oct2026.pdf` (Bi-weekly pay period: 10/15/2026 – 10/28/2026; Employer: Regional Logistics LLC; Regular Hours: 80.0 @ $21.50/hr = $1,720.00; Overtime: 0.0 hrs; Gross Pay: $1,720.00; YTD Gross: $40,549.00; Optical quality: Clear).
3. Uploaded File: `Vance_Residential_Lease_2026.pdf` (Property: 412 Riverfront Rd, Apt B, Metro City, ST 12345; Monthly Rent: $975.00; Term: 07/01/2026 – 06/30/2027; Page 1 of 3 and Page 2 of 3 present — Page 3 of 3 signature block is MISSING; Utility addendum blurred/illegible at bottom margin).

Check math continuity across YTD totals, compute prospective monthly gross income using standard bi-weekly conversion rules, flag all document/signature defects, and format the structured intake validation summary for the caseworker.
```

---

## Prompt PS-2 — Rewrite a Dense Public Notice in Plain Language

- **What you'll try:** Turn a dense, technical boil-water utility notice into clear, everyday language for residents without losing any required details.
- **What success looks like:** A shorter notice a resident could easily understand, with every date, street boundary, address, phone number (`800-555-0148` / `TTY 711`), and required health paragraph preserved intact. *Please check: did it change or drop any facts?*
- **About how long:** 1–2 minutes.

### Copy & Paste Into Antigravity

```text
/plain-language-notice-generator Rewrite this dense municipal water utility notice into clear, accessible plain language for affected residents, preserving every single street boundary, date, time, contact number, and 40 CFR 141.205 health block requirement without inventing any facts:

"PUBLIC NOTIFICATION OF DISTRIBUTION SYSTEM DEPRESSURIZATION AND PRECAUTIONARY BOIL WATER ADVISORY (PWSID #US3302011): Pursuant to 40 CFR § 141.205 and State Drinking Water Rule Title 64, consumers serviced along North Highway 12 between Cedar Creek Road and Meadow Fork Road in Riverbend/Oakridge Counties are hereby advised that at approximately 03:40 EST on November 18, 2026, an unscheduled 12-inch transmission main rupture precipitated hydraulic pressure readings below the mandatory 20 psi threshold. Inadequately treated or depressurized water may contain disease-causing organisms. These organisms include bacteria, viruses, and parasites, which can cause symptoms such as nausea, cramps, diarrhea, and associated headaches. Effective immediately and continuing until bacteriological clearance sampling confirms absence of coliform contamination (estimated 17:00 EST November 20, 2026), all potable water utilized for human consumption, infant formula preparation, dentifrice hygiene, culinary washing, or ice manufacture must be brought to a vigorous rolling boil for a minimum duration of one (1) full minute prior to utilization. Potable water tanker distribution has been staged at the Meadow Fork Community Fire Station, 2349 Mill Creek Rd, Meadow Fork, ST 12346, from 08:00 to 20:00 daily. Direct inquiries to the 24-Hour Water Quality Hotline at 800-555-0148 or TTY 711."
```

---

## Prompt PS-3 — Draft First-Pass Redactions on a Public Record

- **What you'll try:** Prepare first-pass public records redactions on a sample site-inspection memo containing personal information, a minor child's name, vendor banking/trade secrets, internal network credentials, and draft legal advice.
- **What success looks like:** A clearly labeled draft for officer review that leaves the public engineer's inspection summary open while redacting or flagging every private address, SSN, child's name, bank account, trade secret, internal IP/password, and attorney note—with plain-English reasons and statutory citations.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
/public-records-redaction Prepare first-pass public records redactions on this uploaded agency incident & grant site inspection memo before public release under Federal FOIA (5 U.S.C. § 552) and applicable State Public Records law:

Uploaded file: `EDFA_Site_Visit_Memo_Brookside_2026-11-04.txt`
---
MEMORANDUM — DEPARTMENT OF ECONOMIC DEVELOPMENT
Date: November 4, 2026
To: Site Readiness Review File (Brookside County Industrial Park — Lot 7)
From: J. Miller, Senior Field Engineer (Work Email: j.miller@agency.gov | Work Desk: 800-555-0110)

1. Factual Inspection Summary: On November 3, 2026, agency engineers inspected the 38-acre graded pad in Brookside County. Three-phase electric service and a 10-inch municipal water line are confirmed at the eastern parcel boundary.
2. Property Owner / Witness Contact Info: Adjacent landowner Sarah Jenkins (Home Address: 1842 Meadow Valley Rd, Brookside, ST 12348; Personal Cell: 800-555-0192; Personal Email: sjenkins84@example.org; SSN on W-9 easement intake form: 234-00-8891; DOB: 04/19/1984) signed the temporary right-of-entry log. Minor child present during boundary walk: Lucas Jenkins (age 9, Brookside Elementary).
3. Vendor Financial & Proprietary Attachment: Prospective tenant Summit Battery Systems Inc. submitted confidential unit-cost cell chemistry yields (proprietary trade secret formula RX-9) and wire refund instructions (Routing ABA #051900395, Account #8849201143).
4. Cybersecurity Telemetry Note: Temporary SCADA water-pressure telemetry gateway on site is reachable at internal admin IP 10.44.18.92 (root credential vault ID: OPS-PROD-KEY-77).
5. Draft Pre-Decisional Counsel Note: Deputy General Counsel recommends holding $250,000 in contingency escrow pending updated wetland delineation.
---
```

---

## Prompt PS-4 — Triage Records Search Hits & Log Missing Systems

- **What you'll try:** Review 3 sample SharePoint and email search results against a reporter's public records request when two other systems (`ServiceNow` and `SMS` text archives) aren't connected yet.
- **What success looks like:** A 3-table officer report that matches the two October/November 2026 records (flagging one for SSN redaction and one for legal privilege review), excludes the unrelated 2025 paving file, and **explicitly lists `ServiceNow` and `SMS` under `Gaps`** so nothing is overlooked.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
/foia-request-processing We are public records staff at the Infrastructure Site Readiness Grant Council (ISRG). Today (November 18, 2026) we received FOIA Request #ISRG-2026-118 from reporter Dana Hollis asking for:
"All emails, SharePoint engineering memos, and ServiceNow change tickets between October 1, 2026 and November 15, 2026 referencing 'North Corridor Water Extension' or Contract #ISRG-2026-44."

Here are the search results returned from the repositories currently available in this session (SharePoint & Outlook export; note that ServiceNow and text/SMS archives are NOT connected in this environment):
- Result 1 [Uploaded file: North_Corridor_Engineering_Review_Oct2026.pdf]: Dated 2026-10-19 in ISRG SharePoint (`/sites/isrg/Shared Documents/`). Engineering review of Contract #ISRG-2026-44 ($2.4M Pinecrest County water main extension). Contains contractor bid tables plus home phone number and SSN of sole-proprietor surveyor R. Trent on page 4.
- Result 2 [Uploaded file: Outlook_Msg_8821_Counsel_Advice.eml]: Dated 2026-11-02 from Legal Counsel to ISRG Director, Subject: "PRIVILEGED DRAFT — Legal advice on Contract #ISRG-2026-44 liquidated damages dispute."
- Result 3 [Uploaded file: South_Bypass_Paving_2025.pdf]: Dated 2025-08-11 in ISRG SharePoint. Unrelated 2025 paving summary for South Bypass (outside date range and wrong project).

Confirm the governing public records law, evaluate each record (in-scope vs. out-of-scope), flag items needing redaction or privilege review, and produce the complete 3-table first-pass report—including logging the unconnected ServiceNow and SMS repositories in Gaps.
```

---

## Prompt PS-5 — Compare Vendor RFP Bids & Catch Contradictions

- **What you'll try:** Screen two sample vendor proposals against mandatory Pass/Fail rules and technical requirements without letting the AI score or pick a winner.
- **What success looks like:** A page-cited compliance table that catches Vendor A's non-US backup site in Montréal, Canada (`Page 19` vs. `Page 6`), catches Vendor B's missing Purchasing Affidavit and conflicting `99.99%` vs. `99.5%` uptime terms, leaves scoring to human evaluators, and marks external federal debarment checks `Cannot Verify`.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
/rfp-vendor-evaluation Act as procurement evaluation support for the Agency Office of Technology on Solicitation #CRFP-IT27004 ("Cloud Contact Center Modernization"). Do NOT assign numeric scores or rank vendors—compile the page-cited Mandatory Pass/Fail Compliance Matrix, cross-document contradiction flags, and Scored Criterion Evidence table for our human evaluation committee:

GOVERNING RFP REQUIREMENTS (`CRFP-IT27004_Master.pdf`):
- Mandatory M1 (Pass/Fail): Signed Government Purchasing Affidavit & Addendum Acknowledgement Form (must be attached).
- Mandatory M2 (Pass/Fail): FedRAMP Moderate (or higher) Authorization in the FedRAMP Marketplace + CONUS-only data residency.
- Mandatory M3 (External Check): Active federal SAM registration with zero federal debarment/exclusion records.
- Scored Criterion S1 (Max 40 pts): 99.99% uptime SLA with automated IVR failover under 60 seconds.
- Scored Criterion S2 (Max 30 pts): Named Project Manager with >= 5 years of public-sector contact center migration experience.

SUBMITTED VENDOR PACKAGES:
1. Vendor A — Crestline Cloud Solutions (`Crestline_TechProposal.pdf`):
   - Page 2: Attaches signed Purchasing Affidavit & Addendum Acknowledgement.
   - Page 5: Cites FedRAMP Moderate Package ID #FR2209114; Page 6 states primary hosting is `us-east4` (Virginia), BUT Page 19 Appendix B disaster-recovery diagram lists failover storage in `northamerica-northeast1` (Montréal, Canada)!
   - Page 11: Commits to 99.99% uptime SLA and 30-second automated IVR failover.
   - Page 14: Names PM Elena Rostova (7 years leading public-sector state contact center migrations).
2. Vendor B — Riverbend Voice Systems (`RiverbendVoice_Bid.pdf`):
   - Page 1: Cover letter states "Purchasing Affidavit will be provided upon contract award" (NOT attached in bid package).
   - Page 4: FedRAMP High authorized (`us-east4` and `us-central1` CONUS-only).
   - Page 8: Executive summary claims "99.99% uptime," while Page 22 Standard SLA Terms limit guaranteed uptime to "99.5% excluding scheduled maintenance."
   - Page 12: Names PM Derek Hall (3 years commercial retail call center experience; 0 public-sector projects listed).
```

---

## Prompt PS-6 — Audit a Grant Expense Ledger (`2 CFR Part 200`)

- **What you'll try:** Audit a 6-line quarterly grant expense ledger totaling `$18,045.00` against federal grant rules and award caps.
- **What success looks like:** An itemized audit report that approves valid instructor hours (`$3,400`) and capped lodging (`$220`), and flags every unallowable or questioned charge: pre-award printing (`$1,250`), alcohol and live music (`$315`) + unsubstantiated dinner (`$410`), unapproved `$8,900` equipment, `$150` hotel overage, and a `$3,400` duplicate invoice.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
/expense-auditor Audit this quarterly subrecipient grant expenditure ledger for Rural Broadband Training Subgrant #GPS-BB-2026-09 against 2 CFR Part 200 (Uniform Guidance) and our Grant Award Terms, calculate total Allowable vs. Questioned Costs, and produce the 3-part Audit Dossier:

GRANT AWARD TERMS:
- Period of Performance: July 1, 2026 – June 30, 2027
- Approved Budget Cap: $120,000 | Prior-Approval Equipment Threshold: $5,000 per unit (no capital equipment pre-approved in award)
- Travel Rule: Standard GSA FY2026 standard CONUS lodging cap ($110/night) & M&IE ($68/day); zero alcohol or entertainment allowable.

SUBMITTED Q1 LEDGER (`Subrecipient_Q1_Ledger.csv`):
| Line | Invoice Date | Service Date | Vendor / Payee | Description | Amount | Receipt Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 101 | 2026-08-14 | 2026-08-10 | Regional Fiber Lab | Fiber-splicing instructor fee (40 hrs @ $85/hr) | $3,400.00 | Signed invoice + timesheet attached |
| 102 | 2026-08-19 | 2026-06-18 | Tri-County Print Shop | Training manuals printed 12 days BEFORE grant start date | $1,250.00 | Paid receipt attached |
| 103 | 2026-09-05 | 2026-09-03 | Capitol Steak & Spirits | Advisory dinner ($410 food + $165 wine/cocktails) & live music ($150) | $725.00 | Itemized restaurant tab |
| 104 | 2026-09-12 | 2026-09-10 | OpticalTest Gear Inc. | 1x OTDR Rugged Spectrum Analyzer unit (no grantor prior approval on file) | $8,900.00 | Vendor invoice #9941 |
| 105 | 2026-09-22 | 2026-09-19 | Marriott Metro Center | 2 nights hotel for trainer @ $185/night ($370 total vs. $110/night cap) | $370.00 | Hotel folio attached |
| 106 | 2026-09-28 | 2026-08-10 | Regional Fiber Lab | Duplicate submission of Invoice #101 (40 hrs @ $85/hr) | $3,400.00 | Copy of Line 101 invoice |
```

---

## Prompt PS-7 — Research Federal vs. State SNAP Policy Rules

- **What you'll try:** Ask a policy research question comparing federal SNAP regulations (`7 CFR`) with state administrative manual procedures on lump-sum payments and income reporting thresholds.
- **What success looks like:** When `.gov` websites are reachable, Antigravity cites the exact federal rules (one-time lump sums count as resources rather than monthly income; 130% FPL reporting baseline cannot be overridden by a state manual). If `.gov` websites are blocked on your network, it displays a `[⚠️ RETRIEVAL TIMEOUT]` warning and drafts a Policy Clarification Request instead of guessing from memory.
- **About how long:** 2–3 minutes.

### Copy & Paste Into Antigravity

```text
/policy-and-statute-assistant A Department of Human Services policy analyst needs the controlling federal-versus-state regulatory hierarchy (as of November 2026) on two SNAP eligibility questions:

1. Under federal SNAP regulations (7 CFR § 273.9), how are non-recurring lump-sum payments (such as a one-time insurance settlement or tax refund) treated—as countable monthly income in the month received, or as a resource?
2. Under 7 CFR § 273.12(a), what is the federal baseline reporting threshold that triggers a simplified-reporting household's duty to report a mid-certification increase in gross monthly income (130% of the Federal Poverty Level), and where may a state agency's administrative manual set state-specific verification procedures without overriding the federal gross-income threshold?

Follow your strict retrieval hierarchy (use official `.gov` fallback sources if no Federal Regulatory MCP connector is attached in this session, and emit your standard `[⚠️ RETRIEVAL TIMEOUT]` + Policy Clarification Request for any citation whose live official text cannot be retrieved).
```

---

## Send Your Feedback

After trying the prompts that match your role, please submit your feedback (`[Feedback Form Link]`) *(Questions? Contact `[Name / Email / Chat Space]` · Target completion date: `[Testing Target Date]` · IT details: [`IT_AND_TECHNICAL_APPENDIX.md`](./IT_AND_TECHNICAL_APPENDIX.md))*.
