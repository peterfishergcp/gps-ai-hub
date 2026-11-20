---
name: twin-swarm-prep
description: Multi-agent parallel orchestrator for Google Antigravity. Fans out 4 specialized subagents concurrently (context-memory-scout, scqa-redteam-critic, domain-solution-architect, outbound-safety-auditor) via invoke_subagent to compress 45-minute milestone prep, red-team review, architecture/program design, and outbound safety auditing into a ~60-second parallel pass. Trigger on /twin-swarm-prep, "run a swarm prep", "parallel prep for", or "360 prep pack".
---

# 4-Agent Parallel Swarm Orchestrator (`/twin-swarm-prep`)

Orchestrate the 4 subagents bundled in `agy-second-brain/agents/` in parallel so complex meeting, milestone, or deliverable preparation runs concurrently without bloating the main conversation window.

## Bundled Subagent Roster

| Subagent `TypeName` | Model | Role |
| :--- | :--- | :--- |
| `context-memory-scout` | `flash` | Reads `~/antigravity-twin/memory/` (`gtd_board.md`, `contacts.md`, `initiatives/<slug>/`) + connected MCP context |
| `scqa-redteam-critic` | `inherit` | Builds the Adversarial Minto Pyramid (SCQA) Critic (*Situation -> Complication -> Hard Questions -> Counter-Moves*) |
| `domain-solution-architect` | `inherit` | Authors the altitude-matched (`L100-L400`) talk track, `mermaid` diagram, and phased execution plan |
| `outbound-safety-auditor` | `flash` | Drafts the `[Draft-Only]` stakeholder follow-up recap and runs `agy-second-brain/scripts/scrub_and_slop_scanner.mjs` (or inline regex checks) |

*(Fallback: If any custom subagent name is not yet loaded before a window reload, invoke `TypeName: "self"` with the exact `Role` and `Model` above in parallel.)*

## Playbook 1: 360-Degree Pre-Meeting / Milestone Prep

1. Launch all 4 subagents concurrently via `invoke_subagent` targeting the specified initiative or meeting.
2. Stop calling tools and wait for reactive wakeup as all 4 subagents return their findings.
3. Combine their outputs into one clean, structured **360 Prep Pack** (Executive Context, Talk Track + Mermaid Diagram, SCQA Pushback & Counter-Moves, and Pre-Scrubbed `[Draft-Only]` Follow-Up Recap).

## Playbook 2: Post-Meeting Blitz

Immediately after a meeting or review:
1. Fan out `context-memory-scout` (identify GTD and initiative deltas), `domain-solution-architect` (capture reusable patterns for `topics/`), and `outbound-safety-auditor` (prepare the `[Draft-Only]` external recap).
2. Update `initiatives/<slug>/running_notes.md` and `gtd_board.md` once results return.
