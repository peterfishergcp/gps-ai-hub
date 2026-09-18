# Gemini Enterprise Medicaid Fraud Auditor Skill & BYO MCP Connector

This project contains the **Medicaid Fraud Auditor (`medicaid-fraud-auditor`)** Gemini Enterprise Skill and its companion **BigQuery BYO MCP Server** deployed on Google Cloud Run.

> **Privacy & Data Governance Note**: This documentation provides the complete **BigQuery Table Schema (`DDL`)** and **Analytical View Definitions (`SQL`)** required to deploy the fraud detection pipeline in any Google Cloud environment. **No actual or synthetic beneficiary data rows are stored or shared in this document.**

---

## 🗄️ BigQuery Dataset Schema (`<PROJECT_ID>.frauddector`)

The underlying BigQuery dataset (`frauddector`) consists of **1 base enrollment table** (`syntheticdatafraud`) and **3 pre-computed analytical views** (`v_credential_recycling`, `v_address_clustering`, `v_pregnant_members`).

### 1. Base Table Schema: `syntheticdatafraud`

| Ordinal | Column Name | BigQuery Data Type | Nullable | Field Description | MCP Server PII Sanitization (`server.py`) |
| :---: | :--- | :--- | :---: | :--- | :--- |
| 1 | `NUM_CASE` | `STRING` | `YES` | Medicaid Case / Application Identifier | Returned as-is for cross-case collision grouping |
| 2 | `ID_MEDICAID` | `STRING` | `YES` | Individual Beneficiary Medicaid ID | Returned as-is for audit correlation |
| 3 | `USERNAME` | `STRING` | `YES` | Applicant portal login username | **Masked** $\rightarrow$ `USERNAME_MASKED` (e.g., `u***12`) |
| 4 | `PASSWORD` | `STRING` | `YES` | Applicant portal login credential | **Hashed** $\rightarrow$ `PASSWORD_HASH` (`hash:<8-char-sha256>`) |
| 5 | `EMAIL_ADDRESS` | `STRING` | `YES` | Applicant contact email address | **Masked** $\rightarrow$ `EMAIL_MASKED` (e.g., `j***e@domain.com`) |
| 6 | `PHONE_NUMBER` | `INT64` | `YES` | 10-digit applicant contact phone number | Returned as integer |
| 7 | `DTE_LAST_LOGON` | `INT64` | `YES` | Last portal logon / submission date (`YYYYMMDD`) | Used for Rule 4 sequential batch clustering |
| 8 | `NAM_FIRST` | `STRING` | `YES` | Applicant First Name | Used for Rule 3 identity & Rule 5 maternity matching |
| 9 | `NAM_LAST` | `STRING` | `YES` | Applicant Last Name (Surname) | Used for single-household surname diversity check |
| 10 | `DTE_BIRTH` | `INT64` | `YES` | Applicant Date of Birth (`YYYYMMDD`) | **Truncated** $\rightarrow$ `BIRTH_YEAR` (4-digit year `YYYY` only) |
| 11 | `CDE_SEX` | `STRING` | `YES` | Biological Sex Code (`M` / `F`) | Returned as-is |
| 12 | `ADR_STREET_1` | `STRING` | `YES` | Primary Physical Street Address Line 1 | Used for Rule 2 address clustering & household checks |
| 13 | `ADR_STREET_2` | `STRING` | `YES` | Street Address Line 2 (Apt / Suite / Unit) | Returned as-is |
| 14 | `ADR_CITY` | `STRING` | `YES` | Physical Address City | Returned as-is |
| 15 | `ADR_ZIP` | `INT64` | `YES` | 5-digit Postal ZIP Code | Returned as-is |
| 16 | `CDE_CAT_REL` | `STRING` | `YES` | Aid Category / Relationship Code (e.g., `'CNF'` for Pregnant Member) | Used for Rule 5 maternity duplicate screening |
| 17 | `string_field_16` | `STRING` | `YES` | Trailing CSV ingestion artifact column | **Dropped** automatically by `sanitize_record()` |

#### Base Table DDL
```sql
CREATE TABLE IF NOT EXISTS `<PROJECT_ID>.frauddector.syntheticdatafraud` (
  NUM_CASE STRING,
  ID_MEDICAID STRING,
  USERNAME STRING,
  PASSWORD STRING,
  EMAIL_ADDRESS STRING,
  PHONE_NUMBER INT64,
  DTE_LAST_LOGON INT64,
  NAM_FIRST STRING,
  NAM_LAST STRING,
  DTE_BIRTH INT64,
  CDE_SEX STRING,
  ADR_STREET_1 STRING,
  ADR_STREET_2 STRING,
  ADR_CITY STRING,
  ADR_ZIP INT64,
  CDE_CAT_REL STRING,
  string_field_16 STRING
);
```

---

## 🔍 Analytical Views & Fraud Rule SQL Definitions

