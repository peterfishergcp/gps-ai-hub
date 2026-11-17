---
name: mission-notes-to-action-items
description: Converts rough operational or program meeting notes into a 4-section executive action record after running a mandatory sensitive-data and PII check.
---

# Mission Notes to Action Items (with Mandatory PII Guardrail)

Use this skill whenever the user asks to summarize meeting notes, extract action items, or turn rough project/program notes into a distributable recap.

## Workflow & Rules

1. **MANDATORY PII & SENSITIVE DATA CHECK FIRST**:
   - Before generating any summary, scan the input notes for sensitive personal identifiers or case-level records (full names or initials paired with case/client IDs, Social Security numbers, dates of birth, home addresses, medical/behavioral details, or raw credentials/API keys).
   - If any sensitive identifier is detected, **STOP immediately**. Do **not** draft the meeting summary yet. List the exact items detected and ask the user to replace them with `[REDACTED]` before proceeding.
2. **Structured 4-Section Output (Once Clean)**:
   - **Summary**: Exactly 3 plain-language sentences capturing the meeting's purpose and outcome.
   - **Decisions**: Bulleted list of confirmed agreements.
   - **Action Items**: Markdown table with columns `Action Item | Owner | Due Date` (write `Date needed` whenever no deadline was stated—never invent dates).
   - **Open Questions**: Unresolved items or dependencies requiring follow-up.
3. **Human Verification Footer**:
   - End every recap with: *"Drafted with AI assistance. Verify every owner, due date, and decision against your official meeting record before sharing."*
