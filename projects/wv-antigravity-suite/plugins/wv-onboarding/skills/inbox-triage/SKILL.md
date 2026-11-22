---
name: inbox-triage
description: Triages unread emails (Outlook or Gmail via Federated Gemini Enterprise or pasted exports) and operational incident reports against explicit written threshold rules—separating Immediate Leadership Escalations, Action Required Today, Waiting/FYI, and Fail-Safe Unreadable Holds. Trigger on /inbox-triage, "triage my inbox", "triage these incident reports", or "find follow-ups I owe".
---

# Rule-Driven Inbox & Incident Report Triage (`/inbox-triage`)

Sort high-volume email queues or operational field reports deterministically using **explicit threshold rules**—modeled on the GPS Public Sector Inbox Triage playbook and West Virginia's operational incident triage standard.

## Step 1: Retrieve Messages & Active Threshold Rules
1. **Check Federated GE Instance First (remote HTTPS Gemini Enterprise MCP):**
   - If Gemini Enterprise `StreamAssist` is configured, query unread or recent messages from the user's federated **Outlook** or **Gmail** connector (default window: last 24–72 hours, or user-specified query/sender/folder), requesting message subject, sender, timestamp, attachment names, and key body excerpt.
   - If no connector is active yet, process pasted threads, `.eml` files, `.csv` logs, or folder documents directly (and mention `/connect-ge` as a 1-step option for live Outlook/Gmail access).
2. **Apply Explicit 4-Bucket Triage Rules** (use custom agency rules if the user provides a policy doc, otherwise apply this baseline):
   - **Bucket 1 — Immediate Director / Leadership Alert (`[URGENT ESCALATION]`):**
     - Life/safety incidents, injuries, environmental/mine/facility hazards, statutory FOIA/legal deadlines (`<= 5 business days`), media or legislative inquiries, system outages, or budget/audit exceptions above threshold.
   - **Bucket 2 — Action Required by User (`[ACTION TODAY / THIS WEEK]`):**
     - Direct questions, approvals, sign-offs, grant/contract deliverables, or overdue follow-ups where the user is in the `To:` line or explicitly asked to act.
   - **Bucket 3 — Fail-Safe Hold (`[MANUAL REVIEW — UNREADABLE ATTACHMENT / AMBIGUOUS]`):**
     - **CRITICAL FAIL-SAFE RULE:** Never auto-dismiss or mark "routine" any message with a scanned image PDF, password-protected file, truncated attachment, or ambiguous severity. Route it to **Manual Review** so zero critical incidents slip through silently.
   - **Bucket 4 — Routine / FYI (`[DIGEST / ARCHIVE CANDIDATE]`):**
     - Automated notifications, newsletters, CC-only status updates with zero action requested.

## Step 2: Output Format
1. **Executive Triage Table:** `Priority Bucket | Sender & Subject | Date/Time | Triggered Rule / Reason | Recommended Action`
2. **Pre-Drafted Replies for Top Bucket 1 & 2 Items:** Offer concise `[Draft Only]` responses (or invoke `/digital-twin` for full voice-matched replies).
3. **Follow-Up Radar:** Call out any outbound request the user sent earlier in the thread that still lacks a reply.
