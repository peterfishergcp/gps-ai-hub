# West Virginia Super-User Workshop Runbook: *Mountain State AI Crucible* (`120 Minutes · Local Review Draft`)

> [!IMPORTANT]
> **How This Workshop Differentiates Antigravity (`AGY`) from Passive Show-and-Tell Demos:**
> Instead of watching one person present slides about static PDFs or a fictional town, **5 cross-agency tables build working tools on real West Virginia counties and plans in Hour 1**, run a **live Dual-Model (`Gemini` → `Claude`) SME Statutory & Safety Audit** to catch planted compliance traps, and **play a live 30-minute multi-agency crisis exercise together** in Hour 2—rolling all 5 tables' After-Action Corrective Actions into the **Governor's Command Center Dashboard (`/wv-dashboard`)**!

---

## 1. Pre-Workshop Admin & Endpoint Checklist (Zero-Friction Setup)

1. **Google Cloud Console (`wvot-ai-sandbox`):**
   - Navigate to `console.cloud.google.com/gemini-enterprise/settings/ai-developer-tools?project=wvot-ai-sandbox` → **Security → Edit**.
   - Set **Terminal auto-execution mode** to **`Proceed in sandbox`** (unlocks `Default` mode safely without requiring unsandboxed `Turbo`; or set `Always proceed` + `Outside of file access policy: Allow` if full `Turbo` is desired for the workshop window).
2. **100% SentinelOne-Safe Execution:**
   - All 5 Pod builds below use Antigravity's built-in Node runtime (`scaffold_ttx.mjs`, `scaffold_ops_kit.mjs`, `scaffold_dashboard.mjs`) to generate **100% serverless single-file `.html` Artifacts** (`Side Pane` + `WV Preview` + 1-click Chrome/Edge download) — **zero local Python, zero `pip`, and zero local TCP ports required**.

---

## 2. Shared Statewide Scenario Spine: *"Operation Winter Gorge"*

Every pod builds **their own agency's operational app**, anchored to one shared, realistic West Virginia cascading event so all 5 pods connect in Act 4:
- **Event:** A severe November ice storm strikes the **Kanawha / Fayette / New River Gorge corridor (`WVEMD Area 5 & Area 6`, `WVDOH Districts 1 & 9`)**, downing power lines across industrial cold-storage and municipal water infrastructure:
  - **T+06m (`Fire/Hazmat`):** Ice-laden truss collapse ruptures a **`9,000 lb` Anhydrous Ammonia (`UN1005`, `ERG 2024 Guide 125`)** receiver near a riverfront industrial park, `0.35 mi` upwind of a nursing home and community hospital (`ESE wind 5 mph`).
  - **T+18m (`WVOT Cyber & Water Utility`):** Opportunistic ransomware actors exploit an exposed vendor maintenance bridge on the municipal water authority's SCADA HMI (`WV HB 5638`), dropping distribution pressure below `20 psi` (`40 CFR § 141.205`).
  - **T+32m (`WVDED / IJDC / FEMA PA`):** Counties mobilize emergency Time-and-Materials (`T&M`) road-clearing and storm-debris contractors while storm-damaged floodwalls require `33 CFR § 208` / FEMA PA documentation.
  - **T+45m (`DoHS / PIO / Governor's Office`):** Local TV news airs an unverified social-media rumor telling residents to evacuate *eastward directly through the ammonia plume* instead of sheltering in place and boiling water.

---

## 3. Copy-Paste Pod Prompts (Act 2 — `40 Minutes`)

