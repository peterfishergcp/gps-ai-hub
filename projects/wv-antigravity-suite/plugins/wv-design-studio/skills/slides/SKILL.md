---
name: slides
description: Generates zero-install, responsive 16:9 HTML/CSS executive presentation decks (with keyboard navigation, speaker notes drawer, screenshot palette matching, official West Virginia Navy/Rust/Gold styling, and crisp Print-to-PDF export) that render visually inside Antigravity's Side Pane and launch in Chrome/Edge in 1 click via the WV Preview sidecar. Trigger on /slides, "build a slide deck", "create a presentation", or "turn this memo into slides".
---

# Zero-Install Executive Presentation Builder (`/slides`)

Create polished, executive-ready **16:9 presentation decks** that **render visually right inside Antigravity's Side Pane AND open in Chrome or Microsoft Edge in 1 click** (`Ctrl/Cmd+P -> Save as PDF (Landscape)`)—never showing raw HTML code and requiring zero local libraries on West Virginia laptops.

## Step 1: Narrative Arc & Visual Theme
1. **Consultative Storyline (`5–10` Slides Default):**
   - Slide 1: **Title, Agency/Program Eyebrow & Decision Headline**
   - Slide 2: **Executive Summary (3 Key Takeaways / Metrics)**
   - Slides 3–6: **Problem / Context, Architecture or Program Comparison, Data Callouts & Timeline**
   - Slide 7: **Risks, Guardrails & Mitigations**
   - Final Slide: **Clear Decisions Needed, Owners & Next 30-Day Milestones**
2. **Brand Palette:**
   - Default to West Virginia Official (`#053254` Navy primary, `#C1452C` Rust accent, `#D5A245` Gold highlight, `#F4F6F8` canvas, `#FFFFFF` cards, `Fira Sans` / system sans-serif). If the user provides a reference screenshot, extract its exact hex tokens via `wv-design-architect`.

## Step 2: Author Self-Contained `deck.html` (Zero External JS Dependencies)
Generate `<target>/deck.html` following strict security & print rules:
- **100% Self-Contained Single File:** Inline all CSS (`<style>...</style>`) and slide-navigation JS (`<script>...</script>`) inside `deck.html` so it has zero external `.css` or `.js` file dependencies.
- **16:9 Viewport + Print Page Breaks:** Each `<section class="slide">` renders full-bleed `16:9` on screen with `Left/Right` arrow navigation, Prev/Next toolbar buttons, slide counter (`3 / 8`), and a toggleable **Speaker Notes (`N` key)** bar—and includes `@media print { @page { size: 13.333in 7.5in; margin: 0; } .slide { break-after: page; } }` so `Save as PDF` produces pixel-perfect landscape slides!
- **One Idea Per Slide:** Max `4` bullets or `3` visual cards/metrics per slide (`>= 20px` body font); put detailed talking points inside each slide's speaker notes rather than crowding the slide.
- **Secure DOM Only:** Use static HTML + `textContent` / `classList` toggling for slide navigation—never `innerHTML` or external CDN scripts.
- Also write a companion `<target>/deck-outline.md` with slide titles, bullets, and speaker notes for easy copy-paste into Google Slides or PowerPoint.

## Step 3: Mandatory Visual Preview & 1-Click Browser Launch (NEVER Link Raw Workspace `deck.html` as the Preview!)
> **CRITICAL UX RULE:** Clicking a workspace file link like `[deck.html](file:///.../slides/deck.html)` opens the **Code Editor** (raw HTML source code) instead of the rendered slide deck!

Always complete these 2 steps before replying:
1. **Write the Rendered Visual Slide Deck Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Write the exact self-contained `deck.html` content to `<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Interactive rendered 16:9 executive slide deck (use Left/Right arrows or Prev/Next buttons; press N for speaker notes)",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
   - Clicking this Artifact Card in chat opens the **rendered interactive slide deck** right in Antigravity's Side Pane!
2. **Register with `WV Preview` Sidecar & Create a 1-Click Browser Launch URL Card (`.url.json`):**
   - Run:
     ```bash
     node <skill_dir>/../../scripts/register_deliverable.mjs --file <target>/deck.html --kind slides --title "<Deck Title>"
     ```
   - Using the `LIVE_PREVIEW_URL=http://127.0.0.1:4175/view/slides-...` output, use `write_file` to create `<appDataDir>/brain/<conversation-id>/Launch Slide Deck in Browser.url.json` with `ArtifactMetadata: { "Summary": "1-click browser launch & Print to PDF", "UserFacing": true, "RequestFeedback": false }`:
     ```json
     {
       "url": "http://127.0.0.1:4175/view/<id>",
       "title": "Launch 16:9 Slide Deck in Browser (Full Screen / Save as PDF)",
       "description": "Opens the rendered presentation deck in Chrome/Edge with zero terminal prompts."
     }
     ```
3. **In Your Reply (Inline `<agent-embed>` + Rendered Links Only — ZERO `</> deck.html` Code Links!):**
   - Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html"></agent-embed>` in your chat response, and link **ONLY** to `[Open Rendered Slides in Side Pane](file:///<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html)` and `[Launch 16:9 Slide Deck in Browser](http://127.0.0.1:4175/view/<id>)`. **NEVER** create a `file://` link to the workspace `deck.html` or `index.html` (which opens raw HTML source code in the Code Editor).
