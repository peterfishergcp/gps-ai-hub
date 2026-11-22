# High-Signal Federated Query Patterns for Gemini Enterprise (`StreamAssist`)

Federated connectors execute live API searches against Microsoft Graph, Google Workspace, and GitHub. Specific, bounded queries return much sharper grounding than vague 2-word prompts.

## 1. Outlook / Gmail — Chronological Thread & Commitment Extraction
```text
Search my emails from the last [7 days] involving [Sender / Topic / Program Name].
Return every matching thread in chronological order (oldest message to latest reply),
listing exact Subject, Sender, Date/Time, latest decision, and any open action item assigned to me.
```

## 2. SharePoint & OneDrive — Authoritative Policy / Budget / Grant Lookup
```text
Search SharePoint and OneDrive for the most recent version of documents related to [Program / Grant / Site Name].
List each matching file's exact Title, Last Modified Date, Author/Owner, URL, and extract verbatim figures,
eligibility tiers, or dates. Flag if two documents contain conflicting numbers.
```

## 3. Microsoft Teams — Escalation & Project Channel Catch-Up
```text
Search Microsoft Teams messages and meeting notes from the last [72 hours] mentioning [Project / Incident / System].
Group findings into: (1) Decisions Made, (2) Blockers/Risks Raised, and (3) Open Action Items with Owner.
```

## 4. Cross-Connector Synthesis (Email + SharePoint/OneDrive + Teams)
```text
Across Outlook, Teams, SharePoint, and OneDrive, gather everything from the past [14 days] on [Topic].
Cross-check email/Teams discussions against the latest SharePoint/OneDrive document and highlight any updates
discussed in email/Teams that have not yet been reflected in the formal document.
```
