---
name: doc-design
description: Creates print-ready 1-2 page stakeholder flyers, Bottom-Line-Up-Front (BLUF) decision memos, executive summaries, press releases, and plain-language public notices styled in West Virginia brand colors (HTML/Print-to-PDF + Markdown). Trigger on /doc-design, "create a flyer", "one-page decision memo", "executive summary", "press release", or "public notice".
---

# Branded Documents, Flyers & Executive Briefs (`/doc-design`)

Design publication-grade **internal decision documents** and **external stakeholder flyers/notices** with **zero local library installs**—combining West Virginia's print-CSS layout system with the GPS Public Sector Executive & External Communications playbooks.

## Step 1: Pick the Deliverable Format
Consult `./references/executive_comms_templates.md` and match the user's goal:
1. **1–2 Page Branded Stakeholder Flyer / Fact Sheet (`flyer.html` -> `Save as PDF`):**
   - Uses crisp `@page { size: letter portrait; margin: 0.45in; }` (or `letter landscape` for two-column program comparisons like *Mountain State Ready* Loan vs. Grant tiers), WV Navy `#053254` header banner, WV Gold `#D5A245` rule accents, WV Rust `#C1452C` deadline callouts, KPI stat callout boxes, and eligibility/timeline tables.
2. **One-Page Executive Decision Memo (`BLUF`):**
   - Headline recommendation -> Background in 4 sentences -> **Options Comparison Table** (Pros, Cons, Cost, Timeline, Risk) -> Recommended Decision & Sign-Off Block.
3. **Executive Summary of a Long Report / Federal Guidance:**
   - Distills 30–200 page PDFs or federated SharePoint/Drive documents (pulled via `ge_ask_instance`) into a 1-page leadership brief citing exact section/page numbers.
4. **Public Notice, FAQ, or Press Release:**
   - Plain-language (`<= 8th-grade` reading level), clear eligibility/deadline bullets, and verified contact placeholders (`[CONFIRM CONTACT/URL BEFORE PUBLISHING]`).

## Step 2: Cross-Document Fact & Number Check
Before finalizing any flyer or memo, verify every dollar amount, statutory citation, eligibility tier, and deadline against the user's source document (or `ge_ask_instance` retrieval) and flag any discrepancy across drafts!
