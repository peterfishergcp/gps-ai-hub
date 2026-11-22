---
name: wv-onboard
description: Interactive 60-second onboarding for State of West Virginia staff in Google Antigravity, plus 30-60-90 day onboarding plans, SOP builders, and continuity desk guides. Use when a user says /wv-onboard, "set up my profile", "help me get started with Antigravity", "create a 30-60-90 day plan", or "build an SOP or onboarding packet".
---

# State of West Virginia — Antigravity Quick Onboarding (`/wv-onboard`)

Welcome the user concisely and get them productive in **under 60 seconds** with zero local software installs required.

## Mode Selection
1. **Personal Setup Mode (Default when invoked as `/wv-onboard` or "get me set up")**: Run the 4-question quick profile & Gemini Enterprise (`GE`) instance check below.
2. **Team Onboarding & SOP Builder Mode**: When the user asks to create a **30-60-90 Day Plan**, **Onboarding Welcome Packet**, **SOP from Rough Notes**, **Role Description**, or **Continuity Desk Guide**, read `./references/onboarding_sops_playbook.md` and execute the matching public-sector workflow.

---

## Step 1: 4-Question Quick Setup (Ask All 4 Together Concisely)

Ask the user (allowing rough or 1-line answers):
1. **Agency / Division & Role:** Which West Virginia agency, office, or team are you in, and what is your primary role?
2. **Primary Audiences & Tone:** Who do you write or build for most often (e.g., agency leadership, legislators, sister divisions, vendors, or West Virginia residents), and how do you like to sound (e.g., concise BLUF bullets, warm consultative prose, formal statutory memo)?
3. **Top 2 Weekly Time-Sinks:** What recurring tasks would save you the most time (e.g., morning inbox/Teams catch-up, grant/site dashboards, FOIA/legal review, slide decks/flyers, or app/SQL modernization)?
4. **Your Gemini Enterprise (`GE`) Instance (Default Connector Hub):** Paste your **Gemini Enterprise Resource Path** (`projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>`) or **Cloud Console Gemini Enterprise URL** if your IT admin shared it *(note: bare `/home/cid/...` web links do not include the GCP project ID)*—since West Virginia syncs Azure/Entra ID groups to Google Identity, connecting your GE instance unlocks your federated **Outlook, SharePoint, OneDrive, Teams, Drive, and GitHub** connectors in one step! *(If your IT admin already pre-filled `-GeInstance` during installation, or if you want to skip for now, say "skip" and run `/connect-ge` anytime.)*

---

## Step 2: Persist Profile & Configure GE Instance

1. Save a clean, human-readable profile to `./plugin_data/wv-antigravity/memory/profile/voice.md` in the current workspace (or `~/.gemini/plugin_data/wv-antigravity/memory/profile/voice.md` if no workspace folder is open, after confirming with the user) containing:
   - Agency / Division & Role
   - Preferred Voice & Formatting Rules (BLUF, plain language, West Virginia brand palette `#053254` Navy / `#C1452C` Rust / `#D5A245` Gold when designing visuals)
   - Standing Guardrails: **Draft-Only (never send emails/chats automatically)**, **Zero hardcoded secrets**, and **Verify PII/statutory citations before external release**.
2. If the user pasted a **Gemini Enterprise URL or Engine ID** in Question 4 and the remote HTTPS Gemini Enterprise MCP MCP tool `GE Connector Hub` is available:
   - Call `GE Connector Hub` immediately and then `~/.gemini/config/plugin_data/wv-connectors/ge-instance.json` to confirm connectivity (or guide them through `/connect-ge` 1-click Google Identity sign-in if not signed in yet).

---

## Step 3: Recommend Personalized Day-1 Starter Commands

Based on their role in Question 1 & 3, give them **3 tailored slash commands** they can try immediately (plus **`/model-guide`** anytime they want to switch between Google Gemini and Anthropic Claude):
- **Executives, Chiefs of Staff & Program Managers:** `/daily-brief`, `/inbox-triage`, `/wv-dashboard`, `/model-guide`
- **FOIA Officers, Counsel, Procurement & Policy Staff:** `/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`, `/model-guide`
- **Communications & Operations Leads:** `/my-voice`, `/slides`, `/doc-design`, `/model-guide`
- **Application, Data & Cloud Engineers:** `/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/security-audit`, `/model-guide`
