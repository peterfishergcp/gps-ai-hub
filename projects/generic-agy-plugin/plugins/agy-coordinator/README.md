# AGY Coordinator (`agy-coordinator`)

A zero-dependency Antigravity multi-agent coordinator plugin featuring:

- **Animated Mascot Perch ("Clawy")**: Expressive geometric SVG mascot with natural eye blinks, listening/thinking animations, and voice-driven mouth lip-sync.
- **Live Worker Board & Relay**: Discovers active Antigravity conversations via the local Language Server (`ANTIGRAVITY_LS_ADDRESS` + `ANTIGRAVITY_CSRF_TOKEN`), organizes workers into Groups with pin/label controls, spawns new workers (`agentapi new-conversation`), and relays follow-up instructions (`agentapi send-message`).
- **2-Level `Group -> Goal -> Task` Tracker**: Clean, strict two-level hierarchy persisted locally under `~/.gemini/config/plugin_data/agy-coordinator/state.json`.
- **Editable Persona (`IDENTITY.md` + `SOUL.md`)**: Customize your coordinator's name (default `Clawy`), role, and operating principles directly in the **Identity & Voice** tab or via CLI.
- **Dual-Mode Voice**:
  1. **Browser Instant Voice (Default, zero-key)**: Uses Web Speech API (`SpeechRecognition` + `speechSynthesis`) with live mascot lip-sync.
  2. **Gemini Live API Bridge (`gemini-3.8-live`)**: Loopback Node WebSocket/REST bridge using `GEMINI_API_KEY` (from environment or `0600` user prefs in `~/.gemini/config/plugin_data/agy-coordinator/voice_prefs.json`) or keyless `gcloud auth print-access-token` ADC.

## Opening the Panel

- **Sidebar:** Extensions → **AGY Coordinator**
- **Aux Pane:** Conversation `⋮` menu → Extensions → **AGY Coordinator**
- **Skill Command:** `/agy-coordinator`

## CLI Usage (`scripts/coord_ctl.mjs`)

```bash
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs status
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs workers list
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs groups add --title "Sprint Alpha"
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs goals add --group "<groupId>" --title "Ship v1.0"
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs tasks add --goal "<goalId>" --title "Verify tests"
node ~/.gemini/config/plugins/agy-coordinator/scripts/coord_ctl.mjs board post "Sprint Alpha initialized" --kind progress
```

## Persistent State Location

All data is stored strictly inside `~/.gemini/config/plugin_data/agy-coordinator/`:
- `state.json` — Groups, Goals, Tasks, Worker card metadata, Board feed, and Coordinator chat history
- `IDENTITY.md` — Assistant identity and persona (default name: `Clawy`)
- `SOUL.md` — Operating principles and voice guidelines
- `voice_prefs.json` (`0600`) — Voice mode preferences and optional user-provided `GEMINI_API_KEY`