### Pod 1 — WVEMD & County Emergency Managers (`/ttx-simulator`)
```text
Using `/ttx-simulator`, build an interactive HSEEP Multi-Role Tabletop Exercise Simulator in `./winter-gorge-ttx` for **Kanawha and Fayette Counties, West Virginia** ("Operation Winter Gorge"):

1. Ground the simulator in our real 55-County West Virginia Crosswalk (`Kanawha` default, switchable to `Fayette`, `Raleigh`, `Cabell`, `Monongalia`, or `McDowell`), exercising 4 FEMA Core Capabilities: `Operational Coordination`, `Environmental Response/Health and Safety`, `Cybersecurity`, and `Public Information and Warning`.
2. Configure 6 role-specific Fog-of-War seats (`Master Facilitator`, `County EOC & WVEMD`, `Fire & Hazmat IC`, `WVOT Cyber & Water SCADA`, `Hospital & DoHS Health`, `PIO & County Commission`) and 4 timed injects covering:
   - Inject 1 (`T+06m`): `UN1005` Anhydrous Ammonia (`9,000 lb`) `ERG 2024 Guide 125 / Table 3` isolation (`500 ft`) and downwind (`0.5 mi`) protective action check.
   - Inject 2 (`T+18m`): Municipal Water SCADA cyber intrusion & `<20 psi` depressurization (`WV HB 5638`).
   - Inject 3 (`T+32m`): Hospital ED walk-in contamination & HVAC shutoff decision (with dynamic consequence branching if upwind staging or HVAC shutoff was missed!).
   - Inject 4 (`T+48m`): Statewide mutual aid (`W. Va. Code § 15-5-11`) & Governor's State of Emergency proclamation (`W. Va. Code § 15-5-6`).
3. Include the interactive SVG Plume & Facility Map, the `<=120-word` 7-Essentials Public Warning Scorer (`0–100`), and the HSEEP 90-Day `AAR/IP` Builder (`P/S/M/U` ratings).
4. Write the self-contained `ttx-standalone.html` to the Conversation Artifact Directory (`UserFacing: true`) with zero local server ports.
```

---

### Pod 2 — WVOT Cyber, CISO & Infrastructure Ops (`/ttx-simulator` + `/security-audit`)
```text
1. Using `/ttx-simulator`, create a West Virginia Cyber + Continuity of Operations (`COOP`) Tabletop Simulator in `./wvot-scada-coop-ttx` focused on a municipal water & county network ransomware intrusion under **WV HB 5638**:
   - Include role lenses for `WVOT CISO Incident Commander`, `Municipal Water OT Engineer`, `WV State Police / Fusion Center`, and `Agency General Counsel`.
   - Test OT/IT network segmentation, forensic log preservation before re-imaging, out-of-band communications when VoIP/email fail, and statutory prohibition on unauthorized ransom payments.
2. Then run `/security-audit` on this legacy water-telemetry status snippet our contractor left behind, and plant-check all vulnerabilities (hardcoded API token, SQL string concatenation, and public Cloud Run default service account):
   ```javascript
   const SCADA_API_TOKEN = "wv-water-telemetry-prod-9981";
   async function getPressureLog(req, bq, el) {
     el.innerHTML = "Station: " + req.query.station;
     return bq.query(`SELECT psi FROM telemetry.logs WHERE station = '${req.query.station}'`);
   }
   ```
3. Write the rendered `ttx-standalone.html` to the Conversation Artifact Directory (`UserFacing: true`).
```

---

