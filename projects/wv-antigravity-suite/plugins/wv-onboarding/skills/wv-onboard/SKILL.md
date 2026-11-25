---
name: wv-onboard
description: Interactive 60-second onboarding for State of West Virginia staff in Google Antigravity, plus 30-60-90 day onboarding plans, SOP builders, and continuity desk guides. Use when a user says /wv-onboard, "set up my profile", "help me get started with Antigravity", "create a 30-60-90 day plan", or "build an SOP or onboarding packet".
---

# State of West Virginia — Antigravity Quick Onboarding (`/wv-onboard`)

Welcome the user concisely and get them productive in **under 60 seconds** with zero local software installs required.

## Mode Selection
1. **Personal Setup Mode (Default when invoked as `/wv-onboard` or "get me set up")**: Run the 4-question quick profile & built-in Google Workspace connector check below.
2. **Team Onboarding & SOP Builder Mode**: When the user asks to create a **30-60-90 Day Plan**, **Onboarding Welcome Packet**, **SOP from Rough Notes**, **Role Description**, or **Continuity Desk Guide**, read `./references/onboarding_sops_playbook.md` and execute the matching public-sector workflow.

---

## Step 1: 4-Question Quick Setup (Ask All 4 Together Concisely)

Ask the user (allowing rough or 1-line answers):
1. **Agency / Division & Role:** Which West Virginia agency, office, or team are you in, and what is your primary role?
2. **Primary Audiences & Tone:** Who do you write or build for most often (e.g., agency leadership, legislators, sister divisions, vendors, or West Virginia residents), and how do you like to sound (e.g., concise BLUF bullets, warm consultative prose, formal statutory memo)?
3. **Top 2 Weekly Time-Sinks:** What recurring tasks would save you the most time (e.g., morning inbox catch-up, grant/site dashboards, FOIA/legal review, slide decks/flyers, or app/SQL modernization)?
4. **Google Workspace Connectors:** Would you like to connect **Google Docs, Sheets, Slides, Drive, Calendar, or Gmail**? *(No complex setup required — just open **Customizations** in Antigravity's left sidebar → **Marketplace** → **Google Workspace** and click **+** next to each app.)*

---

## Step 2: Persist Profile & Confirm Google Workspace Connectors

1. Save a clean, human-readable profile strictly inside `~/.gemini/config/plugin_data/wv-antigravity/memory/profile/voice.md` (and `identity.md`, zero files outside `~/.gemini/config/`) containing:
   - Agency / Division & Role
   - Preferred Voice & Formatting Rules (BLUF, plain language, West Virginia brand palette `#053254` Navy / `#C1452C` Rust / `#D5A245` Gold when designing visuals)
   - Standing Guardrails: **Draft-Only (never send emails/chats automatically)**, **Zero hardcoded secrets**, and **Verify PII/statutory citations before external release**.
2. If the user wants Google Workspace access, remind them to click **Customizations → Marketplace → Google Workspace** in Antigravity's left sidebar and add Google Docs, Sheets, Slides, Drive, Calendar, and Gmail with their `@wv.gov` account.

---

## Step 3: Tour Your 3 West Virginia Sidebar Panels & Starter Commands

Point out the **3 streamlined West Virginia panels** under **Plugins** in the left sidebar:
- **`WV My Hub`** (Rainbow **A** icon): Daily Overview, Action Items, Initiatives, Stakeholders, TokenEconomics, and Customize voice/memory files.
- **`WV Skills`** (Sparkles icon): Browse all **36 WV skills** + **`★ My Personal Skills`**, or click **`🐻 Ask Clawy`** next to the search bar to describe what you need in plain English and match the right skill in 1 click.
- **`WV Preview`** (Magnifying Glass icon): Searchable, newest-first visual viewer for Dashboards, 16:9 Slide Decks, and Branded Flyers with **`Open in Browser ↗`**, **`Save to Downloads`**, and **`Print / PDF`**.

Then, based on their role in Question 1 & 3, give them **3 tailored slash commands** they can try immediately:
- **Executives, Chiefs of Staff & Program Managers:** `/daily-brief`, `/inbox-triage`, `/wv-dashboard`, `/model-guide`
- **FOIA Officers, Counsel, Procurement & Policy Staff:** `/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`, `/public-records-redaction`
- **Communications & Operations Leads:** `/my-voice`, `/slides`, `/doc-design`, `/plain-language-notice-generator`
- **Application, Data & Cloud Engineers:** `/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/security-audit`
