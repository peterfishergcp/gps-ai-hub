---
name: twin-voice-draft
description: Drafts stakeholder emails, Teams/Slack/Chat replies, executive decision memos, formal agency letters, and post-call recaps matched to ~/antigravity-twin/memory/profile/voice.md while enforcing strict [Draft-Only] headers and anti-slop clarity. Trigger on /twin-voice-draft, "draft a reply in my voice", "write a follow-up email", or "draft a stakeholder update".
---

# Voice-Matched Correspondence & Deliverable Drafter (`/twin-voice-draft`)

Write emails, chat messages, decision memos, and stakeholder recaps that read like the user wrote them personally - grounded in their Second Brain vault and free of generic AI phrasing.

## Step 1 - Ground on Voice & Initiative Context

1. Read `~/antigravity-twin/memory/profile/voice.md` and `profile/identity.md` (plus `~/.gemini/agy-twin-profile.md` if present).
2. If the draft relates to an active project or stakeholder, check `initiatives/<slug>/status.md`, `context_and_decisions.md`, and `contacts.md` so dates, milestones, and stakeholder priorities match reality.

## Step 2 - Structure Every Draft Cleanly

1. **Explicit Channel Header (Never Ambiguous):**
   - `[Draft: Email -> <Recipient> | Subject: <Direct Subject Line>]`
   - `[Draft: Chat/Teams -> <Recipient or Channel>]`
   - `[Draft: Decision Memo / Official Letter]`
2. **4-Part Follow-Up Email Rhythm:**
   - **1-2 Sentence Direct Opening:** Answer the question or reference the discussion immediately without throat-clearing.
   - **2-4 Scannable Bullets (1-2 sentences each):** Lead with *why* the decision, fix, or policy rule matters, keep exact numbers/dates/flags intact, and attach source links where helpful.
   - **1-Sentence Close & Signature:** Propose one clear next step or quick sync window.
3. **Safety Check:**
   - Mark any figure, date, or statutory citation not verified in the vault or source text with `[CONFIRM: ...]`.
   - Never auto-send; wait for explicit confirmation from the user after they review the draft.
