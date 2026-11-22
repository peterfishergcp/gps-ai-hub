---
name: doc-design
description: Creates print-ready 1-2 page stakeholder flyers, Bottom-Line-Up-Front (BLUF) decision memos, executive summaries, press releases, and plain-language public notices styled in West Virginia brand colors—automatically rendered visually inside Antigravity's Side Pane with zero Python, zero Node server, and zero 127.0.0.1 firewall issues. Trigger on /doc-design, "create a flyer", "one-page decision memo", "executive summary", "press release", or "public notice".
---

# Branded Documents, Flyers & Executive Briefs (`/doc-design`)

Design publication-grade **internal decision documents** and **external stakeholder flyers/notices** with **zero local library installs**—rendering a **100% serverless visual preview right inside Antigravity's Side Pane** with built-in **`Download HTML ↗`** and **`Print / Save as PDF`** toolbar buttons so users never see raw HTML code or `127.0.0.1` connection errors.

## Step 1: Pick the Deliverable Format
Consult `./references/executive_comms_templates.md` and match the user's goal:
1. **1–2 Page Branded Stakeholder Flyer / Fact Sheet (`flyer.html` -> `Save as PDF`):**
   - Self-contained single-file HTML (all CSS inlined in `<style>...</style>`) using `@page { size: letter portrait; margin: 0.45in; }`, WV Navy `#053254` header banner, WV Gold `#D5A245` rule accents, WV Rust `#C1452C` deadline callouts, KPI stat callout boxes, and eligibility/timeline tables, plus a top `.no-print` action bar with **`Print / Save as PDF`** (`window.print()`) and **`Download HTML ↗`** (Blob download of `document.documentElement.outerHTML`).
2. **One-Page Executive Decision Memo (`BLUF`):**
   - Headline recommendation -> Background in 4 sentences -> **Options Comparison Table** (Pros, Cons, Cost, Timeline, Risk) -> Recommended Decision & Sign-Off Block.
3. **Executive Summary of a Long Report / Federal Guidance:**
   - Distills 30–200 page PDFs or federated SharePoint/Drive documents (pulled via Gemini Enterprise `StreamAssist`) into a 1-page leadership brief citing exact section/page numbers.
4. **Public Notice, FAQ, or Press Release:**
   - Plain-language (`<= 8th-grade` reading level), clear eligibility/deadline bullets, and verified contact placeholders (`[CONFIRM CONTACT/URL BEFORE PUBLISHING]`).

## Step 2: Cross-Document Fact & Number Check
Before finalizing any flyer or memo, verify every dollar amount, statutory citation, eligibility tier, and deadline against the user's source document (or Gemini Enterprise `StreamAssist` retrieval) and flag any discrepancy across drafts!

## Step 3: Mandatory Serverless Visual Preview (ZERO `127.0.0.1` `.url.json` Cards & ZERO Workspace `flyer.html` Code Links!)
> **CRITICAL UX & FIREWALL RULE:**
> - **NEVER create `.url.json` artifacts pointing to `http://127.0.0.1:...` or `http://localhost:...`** (causes `ERR_CONNECTION_REFUSED` on corporate laptops).
> - **NEVER link workspace `[flyer.html](file:///.../flyer/flyer.html)` in chat** (opens raw HTML source code in the Code Editor!).

Whenever you generate an HTML flyer, fact sheet, or formatted decision memo, always complete these 2 serverless steps before replying:
1. **Write the Rendered Visual Flyer/Memo Artifact to `<appDataDir>/brain/<conversation-id>/`:**
   - Write the self-contained single-file HTML directly to `<appDataDir>/brain/<conversation-id>/<doc_name>_flyer_preview.html` using `write_file` with:
     ```json
     "ArtifactMetadata": {
       "Summary": "Rendered print-ready West Virginia stakeholder flyer / decision memo preview (click 'Print / Save as PDF' or 'Download HTML' in the top bar)",
       "UserFacing": true,
       "RequestFeedback": false
     }
     ```
2. **In Your Reply (Inline `<agent-embed>` + Artifact Link Only):**
   - Embed `<agent-embed src="file:///<appDataDir>/brain/<conversation-id>/<doc_name>_flyer_preview.html"></agent-embed>` in your chat response, and link **ONLY** to `[Open Rendered Flyer in Side Pane](file:///<appDataDir>/brain/<conversation-id>/<doc_name>_flyer_preview.html)`.
