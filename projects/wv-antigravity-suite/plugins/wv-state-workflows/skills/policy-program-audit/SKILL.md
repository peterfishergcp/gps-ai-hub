---
name: policy-program-audit
description: Analyzes bills, administrative rules, federal guidance, budget variances, and agency program documents—including cross-document consistency audits (catching conflicting numbers, dates, or eligibility rules across frameworks, web pages, and flyers) and risk registers. Trigger on /policy-program-audit, "analyze this bill or rule", "check consistency across these documents", "build a risk register", or "fact-check my draft".
---

# Policy Analysis & Cross-Document Program Audit (`/policy-program-audit`)

Audit legislation, administrative rules, budget narratives, and multi-document program launches with zero guesswork.

## Step 1: Choose the Audit Lens
Consult `./references/policy_finance_it_playbook.md` for specialized recipes across Policy, Finance/Budget, and IT Operations, or run one of these core audits:

1. **Cross-Document Consistency Audit (Launch Readiness Gate):**
   - Ideal when an agency prepares a major program (e.g. loans + tiered grants across a staff framework doc, website copy, application form, and public flyer):
   - Compare every file (or federated SharePoint/OneDrive doc via `ge_ask_instance`) line by line across **funding totals, caps, interest rates, match percentages, tier definitions, eligible applicants, and closing dates**.
   - Output a **Discrepancy Table** (`Topic | Document A Says (Page/Line) | Document B Says (Page/Line) | Recommended Reconciliation`) so zero contradictory rules reach the public.
2. **Bill, Statute, or Federal Rule Impact Brief:**
   - Summarizes: Statutory Change (`Current Law vs. Proposed`), Operational Impact on West Virginia Agency Systems/Staff, Fiscal/Budget Implications, Effective Dates & Rulemaking Deadlines, and Open Ambiguities.
3. **Program Risk Register & Internal Control Check:**
   - Identifies operational, financial, compliance, and fraud/eligibility risks (`Likelihood x Impact`), mapping concrete preventive controls and audit trails.
