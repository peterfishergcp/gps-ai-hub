---
name: agy-coordinator
description: Multi-Agent Command Center & Gemini Live Voice Hub ("Clawy") for triaging active Antigravity agent conversations (Needs You, Working, Ready for Review, Idle), popping conversations open side-by-side, closing idle chats, organizing 2-level Group -> Goal -> Task sprints, and customizing IDENTITY.md / SOUL.md + Kore Gemini Live Voice inside ~/.gemini/config/plugin_data/agy-coordinator/. Use when a user says /agy-coordinator, asks to coordinate multiple agents, check which agent needs attention, track Group -> Goal -> Task progress, or open the Clawy panel.
---

# Clawy — Multi-Agent Command Center (`/agy-coordinator`)

Coordinates parallel Antigravity agent conversations (`🤖 Agents`), side-by-side split pop-outs (`↗ Pop Out`), live attention triage (`🔔 Updates` / `Notifications`), strict 2-level **Group -> Goal -> Task** sprints, and `Kore` Gemini Live voice commands inside `~/.gemini/config/plugin_data/agy-coordinator/`.

## Quick CLI Reference (`coord_ctl.mjs`)

Run commands with Node against `~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs`:

```bash
COORD_CTL="${HOME}/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs"

# 1. Overall coordinator snapshot (LS status, counts, persona, voice readiness)
node "$COORD_CTL" status

# 2. List live Antigravity worker conversations merged with local Group/Pin/Label tags
node "$COORD_CTL" workers list

# 3. Spawn a new isolated worker conversation or relay an instruction
node "$COORD_CTL" workers spawn --group "group-default" --title "API Audit" --prompt "Audit auth endpoints and report back"
node "$COORD_CTL" workers relay --id "<conversation-id>" --message "Focus on input validation first"

# 4. Manage strict 2-level Group -> Goal -> Task hierarchy
node "$COORD_CTL" groups add --title "Sprint Alpha"
node "$COORD_CTL" goals add --group "<group-id>" --title "Complete integration tests"
node "$COORD_CTL" tasks add --goal "<goal-id>" --title "Verify loopback routes"
node "$COORD_CTL" tasks toggle --id "<task-id>"

# 5. Post a 1-line progress update to the coordinator board
node "$COORD_CTL" board post "Completed auth audit" --kind progress

# 6. Read or update Assistant Identity (default name: Clawy)
node "$COORD_CTL" identity get
node "$COORD_CTL" identity set --name "Clawy" --role "Multi-Agent Coordinator"
```

## Opening the Interactive Panel

Direct the user to:
- **Left Sidebar:** `Extensions -> AGY Coordinator`
- **Conversation Aux Pane:** Top-right `⋮` menu `-> Extensions -> AGY Coordinator`

Inside the panel, users can watch **Clawy** on the animated mascot perch, use **Browser Instant Voice** (zero-key Web Speech) or **Gemini Live (`gemini-3.8-live`)**, manage Workers & Goals, and edit `IDENTITY.md` / `SOUL.md`.
