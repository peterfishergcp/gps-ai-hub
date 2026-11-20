---
name: agy-onboard
description: Interactive 60-second onboarding for Public Sector staff in Google Antigravity, including optional 1-step Second Brain Memory Vault setup (~/antigravity-twin/memory/), 30-60-90 day onboarding plans, SOP builders, and continuity desk guides. Use when a user says /agy-onboard, "set up my profile", "set up my digital twin", "initialize my second brain", "help me get started with Antigravity", "create a 30-60-90 day plan", or "build an SOP or onboarding packet".
---

# Public Sector — Antigravity & Second Brain Quick Onboarding (`/agy-onboard`)

Welcome the user concisely and get them productive in **under 60 seconds** with zero local software installs required.

## Mode Selection
1. **Personal Setup Mode (Default when invoked as `/agy-onboard` or "get me set up")**: Run the 4-question quick profile, Gemini Enterprise (`GE`) instance check, and optional 1-step **2-Tier Second Brain Vault** initialization below.
2. **Team Onboarding & SOP Builder Mode**: When the user asks to create a **30-60-90 Day Plan**, **Onboarding Welcome Packet**, **SOP from Rough Notes**, **Role Description**, or **Continuity Desk Guide**, read `./references/onboarding_sops_playbook.md` and execute the matching public-sector workflow.

---

## Step 1: 4-Question Quick Setup (Ask All 4 Together Concisely)

Ask the user (allowing rough or 1-line answers):
1. **Agency / Division, Role & Time Zone:** Which Public Sector agency, office, or team are you in, what is your primary role, and what is your IANA time zone (e.g., `America/New_York`, `America/Chicago`, `America/Los_Angeles`)?
2. **Primary Audiences & Tone:** Who do you write or build for most often (e.g., agency leadership, legislators, sister divisions, vendors, or constituents), and how do you like to sound (e.g., concise BLUF bullets, warm consultative prose, formal statutory memo)?
3. **Top 2 Weekly Time-Sinks & Active Initiatives:** What recurring tasks or 1-2 active projects/programs would save you the most time (e.g., morning inbox/Teams catch-up, grant/site dashboards, FOIA/legal review, slide decks/flyers, or app/SQL modernization)? *(Also ask if they want to initialize their persistent **Second Brain Memory Vault** at `~/antigravity-twin/memory/`—recommended!)*
4. **Your Gemini Enterprise (`GE`) Instance (Default Connector Hub):** Paste your **Gemini Enterprise Resource Path** (`projects/<PROJECT_ID>/locations/<LOCATION>/collections/default_collection/engines/<ENGINE_ID>`) or **Cloud Console Gemini Enterprise URL** if your IT admin shared it *(note: bare `/home/cid/...` web links do not include the GCP project ID)*—connecting your GE instance unlocks federated **Outlook, SharePoint, OneDrive, Teams, Drive, and GitHub** connectors in one step! *(Say "skip" to configure anytime via `/connect-ge`.)*

---

## Step 2: Persist Profile, Initialize Second Brain Vault & Configure GE Instance

1. **Save Digital Twin Profile (`./agy-twin-profile.md` / `~/.gemini/agy-twin-profile.md`):**
   - Save a clean, human-readable profile in the current workspace (or `~/.gemini/agy-twin-profile.md` if no workspace folder is open, after confirming with the user) containing:
     - Agency / Division, Role & Primary Time Zone
     - Preferred Voice & Formatting Rules (BLUF, plain language, spaced hyphens ` - `, Public Sector brand palette `#053254` Navy / `#C1452C` Rust / `#D5A245` Gold when designing visuals)
     - Standing Guardrails: **Draft-Only (never send emails/chats automatically)**, **Zero hardcoded secrets**, and **Verify PII/statutory citations before external release**.
2. **Optional 1-Step Second Brain Memory Vault Initialization (`~/antigravity-twin/memory/`):**
   - Unless the user opts out, initialize their persistent **2-Tier Second Brain Vault** using the `public-sector` preset (or `pm`, `developer`, `leader` if closer to their role):
     - When `node` is available on `PATH`, run:
       ```bash
       node ~/.gemini/config/plugins/agy-second-brain/scripts/vault_cli.mjs init \
         --role public-sector \
         --name "<User Name>" \
         --role-title "<Role Title>" \
         --org "<Agency or Division>" \
         --timezone "<IANA Timezone>" \
         --seed-demo
       ```
     - **No-`node`-on-PATH Fallback (Locked-Down Laptops):** Create the Markdown/JSON vault files directly in `~/antigravity-twin/memory/` using file tools: `profile/{identity,portfolio,playbooks,voice}.md`, `gtd_board.md` (Zero Task Decay), `contacts.md` (`>21d` staleness tracking), 4-file isolated folders under `initiatives/<slug>/{status,running_notes,context_and_decisions,stakeholders}.md` for the active initiatives named in Question 3, `topics/lessons-learned.md`, `followups/latest_action_plan.md`, and `impact/ledger.json`.
   - Point the user to **`Extensions -> Twin Vault`** on the Antigravity sidebar so they can visually inspect and edit every Markdown file in their vault.
3. **Configure Gemini Enterprise (`GE`) Bridge (If Provided in Question 4):**
   - If the `agy-ge-bridge` MCP tool `ge_configure_instance` is available, call `ge_configure_instance` and `ge_instance_status` to confirm connectivity (or guide 1-click Google Identity sign-in via `/connect-ge`).

---

## Step 3: Recommend Personalized Day-1 Starter Commands

Based on their role in Questions 1 & 3, give them tailored slash commands they can try immediately (plus **`/model-guide`** anytime to switch between Google Gemini and Anthropic Claude):
- **Executives, Chiefs of Staff & Program Managers:** `/daily-brief`, `/twin-memory`, `/twin-jit-prep`, `/twin-swarm-prep`, `/twin-weekly-impact`, `/agy-dashboard`
- **FOIA Officers, Counsel, Procurement & Policy Staff:** `/foia-expert`, `/legal-procurement-review`, `/policy-program-audit`, `/outbound-scrub`
- **Communications & Operations Leads:** `/digital-twin`, `/no-ai-slop`, `/outbound-scrub`, `/slides`, `/doc-design`
- **Application, Data & Cloud Engineers:** `/modernize-refactor`, `/deploy-cloudrun`, `/bigquery-architect`, `/security-audit`, `/twin-memory`
