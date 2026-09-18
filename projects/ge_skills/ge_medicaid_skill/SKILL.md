---
name: medicaid-fraud-auditor
description: >
  Audit Medicaid application records and batches for fraud, waste, and abuse.
  Use when analyzing Medicaid enrollment data in BigQuery (ai-hub-459714.frauddector),
  detecting credential recycling, address clustering, identity mismatches,
  sequential logon/creation activity, or pregnant member duplicate anomalies,
  verifying cross-case collision counts, filtering single-household false positives,
  and preparing redacted compliance audit reports.
---

# Medicaid Fraud Auditor (`medicaid-fraud-auditor`)

A specialized audit framework to detect, verify, and report Medicaid application fraud, waste, and abuse across multi-case datasets while minimizing false positives and deterministically redacting sensitive PII.

---

## When to Use
- Analyzing Medicaid case files or BigQuery enrollment datasets (`ai-hub-459714.frauddector`) for anomalous patterns
- Investigating suspected application fraud rings, unauthorized broker submissions, or synthetic identities
- Verifying candidate fraud records against independent cross-case collision metrics (`COUNT(DISTINCT NUM_CASE) >= 2`)
- Filtering false positives (e.g., legitimate single-household families cohabitating at the same physical street address)
- Preparing sanitized, compliance-ready audit summaries for State Medicaid Fraud Control Units (MFCU) and Program Integrity investigators

---

## Audit Framework

### 1. Invocation & Scope Guidance
- **Case and Batch Focus**: Respect specific case numbers (`NUM_CASE`), geographic regions (`ADR_CITY`, `ADR_ZIP`), time windows (`DTE_LAST_LOGON`), or aid categories (`CDE_CAT_REL`) specified by the auditor.
- **Audit Tool Alignment**: Map analysis directly to the 5 core fraud rules and available BYO MCP BigQuery query tools:
  - `audit_credential_recycling`
  - `audit_address_clustering`
  - `audit_identity_mismatches`
  - `audit_sequential_clusters`
  - `audit_pregnant_members`
  - `verify_case_records`
- **Precedence**: Prioritize user-provided audit parameters over standard baseline thresholds.

---

### 2. The 5 Core Medicaid Fraud Rules

Every audit must systematically evaluate candidate records against the following 5 rules:

#### Rule 1: Credential Recycling (`audit_credential_recycling`)
- **Detection Logic**: Detects shared usernames (`MASKED_USERNAME`) or password hashes (`PASSWORD_HASH`) across distinct case numbers (`COUNT(DISTINCT NUM_CASE) > 1`).
- **Investigative Signal**: Indicates shared account creation rings, unauthorized broker submissions, or compromised credentials.

#### Rule 2: Address Clustering (`audit_address_clustering`)
- **Detection Logic**: Identifies high-density clusters sharing normalized street lines (`LOWER(TRIM(ADR_STREET_1))`) across two or more distinct cases (`COUNT(DISTINCT NUM_CASE) >= 2`).
- **Investigative Signal**: Flags commercial drop boxes, abandoned buildings, or coordinated address mills.

#### Rule 3: Identity Mismatches (`audit_identity_mismatches`)
- **Detection Logic**: Compares normalized applicant first and last names (`NAM_FIRST`, `NAM_LAST`) against account usernames and email prefixes.
- **Investigative Signal**: Isolates synthetic identities, mismatched third-party account handlers, or hijacked profiles.

#### Rule 4: Sequential Clusters (`audit_sequential_clusters`)
- **Detection Logic**: Identifies same-day logon/submission batches (`DTE_LAST_LOGON`) across multiple distinct case numbers (`COUNT(DISTINCT NUM_CASE) >= 3`).
- **Investigative Signal**: Detects automated bot filings or rapid batch processing by unauthorized intermediaries.

#### Rule 5: Pregnant Member Anomalies (`audit_pregnant_members`)
- **Detection Logic**: Evaluates records with category code `CDE_CAT_REL = 'CNF'`, grouping by normalized first name (`NAM_FIRST`) and 4-digit birth year (`SUBSTR(CAST(DTE_BIRTH AS STRING), 1, 4)`) across multiple distinct cases (`COUNT(DISTINCT NUM_CASE) >= 2`).
- **Investigative Signal**: Surfaces duplicate submissions exploiting enhanced maternity benefit coverage.

---

### 3. False-Positive Minimization Protocol

Never escalate candidate records without rigorous secondary verification:

1. **Enforce Case Multiplicity**:
   - Verify that cross-case anomalies contain genuinely distinct case numbers (`COUNT(DISTINCT NUM_CASE) >= 2`). Never flag single-case anomalies as systemic fraud rings.
