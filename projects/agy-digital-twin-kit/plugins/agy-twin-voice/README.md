# AGY Twin Voice, Anti-Slop & Outbound Guardrails (`agy-twin-voice`)

Keeps every email, chat message, memo, and external deliverable sounding like a real human specialist - while enforcing Draft-Only safety and scanning outbound text for exposed credentials, PII, or unresolved placeholders.

## Included Capabilities

- **Always-On Writing & Safety Rules (`rules/AGENTS.md`):** Enforces BLUF clarity, `[Draft-Only]` channel headers, punctuation restraint, and zero AI clichés across every turn.
- **Slash Skills:**
  - `/twin-voice-draft`: Drafts stakeholder emails, Teams/Chat messages, formal agency letters, and executive memos calibrated to `~/antigravity-twin/memory/profile/voice.md`.
  - `/no-ai-slop`: Rewrites or audits drafts to eliminate 17 common LLM filler patterns while preserving exact numbers, dates, flags, and citations.
  - `/outbound-scrub`: Runs `scripts/scrub_and_slop_scanner.mjs` to catch leaked secrets/tokens, SSNs, unresolved `[CONFIRM: ...]` markers, and filler phrasing before external sharing.
- **Optional Deterministic Lifecycle Hooks (`hooks.json`):** Fast `< 50ms` `PreToolUse` safety gate (`pre_tool_guardrails.mjs`, shipped disabled by default for zero-Node corporate laptops and one-click toggleable on developer workstations).
