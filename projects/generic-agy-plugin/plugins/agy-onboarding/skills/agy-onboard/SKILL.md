---
name: agy-onboard
description: Interactive 60-second onboarding for Public Sector staff in Google Antigravity, including optional 1-step Personal Workspace Memory setup (~/my-antigravity/memory/), 30-60-90 day onboarding plans, SOP builders, and continuity desk guides. Use when a user says /agy-onboard, "set up my profile", "initialize my workspace memory", "help me get started with Antigravity", "create a 30-60-90 day plan", or "build an SOP or onboarding packet".
---

# Public Sector — Antigravity Quick Onboarding (`/agy-onboard`)

Welcome the user concisely and get them productive in **under 60 seconds** with zero local software installs required.

## Mode Selection
1. **Personal Setup Mode (Default when invoked as `/agy-onboard` or "get me set up")**: Run the 4-question quick profile, Gemini Enterprise (`GE`) instance check, and optional 1-step **Personal Workspace Memory** initialization below.
2. **Team Onboarding & SOP Builder Mode**: When the user asks to create a **30-60-90 Day Plan**, **Onboarding Welcome Packet**, **SOP from Rough Notes**, **Role Description**, or **Continuity Desk Guide**, read `./references/onboarding_sops_playbook.md` and execute the matching public-sector workflow.

---

## Step 1: 4-Question Quick Setup (Ask All 4 Together Concisely)

Ask the user (allowing rough or 1-line answers):
1. **Agency / Division, Role & Time Zone:** Which Public Sector agency, office, or team are you in, what is your primary role, and what is your IANA time zone (e.g., `America/New_York`, `America/Chicago`, `America/Los_Angeles`)?
2. **Primary Audiences & Tone:** Who do you write or build for most often (e.g., agency leadership, legislators, sister divisions, vendors, or constituents), and how do you like to sound (e.g., concise BLUF bullets, warm consultative prose, formal statutory memo)?
3. **Top 2 Weekly Time-Sinks & Active Initiatives:** What recurring tasks or 1-2 active projects/programs would save you the most time? *(Also ask if they want to initialize their persistent **Personal Workspace Memory** at `~/my-antigravity/memory/`—recommended!)*
4. **Your Gemini Enterprise (`GE`) Instance (Default Connector Hub):** Paste your **Gemini Enterprise Resource Path** (`projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>`) or **Cloud Console Gemini Enterprise URL** if your IT admin shared it—connecting your GE instance unlocks federated **Outlook, SharePoint, OneDrive, Teams, Drive, and GitHub** connectors in one step! *(Say "skip" to configure anytime via `/connect-ge`.)*

---

## Step 2: Persist Profile, Initialize Personal Memory & Configure GE Instance

1. **Save Personal Profile (`./agy-profile.md` / `~/.gemini/agy-profile.md`):**
   - Save a clean, human-readable profile containing Agency / Division, Role, Primary Time Zone, Preferred Voice & Formatting Rules (BLUF, plain language, spaced hyphens ` - `), and Standing Guardrails (**Draft-Only**, **Zero hardcoded secrets**, **Verify PII/statutory citations**).
2. **Optional 1-Step Personal Memory Initialization (`~/my-antigravity/memory/`):**
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
   - Point the user to **`Extensions -> My Antigravity`** (`Action Items` + the top-right **Customize** icon) so they can review suggested to-dos, topics, and their personal voice settings anytime.
3. **Configure Gemini Enterprise (`GE`) Bridge (If Provided in Question 4):**
   - If `ge_configure_instance` is available, call `ge_configure_instance` and `ge_instance_status` to confirm connectivity (or guide 1-click Google Identity sign-in via `/connect-ge`).

---

## Step 3: Highlight Clawy (`🐻`) & Personalized Day-1 Starter Commands

Always point out **`Clawy`** (the warm Brown Bear icon in the left Extensions sidebar, or `/agy-coordinator`) so the user knows they can view and pop out active agent conversations side-by-side, connect their Google Cloud Project (`Settings -> General -> GCP Project ID`) for `Kore` Gemini Live neural voice, and track `Group -> Goal -> Task` sprints.

- **Executives, Chiefs of Staff & Program Managers:** `/agy-coordinator`, `/daily-brief`, `/memory`, `/meeting-prep`, `/swarm-prep`, `/weekly-impact`, `/agy-dashboard`
- **FOIA Officers, Counsel, Procurement & Policy Staff:** `/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`, `/outbound-scrub`, `/agy-coordinator`
- **Communications & Operations Leads:** `/my-voice`, `/no-ai-slop`, `/outbound-scrub`, `/slides`, `/doc-design`, `/agy-coordinator`
- **Application, Data & Cloud Engineers:** `/agy-coordinator`, `/orchestrator-guide`, `/token-usage`, `/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/security-audit`