2. **Independent Collision Verification**:
   - Call `verify_case_records` to retrieve exact collision metrics:
     - Exact count of distinct cases sharing the same username (`shared_username_case_count`).
     - Exact count of distinct cases sharing the same password hash (`shared_password_case_count`).
     - Exact count of distinct cases sharing the same physical street address (`shared_address_case_count`).
     - Count of distinct surnames at the address (`distinct_last_names_at_address`).
3. **Legitimate Cohabitation vs. Fraud Rings**:
   - Distinguish legitimate family households from fraudulent address mills.
   - Records flagged with `likely_legitimate_family_household = true` (shared physical address with a single shared family surname and zero cross-case credential/password recycling) must be filtered out of `CRITICAL`/`HIGH` fraud ring escalations and marked as `FILTER_FALSE_POSITIVE`.
4. **Data Quality Check**:
   - Exclude standard test accounts, administrative batch loads, or placeholder addresses (e.g., `"123 Main St"`, `"General Delivery"`, known homeless shelter administrative addresses) from automated ring designations unless accompanied by credential recycling.

---

### 4. Risk Severity Classification

Categorize verified findings into standardized severity tiers:

- **`CRITICAL`**: Cross-case credential recycling across distinct identities (`Rule 1`) **OR** large multi-surname address clusters (`4 or more distinct case numbers` in `Rule 2`).
- **`HIGH`**: Small multi-surname address clusters (`2 to 3 distinct cases` in `Rule 2`) **OR** pregnant member anomalies sharing identical first name and birth year across distinct cases (`Rule 5`).
- **`MEDIUM`**: Isolated identity mismatches where applicant name diverges from email/username (`Rule 3`) **OR** sequential logon/creation bursts (`Rule 4`) without cross-account credential collisions.
- **`LOW`**: Single-household family cohabitation (`likely_legitimate_family_household = true`) or minor data entry anomalies with no shared credentials.

---

### 5. PII Redaction & Data Sanitization

All audit findings and reports must strictly protect beneficiary privacy and operational security:

1. **Mask PII**:
   - **SSNs**: Redact full Social Security Numbers (show only last 4 digits: `XXX-XX-1234` or omit completely).
   - **Emails & Usernames**: Mask emails (`j***e@domain.com`) and usernames (`u***r12`).
   - **Passwords**: Never display plain-text passwords or full raw hashes; always format as `hash:<8-hex-chars>` (e.g., `hash:9f86d081`).
   - **Dates of Birth**: Truncate full dates of birth to 4-digit birth year only (`YYYY`).
2. **Scrub Technical Metadata**:
   - Remove raw SQL queries, internal database connection strings, BigQuery dataset IDs (`ai-hub-459714.frauddector`), cloud project numbers, and internal pipeline callbacks from final executive deliverables.

---

### 6. Output Reporting Standards

Present audit deliverables using these exact structured sections:

#### 1. Executive Audit Summary
A concise 3-to-4 sentence summary identifying the scope/batch reviewed, primary anomaly drivers detected, number of false-positive family households filtered out, and an overall batch risk rating (`Safe`, `Review Required`, or `Critical`).

#### 2. Key Metric Summary Table
| Audit Metric | Verified Count | Risk Assessment / Notes |
| :--- | :--- | :--- |
| **Total Cases Evaluated** | `[N]` | Scope of enrollment batch analyzed |
| **Credential Recycling Collisions (Rule 1)** | `[N]` | Shared usernames or `hash:...` across distinct cases |
| **Address Clustering Cases (Rule 2)** | `[N]` | Multi-case physical address clusters (`>= 2` cases) |
| **Filtered Single-Household False Positives** | `[N]` | Shared surname cohabitation with unique credentials |
| **Pregnant Member Duplicates (Rule 5)** | `[N]` | Duplicate `CNF` maternity records sharing name + birth year |
| **Highest Batch Risk Tier** | `[CRITICAL / HIGH / MEDIUM / LOW]` | Overall priority determination |

#### 3. Detailed Findings by Risk Tier
Group verified anomalies by risk tier (`CRITICAL`, `HIGH`, `MEDIUM`) with:
- **Case Number(s)**: Redacted/verified `NUM_CASE` and `ID_MEDICAID` references.
- **Triggered Rule(s)**: Specific rule(s) violated (`Rule 1` through `Rule 5`).
- **Collision Metrics**: Verified distinct case count sharing the attribute (`shared_username_case_count`, `shared_password_case_count`, `shared_address_case_count`).
- **Investigative Analysis**: Plain-language explanation of how the pattern impacts program integrity.
- **Recommended Action**: Concrete next step (e.g., *Refer to OIG & Subpoena ISP Logs*, *Freeze Pending Physical Residency Affidavit*, *Request NIST IAL-2 Identity Proofing*).
