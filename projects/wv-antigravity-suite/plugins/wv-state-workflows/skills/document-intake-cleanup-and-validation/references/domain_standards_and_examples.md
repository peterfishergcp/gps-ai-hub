# Domain Standards, Golden Examples & Machine-Readable Schemas

This reference accompanies `SKILL.md` and provides the complete statutory
verification standards, golden evaluation examples, and JSON output schema for
`document-intake-cleanup-and-validation`.

--------------------------------------------------------------------------------

## 1. Document Class Verification Standards & Statutory Rules

Document Class                                        | Governing Regulation / Standard                                                  | Mandatory Fields Required                                                                                                                                                                                                     | Mathematical / Continuity Verification Rule                                                                                                                                                                                                                          | Common Blocker Defects
:---------------------------------------------------- | :------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------
**Paystubs / Earnings Statements**                    | 7 CFR § 273.2(f)(1)(i) (SNAP); 42 CFR § 435.948 (Medicaid MAGI)                  | Employee Name, Employer Name/EIN, Pay Period Start/End, Pay Date, Hours, Hourly Rate, Current Gross, YTD Gross, Itemized Deductions, Net Pay                                                                                  | 1. `Hours * Rate = Base Gross`<br>2. `Current Gross - Sum(Deductions) = Net Pay`<br>3. `YTD Gross_t - YTD Gross_{t-1} = Current Gross_t`<br>4. Single-stub `YTD Gross` vs. `Elapsed Periods * Base Gross` (flag positive variance as `MAJOR`; recommend `Form EV-1`) | Pay date outside lookback window (default 30 days); cropped employer header; unexplained YTD jump indicating omitted overtime/bonus stubs.
**IRS Forms W-2, 1099-NEC/MISC, 1099-G & Schedule C** | 26 U.S.C. § 6103 (Tax Return Verification); 42 CFR § 435.948; 7 CFR § 273.11(a)  | Tax Year, Employer/Payer EIN/TIN, Employee/Recipient SSN/TIN, Pre-Withholding Gross (`Box 1`), Federal/State Tax Withheld (`Box 2/4/6/11`), FICA/Medicare (`W-2 Boxes 3-6`), or `Schedule C Pages 1 & 2` + signed `Form 1040` | 1. Annualize **Gross `Box 1`** (`Box 1 / 12`), never net post-withholding<br>2. `W-2 Box 4 ~= 6.2% * Box 3` & `Box 6 ~= 1.45% * Box 5`, and `Box 3/5` reconcile with `Box 1` (unless explained by `Box 12` codes)                                                    | Altered/irreconcilable `W-2 Box 1/3/4/5/6` FICA math (`REJECTED`, cross-check state UI wages); incomplete `Schedule C` (`Page 1` only omitting `Page 2` Part II expenses and signed `Form 1040` -> `INCOMPLETE`).
**Monthly Bank / Credit Union Statements**            | 7 CFR § 273.8 (Resource Eligibility Standards); State Medicaid Asset Rules       | Institution Name, Account Holder Name, Account Number, Statement Period (within 30/60-day lookback), Opening Balance, Total Credits, Total Debits, Ending Balance, Itemized Transaction Ledger                                | 1. `Opening Balance + Total Credits - Total Debits = Ending Balance` (and matches itemized ledger rows)<br>2. Page `N` ending balance must equal Page `N+1` starting balance                                                                                         | Omitted intermediate pages (`Page 2 of 3` missing -> `INCOMPLETE`); **stale statement** outside 30/60-day lookback (`REJECTED`); **broken balance footing** (`Opening + Credits - Debits != Ending` -> `REJECTED`); **cropped mobile app balance widget** lacking bank/holder/dates/ledger (`REJECTED`).
**Residential Lease Agreements**                      | 7 CFR § 273.9(d)(6)(ii) (Excess Shelter Deduction); HUD Housing Verification     | Tenant Name(s), Landlord / Property Manager Name & Contact, Premise Street Address, Lease Term Start/End Dates, Monthly Rent Amount, Signatures                                                                               | Verify current date falls within active lease term or valid holdover month-to-month clause; verify stated rent matches sum of `base rent + mandatory fees`                                                                                                           | Missing Landlord/Obligor signature (unexecuted draft lease); expired lease term without renewal addendum.
**Utility Bills (Electric, Gas, Water)**              | 7 CFR § 273.9(d)(6)(iii) (Standard Utility Allowance / Residency Proof)          | Utility Provider, Customer Name, **Service Address** (distinct from Mailing/Billing Address), Statement Date, Previous Balance, Current Charges, Total Due                                                                    | `Previous Balance - Payments + Current Charges = Total Amount Due`                                                                                                                                                                                                   | Submitting a disconnect notice or remittance coupon that shows only a P.O. Box mailing address rather than the physical **Service Address**.
**Foreign & Domestic Birth Certificates**             | 8 CFR § 103.2(b)(3) (Foreign Document Translation); State Vital Statistics Rules | Child Full Legal Name, Date of Birth, Place of Birth, Parent Full Name(s), Official State File / Certificate Number, Civil Registry Seal / Registrar Signature                                                                | Cross-verify numeric date tokens in `DD/MM/YYYY` jurisdictions against spelled-out textual margin clauses                                                                                                                                                            | Submitting a non-governmental commemorative or hospital souvenir record lacking an official state file number and registrar seal (`INCOMPLETE`); ambiguous foreign date format or missing translation check (`[VERIFY]`).
**Military Discharge Form DD-214**                    | DoD Instruction 1336.01; 38 U.S.C. § 101(2) (Veteran Status)                     | Block 1 (Name), Block 12a-c (Active Duty Dates & Net Service), Copy Designation (bottom margin), Block 24 (Character of Service), Block 28 (Narrative Reason)                                                                 | `Block 12b (Separation Date) - Block 12a (Entry Date) = Block 12c (Net Active Service)`                                                                                                                                                                              | Submitting **Member-1 (Short Form)** copy, which omits Block 24 (Character of Service) and Block 28 required to verify Honorable / Under Honorable discharge.
**Public Assistance / Benefits Applications**         | 7 CFR § 273.2 & § 273.3; 45 CFR § 206.10 (TANF); 42 CFR § 435.907 (Medicaid)     | Applicant Full Name, DOB, Valid 9-Digit SSN, Physical Home Address, Household Member Demographics, Filled/Checked Fields & Blank Mandatory Fields, Matching Applicant Signature & Date                                        | 1. Sum itemized shelter/utility declarations & verify periodic vs. annual wage math<br>2. Verify state form jurisdiction matches physical street address state                                                                                                       | Out-of-state home address; invalid/incomplete SSN; signatory mismatch against primary applicant without Authorized Rep designation; missing pages or incomplete household member disclosures.
**Regulatory & Administrative Case Records**          | INA § 212 / § 237; 8 CFR § 287.6 (Regulatory Case Record Integrity)              | Subject Full Name, DOB, Country of Citizenship, Date/Location of Action, Entry/Case Status, Employer/Income Block, Investigating Officer Signature                                                                            | Cross-verify status, dates/locations, and employer/periodic wage figures across multi-page or paired filings                                                                                                                                                         | Unexecuted officer signature; attached blank trailing continuation sheets; conflicting employment or status narratives across pages.

