# Legal and Platform References

Source links for the laws `SKILL.md` names. Point to the law; don't encode its
rules. Cite a specific provision only when confident; otherwise write "provision
to confirm". When the conversation doesn't give enough information about a rule,
say so and leave the decision to the designated officer.

## Federal

-   [5 U.S.C. § 552, Freedom of Information Act](https://www.govinfo.gov/content/pkg/USCODE-2023-title5/html/USCODE-2023-title5-partI-chap5-subchapII-sec552.htm).
    Applies to federal executive branch agencies; federal courts and Congress
    are not covered.
    -   § 552(a)(3)(A): a request must reasonably describe the records sought.
        Use it to flag vague or very large requests; the FOIA office decides.
    -   § 552(b)(5) (Exemption 5): predecisional or deliberative advice in a
        federal record. Suggest withholding the advice and releasing the facts.
    -   § 552(a)(8)(A) (foreseeable harm): pair with an Exemption 5 suggestion
        by asking whether release would foreseeably harm agency deliberations.
    -   § 552(b)(4) and (b)(6): confidential commercial information and personal
        privacy; cite only when the record plainly fits.
-   [5 U.S.C. § 552a, Privacy Act of 1974](https://www.govinfo.gov/content/pkg/USCODE-2023-title5/html/USCODE-2023-title5-partI-chap5-subchapII-sec552a.htm),
    § 552a(a)(2): "individual" means a citizen of the United States or an alien
    lawfully admitted for permanent residence. A federal request for one's own
    records may also fall under the Privacy Act; flag unclear status, don't
    decide it. This skill does not verify identity; the officer does.
-   [40 CFR Part 2, Subpart A, EPA FOIA regulations](https://www.ecfr.gov/current/title-40/chapter-I/subchapter-A/part-2/subpart-A).
    Cite alongside 5 U.S.C. § 552 for EPA requests. For another federal agency,
    add its own FOIA regulations only if you know them.
-   [DOJ Office of Information Policy, Guide to the FOIA](https://www.justice.gov/oip/doj-guide-freedom-information-act-0).
    Background for officers; don't quote it as a rule for a specific record.

## States

State, county, city, school district, and other local agencies follow their own
state's public records law, even when a request cites "FOIA". Name the
requester's state law by its usual name and citation; if you're not certain of
the citation, say "provision to confirm".

-   Some states cover police and other criminal justice records under a separate
    law; see Special Requests in `corner_cases.md`.
-   Never carry one state's rules, exemptions, or citations over to another
    state.

Don't state how a state treats specific record types (drafts, advisory material,
trade secrets, personnel files, vendor confidentiality markings) unless the law
plainly says so or the user supplies the rule.

## Platform

-   [Gemini Enterprise: Google Drive data store](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/gdrive)
-   [Gemini Enterprise: Microsoft SharePoint data store](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/ms-sharepoint)

These describe how connectors index content with the signed-in user's own
permissions (federated access).
