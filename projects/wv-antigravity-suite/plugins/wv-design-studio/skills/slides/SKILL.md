---
name: slides
description: Generates zero-install, responsive 16:9 HTML/CSS executive presentation decks (with keyboard navigation, speaker notes drawer, screenshot palette matching, official West Virginia Navy/Rust/Gold styling, and built-in Download HTML & Print-to-PDF buttons) that render visually inside Antigravity's Side Pane with zero Python, zero Node server, and zero 127.0.0.1 firewall issues. Trigger on /slides, "build a slide deck", "create a presentation", or "turn this memo into slides".
---

# Zero-Install Executive Presentation Builder (`/slides`)

Create polished, executive-ready **16:9 presentation decks** that **render visually right inside Antigravity's Side Pane with zero web server, zero Python, and zero `127.0.0.1` firewall issues**—and include built-in **`Download HTML ↗`** and **`Print / Save as PDF`** toolbar buttons.

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
- **Top Control Bar with `Print / Save as PDF` & `Download HTML ↗`:** Include `Prev`, `Next`, `Notes (N)`, `Print / Save as PDF` (`window.print()`), and `Download HTML ↗` (which downloads `new Blob(['<!doctype html>\n' + document.documentElement.outerHTML], {type: 'text/html'})` as `wv-slides-deck.html` so the user can open it in full-screen Chrome/Edge with zero web server!).
- **16:9 Viewport + Print Page Breaks:** Each `<section class="slide">` renders full-bleed `16:9` on screen with `Left/Right` arrow navigation and includes `@media print { @page { size: 13.333in 7.5in; margin: 0; } .slide { break-after: page; } }`.
- **One Idea Per Slide & Secure DOM Only:** Max `4` bullets or `3` visual cards/metrics per slide (`>= 20px` body font); use static HTML + `textContent` / `classList` toggling—never `innerHTML` or external CDN scripts.
- Also write a companion `<target>/deck-outline.md` for easy copy-paste into Google Slides or PowerPoint.

## Step 3: Mandatory Serverless Visual Preview (ZERO `127.0.0.1` `.url.json` Cards & ZERO Workspace `deck.html` Code Links!)
> **CRITICAL UX & FIREWALL RULE:**
> - **NEVER create `.url.json` artifacts pointing to `http://127.0.0.1:...` or `http://localhost:...`** (causes `ERR_CONNECTION_REFUSED` on corporate laptops).
> - **NEVER link workspace `[deck.html](file:///.../slides/deck.html)` in chat** (opens raw HTML source code in the Code Editor!).

Always complete these 2 serverless steps before replying:
1. **Write the Rendered Visual Slide Deck Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Write the exact self-contained `deck.html` content directly to `<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Interactive rendered 16:9 executive slide deck (use Left/Right arrows or Prev/Next buttons; click 'Download HTML' or 'Print / Save as PDF' in the toolbar)",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
2. **In Your Reply (Inline `<agent-embed>` + Artifact Link Only):**
   - Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html"></agent-embed>` in your chat response, and link **ONLY** to `[Open Rendered Slide Deck in Side Pane](file:///<appDataDir>/brain/<conversation-id>/<deck_name>_slides_preview.html)`.
