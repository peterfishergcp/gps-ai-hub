---
name: twin-jit-prep
description: T-15m Pre-Meeting Just-In-Time (JIT) Brief & Adversarial Minto Pyramid (SCQA) Coach. Reads the target initiative's 4-file vault (initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md), gtd_board.md, and contacts.md to build a 1-card briefing plus an "Angle & Pushback to Watch For" SCQA red-team section. Trigger on /twin-jit-prep, "jit prep", "15-minute brief for", "prep me for my next meeting", or "SCQA critic for".
---

# T-15m Pre-Meeting Brief & Adversarial SCQA Coach (`/twin-jit-prep`)

Give the user a 60-second read before stepping into a stakeholder review, technical design session, vendor negotiation, or leadership readout.

## Step 1 - Pull 4-File Initiative & Stakeholder Context

1. Match the named meeting or topic to its folder under `~/antigravity-twin/memory/initiatives/<slug>/` (or pick the highest-priority `AMBER`/`RED`/`P0` initiative if none was specified; if no vault exists yet, build the brief from pasted context or offer `/twin-memory init`).
2. Read:
   - `initiatives/<slug>/status.md` & `running_notes.md` (focusing on Tier 1 `0-7d` notes)
   - `initiatives/<slug>/context_and_decisions.md` & `stakeholders.md`
   - Matching open `[ ]` items in `~/antigravity-twin/memory/gtd_board.md` and `Last_Touch_Date` in `contacts.md`.
3. If a Calendar or Federated Gemini Enterprise MCP (`agy-ge-bridge`) is connected, pull the invite agenda and most recent email/chat exchange with the attendees.

## Step 2 - Produce the 1-Card JIT Brief + Adversarial SCQA Critic

Use this crisp layout (anchored in the user's timezone from `profile/identity.md` or `agy-twin-profile.md`):

```markdown
## JIT Pre-Meeting Brief: <Meeting or Initiative Title>

- **RAG & Next Milestone:** `<GREEN | AMBER | RED>` - <Next Milestone>
- **Key Attendees & Priorities:** <Names, Roles, Priorities, and Last Touch from stakeholders.md / contacts.md>
- **Where We Left Off (0-7d Notes):**
  - <1-2 bullets on latest progress and agreed constraints>
- **Open Commitments (`gtd_board.md`):**
  - <Matching open [ ] tasks>

### Angle & Pushback to Watch For (Adversarial Minto SCQA Critic)
- **Situation (Their Baseline):** <What the skeptical sponsor, security lead, counsel, or architect currently assumes or runs>
- **Complication (Likely Pushback):** <Specific cost, schedule, compliance, statutory, or reliability concern they will raise today>
- **Hard Question Expecting You:** "<Exact tough question phrased in their voice>"
- **Counter-Move & Proof Point:** <Concrete architectural guardrail, contract clause, budget cap, or phased fallback that resolves the concern>
```

End by asking if the user wants a pre-staged `[Draft-Only]` post-call recap skeleton via **`/digital-twin`** ready to fill in right after the meeting.
