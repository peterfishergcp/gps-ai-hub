---
name: ttx-simulator
description: >-
  Build, customize, verify, and launch interactive serverless HSEEP Multi-Role
  Tabletop & Crisis Simulators for any US state, county, or tribal/municipal
  jurisdiction (ships pre-loaded with all 55 West Virginia counties + Operation
  Winter Gorge, and supports 1-prompt "Swap to My State" customization via
  stateMeta). Features 6 Fog-of-War agency seats, a 16-unit dispatchable
  resource roster, 4 timed multi-domain injects with dynamic cascade
  consequences, an interactive ERG 2024 SVG plume and 4-sheet plotter map, a
  live 7-Essentials <=120-word public warning auto-scorer, and a 90-day FEMA
  EMPG After-Action Report / Improvement Plan (AAR/IP) exporter. Use when asked
  to create a tabletop exercise, crisis simulator, HSEEP SitMan, emergency
  readiness drill, or `/ttx-simulator`.
license: Apache-2.0
---

# WV HSEEP Multi-Role Tabletop & Crisis Simulator (`/ttx-simulator`)

Create deterministic, offline-capable **Homeland Security Exercise and Evaluation Program (HSEEP)** Tabletop & Crisis Simulators tailored to any of **West Virginia's 55 counties** (or `Anonymized WV Valley Town` for multi-county regional classes) that open instantaneously (`< 0.5s`) inside Antigravity's Side Pane with zero external network dependencies.

---

## Step 1: Plain-Language Intake (4 Questions or Zero-Question Express Path)

- **Zero-Question Express Path**: If the user's prompt already names a county, hazard, or asks for the flagship West Virginia demo, **skip questions and proceed directly to Step 2** (defaulting to `Kanawha` County — Charleston and `wv-operation-winter-gorge`).
- **Guided 4-Question Intake**: When the user asks to design a new custom tabletop exercise without details, ask these 4 concise plain-language questions:
  1. **West Virginia Jurisdiction**: *"Which of West Virginia's 55 counties should anchor the exercise (for example `Kanawha`, `Cabell`, `Berkeley`, `Monongalia`, `Raleigh`, or `McDowell`), or would you prefer `Anonymized WV Valley Town` for a regional class?"*
  2. **Primary & Compound Hazards**: *"Would you like to start from **Operation Winter Gorge** (Ice Storm + `UN1005` 9,000 lb Anhydrous Ammonia Release + Municipal Water SCADA Ransomware), swap to another `ERG 2024` / natural hazard profile (`UN1017` Chlorine, `UN1170` Ethanol Rail Fire, `UN1075` Propane BLEVE, flash flood), or model a local facility?"*
  3. **Agency Seats at the Table (`Fog-of-War`)**: *"Should we keep the default 6 agency seats (`Master Facilitator`, `County EOC & WVEMD`, `Fire & Hazmat IC`, `WVOT Cyber & Water SCADA`, `Hospital & DoHS Health`, `PIO & County Commission`), or tailor seats to specific local departments?"*
  4. **Evaluated FEMA Core Capabilities (`90-Day EMPG AAR/IP`)**: *"Which 3–6 FEMA Core Capabilities (from `references/fema_32_core_capabilities.json`) do you want pre-loaded into Tab 4's After-Action Report / Improvement Plan?"*

---

## Step 2: Scaffold, Customize `ttx.config.json`, and `--sync`

1. **Scaffold the simulator workspace** using the bundled zero-dependency Node.js scaffolder (`node:fs`, `node:path`, `node:crypto` only):

   ```bash
   node "<skill_dir>/scripts/scaffold_ttx.mjs" \
     --target "./ttx-exercise" \
     --template "wv-operation-winter-gorge"
   ```

   - Optional flag: pass `--county "Cabell"` (or any of the 55 WV counties / `"Anonymized WV Valley Town"`) to set the initial jurisdiction directly, or `--force` to reset an existing `ttx.config.json`.

2. **Customize `ttx.config.json` (Read First!)**:
   - Always read `./ttx-exercise/ttx.config.json` before editing so existing facilitator customizations are preserved.
   - Use jurisdiction placeholders (`{COUNTY}`, `{SEAT}`, `{WVEMD_AREA}`, `{WVDOH_DIST}`, `{WVSP_TROOP}`, `{RPDC}`, `{USACE_DIST}`, `{RIVER_BASIN}`, `{LEGACY_FLOOD_WORKS}`) in narrative strings so switching the County dropdown dynamically re-localizes the entire exercise in real time.
   - **Adapting to Any Other US State ("Swap to My State")**: When the user asks for another state (for example Florida, Texas, California, Virginia, Ohio, or Pennsylvania), populate top-level `stateMeta` in `ttx.config.json` (`stateTitle`, `shortState`, `stateCode`, `selectLabel`, `emaLabel`, `dotLabel`, `policeLabel`, `rpdcLabel`, `statutoryFooter`), replace `jurisdictions[]` with that state's counties/parishes, update state statutory citations (e.g., `Fla. Stat. Ch. 252`, `Tex. Gov't Code Ch. 418`, `Cal. Gov. Code § 8550`), and run `--sync` (skip `--verify`'s WV-only 55-county assertion when using non-WV jurisdictions, while still verifying all `ERG 2024` distances and `FEMA EMPG` / `2 CFR 200` rules).
   - Ensure every timed inject includes 4 options graded `RECOMMENDED`, `ACCEPTABLE WITH LIMITS`, or `NOT RECOMMENDED` with pinpoint statutory/technical citations, and populate `cascadeAlert` on suboptimal choices so downstream injects automatically surface red **`DYNAMIC CASCADE ALERT`** banners.

3. **Re-bundle & Verify via `--sync`**:
   After editing `ttx.config.json`, regenerate `index.html` and the self-contained `ttx-standalone.html` (stamped with fresh SHA-256 Content-Security-Policy hashes):

   ```bash
   node "<skill_dir>/scripts/scaffold_ttx.mjs" \
     --target "./ttx-exercise" \
     --sync
   ```

---

## Step 3: SME Deterministic & Dual-Model Verification Gate

Before delivering a custom or modified scenario to emergency managers, complete this two-pass quality gate:

### Pass 1 — Deterministic Statutory & ERG 2024 Check (Mandatory)
Run the built-in verifier against `<skill_dir>/references/erg2024_and_wv_code_verifier.json`, `<skill_dir>/references/wv_55_counties_crosswalk.json`, and `<skill_dir>/references/fema_32_core_capabilities.json`:

```bash
node "<skill_dir>/scripts/scaffold_ttx.mjs" \
  --target "./ttx-exercise" \
  --verify
