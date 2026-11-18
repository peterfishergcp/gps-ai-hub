# QA Mode and Special Inputs

Read this file when the user asks you to check someone else's redactions (QA
mode), for the special requests in SKILL.md principle 10, when the records
include a large table of people, or when the user provides an agency redaction
policy or exemption list. Everything in SKILL.md still applies.

## Special Requests

-   **Requests about the default set**: if asked to release a default item, keep
    the redaction and flag that it is in the default set and a release generally
    goes to the public, so what the requester already has doesn't make it
    releasable. Decline in a flag a request to hash or substitute a value
    (Security 3) or to redact something only because it is embarrassing. If the
    requester is clearly the subject (a person asking for their own record),
    their own information stays in their copy with a flag asking the officer to
    verify identity; others' is still redacted. If the requester is an
    organization or only might be the subject, redact as usual and flag it. If
    the user preparing the release is the subject, flag a conflict of interest.
-   **Earlier fake redactions**: if a record's text includes content under
    earlier boxes or highlights, treat it like any other text: redact
    default-set items, never point out what was hidden, and flag that the
    original's redactions are not true redactions.

## QA Mode: QA Findings

Use QA mode when the user asks you to check someone else's redactions. The reply
shows the corrected draft: **Redacted Text (corrected)** first, then QA
Findings, What Was Redacted, and Needs Officer Review. The reviewer's proposal
list is not part of the record and doesn't appear in Redacted Text.

Markdown table `| Proposal | Where | Proposed basis | Verdict | Corrected action
| Reason |`.

-   **Proposal**: the reviewer's ID (H1, H2, ...); add missed items as M1, M2,
    ... with `None` as the proposed basis. Check the whole record against the
    Default Redaction Set yourself, not only the reviewer's list: a house number
    or unit, personal phone, or minor's name the reviewer released is a miss.
-   **Verdict**: exactly one of `CONFIRMED` (right redaction under the governing
    law, including the state act with "provision to confirm"), `OVER-REDACTION`
    (should be released), `UNDER-REDACTION` (missed), or `WRONG BASIS` (right
    redaction, wrong law: a federal exemption or a federal statute cited alone
    on a state or local record, or a state law on a federal record).
-   **Corrected action**: `Release`, or `Redact as {label}` with the corrected
    citation when the basis changes; describe the span by kind ("house number
    only"), never by its value.
-   **Reason**: why the verdict applies, by label and kind; QA Findings never
    quotes the value a proposal covers.
-   Whenever a proposal cited the wrong law, whatever the verdict, add an Output
    C flag whose Officer decides cell says `Check the reviewer's other records
    for the same error`.

## Long Records and Large Tables

Long records and many items follow Size and Batches in SKILL.md (batches,
locations only). Never summarize released text. For a large table, use one label
per row only when there are fewer than about 50 people; otherwise log redactions
by column ("Recipient name, all rows") and flag it. When a table releases
demographic or descriptive fields about private people (age, race, gender,
veteran or disability status, ZIP or neighborhood), add a flag naming those
columns: combined, they may identify someone. Where a reply stopped is a gap
flag in Needs Officer Review.

## Agency Policy

If the user provides an agency redaction policy or exemption list, cite from it
and say so in the governing law line; it never removes default items.
