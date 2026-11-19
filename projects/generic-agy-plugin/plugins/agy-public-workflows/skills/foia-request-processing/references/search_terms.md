# Search Terms, Sources, and the Search Plan

Build terms as below, then express them in each connector's own query syntax.
The examples use quotes, OR, and AND only to show which forms to cover.

## Sources (connected systems)

Connector                             | Used for
------------------------------------- | --------
SharePoint                            | Search sites, folders, and libraries the user can access; list a named folder or library
Outlook                               | Search the user's mailbox and any shared or delegate mailbox they can access; read a request email
Google Workspace (Gmail, Drive, Chat) | Search the user's mail, files, folders, and chats; list a named Drive folder
Salesforce                            | Search case records the user can access
ServiceNow                            | Read a request ticket; search tickets the user can access
Uploaded files                        | Read every uploaded file in full

-   All connectors use the signed-in user's own permissions. Other people's
    mailboxes, drives, chats, phones, and texts are Gaps rows, never searched.
-   Not connected: Microsoft Teams, OnBase, FOIAXpress, GovQA, procurement and
    financial systems, and organization-wide search tools. When a request likely
    involves them, add a Gaps row (for organization-wide search: "ask the
    agency's IT team whether an organization-wide search is possible").
-   Match sources to the record types asked for: messages point to mail and
    chat; "all records" or "everything on" a subject points to mail, chat,
    documents, and business systems (contracts, payments, cases, tickets).

## "Everything on" a subject

Include email, chat, documents, and records in business systems. For a contract,
the usual record types are the solicitation, bids, evaluation, award, the
contract and amendments, invoices and payments, and performance records. List
the types that were not found in Gaps with where they are likely held (Example
3).

## Building terms

-   Cover every form of an identifier:
    -   Contract 1234: `"contract #1234"`, `"contract 1234"`, `"C1234"`,
        `"C-1234"`. Never search a bare `1234`: it matches look-alikes such as
        contract #12345, invoice numbers, and phone numbers.
    -   Identifiers with letters and digits (permits, case or ticket numbers):
        the hyphenated, spaced, and joined forms (`"AB-123"`, `"AB 123"`,
        `"AB123"`), plus the facility or party name when the request gives one.
    -   Place names: common short forms (`"Elm Street bridge"`, `"Elm St
        bridge"`).
-   When the subject alone is too broad, combine it with topic words (`"Green
    River"` with spill, water quality, sampling, or lab result).
-   A second search on a related name (for example, a vendor name) finds records
    that omit the identifier. A hit on that name alone with no readable content
    is a Table 3 "Not sure" item, "Not sure it matches: can't be read"; a
    different contract or matter with the same name is a clear non-match
    (counted in the "other files" sentence, not listed).
-   Quote names and identifiers exactly as the request writes them. Don't
    correct spellings or replace values.
-   For a numbered multi-part request, build terms per part, and note in Gaps
    when one date limit was applied to parts that have none.

## Full review of a named folder or upload set

A search for an identifier misses files that don't contain it, including
look-alikes (contract C-1243 never comes back from a "C-1234" search). So for a
named Drive folder, SharePoint folder or library, or a set of uploads:

1.  Run the identifier search in the folder.
2.  List the folder ("list all files"), or search it with no terms.
3.  If neither works, search the folder for each record type asked for
    (`invoice`, `contract`, `certificate`, `email`) without the identifier.
4.  Sort every file returned: Table 1, a Table 3 "Not sure" item, or a clear
    non-match counted in the "other files" sentence. Never skip a file.
5.  If the whole folder can't be confirmed, add a Gaps row naming the searches
    run instead and suggesting the user open the folder and check for any file
    this report doesn't cover.

A whole mailbox or site is searched with the identifier and record-type terms,
not listed.

## Date ranges

Write actual dates (YYYY-MM-DD) in the Request Summary and Gaps.

Request says                                         | Date range to use                    | How to note it in the Request Summary
---------------------------------------------------- | ------------------------------------ | -------------------------------------
Exact dates                                          | Those dates                          | The range
A year or years ("from 2025 and 2026")               | 2025-01-01 to 2026-12-31             | The range
An event in a named month or year ("the 2026 audit") | From the start of that month or year | "None given; searched from 2026-01-01 because the request names a 2026 audit"
A relative period ("last spring")                    | The period it most likely means      | "\"Last spring\": spring 2026; exact dates not given"
A season or fiscal year ("2025-26 winter season")    | The season as written                | "2025-26 winter season (exact dates not given)"
Nothing                                              | Any date                             | "None given" (or "None given: any date up to today")

## Proposed search plan

Used when no location is named and no source is connected in the chat. One row
per source; generic locations; no links, items, or counts.

```text
**Proposed search plan (nothing searched yet)**

| Source | Location | Terms | Date range |
| --- | --- | --- | --- |
| Outlook | Your mailbox | (drone OR UAS OR "unmanned aircraft") AND (policy OR directive OR "general order" OR training) | Any date |
| SharePoint | Any site you name where policies, general orders, or training records are kept | Same terms | Any date |
| Uploaded files | Any policy or training file you upload | Read in full | Not applicable |

Confirm this plan or name the locations you want searched, and I'll run it.
```