### Pod 3 — FEMA Public Assistance, WVDED/IJDC & State Auditor (`/field-ops-kit` + `/expense-auditor`)
```text
Using `/field-ops-kit`, build an interactive serverless **West Virginia Disaster Debris Readiness, 55-County Crosswalk & Forensic Audit Kit** in `./wv-debris-ops-kit`:

1. Configure all 4 operational modules:
   - **Tab 1 (7-Tab Disaster Timeline Binder):** Plain-language county tools from Pre-Storm & Legacy USACE Levee/Floodwall O&M (`33 CFR § 208`) through First 72 Hours (`70-hour` T&M emergency cap), `2 CFR Part 200` contracting, and FEMA PA Closeout.
   - **Tab 2 (25-Question County Readiness Self-Check):** Interactive self-scoring diagnostic selectable across all 55 WV counties that generates a prioritized 30/60/90-day county readiness plan (replacing physical binders and USB thumb drives).
   - **Tab 3 (Forensic Record-Gap Crosswalk):** Reconcile unmonitored county storm-debris hauling (`Weeks 1–3`) by cross-checking Staging-Site Gate Camera timestamps, Landfill Scale weights, and Contractor T&M invoices across the 6 forensic tests—with a live Max Transit Minutes slider (`35–65 min`) so reviewers see verified vs. questioned dollars recalculate instantly.
   - **Tab 4 (55-County / 28-Region Crosswalk):** Searchable SEOC county matrix across WVEMD Areas, WVDOH Districts, WVSP Troops, RPDCs, USACE Districts, and legacy flood works (`132` total / `112` outside federal levee DB).
2. Write the self-contained `ops-kit-standalone.html` to the Conversation Artifact Directory (`UserFacing: true`).
```

---

### Pod 4 — DoHS, Bureau for Public Health & County PIOs (`/plain-language-notice-generator` + `/document-intake-cleanup-and-validation`)
```text
Run a 2-part emergency constituent response sprint for Operation Winter Gorge:

1. `/plain-language-notice-generator`: Rewrite this urgent joint Hazmat Shelter-in-Place + Precautionary Boil Water technical bulletin into clear, active-voice plain language for Kanawha/Fayette residents—preserving 100% of street boundaries, `40 CFR § 141.205` mandatory health text, shelter-in-place HVAC instructions, water tanker hours (`07:00–21:00`), and hotline numbers (`304-555-0148`, `TTY 711`) with zero added or dropped facts:
   > "JOINT EMERGENCY BULLETIN (#WV-2026-1119): Due to an anhydrous ammonia (UN1005) release at Milepost 64 Industrial Cold Storage (06:12 EST Nov 19, 2026) and concurrent distribution depressurization below 20 psi on PWSID #WV3302019, residents within 0.5 miles east-southeast between Montgomery Bridge Rd and Alloy Route 60 must remain indoors, close all windows/vents, and deactivate forced-air HVAC until all-clear (est. 14:00 EST Nov 19, 2026). Do NOT evacuate east on US-60. Furthermore, pursuant to 40 CFR § 141.205, inadequately treated or depressurized water may contain disease-causing organisms. These organisms include bacteria, viruses, and parasites, which can cause symptoms such as nausea, cramps, diarrhea, and associated headaches. Boil all tap water for 1 full minute before drinking, cooking, brushing teeth, or making baby formula until bacteriological clearance (est. 18:00 EST Nov 21, 2026). Bottled water pickup opens post-all-clear at Gauley Bridge VFD, 410 Main St, 07:00–21:00. Hotline: 304-555-0148 / TTY 711."

2. `/document-intake-cleanup-and-validation`: Validate an emergency Disaster Assistance / LIHEAP intake packet (2 bi-weekly paystubs + storm-damaged lease missing landlord signature) so displaced households are triaged accurately with human-in-the-loop safeguards.
```

---

### Pod 5 — Governor's Office, General Counsel & Legislative Command (`/wv-dashboard` + `/legal-procurement-review`)
```text
1. Using `/wv-dashboard`, spin up an interactive **Operation Winter Gorge — Governor's Multi-Agency Command Center** in `./winter-gorge-command` (`wv-mountain-state-ready` / Command Center layout) tracking:
   - Live KPIs: `Counties Under Emergency Proclamation (6)`, `Active HSEEP Corrective Actions`, `FEMA PA Debris Pipeline ($M)`, and `90-Day EMPG Compliance Clock`.
   - `1. TODAY & TRIAGE` (`NEEDS ACTION NOW` + `MY WORK LIST`), `2. PRIORITY AGENDA`, `3. ANALYTICS & CHARTS`, and `4. FULL 55-COUNTY REGISTER`.
2. Using `/legal-procurement-review`, score (`1:3:9`) and redline this emergency debris & cyber-recovery vendor contract clause submitted at `02:00 AM` during the storm:
   > "Emergency Clause 9: County agrees to uncapped Time-and-Materials billing for 90 days with no not-to-exceed ceiling, agrees to indemnify Contractor against all third-party environmental claims, submits to binding arbitration in Texas, and grants Contractor perpetual rights to train commercial AI models on uploaded county infrastructure logs."
3. Write the rendered Command Center HTML to the Conversation Artifact Directory (`UserFacing: true`).
```