--------------------------------------------------------------------------------

## 2. Prospective Monthly Income Conversion Multipliers

When converting verified earned income from paystubs into a standardized monthly
gross figure for downstream eligibility rules engines:

| Pay Frequency    | Pay Periods Per | Standard           | Calculation        |
:                  : Year            : Conversion         : Formula            :
:                  :                 : Multiplier         :                    :
| :--------------- | :-------------: | :----------------: | :----------------- |
| **Weekly**       | 52              | `4.3333` (or `52 / | `Average Weekly    |
:                  :                 : 12`)               : Gross * 4.3333`    :
| **Bi-Weekly**    | 26              | `2.1667` (or `26 / | `Average Bi-Weekly |
: (Every 2 Weeks)  :                 : 12`)               : Gross * 2.1667`    :
| **Semi-Monthly** | 24              | `2.0000`           | `Average           |
: (Twice a Month,  :                 :                    : Semi-Monthly       :
: e.g., 1st &      :                 :                    : Gross * 2.0000`    :
: 15th)            :                 :                    :                    :
| **Monthly**      | 12              | `1.0000`           | `Verified Monthly  |
:                  :                 :                    : Gross * 1.0000`    :

> **Note**: Always verify whether the customer agency's state policy manual
> mandates `4.3333` / `2.1667` (standard USDA SNAP formula) or truncated
> multipliers (`4.3` / `2.15`), following the 3-Tier Statutory Policy Hierarchy
> (`Federal Baseline -> State Policy Manual -> Program/Form Rules`).

--------------------------------------------------------------------------------

## 3. Illustrative Verification Patterns & Output Templates

### Pattern 1: Consecutive Paystubs - Connected System Intake & Monthly Income Calculation

-   **Scenario**: Applicant submits consecutive bi-weekly paystubs within the
    30-day lookback window with intact boundaries and `>= 95%` per-field
    confidence.
-   **Expected Output Header**: `#### Intake Verification Summary: Earned Income
    Packet (Case #<case_id>)`
-   **Key Verification Steps**:
    -   **Verification Status**: `ACCEPTED - READY FOR RULES INGESTION`
        (Per-Field Confidence: All extracted fields `>= 95%`)
    -   **Arithmetic Audit**: Verify horizontal paystub math (`Regular Hours *
        Hourly Rate = Current Base Gross Pay`; `Current Gross - Deductions = Net
        Pay`) and consecutive `YTD Gross` progression (`YTD_t - YTD_{t-1} =
        Current Gross_t`) with `Variance = $0.00`.
    -   **Projected Monthly Gross Earned Income**: Multiply verified average
        per-period gross income by the standard frequency multiplier (e.g.,
        `Bi-Weekly Gross * 2.1667` or `Weekly Gross * 4.3333`).

### Pattern 2: Blurry / Cropped Capture - Gate A Recapture Blocker & Provisional Extraction

-   **Scenario**: Mobile camera upload exhibits severe motion blur (`Laplacian <
    120.0`), perspective skew (`> 5.0°`), or cropped document corners (`< 4 of 4
    corners visible`) cutting off critical date or dollar columns.
-   **Expected Output Header**: `#### Intake Verification Summary: <Document
    Class> (<filename>)`
-   **Key Verification Steps**:
    -   **Verification Status**: `REJECTED - RECAPTURE REQUIRED` (Per-Field
        Confidence `< 95%` on blurred or cropped fields - **"Human review
        required"**)
    -   **Tier 2 Provisional Extraction**: Preserve any intact, high-confidence
        (`>= 95%`) fields accompanied by the **Provisional Extraction Notice**,
        never guess blurred or cut-off digits, and halt downstream income
        projections if required calculation inputs are affected.
    -   **Plain-Language Citizen Notice (7th-Grade Reading Level)**: Clear,
        numbered instructions explaining how to retake the photo flat on a
        well-lit surface with all four corners and all columns inside the frame.

### Pattern 3: Detached / Unclassified Document Fragment - Safe-Halt & Reduced Extraction Mode

-   **Scenario**: Submission is a torn or detached document fragment (such as a
    bottom remittance slip) that is optically sharp in its surviving area but
    sheared along a tear or perforation line and missing upper header fields
    (applicant name, issuer name, period dates, frequency, or gross pay) or
    table column headers.
-   **Expected Output Header**: `#### Intake Verification Summary: Unclassified
    Detached Document Snippet`
-   **Key Verification Steps**:
    -   **Verification Status**: `INCOMPLETE - MISSING MANDATORY STATUTORY
        FIELDS`
    -   **Safe-Halt & Reduced Extraction Mode**: Immediately output the
        **`[!WARNING] INCOMPLETE DOCUMENT - FINANCIAL ANALYSIS & INCOME
        PROJECTION HALTED`** banner. Do **not** back-calculate Gross Pay from
        Net Pay + Deductions, and do **not** output `Gross Income Calculation`
        or `Projected Monthly Gross Income` tables. Suppress row-by-row
        extraction for any table section missing its column headers or cut by a
        tear line (`[Extraction Suppressed - Torn/missing headers]`, `< 95%`
        confidence - **"Human review required"** followed strictly by a
        qualitative description of the defect, with **no quantitative numbers or
        line-item amounts** in the notes), and display only 100% intact
        self-labeled anchor fields alongside the list of missing mandatory
        fields.

### Pattern 4: Paystub with Year-to-Date (YTD) Mathematical Disparity

-   **Scenario**: Current-period paystub math reconciles (`Hours * Rate =
    Current Gross`), but stated `YTD Gross` exceeds `Elapsed Pay Periods *
    Current Base Gross`.
-   **Key Verification Steps**:
    -   **Verification Status**: `ACCEPTED WITH EXCEPTIONS (Caseworker Review
        Flag)`
    -   **Discrepancy**: Flag the positive YTD variance as a `MAJOR` review item
        indicating prior overtime, shift differentials, or bonuses not shown on
        the current stub, and recommend requesting prior paystubs or an Employer
        Verification Form (`EV-1`).

### Pattern 5: Multi-Page Statement, Agreement, or Application with Structural Blockers

-   **Scenario**: Multi-page statement, tax schedule, residential lease,
    military discharge record, public assistance application, or regulatory
    packet has missing intermediate pages, unexecuted signatures/initials,
    incorrect copy designation, residency jurisdiction mismatch, or internal
    cross-page contradictions.
-   **Key Verification Steps**:
    -   **Verification Status**: `INCOMPLETE - ADDITIONAL DOCUMENTS / SIGNATURES
        REQUIRED`
    -   **Structural & Continuity Audit**: Preserve intact extracted fields with
        per-field confidence scores (`0-100%`), compute any multi-page balance
        or annual wage discrepancy, flag all `BLOCKER` defects (`"Human review
        required"` on fields `< 95%` confidence), and provide a plain-language
        remediation notice listing the exact missing pages, signatures, or
        official copy variants required.

--------------------------------------------------------------------------------

## 4. Machine-Readable Output Contract (JSON Schema)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DocumentIntakeValidationRecord",
  "type": "object",
  "required": [
    "intake_request_id",
    "packet_verdict",
    "evaluated_documents",
    "standardized_income_summary"
  ],
  "properties": {
    "intake_request_id": { "type": "string" },
    "case_id": {
      "type": ["string", "null"],
      "description": "Optional external case management identifier. Present only when pushing into a connected agency system; null for standalone ad-hoc intake."
    },
    "packet_verdict": {
      "type": "string",
      "enum": [
        "ACCEPTED_READY_FOR_RULES_INGESTION",
        "ACCEPTED_WITH_EXCEPTIONS",
        "INCOMPLETE_ADDITIONAL_DOCUMENTS_REQUIRED",
        "REJECTED_RECAPTURE_REQUIRED"
      ]
    },
    "evaluated_documents": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "document_id",
          "classified_type",
          "type_confidence",
          "quality_metrics",
          "findings",
          "extracted_fields"
        ],
        "properties": {
          "document_id": { "type": "string" },
          "classified_type": { "type": "string" },
          "type_confidence": { "type": "number" },
          "quality_metrics": {
            "type": "object",
            "properties": {
              "blur_score": { "type": "number" },
              "skew_angle_degrees": { "type": "number" },
              "effective_dpi": { "type": "integer" },
              "corners_visible": { "type": "integer" },
              "pages_detected": { "type": "integer" },
              "pages_expected": { "type": "integer" }
            }
          },
          "findings": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["severity", "code", "description", "remediation_notice_plain_language"],
              "properties": {
                "severity": { "type": "string", "enum": ["BLOCKER", "MAJOR", "MINOR", "PASS"] },
                "code": { "type": "string" },
                "description": { "type": "string" },
                "remediation_notice_plain_language": { "type": "string" }
              }
            }
          },
          "extracted_fields": {
            "type": "object",
            "description": "Per-field extraction records with individual confidence scores (0.0-1.0). Any field with confidence < 0.95 (95%) must set human_review_required to true and status_note to 'Human review required'.",
            "additionalProperties": {
              "type": "object",
              "required": ["value", "confidence", "human_review_required"],
              "properties": {
                "value": { "type": ["string", "number", "boolean", "null"] },
                "confidence": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
                "human_review_required": { "type": "boolean" },
                "status_note": { "type": ["string", "null"] }
              }
            }
          }
        }
      }
    },
    "standardized_income_summary": {
      "type": ["object", "null"],
      "properties": {
        "employer_name": { "type": "string" },
        "pay_frequency": { "type": "string", "enum": ["WEEKLY", "BI_WEEKLY", "SEMI_MONTHLY", "MONTHLY"] },
        "average_gross_per_period": { "type": "number" },
        "conversion_multiplier": { "type": "number" },
        "projected_monthly_gross_income": { "type": "number" },
        "ytd_reconciled": { "type": "boolean" }
      }
    }
  }
}
```
