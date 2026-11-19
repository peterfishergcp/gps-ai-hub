---
name: daily-brief
description: Generates a concise morning or weekly executive briefing covering calendar meetings, unread priority messages, open action items, meeting prep briefs, and status rollups. Pulls from the user's federated Gemini Enterprise (GE) instance (Outlook/Gmail, Calendar, SharePoint/OneDrive, Teams) first or from pasted notes. Trigger on /daily-brief, "morning brief", "daily update", "prep me for today's meetings", or "weekly status report".
---

# Daily Executive Update & Meeting Brief (`/daily-brief`)

Produce an actionable, scannable daily update or weekly rollup tailored to the user's role (check `./agy-twin-profile.md` or `~/.gemini/agy-twin-profile.md` first if present).

## Step 1: Gather Context (GE Federated Connectors First -> Local Fallback)

1. **Check Federated Gemini Enterprise (`GE`) Bridge First:**
   - If the `agy-ge-bridge` MCP tool `ge_ask_instance` is available and configured, run a single consolidated query against the user's GE instance:
     > *"Summarize my upcoming meetings today/this week, unread high-priority emails or Teams mentions requiring my response, and any open action items or deadlines shared with me across Outlook/Gmail, Calendar, Teams, and SharePoint/OneDrive over the last 48 hours. Cite every email, thread, or document title and date."*
   - If `ge_instance_status` indicates the GE instance is not configured yet—or if a federated connector (like Outlook or Teams) needs a one-time **Authorize** click in the GE Web App—tell the user in one friendly line (`Tip: Run /connect-ge anytime to pull live Outlook, Teams, and SharePoint updates automatically`) and proceed immediately if they pasted notes or files.
2. **No Connector / Pasted Notes Fallback:**
   - Never block! If the user pasted a calendar schedule, email thread, meeting transcript, or bullet list (or attached `.eml`/`.docx`/`.txt` files), synthesize directly from those materials. If neither GE nor pasted input is available, ask them to either paste their schedule/notes or run `/connect-ge`.

## Step 2: Additional Meeting & Project Recipes
When the user asks specifically for a **Single-Meeting Prep Brief**, **Agenda Builder**, **Notes-to-Action-Items Extractor**, **Project Charter**, **RAID / Milestone Tracker**, or **Leadership Status Report**, consult `./references/meetings_project_playbook.md` for the structured public-sector templates.

## Step 3: Output Structure (Scannable BLUF Format)

1. **Bottom Line Up Front (Top 3 Moves Today):** The 3 highest-leverage actions or deadlines that need the user's attention first, with owner and due time.
2. **Schedule & Prep Snapshot:** Chronological table of meetings (`Time | Session & Attendees | Goal / Decision Needed | Prep Doc or Question to Ask`).
3. **Open Replies & Escalations:** Messages or shared documents waiting on the user's decision or sign-off, each with a verified source citation.
4. **Offer Next Step:** Offer to draft any needed reply via `/digital-twin` or turn notes into a tracker/dashboard via `/agy-dashboard`.

## Guardrails
- Cite real message subjects, senders, timestamps, and document names—never invent attendees, deadlines, or commitments.
- Flag `[VERIFY BEFORE SHARING]` on any sensitive personnel, budget, or statutory item.