```

Confirm:
- **ERG 2024 Protective Distances & Warnings**:
  - `UN1005` Anhydrous Ammonia (`Guide 125`): Small `100 ft` / `0.1 mi` day / `0.2 mi` night; Large `500 ft` / `0.5 mi` day / `1.3 mi` night; water fog on vapor cloud ONLY—never apply direct water stream into pooled liquid ammonia.
  - `UN1017` Chlorine (`Guide 124`): Small `200 ft` / `0.3 mi` day / `1.1 mi` night; Large `1000 ft` / `1.9 mi` day / `4.9 mi` night.
  - `UN1170` Ethanol (`Guide 127`): Requires `AR-AFFF` polar-solvent foam; `0.5 mi` tank-car fire isolation.
  - `UN1075` Propane / LPG (`Guide 115`): `1.0 mi` (`1600 m`) isolation if tank is involved in fire (`BLEVE` hazard).
- **West Virginia & Federal Statutory Citations**:
  - `W. Va. Code § 15-5-6` (Governor State of Emergency Proclamation)
  - `W. Va. Code § 15-5-8 & § 15-5-11` (Local Emergency Services & Intrastate Mutual Aid)
  - `W. Va. Code § 15-5-22` (Emergency Management Assistance Compact — `EMAC`)
  - `WV HB 5638 / WVOT Cyber Incident Protocol` (Immediate OT/IT isolation, forensic log preservation, WVOT CISO / WV Fusion Center reporting, no unapproved ransom payments)
  - `FEMA FY2025 EMPG Manual §§ 12.8.2 & 12.10` (HSEEP progressive exercise & mandatory `90-calendar-day` `AAR/IP` submission)
  - `2 CFR §§ 200.318–200.327 & FEMA PAPPG` (`<= 70-hour` emergency Time-and-Materials ceiling, hard dollar cap, independent load monitoring)

### Pass 2 — Optional Dual-Model Statutory Review (`Claude Sonnet` / `Claude Opus`)
For formal county or state exercises, offer the facilitator a cold-start second-opinion review prompt (with zero prior chat context) for `Claude Sonnet` or `Claude Opus`:

> *"Review the attached `ttx.config.json` cold with zero assumptions. Verify: (1) every `ERG 2024` isolation and downwind protective action distance matches the release quantity and guide number, (2) `W. Va. Code Chapter 15 Article 5`, `WV HB 5638`, `EMTALA`, and `2 CFR Part 200` citations accurately reflect statutory authority, (3) `cascadeAlert` consequences logically follow from earlier suboptimal inject selections without contradicting role blind spots, and (4) the `sampleGoldDraft` warning stays `<= 120` words while covering all 7 HSEEP Public Warning Essentials. Classify findings strictly as `BLOCKING_ACCURACY_FIX` or `OPTIONAL_POLISH`."*

---

## Step 4: Deliver `ttx-standalone.html` to Antigravity Side Pane (Zero Localhost `.url.json` Cards)

1. Copy or write the generated `ttx-standalone.html` directly to `<appDataDir>/brain/<conversation-id>/ttx-standalone.html` using `write_file` with `ArtifactMetadata`:
   - `UserFacing: true`
   - `RequestFeedback: false`
   - `Summary`: Concise summary of the county crosswalk, 6 agency seats, 4 timed injects with dynamic cascade branching, 7-Essentials public warning scorer, and 90-day EMPG `AAR/IP` export.
2. **Serverless Artifact Rule**: **Do NOT** start a `127.0.0.1` HTTP server or create `.url.json` localhost bookmark cards unless the user explicitly asks for a local dev server. `ttx-standalone.html` runs 100% serverless in `< 0.5s` offline inside Antigravity's Side Pane and includes built-in **`Print SitMan / AAR`**, **`Export AAR to Command Center (.json)`**, and **`Open / Download HTML ↗`** controls.

---

## Mandatory Security & Offline Architecture Verification

- **DOM Construction Only**: `assets/runtime/app.js` constructs every HTML and SVG element exclusively via `document.createElement`, `document.createElementNS`, `element.replaceChildren()`, and `textContent`—zero unsafe HTML string sinks or dynamic code evaluation.
- **Strict SHA-256 CSP & Zero External Network Calls**: `scaffold_ttx.mjs` computes cryptographic SHA-256 hashes (`node:crypto`) for inline `<style>` and `<script>` blocks and locks `default-src 'none'; connect-src 'none'`, ensuring zero external CDN/font requests and instant air-gapped EOC readiness.
- **Path & Substitution Safety**: `scaffold_ttx.mjs` enforces `path.resolve` directory boundary checks with trailing `path.sep` and uses function callbacks `.replace(target, () => replacement)` so `$` characters in JSON/JS payloads are never corrupted.
