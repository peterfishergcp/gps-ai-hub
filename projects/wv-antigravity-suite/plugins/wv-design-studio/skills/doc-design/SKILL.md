---
name: doc-design
description: Creates print-ready 1-2 page stakeholder flyers, Bottom-Line-Up-Front (BLUF) decision memos, executive summaries, press releases, and plain-language public notices styled in West Virginia brand colors—automatically rendered visually inside Antigravity's Side Pane and launchable in Chrome/Edge in 1 click via the WV Preview sidecar. Trigger on /doc-design, "create a flyer", "one-page decision memo", "executive summary", "press release", or "public notice".
---

# Branded Documents, Flyers & Executive Briefs (`/doc-design`)

Design publication-grade **internal decision documents** and **external stakeholder flyers/notices** with **zero local library installs**—automatically rendering a **visual preview right inside Antigravity's Side Pane** and providing a **1-click Browser / Print-to-PDF launch card** so users never see raw HTML code.

## Step 1: Pick the Deliverable Format
Consult `./references/executive_comms_templates.md` and match the user's goal:
1. **1–2 Page Branded Stakeholder Flyer / Fact Sheet (`flyer.html` -> `Save as PDF`):**
   - Self-contained single-file HTML (all CSS inlined in `<style>...</style>`) using `@page { size: letter portrait; margin: 0.45in; }` (or `letter landscape` for two-column program comparisons like *Mountain State Ready* Loan vs. Grant tiers), WV Navy `#053254` header banner, WV Gold `#D5A245` rule accents, WV Rust `#C1452C` deadline callouts, KPI stat callout boxes, and eligibility/timeline tables, plus a top **Print / Save as PDF** button (`window.print()`).
2. **One-Page Executive Decision Memo (`BLUF`):**
   - Headline recommendation -> Background in 4 sentences -> **Options Comparison Table** (Pros, Cons, Cost, Timeline, Risk) -> Recommended Decision & Sign-Off Block.
3. **Executive Summary of a Long Report / Federal Guidance:**
   - Distills 30–200 page PDFs or federated SharePoint/Drive documents (pulled via `ge_ask_instance`) into a 1-page leadership brief citing exact section/page numbers.
4. **Public Notice, FAQ, or Press Release:**
   - Plain-language (`<= 8th-grade` reading level), clear eligibility/deadline bullets, and verified contact placeholders (`[CONFIRM CONTACT/URL BEFORE PUBLISHING]`).

## Step 2: Cross-Document Fact & Number Check
Before finalizing any flyer or memo, verify every dollar amount, statutory citation, eligibility tier, and deadline against the user's source document (or `ge_ask_instance` retrieval) and flag any discrepancy across drafts!

## Step 3: Mandatory Visual Preview & 1-Click Browser Launch (NEVER Link Raw Workspace `flyer.html` as the Preview!)
> **CRITICAL UX RULE:** Clicking a workspace file link like `[flyer.html](file:///.../flyer/flyer.html)` opens the **Code Editor** (raw HTML source code) instead of the rendered flyer!

Whenever you generate an HTML flyer, fact sheet, or formatted decision memo, always complete these 2 steps before replying:
1. **Write the Rendered Visual Flyer/Memo Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Write the self-contained single-file HTML directly to `<appDataDir>/brain/<conversation-id>/<doc_name>_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Rendered print-ready West Virginia stakeholder flyer / decision memo preview",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
   - Clicking this Artifact Card in chat opens the **rendered visual flyer/memo** in Antigravity's right-hand Side Pane!
2. **Register with `WV Preview` Sidecar & Create a 1-Click Browser / Print-to-PDF URL Card (`.url.json`):**
   - Run:
     ```bash
     node <skill_dir>/../../scripts/register_deliverable.mjs --file <target>/flyer.html --kind doc --title "<Document Title>"
     ```
   - Using the `LIVE_PREVIEW_URL=http://127.0.0.1:4175/view/doc-...` output, use `write_file` to create `<appDataDir>/brain/<conversation-id>/Launch Flyer in Browser.url.json` with `ArtifactMetadata: { "Summary": "1-click browser launch & Print to PDF", "UserFacing": true, "RequestFeedback": false }`:
     ```json
     {
       "url": "http://127.0.0.1:4175/view/<id>",
       "title": "Launch Branded Flyer / Memo in Browser (Print / Save as PDF)",
       "description": "Opens the rendered print-ready document in Chrome/Edge with zero terminal prompts."
     }
     ```
3. **In Your Reply (Inline `<agent-embed>` + Rendered Links Only — ZERO `</> flyer.html` Code Links!):**
   - Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/<doc_name>_preview.html"></agent-embed>` in your chat response, and link **ONLY** to `[Open Rendered Flyer in Side Pane](file:///<appDataDir>/brain/<conversation-id>/<doc_name>_preview.html)` and `[Launch Branded Flyer in Browser](http://127.0.0.1:4175/view/<id>)`. **NEVER** create a `file://` link to the workspace `flyer.html` or `index.html` (which opens raw HTML source code in the Code Editor).