### View 1: `v_credential_recycling` (Rule 1 — Credential Recycling)
Flags accounts where the same `USERNAME` or `PASSWORD` is shared across **more than one distinct case (`COUNT(DISTINCT NUM_CASE) > 1`)**.
- **Output Schema**: All 17 columns from `syntheticdatafraud` + `violation_detail` (`STRING`: `'Both Username and Password Recycled'`, `'Username Recycled'`, or `'Password Recycled'`).

```sql
CREATE OR REPLACE VIEW `<PROJECT_ID>.frauddector.v_credential_recycling` AS
WITH recycled_users AS (
    SELECT USERNAME
    FROM `<PROJECT_ID>.frauddector.syntheticdatafraud`
    WHERE USERNAME IS NOT NULL
    GROUP BY USERNAME
    HAVING COUNT(DISTINCT NUM_CASE) > 1
),
recycled_passwords AS (
    SELECT PASSWORD
    FROM `<PROJECT_ID>.frauddector.syntheticdatafraud`
    WHERE PASSWORD IS NOT NULL
    GROUP BY PASSWORD
    HAVING COUNT(DISTINCT NUM_CASE) > 1
)
SELECT
    t.*,
    CASE
        WHEN t.USERNAME IN (SELECT USERNAME FROM recycled_users)
         AND t.PASSWORD IN (SELECT PASSWORD FROM recycled_passwords)
            THEN 'Both Username and Password Recycled'
        WHEN t.USERNAME IN (SELECT USERNAME FROM recycled_users)
            THEN 'Username Recycled'
        ELSE 'Password Recycled'
    END AS violation_detail
FROM `<PROJECT_ID>.frauddector.syntheticdatafraud` t
WHERE t.USERNAME IN (SELECT USERNAME FROM recycled_users)
   OR t.PASSWORD IN (SELECT PASSWORD FROM recycled_passwords);
```

---

### View 2: `v_address_clustering` (Rule 2 — High-Density Address Clustering)
Identifies physical street addresses (`ADR_STREET_1`) shared across **more than 2 distinct case numbers (`COUNT(DISTINCT NUM_CASE) > 2`)**.
- **Output Schema**: All 17 columns from `syntheticdatafraud` + `violation_detail` (`STRING`: `'Address Clustering (>2 distinct cases at street address)'`).
- **MCP Server False-Positive Enrichment (`audit_address_clustering`)**: When queried via `server.py`, this view is joined against surname diversity (`COUNT(DISTINCT LOWER(TRIM(NAM_LAST)))`) and password diversity (`COUNT(DISTINCT PASSWORD)`) to compute `single_household_false_positive_candidate` (`BOOL`), allowing single-family households with unique credentials to be filtered out.

```sql
CREATE OR REPLACE VIEW `<PROJECT_ID>.frauddector.v_address_clustering` AS
WITH clustered_addrs AS (
    SELECT ADR_STREET_1
    FROM `<PROJECT_ID>.frauddector.syntheticdatafraud`
    WHERE ADR_STREET_1 IS NOT NULL
    GROUP BY ADR_STREET_1
    HAVING COUNT(DISTINCT NUM_CASE) > 2
)
SELECT
    t.*,
    'Address Clustering (>2 distinct cases at street address)' AS violation_detail
FROM `<PROJECT_ID>.frauddector.syntheticdatafraud` t
WHERE t.ADR_STREET_1 IN (SELECT ADR_STREET_1 FROM clustered_addrs);
```

---

### View 3: `v_pregnant_members` (Rule 5 — Pregnant Member Anomalies)
Identifies duplicate maternity benefit enrollments where `CDE_CAT_REL = 'CNF'` records share the exact same first name (`NAM_FIRST`) and 4-digit birth year (`SUBSTR(CAST(DTE_BIRTH AS STRING), 1, 4)`).
- **Output Schema**: All 17 columns from `syntheticdatafraud` + `violation_detail` (`STRING`: `'Pregnant Member Cluster (Same First Name + Birth Year)'`).

```sql
CREATE OR REPLACE VIEW `<PROJECT_ID>.frauddector.v_pregnant_members` AS
WITH pregnant_clusters AS (
    SELECT
        NAM_FIRST,
        SUBSTR(CAST(DTE_BIRTH AS STRING), 1, 4) AS birth_year
    FROM `<PROJECT_ID>.frauddector.syntheticdatafraud`
    WHERE CDE_CAT_REL = 'CNF'
      AND NAM_FIRST IS NOT NULL
      AND DTE_BIRTH IS NOT NULL
    GROUP BY NAM_FIRST, birth_year
    HAVING COUNT(*) > 1
)
SELECT
    t.*,
    'Pregnant Member Cluster (Same First Name + Birth Year)' AS violation_detail
FROM `<PROJECT_ID>.frauddector.syntheticdatafraud` t
INNER JOIN pregnant_clusters pc
    ON t.NAM_FIRST = pc.NAM_FIRST
   AND SUBSTR(CAST(t.DTE_BIRTH AS STRING), 1, 4) = pc.birth_year
WHERE t.CDE_CAT_REL = 'CNF';
```

