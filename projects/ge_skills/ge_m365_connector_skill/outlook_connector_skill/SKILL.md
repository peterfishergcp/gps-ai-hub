---
name: outlook-connector-temporal-enhancer
description: >
  Enforce temporal date precision, chronological email thread aggregation, batch message
  synthesis, and mandatory clickable webLink citations for Microsoft Outlook Mail & Calendar
  connectors (Standard Federated Connector or Microsoft Graph MCP). Use when searching emails,
  analyzing conversation threads, checking calendar schedules, or resolving relative date queries
  (today, latest, oldest, last week, past 7 days).
---

# Microsoft Outlook Connector & Temporal Search Enhancer (`outlook-connector-temporal-enhancer`)

A specialized Gemini Enterprise Skill designed to enforce accurate temporal date arithmetic, full conversation thread reconstruction, and clickable `webLink` citations across Microsoft Outlook Mail and Calendar connectors.

---

## When to Use
- Searching or filtering Microsoft Outlook emails and calendar events by relative time windows (`today`, `latest`, `newest`, `oldest`, `earliest`, `last week`, `past 7 days`)
- Synthesizing multi-message email threads (`RE:`, `FW:`) to identify final decisions, action items, or latest status updates
- Generating executive summaries of communications where every referenced email or calendar invite requires a clickable direct `webLink`

---

## Core Outlook Connector & Temporal Rules

### CURRENT SYSTEM TIME / DATE REFERENCE
Always anchor date calculations to the active system clock:
- **Today's Date**: `${currentDateStr}` (Format: `YYYY-MM-DD`)
- **Current ISO Timestamp**: `${currentIsoTime}` (Format: `YYYY-MM-DDTHH:mm:ssZ`)

---

### 1. Temporal & Relative Date Guidelines
When translating natural-language time expressions into search filters or evaluating retrieved email timestamps:

- **"Today"**:
  - Use start boundary `fromDate: "${currentDateStr}T00:00:00Z"`.
- **"Latest" / "Most Recent" / "Newest"**:
  - Set `sortOrder: "desc"` (default). Always prioritize the most recent message timestamp when reporting current status.
- **"Oldest" / "Earliest"**:
  - Set `sortOrder: "asc"` to surface the originating message or earliest record first.
- **"Last Week" / "Past 7 Days"**:
  - Calculate the exact ISO date range subtracting 7 calendar days from Today's Date (`${currentDateStr}`). Explicitly state the resolved date range (`YYYY-MM-DD` to `YYYY-MM-DD`) in your response.

---

### 2. Threads & Multi-Email Aggregation
- **Complete Thread Retrieval**:
  - When analyzing an ongoing discussion, never rely on a single isolated reply snippet if earlier messages contain essential context.
  - If paired with the Outlook MCP Connector, invoke `get_email_thread_lookup` using the email's `conversationId` or `messageId` to fetch the complete chronological thread.
  - If paired with the Standard Federated Connector, aggregate all retrieved emails sharing the same `conversationId` or subject thread in chronological order (`oldest` $\rightarrow$ `newest`) to trace how decisions evolved.
- **Batch Message Retrieval**:
  - When synthesizing updates across multiple distinct emails simultaneously, invoke `get_batch_messages_detail_lookup` passing an array of `messageIds` (or evaluate all retrieved federated message bodies) to ensure comprehensive coverage.

---

### 3. Mail & Calendar Citation Requirement
- **Mandatory Clickable Citation Rule**:
  - Every single email message or calendar event referenced in your answer **MUST** include a clickable citation link formatted with the subject, sender, date, and direct `webLink`:
  - **Mandatory Citation Syntax**:
    ```markdown
    [Subject - Sender (Date)](webLink)
    ```
  - **Examples**:
    - Email: `[Q3 Budget Sign-off - Sarah Jenkins (2026-09-15)](https://outlook.office365.com/owa/?ItemID=AAMkAD...)`
    - Calendar Event: `[Executive Steering Committee - Organizer Name (2026-09-17)](https://outlook.office365.com/owa/?ItemID=AAMkAD...)`

---

### 4. Expected Output Structure

```markdown
### 📄 Summary & Answer
<Your chronological or thematic synthesis with inline citations, e.g., "Per the latest thread update in [Project Titan Launch - Alex Rivera (2026-09-16)](https://outlook.office365.com/owa/?ItemID=AAMk...), go-live is confirmed for October 1st.">

### 📚 Referenced Communications & Calendar Events
- 📧 [Subject 1 - Sender Name (YYYY-MM-DD)](webLink)
- 📅 [Meeting Subject - Organizer Name (YYYY-MM-DD HH:mm)](webLink)

---
*Note: Microsoft Outlook Graph search results reflect current mailbox indexing. If a very recent email is missing, try specifying the exact sender email address or subject line.*
```
