---
name: slides
description: Generates zero-install, responsive 16:9 HTML/CSS executive presentation decks (with keyboard navigation, speaker notes drawer, screenshot palette matching, official West Virginia Navy/Rust/Gold styling, and crisp Print-to-PDF export) plus PowerPoint/Google Slides outlines. Trigger on /slides, "build a slide deck", "create a presentation", or "turn this memo into slides".
---

# Zero-Install Executive Presentation Builder (`/slides`)

Create polished, executive-ready **16:9 presentation decks** that open directly in **Chrome or Microsoft Edge** (`file://`) and export cleanly via **Ctrl/Cmd+P -> Save as PDF (Landscape)**—requiring **zero `python-pptx`, `Node.js`, or local libraries** on locked-down West Virginia laptops.

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
- **16:9 Viewport + Print Page Breaks:** Each `<section class="slide">` renders full-bleed `16:9` on screen with `Left/Right` arrow navigation, slide counter (`3 / 8`), and a toggleable **Speaker Notes (`N` key)** bar—and includes `@media print { @page { size: 13.333in 7.5in; margin: 0; } .slide { break-after: page; } }` so `Save as PDF` produces pixel-perfect landscape slides!
- **One Idea Per Slide:** Max `4` bullets or `3` visual cards/metrics per slide (`>= 20px` body font); put detailed talking points inside each slide's speaker notes rather than crowding the slide.
- **Secure DOM Only:** Use static HTML + `textContent` / `classList` toggling for slide navigation—never `innerHTML` or external CDN scripts.
- Also include a companion `deck-outline.md` with slide titles, bullets, and speaker notes for easy copy-paste into Google Slides or PowerPoint when needed.
