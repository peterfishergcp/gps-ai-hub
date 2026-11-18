# Record Types

Rules for specific record types. They apply the Default Redaction Set and its
principles in SKILL.md; they never remove an item from it. Labels, markers, and
citations follow SKILL.md.

## Police, Investigative, and Immigration Records

-   **Private persons** (suspects, arrestees, witnesses, callers, tipsters) each
    get their own label: name and every variant, age, house number, workplace,
    and other identifying details. The offense, the arrest or booking, the type
    of location (for example, "detached garage"), the street, and property taken
    stay.
-   **Arrested adults**: redact the name and personal identifiers; the arrest,
    charges, and booking itself (for example, "booked into the county jail")
    stay. Flag: "Many state laws make an adult arrestee's name and booking
    information public; confirm under {state} law." On a federal record, cite
    `(b)(6)` and `(b)(7)(C)`.
-   **Victims**: redact the name, house number, age, workplace, and other
    identifying details. When a job appears with a named workplace ("a {job} at
    {business} on {street}"), redact the phrase as one span. Generic role words
    that don't name the workplace ("a clerk there", "after his shift") stay;
    this applies to witnesses too. Flag that state law may treat a victim's
    identity or the incident address differently, so the officer confirms.
-   **Public employees as witnesses, complainants, victims, or subjects** in a
    police, inspector general, or similar investigative record are not acting in
    a work role there. Redact their name and variants, job title, duty station,
    and other identifying details under one label, and flag it. The
    investigators and officers handling the matter keep their names under the
    work-role principle. An employer's own complaint, personnel, or discipline
    file is not an investigative record in this sense: an employee who complains
    or reports there keeps their name, title, and work email, with any
    retaliation concern flagged. The discipline itself stays; if the governing
    law may protect personnel files, flag it.
-   **Officers and agents** keep their names under the work-role principle. On a
    federal law enforcement record, flag that you don't know the agency's
    practice on withholding law enforcement personnel names (Exemptions 6 and
    7(C)), so the officer decides.
-   **Immigration records**: a subject's statement of fear of return or request
    for protection is that person's information: redact it under their label
    (`(b)(6)`, `(b)(7)(C)`). Flag immigration status information (asylum,
    credible fear, protected status) for the officer; cite no specific
    regulation for it. The Privacy Act gives access rights only to U.S. citizens
    and lawful permanent residents; flag when a first-party requester's status
    is unclear.
-   Active investigations, confidential sources, and techniques are flagged, not
    redacted (SKILL.md principle 11): details of a possibly open investigation
    (Exemption 7(A) on a federal record); release logistics, operational times
    and places, radio, ten-, and officer-safety codes (Exemption 7(E), or the
    state act with "provision to confirm").

## Health Records

-   Redact the patient's diagnosis, injury, condition, treatment, lab values,
    and outcome. A clinical-notes field about the patient is redacted as one
    span: the whole field after its heading (`Treatment notes: 🟥[REDACTED-R1]`).
-   The event the record exists to document stays, including its specifics: a
    fall, or a medication error (the drug class and dose given in error) and how
    it was caught. If it still reveals something sensitive about the patient,
    flag it.
-   A patient's own room or bed number, tied to the patient by name or other
    detail, takes the patient's label. A room mentioned only as the place where
    an event happened (for example, "the dose ordered for Room 7C"), with no
    name attached, stays with a flag.
-   A provider that wrote or holds the record, or where an event happened,
    stays, and visit dates stay. Where a named patient, victim, or complainant
    was treated takes that person's label. A provider whose name reveals a
    condition (for example, a substance use treatment program) may make the
    whole record confidential (see the citation guide).

## Vendor and Financial Records

-   A person's own bank account, card, or customer number takes that person's
    label. A business account (including a sole proprietor's business account),
    an agency purchasing card, or a number not tied to a person named in the
    record gets its own label.
-   A business EIN is released with a flag; a sole proprietor's SSN is redacted.
-   The house number and cell on a sole proprietor's W-9 or vendor form are
    redacted under the default set, with a flag that they may be business
    details the officer can release. The owner's name and business name stay
    when the vendor holds an agency contract.
-   Payment amounts, invoice totals, and contract terms stay unless they are
    tagged proprietary (Proprietary Material below).

**Business figures and derived values**: a business's financial figures (sales,
receipts, payments, taxes paid) and aggregate totals or counts are not personal
data; release them unless proprietary-tagged or FTI from the IRS, and if a law
you can't confirm (for example, state tax confidentiality) may cover them,
release and flag. Redact a released figure only when arithmetic on released text
yields a redacted value (a total minus its other parts), not because it sits
next to one. Figures that reveal a proposed withholding are released and
flagged. A person's credit or debt history in words (not account numbers) is not
a default item: release it and flag.

## Proprietary Material

"Tagged proprietary" means the owner marked the record, a section, or specific
text as proprietary, confidential, or a trade secret, or the source system
labels it so.

-   Propose withholding, with a 🟨 marker, exactly the text the mark covers. When
    the mark covers a section, one 🟨 marker replaces the section body under its
    heading. When the mark is a banner over a whole document, propose
    withholding its competitively sensitive content (prices, rates, costs,
    markups, formulas, methods, staffing or cost models) and release routine
    text (parties, service descriptions, totals).
-   Figures outside the marked text (for example, contract rates and totals) and
    untagged pricing, vendor reports, and recommendations are released; a
    sentence saying "our pricing is confidential" in an untagged email doesn't
    tag it. Flag all of these as the SKILL.md officer-review checklist
    describes.

## Grant, License, and Permit Files

-   The grantee, contractor, licensee, or permit holder keeps their name and
    business contact details everywhere in the file, including on their own
    application, because the award or permit is public (principle 2). Their SSN,
    house number, bank numbers, and similar identifiers are redacted.
-   Other people on the same forms (a spouse, dependents, references) get their
    own labels.
-   **Applicant-supplied tax return** (for example, a Form 1040 in a grant
    file): not FTI unless it came from the IRS, so don't cite 26 U.S.C. § 6103.
    Redact its SSNs, account numbers, and other identifiers, keep the grantee's
    own name, redact a spouse's or dependent's name, and propose withholding the
    whole return in a flag (the officer decides under the governing law's
    privacy or financial provision).
-   A denial or condition based on personal grounds (health, criminal history,
    finances) is a sensitive personal fact: redact the name and flag (principle
    2).

## Criminal History and Background Checks

A criminal history printout from the FBI or NCIC may be barred from release by
federal law (28 U.S.C. § 534; 28 CFR 20.33). Redact the identifiers in it and
propose withholding the printout in a flag, cited through Exemption 3 on a
federal record or through the state act's provision for records made
confidential by federal law on a state or local record. A criminal history line
inside another record (a booking sheet, a background check) is not a default
item: release it in the draft and propose withholding it in a flag that cites 28
U.S.C. § 534 (through the state act on a state or local record). Other
background check results (a credit summary, a clearance or threat assessment
status) are not default items either: release them with a flag, and add a
consult flag when another agency made the determination.
