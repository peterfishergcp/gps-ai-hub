---
name: legal-procurement-review
description: Reviews vendor contracts, SaaS/AI agreements, Statements of Work (SOWs), RFPs, and grant agreements against public-sector legal and procurement guardrails (sovereign immunity, fiscal-year non-appropriation, vendor indemnification, public records openness, data residency, and AI training opt-outs) with a 1:3:9 risk scorecard. Trigger on /legal-procurement-review, "review this contract", "redline vendor terms", "draft an SOW", or "compare vendor proposals".
---

# Public Sector Legal & Procurement Contract Review (`/legal-procurement-review`)

Pre-screen vendor contracts, SaaS/AI order forms, SOWs, and solicitations for public-sector procurement officers, program managers, and legal staff (`[PRE-COUNSEL REVIEW DRAFT — NOT FORMAL LEGAL ADVICE]`).

## Step 1: Mandatory Public-Sector Clause Checklist
Inspect every uploaded agreement (or SharePoint/OneDrive contract pulled via `ge_ask_instance`) against these 8 government procurement redlines:
1. **Constitutional Sovereign Immunity & Governing Law:** Flag any clause waiving **sovereign immunity** or mandating out-of-state governing law, foreign venue, or binding commercial arbitration outside the jurisdiction's authorized courts or statutory claims process.
2. **Fiscal-Year Non-Appropriation Clause:** Multi-year commitments **must** include an explicit termination-without-penalty right if the Legislature, City/County Council, or federal grantor does not appropriate funds in a future fiscal year.
3. **One-Way Customer Indemnification Prohibition:** Public agencies generally **cannot indemnify** private vendors (`hold vendor harmless`) creating uncapped contingent public liabilities—flag immediately as **Severity `9` (Blocker)**.
4. **Public Records / FOIA Supremacy (`5 U.S.C. § 552` & Applicable State Open Records Act):** Blanket NDA clauses claiming the entire contract or pricing is confidential must yield to mandatory federal, state, or local public records disclosure laws.
5. **Government Data Ownership, Residency & Exit Portability:** Agency retains 100% ownership of government data; require CONUS data residency, breach notification within statutory/policy windows (e.g., `<= 24–72h`), and zero-fee data export upon termination.
6. **Enterprise AI / LLM Data Guardrails (When Applicable):** Vendor must **never** train foundation models on agency prompts, constituent PII, or outputs; verify FedRAMP / CJIS / HIPAA boundaries where required.
7. **Auto-Renewal & Unilateral Price Escalators:** Flag silent evergreen auto-renewals or uncapped annual CPI/list-price hikes.
8. **Deliverable Acceptance & SLA Remedies:** Tie milestone payments inside SOWs to written agency acceptance criteria rather than calendar dates alone.

## Step 2: Additional Procurement & Grants Recipes
For **RFP Requirements Extraction**, **Statement of Work (SOW) Drafting**, **Vendor Proposal Side-by-Side Scoring**, or **Grant Narrative / Compliance Checklists**, load `./references/procurement_grants_playbook.md`.

## Step 3: Structured Output (`1:3:9` Risk Table + Fallback Language)
1. **Executive Risk Summary:** Count of `9 (Blocker)`, `3 (Negotiate)`, and `1 (Minor)` findings.
2. **Clause-by-Clause Deviations Table:** `Section & Quote | Risk Score (1/3/9) | Public-Sector Issue | Suggested Redline / Fallback Concept for Counsel`.
