---
name: meeting-notes
description: Ingests meeting transcripts, Gemini Meet Notes, Teams/Zoom summaries, or raw call notes into ~/.gemini/config/plugin_data/wv-antigravity/memory/, strips embedded base64 bloat, applies 4-Tier Recency Compaction (0-7d, 8-30d, 31-90d, 90d+) to initiatives/<slug>/running_notes.md, extracts open action items into action_items.md, and updates Last_Touch_Date in contacts.md. Trigger on /meeting-notes, "sync my meeting notes", "compact these call notes", or "extract action items from this transcript".
---

# Meeting Notes Harvester & Action Item Extractor (`/meeting-notes`)

Turn messy meeting transcripts, shared call notes, or pasted summaries into structured, compacted workspace memory and suggested to-dos without bloating future context windows.

## Step 1 - Gather Transcript or Meeting Notes

1. **Pasted or Local File Input:** If the user pasted call notes or pointed to local `.md` / `.txt` / `.vtt` files, read them directly.
2. **Connected MCP Sources (Optional):** If a remote HTTPS Gemini Enterprise MCP gateway (`StreamAssist`) or a Drive/SharePoint/Mail MCP is active and the user asks to pull recent meeting notes (such as *"Notes by Gemini"* or Teams meeting recaps), search **both** user-owned and shared-with-me documents from the requested window.
3. Strip any inline `data:image/...;base64,...` blobs so Markdown files stay under `15 KB` of clean text (or run `node ~/.gemini/config/plugins/wv-second-brain/scripts/vault_cli.mjs ingest-notes --slug "<slug>" --title "<Title>" --file <path>` when `node` is on `PATH`).

## Step 2 - Update Initiative Topics & Action Items

Map each meeting to its matching folder under `~/.gemini/config/plugin_data/wv-antigravity/memory/initiatives/<slug>/` (create a new 4-file folder if a new project or workstream appears). See `./references/compaction_rubric.md` for detailed examples:

1. **`initiatives/<slug>/running_notes.md` (4-Tier Recency Compaction):**
   - **Tier 1 (`0-7 Days`):** Prepend dated summary, key stakeholder objections/quotes, and concrete next steps.
   - **Tier 2 (`8-30 Days`):** Compact entries older than 7 days into 3-5 crisp bullets per session.
   - **Tier 3 (`31-90 Days`):** Roll 31-90 day bullets into dated architectural, policy, or program milestones.
   - **Tier 4 (`90+ Days`):** Distill permanent historical background into one concise paragraph.
2. **`initiatives/<slug>/context_and_decisions.md` & `status.md`:**
   - Record any newly agreed technical specs, budget caps, deadlines, or `GREEN` / `AMBER` / `RED` status shifts.
3. **`action_items.md`:**
   - Append every open action item using `- [ ] [<slug>] <Verb + Deliverable> [Owner: <Name>] (Added: YYYY-MM-DD)`.
   - If the transcript confirms an existing `[ ]` item in `action_items.md` was completed, mark it `[x]`.
4. **`contacts.md`:**
   - Update `Last_Touch_Date` (`YYYY-MM-DD`) for every attendee on the call and clear any `STALE (>21d)` flag.

## Step 3 - Output Summary & Optional Follow-Up Draft

Return a short summary showing updated files, newly added `[ ]` action items, and an offer to generate a `[Draft-Only]` post-meeting recap via **`/my-voice`**.
