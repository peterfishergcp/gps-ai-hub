---
name: sop-from-rough-notes
description: Transforms rough operational notes into a standardized 6-section Standard Operating Procedure (SOP) with inline confirmation markers and PII checks.
---

# Standard Operating Procedure (SOP) From Rough Notes

Use this skill whenever the user asks to convert rough process notes, bullet points, or desk steps into a formal Standard Operating Procedure (SOP) or runbook.

## Workflow & Rules

1. **PII & Secret Check First**: Halt and ask for `[REDACTED]` placeholders if the notes contain real constituent/client PII or plaintext credentials.
2. **Six Required Headings**:
   1. **Purpose**
   2. **Scope**
   3. **Roles and Responsibilities**
   4. **Procedure** — Numbered steps starting with strong action verbs (*Export, Verify, Cross-check, Notify, Archive*). Whenever a threshold, policy number, or owner is missing from the notes, mark it inline on that line as **`[NEEDS CONFIRMATION: missing detail]`** instead of guessing (never place bare `[...]` alone on its own line).
   5. **Decision Points and Exceptions**
   6. **Contacts and References**
3. **Human Verification Footer**:
   - End with: *"AI-assisted SOP draft. Validate every procedure step, exception path, and policy reference with process owners before publication."*