---

### Dynamic MCP Server Queries (Rules 3, 4 & Secondary Verification)

In addition to the three pre-built BigQuery views above, [`mcp_server/server.py`](file:///Users/peterfisher/Documents/Jetski_Work/ge_medicaid_skill/mcp_server/server.py) executes parameterized read-only SQL queries against `syntheticdatafraud` for:
- **Rule 3 (`audit_identity_mismatches`)**: Flags records where the first 3 characters of `NAM_FIRST` and `NAM_LAST` do not appear in either `USERNAME` or `EMAIL_ADDRESS`.
- **Rule 4 (`audit_sequential_clusters`)**: Groups `syntheticdatafraud` by `DTE_LAST_LOGON` where `COUNT(DISTINCT NUM_CASE) >= @min_batch` (default `3`) to detect automated same-day batch submissions.
- **Secondary Verification (`verify_case_records`)**: Accepts up to 20 `NUM_CASE` IDs and computes exact cross-case collision metrics (`shared_address_case_count`, `distinct_surnames_at_address`, `shared_password_case_count`, `shared_username_case_count`, and `is_legitimate_single_household_family`).

---

## 🚀 Live Cloud Run BYO MCP Server Endpoints

The BigQuery BYO MCP Server (`medicaid-fraud-bq-mcp`) is deployed in GCP project `ai-hub-459714` (`us-central1`) and connects read-only to `ai-hub-459714.frauddector`.

| Configuration Field | Value |
| :--- | :--- |
| **Service Base URL** | `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app` |
| **Streamable HTTP MCP Endpoint** | `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/mcp` |
| **OAuth 2.0 Authorization URL** | `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/auth` |
| **OAuth 2.0 Token URL** | `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/token` |
| **Client ID** | `ge-medicaid-mcp-client` *(or any string)* |
| **Client Secret** | `ge-medicaid-mcp-secret` *(or any string)* |

---

## 🛠️ Step-by-Step Setup in Gemini Enterprise (`frauddectorapp_1787760680542`)

### Step 1: Register the BigQuery BYO MCP Connector (Action Connector)
1. Open the **Google Cloud Console** $\rightarrow$ **Agent Builder / Gemini Enterprise** $\rightarrow$ **Apps** $\rightarrow$ select **`frauddectorapp`** (`global/engines/frauddectorapp_1787760680542`).
2. Navigate to **Actions / Connectors** $\rightarrow$ **Add MCP Server / Custom Connector**.
3. Enter the connector details:
   - **Connector Name**: `Medicaid-Fraud-BigQuery-MCP`
   - **MCP Server URL**: `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/mcp`
   - **Authorization URL**: `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/auth`
   - **Token URL**: `https://medicaid-fraud-bq-mcp-726122012742.us-central1.run.app/token`
   - **Client ID / Secret**: `ge-medicaid-mcp-client` / `ge-medicaid-mcp-secret`
4. Save and verify that the 6 tools are discovered:
   - `audit_credential_recycling`
   - `audit_address_clustering`
   - `audit_identity_mismatches`
   - `audit_sequential_clusters`
   - `audit_pregnant_members`
   - `verify_case_records`

### Step 2: Add the `medicaid-fraud-auditor` Skill
1. Inside **`frauddectorapp`**, navigate to **Skills** $\rightarrow$ **Create Skill**.
2. Copy and paste the contents of [`SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_medicaid_skill/SKILL.md) (`medicaid-fraud-auditor`).
3. Associate the **Medicaid-Fraud-BigQuery-MCP** connector tools with the skill and click **Save / Publish**.

### Step 3: Test Prompt
> `"Run an audit on the latest batch of Medicaid enrollment records for suspected address clustering and credential recycling. Flag any multi-case collisions, filter out single-household false positives, and output a sanitized findings report."`

---

## 📁 Repository Structure

- [`SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_medicaid_skill/SKILL.md) — Production Gemini Enterprise Skill definition with 5 Core Rules, False-Positive Protocol, Risk Severity Classification, and PII Sanitization rules.
- [`mcp_server/server.py`](file:///Users/peterfisher/Documents/Jetski_Work/ge_medicaid_skill/mcp_server/server.py) — Streamable HTTP JSON-RPC 2.0 MCP server querying `ai-hub-459714.frauddector` with SHA-256 password hashing (`hash:a1b2...`) and birth-year truncation.
- [`mcp_server/deploy.sh`](file:///Users/peterfisher/Documents/Jetski_Work/ge_medicaid_skill/mcp_server/deploy.sh) — Cloud Run deployment script.
