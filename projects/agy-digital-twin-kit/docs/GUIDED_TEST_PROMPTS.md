# Antigravity Digital Twin & Second Brain Kit - Guided Test Prompts (`v1.0.1`)

Use these 7 self-contained test prompts inside **Google Antigravity** right after installing the kit. Every prompt runs on synthetic sample data with zero live constituent, customer, or production credentials required.

## Quick Verification Before Starting

1. Open **Google Antigravity** and check **Extensions -> Twin Vault** on the left sidebar (or open **Twin Vault** from the `+` panel menu in any chat).
2. Confirm you see the 5 tabs (**Overview**, **GTD Board**, **Initiatives**, **Stakeholders**, **Markdown Files**) and can click any `.md` file to view what Antigravity stores on disk.

---

## Prompt 1 (Everyone - Start Here): Role-Adaptive Second Brain Setup (`/twin-setup`)

Pick the role line that best matches your day-to-day work (`pm`, `developer`, `public-sector`, or `leader`) and paste into Antigravity:

```text
/twin-setup Initialize my Second Brain memory vault using the "public-sector" preset for Jordan Taylor (Senior Program Analyst, State Office of Broadband & Digital Equity, timezone America/New_York) with demo initiatives enabled, then summarize what files were created in ~/antigravity-twin/memory/.
```

**What success looks like:** Antigravity creates `profile/{identity,portfolio,playbooks,voice}.md`, `gtd_board.md`, `contacts.md`, and 4-file folders under `initiatives/`, and **Twin Vault** updates immediately when you click **Refresh**.

---

## Prompt 2 (Everyone): Morning Workday Kickoff & Stale Relationship Check (`/twin-brief`)

```text
/twin-brief Run my morning kickoff brief from my Second Brain vault. Highlight my Top 3 actions for today, open P0/P1 commitments, and any stakeholders in contacts.md who are over 21 days since last touch.
```

**What success looks like:** A concise 4-part brief anchored in `America/New_York` surfacing `P0` tasks first and flagging `STALE (>21d)` contacts with an offer to draft a check-in.

---

## Prompt 3 (Everyone): Meeting Notes Compaction & Zero-Decay GTD Extraction (`/twin-meeting-notes`)

```text
/twin-meeting-notes Ingest these call notes into my "broadband-grant-round-3" initiative, update running_notes.md and contacts.md, and add every open action item to gtd_board.md:

"Call: Round 3 County Grant Intake Review (Attendees: Carla Jennings, Robert Vance).
1. Confirmed the $15M total award cap and Dec 31, 2026 submission deadline across all county PDFs.
2. Robert Vance noted rural applicants need a 1-page sample match-waiver calculation worksheet by Friday.
Action items:
- [ ] Draft 1-page sample match-waiver calculation worksheet for county applicants
- [ ] Confirm FAQ Spanish translation timeline with Communications lead"
```

**What success looks like:** `initiatives/broadband-grant-round-3/running_notes.md` gets a clean Tier-1 (`0-7d`) entry, both `- [ ]` tasks appear on `gtd_board.md` without overwriting prior tasks, and Robert Vance's `Last_Touch_Date` updates to today (clearing his `STALE (>21d)` badge).

---

## Prompt 4 (Everyone): Pre-Meeting Brief & Adversarial Minto SCQA Critic (`/twin-jit-prep`)

```text
/twin-jit-prep I have a 30-minute review in 15 minutes with Senior Assistant General Counsel Hannah Kim on "records-modernization-pilot". Build my 1-card JIT brief and an Adversarial Minto SCQA Critic ("Angle & Pushback to Watch For") from her legal and public-records risk perspective.
```

**What success looks like:** A 1-page brief showing Where We Left Off, open commitments, and a realistic SCQA red-team section (*Situation -> Complication -> Hard Question Expecting You -> Evidence-Backed Counter-Move*).

---

## Prompt 5 (Everyone): Anti-AI-Slop Rewrite & Outbound Safety Scrub (`/no-ai-slop` + `/outbound-scrub`)

```text
Run /no-ai-slop and /outbound-scrub on this draft email before I send it externally:

"First and foremost, in today's fast-paced and ever-evolving landscape, I wanted to delve into our paradigm-shifting grant portal rollout - it's not just an upgrade, it's a game changer! Please verify the final award ceiling [CONFIRM: $15M or $18M?] and timeline [TODO: insert Q4 cutoff date]. At the end of the day, this ensures holistic synergy across stakeholders."
```

**What success looks like:** `/outbound-scrub` flags the unresolved `[CONFIRM: ...]` and `[TODO: ...]` markers plus the AI-slop phrases, and `/no-ai-slop` rewrites the message into a clean, human `[Draft: Email -> ...]` block.

---

## Prompt 6 (Program Managers, Architects & Analysts): 4-Agent Parallel Swarm Prep (`/twin-swarm-prep`)

```text
/twin-swarm-prep Run a 4-agent parallel 360 prep pack for our Thursday milestone review on "broadband-grant-round-3" (covering vault status, an L100-L300 talk track with a Mermaid workflow diagram, SCQA pushback, and a pre-scrubbed [Draft-Only] stakeholder recap).
```

**What success looks like:** Four subagents (`context-memory-scout`, `scqa-redteam-critic`, `domain-solution-architect`, `outbound-safety-auditor`) run in parallel and return one cohesive prep pack.

---

## Prompt 7 (Everyone): Friday 3-Altitude Impact Summary & Scheduled Automations (`/twin-weekly-impact` + `/twin-automations`)

```text
1. Run /twin-weekly-impact to generate this week's 3-Altitude impact summary into weekly/ and impact/ledger.json.
2. Run /twin-automations to set my scheduled automations timezone to America/New_York and show me where to enable Morning Twin Kickoff Brief in the Automations dashboard.
```

**What success looks like:** Saves `weekly/YYYY-WXX.md` across Altitude 1 (Executive Outcomes), Altitude 2 (Reusable Assets), and Altitude 3 (Workstream Velocity), updates `impact/ledger.json`, and provides the one-click **Automations Dashboard** link (`sidecar://dashboard`).