---

## 4. Act 3 (`20 Min`) — Signature Differentiator: *"Gemini Builds It, Claude Audits It"* Live SME Crucible

After all 5 pods finish building in **Gemini 3.8 Flash**, every table clicks the **Model Selector** in Antigravity (`bottom-left of prompt box`), switches to **Anthropic Claude Sonnet** (or **Claude Opus**), and pastes this universal **Cold-Start SME Statutory & Life-Safety Audit Prompt**:

```text
Act as an independent West Virginia Subject Matter Expert (Emergency Management, Legal & Cybersecurity Auditor) reviewing the deliverable we just generated in this workspace.

Audit our generated scenario/kit against these 4 non-negotiable West Virginia & federal rules and output a 1-Page SME Verification Certificate (PASS / BLOCKING FIX NEEDED):
1. Hazmat & Life-Safety Accuracy: Do all isolation and downwind protective distances match DOT PHMSA ERG 2024 (e.g., UN1005 Guide 125 / Table 3 = 500 ft isolation, 0.5 mi daytime downwind for large spills) without conflating small-spill vs. large-spill tables?
2. Federal Grant & FEMA PA Guardrails (2 CFR Part 200 & FEMA PAPPG): Are Time-and-Materials (T&M) emergency contracts strictly capped (70-hour initial emergency window + hard dollar ceiling + independent load/scale verification)?
3. West Virginia Statutory & Cyber Compliance: Are emergency powers cited accurately under W. Va. Code § 15-5-6 / § 15-5-11, sovereign immunity preserved (W. Va. Const. art. VI, § 35), CONUS-only data residency enforced, and WV HB 5638 cyber isolation rules followed?
4. Public Warning Completeness: Does the public warning message satisfy all 7 Essentials within <= 120 words in active plain language?
```

---

## 5. Act 4 & Act 5 (`45 Min`) — Live Multi-Pod Crisis Playoff & Governor's Command Center Rollup

1. **Facilitator Projects the Master Exercise Clock (`00:00 → 45:00` simulated):**
   - **Round 1 (`10 min`):** Pod 1 (`WVEMD`) and Pod 3 (`Debris/PA`) announce Kanawha/Fayette protective zones (`500 ft` / `0.5 mi`) and `70-hour` T&M monitoring rules using their live apps.
   - **Round 2 (`10 min`):** Pod 2 (`WVOT Cyber`) adjudicates the SCADA water intrusion while Pod 4 (`DoHS / PIO`) drafts a `<=120-word` joint Shelter-in-Place + Boil Water warning and scores it live (`Target: 100/100` on the big screen!).
   - **Round 3 (`10 min`):** Pod 5 (`Governor's Office / Counsel`) blocks the predatory `02:00 AM` T&M contract clause and proclaims a 6-county State of Emergency (`W. Va. Code § 15-5-6`).
2. **Grand Finale (`15 min`):** Each pod clicks **`Export AAR to Command Center (.json)`** on their simulator/kit, rolling their HSEEP `P/S/M/U` ratings and Corrective Actions into Pod 5's **Governor's Command Center Dashboard**—proving how West Virginia owns a **connected, FedRAMP-compliant statewide readiness ecosystem** instead of siloed `.docx` attachments and USB thumb drives.
