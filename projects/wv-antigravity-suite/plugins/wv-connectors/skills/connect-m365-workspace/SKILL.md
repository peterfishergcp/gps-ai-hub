---
name: connect-m365-workspace
description: High-precision workflows for querying and synthesizing Email (Outlook or Gmail), SharePoint, OneDrive, Microsoft Teams, and Google Drive through the user's Federated Gemini Enterprise (GE) instance—with citation hygiene, draft-only safeguards, and offline file fallbacks. Trigger on /connect-m365-workspace, "search SharePoint", "check OneDrive", "summarize Teams", "pull Outlook emails", or "search Google Drive".
---

# Email, SharePoint, OneDrive, Teams & Drive via Federated GE (`/connect-m365-workspace`)

Use the user's **Gemini Enterprise (`GE`) instance** (via an agency-hosted remote HTTPS Cloud Run GE Gateway, `@wv.gov` `StreamAssist` REST/ADC, or grounded GE Web App results) as the primary connector to **Microsoft 365** (*Outlook, SharePoint, OneDrive, Teams*) and **Google Workspace** (*Gmail, Drive, Docs, Sheets*).

## Step 1: Route to Federated GE (`StreamAssist` First for Federated Sources!)
- **CRITICAL ARCHITECTURAL RULE:** Because West Virginia's **Outlook, SharePoint, OneDrive, and Teams** connectors are **federated**, always prefer **`AssistantService.StreamAssist`** (remote gateway tool or GE Web App grounded prompt) over ingested-only search when querying live M365 mail, Teams channels, or federated files! `StreamAssist` fans out across federated connectors in real time with per-user ACLs.
- If the user has `.eml`, `.docx`, `.xlsx`, `.pdf`, `.csv`, or `.txt` exports attached or in their workspace, synthesize those immediately without blocking—and offer `./references/federated_connector_prompts.md` for copy-ready GE Web App queries!

## Step 2: Connector-Specific Precision Rules
Consult `./references/federated_connector_prompts.md` for copy-ready query templates, and apply these quality rules on every response:
1. **Outlook & Gmail Threads:** Reconstruct threads **chronologically** (`Oldest -> Newest`) so superseded numbers or reversed decisions in earlier replies are never reported as final policy. Always cite `Sender`, `Subject`, and `Timestamp`.
2. **SharePoint & OneDrive Documents:** Preserve exact document titles and web links (`?web=1` when linking `.docx`/`.xlsx`/`.pptx` in SharePoint/OneDrive so links open cleanly in Chrome/Edge rather than forcing downloads; `#page=N` on PDFs when page numbers are returned).
3. **Microsoft Teams & Workspace Chat Synthesis:** Group noisy channel chatter into **Issue / Context -> Key Findings -> Decisions Made -> Open Action Items (`Owner + Due Date`)**.
4. **Sensitivity Labels & Draft-Only Safety:** Respect Microsoft Purview / Workspace sensitivity markings (`Confidential`, `Internal Only`, `FOIA Exempt`) and **never** auto-send emails or chat messages.
