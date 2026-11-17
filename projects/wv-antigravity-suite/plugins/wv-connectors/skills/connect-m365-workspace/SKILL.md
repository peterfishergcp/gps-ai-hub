---
name: connect-m365-workspace
description: High-precision workflows for querying and synthesizing Email (Outlook or Gmail), SharePoint, OneDrive, Microsoft Teams, and Google Drive through the user's Federated Gemini Enterprise (GE) instance—with citation hygiene, draft-only safeguards, and offline file fallbacks. Trigger on /connect-m365-workspace, "search SharePoint", "check OneDrive", "summarize Teams chat", "pull Outlook emails", or "search Google Drive".
---

# Email, SharePoint, OneDrive, Teams & Drive via Federated GE (`/connect-m365-workspace`)

Use the user's **Gemini Enterprise (`GE`) instance** (`wv-ge-bridge` -> `ge_ask_instance` and `ge_search_records`) as the primary connector to **Microsoft 365** (*Outlook, SharePoint, OneDrive, Teams*) and **Google Workspace** (*Gmail, Drive, Docs, Sheets*).

## Step 1: Route to Federated GE (`ge_ask_instance` First for Federated Sources!)
- **CRITICAL ARCHITECTURAL RULE:** Because West Virginia's **Outlook, SharePoint, OneDrive, and Teams** connectors are **federated**, always prefer **`ge_ask_instance`** (`StreamAssist`) over `ge_search_records` (`SearchService.Search`) when querying live M365 mail, chats, or federated files! `StreamAssist` fans out across federated connectors in real time, whereas `SearchService.Search` primarily queries ingested stores.
- If `ge_instance_status` shows the user hasn't configured GE yet, offer `/connect-ge`—and if they already have `.eml`, `.docx`, `.xlsx`, `.pdf`, or `.txt` exports on disk, process those immediately without blocking!

## Step 2: Connector-Specific Precision Rules
Consult `./references/federated_connector_prompts.md` for copy-ready `ge_ask_instance` query templates, and apply these quality rules on every response:
1. **Outlook & Gmail Threads:** Reconstruct threads **chronologically** (`Oldest -> Newest`) so superseded numbers or reversed decisions in earlier replies are never reported as final policy. Always cite `Sender`, `Subject`, and `Timestamp`.
2. **SharePoint & OneDrive Documents:** Preserve exact document titles and web links (`?web=1` when linking `.docx`/`.xlsx`/`.pptx` in SharePoint/OneDrive so links open cleanly in Chrome/Edge rather than forcing downloads; `#page=N` on PDFs when page numbers are returned).
3. **Microsoft Teams & Google Chat Synthesis:** Group noisy channel chatter into **Issue / Context -> Key Findings -> Decisions Made -> Open Action Items (`Owner + Due Date`)**.
4. **Sensitivity Labels & Draft-Only Safety:** Respect Microsoft Purview / Workspace sensitivity markings (`Confidential`, `Internal Only`, `FOIA Exempt`) and **never** auto-send emails or chat messages.
