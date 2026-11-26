---
name: agy-onboard
description: Interactive 60-second onboarding for Public Sector staff in Google Antigravity, including optional 1-step Personal Workspace Memory setup (~/.gemini/config/plugin_data/my-antigravity/memory/), 30-60-90 day onboarding plans, SOP builders, and continuity desk guides. Use when a user says /agy-onboard, "set up my profile", "initialize my workspace memory", "help me get started with Antigravity", "create a 30-60-90 day plan", or "build an SOP or onboarding packet".
---

# Public Sector — Antigravity Quick Onboarding (`/agy-onboard`)

Welcome the user concisely and get them productive in **under 60 seconds** with zero local software installs required.

## Mode Selection
1. **Personal Setup Mode (Default when invoked as `/agy-onboard` or "get me set up")**: Run the 4-question quick profile, built-in Google Workspace connector check, and optional 1-step **Personal Workspace Memory** initialization below.
2. **Team Onboarding & SOP Builder Mode**: When the user asks to create a **30-60-90 Day Plan**, **Onboarding Welcome Packet**, **SOP from Rough Notes**, **Role Description**, or **Continuity Desk Guide**, read `./references/onboarding_sops_playbook.md` and execute the matching public-sector workflow.

---

## Step 1: 4-Question Quick Setup (Ask All 4 Together Concisely)

Ask the user (allowing rough or 1-line answers):
1. **Agency / Division, Role & Time Zone:** Which Public Sector agency, office, or team are you in, what is your primary role, and what is your IANA time zone (e.g., `America/New_York`, `America/Chicago`, `America/Los_Angeles`)?
2. **Primary Audiences & Tone:** Who do you write or build for most often (e.g., agency leadership, legislators, sister divisions, vendors, or constituents), and how do you like to sound (e.g., concise BLUF bullets, warm consultative prose, formal statutory memo)?
3. **Top 2 Weekly Time-Sinks & Active Initiatives:** What recurring tasks or 1-2 active projects/programs would save you the most time? *(Also ask if they want to initialize their persistent **Personal Workspace Memory** at `~/.gemini/config/plugin_data/my-antigravity/memory/`—recommended!)*
4. **Google Workspace Connectors:** Would you like to connect **Google Docs, Sheets, Slides, Drive, Calendar, and Gmail**? Point them straight to Antigravity's built-in left sidebar: **`Customizations → Marketplace → Google Workspace`** and click `+` next to each app!

---

## Step 2: Persist Profile, Initialize Personal Memory & Guide Built-In Connectors

1. **Save Personal Profile (`./agy-profile.md` / `~/.gemini/config/plugin_data/my-antigravity/agy-profile.md`):**
   - Save a clean, human-readable profile containing Agency / Division, Role, Primary Time Zone, Preferred Voice & Formatting Rules (BLUF, plain language, spaced hyphens ` - `), and Standing Guardrails (**Draft-Only**, **Zero hardcoded secrets**, **Verify PII/statutory citations**).
2. **Optional 1-Step Personal Memory Initialization (`~/.gemini/config/plugin_data/my-antigravity/memory/`):**
   - Unless the user opts out, initialize their persistent workspace memory using the `public-sector` preset (or `pm`, `developer`, `leader` if closer to their role):
     ```bash
     node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs init \
       --role public-sector \
       --name "<User Name>" \
       --role-title "<Role Title>" \
       --org "<Agency or Division>" \
       --timezone "<IANA Timezone>" \
       --seed-demo
     ```
   - Point the user to **`Plugins -> My Hub`** (`Action Items` + the top-right **Customize** icon) so they can review suggested to-dos, topics, and their personal voice settings anytime.
3. **Connect Native Google Workspace Plugins:**
   - Walk them through **`Customizations → Marketplace → Google Workspace`** in the left sidebar to enable **Google Docs, Sheets, Slides, Drive, Calendar, and Gmail** with zero local installs.

---

## Step 3: Highlight `Ask Clawy` (`🐻`) in `Skills` & Personalized Day-1 Starter Commands

Always point out **`Ask Clawy`** (the warm Brown Bear icon right beside the search bar inside **`Plugins → Skills`**) so users know they can describe any task in plain English to find the best skill or start a focused chat in 1 click.

- **Executives, Chiefs of Staff & Program Managers:** `/daily-brief`, `/memory`, `/meeting-prep`, `/swarm-prep`, `/weekly-impact`, `/agy-dashboard`
- **FOIA Officers, Counsel, Procurement & Policy Staff:** `/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`, `/public-records-redaction`, `/outbound-scrub`
- **Communications & Operations Leads:** `/my-voice`, `/no-ai-slop`, `/outbound-scrub`, `/slides`, `/doc-design`
- **Application, Data & Cloud Engineers:** `/orchestrator-guide`, `/token-usage`, `/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/security-audit`
