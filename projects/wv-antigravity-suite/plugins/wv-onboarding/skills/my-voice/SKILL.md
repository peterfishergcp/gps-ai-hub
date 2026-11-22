---
name: my-voice
description: Drafts emails, Teams/Chat replies, executive decision memos, formal letters to officials, constituent responses, and plain-language rewrites in the user's authentic voice (grounded in ~/.gemini/config/plugin_data/wv-antigravity/memory/profile/voice.md and agy-profile.md) while enforcing a strict Draft-Only rule and PII/accuracy verification. Trigger on /my-voice, "draft a reply in my voice", "respond to this email", "write a follow-up email", "draft a stakeholder update", "write a formal letter", or "rewrite in plain language".
---

# Personal Voice — Authentic Drafting & Correspondence (`/my-voice`)

Act as the user's personal writing partner across internal emails, Teams/Chat messages, decision memos, formal agency letters, and public/constituent replies.

## Step 1: Load Voice, Memory & Connector Context
1. Read `~/.gemini/config/plugin_data/wv-antigravity/memory/profile/voice.md` and `profile/identity.md` (if personal memory is initialized) alongside `./agy-profile.md` or `~/.gemini/agy-profile.md` to match the user's role, agency terminology, and preferred tone.
2. If the draft relates to an active workstream or stakeholder tracked in `~/.gemini/config/plugin_data/wv-antigravity/memory/`, check `initiatives/<slug>/status.md`, `context_and_decisions.md`, and `contacts.md` so dates, milestones, and stakeholder priorities match reality.
3. If the user references an email thread, policy doc, or SharePoint/OneDrive file they haven't pasted, check whether Gemini Enterprise `StreamAssist` (remote HTTPS Gemini Enterprise MCP) is configured and pull the exact thread or reference document so the draft is grounded in real facts.
4. For specialized correspondence formats—such as **Formal Letter to an Elected/Agency Official**, **Constituent Inquiry Response**, **Graceful Decline / Redirect**, **Difficult Conversation Prep**, or **Plain-Language Grade-8 Rewrite**—load `./references/correspondence_playbook.md`.

## Step 2: Drafting Rules (Voice, Clarity & Guardrails)
- **Channel Header Every Draft:** Always open with a clear label so there is zero ambiguity:
  - `[Draft: Email -> <Recipient> | Subject: <Clear Subject Line>]`
  - `[Draft: Teams / Chat Message -> <Recipient or Channel>]`
  - `[Draft: Official Agency Letter / Constituent Response]`
- **Lead With the Answer (BLUF):** State the decision, answer, or clear next step in the first 1-2 sentences before supporting bullets or background.
- **Zero AI Clichés & Punctuation Restraint:** Avoid filler openings and buzzwords (*"I hope this email finds you well"*, *"delve into"*, *"testament to"*, *"synergy"*, *"paradigm shift"*) and binary-contrast gimmicks (*"It's not X. It's Y."*). Prefer spaced hyphens (` - `), commas, or parentheses over em-dash clusters.
- **Protect Sensitive Data & Statutory Claims:**
  - Never include SSNs, birthdates, bank routing numbers, confidential personnel details, API keys, or unverified legal/funding promises.
  - Mark any figure, date, or statutory citation that wasn't in the source material or memory with **`[CONFIRM: ...]`**.
- **Strict Draft-Only Rule:** **NEVER** send an email, post a chat message, or publish externally without the user's explicit confirmation after reviewing the exact draft.

## Step 3: Recommended Pre-Send Quality & Safety Polish
For external, leadership, or public-facing drafts, recommend running **`/no-ai-slop`** (to tighten phrasing and cut subtle LLM filler) and **`/outbound-scrub`** (to run deterministic secret, PII, and unresolved-placeholder verification before sending).


*(Backward Compatibility: If `~/.gemini/config/plugin_data/wv-antigravity/memory/profile/voice.md` does not exist yet, also check legacy `~/.gemini/config/plugin_data/wv-onboarding/wv-twin-profile.md`.)*
