---
name: field-ops-kit
description: Turns agency emergency SOPs, federal disaster regulations (2 CFR Part 200, FEMA PAPPG, 33 CFR Parts 203/208), state statutory doctrine (pre-loaded with West Virginia W. Va. Code § 15-5 + 55-county crosswalk, and 1-prompt customizable to any US state via stateMeta), and raw operational logs (TDMS gate camera timestamps, truck tare registries, certified landfill scale tickets, contractor invoices) into an offline serverless Field Readiness, Forensic Crosswalk & Regional Kit (ops-kit-standalone.html). Trigger on /field-ops-kit, disaster field binder, FEMA PA deobligation audit check, forensic debris hauling record-gap crosswalk, or county SEOC regional crosswalk.
---

# Field Operations, Readiness & Forensic Crosswalk Kit (`/field-ops-kit`)

Builds an offline-capable, zero-dependency serverless application (`ops-kit-standalone.html`) designed for State & County Emergency Operations Centers (SEOC/EOCs), County Commissions, Emergency Services Directors, Purchasing Clerks, and Public Assistance closeout teams.

It converts dense federal/state disaster regulations and raw contractor hauling records into **four integrated operational modules**:

1. **7-Tab Disaster Timeline Binder**: Chronological plain-language field tools (`Tab 0` through `Tab 6`, 24 concrete tools in the West Virginia FEMA PA baseline) with crimson Deobligation Trap callouts, statutory endnotes (`2 CFR §§ 200.318–200.327`, `44 CFR § 206.224`, `33 CFR Parts 203 & 208`, `W. Va. Code § 15-5`, `PHMSA ERG 2024`), cross-binder instant search, and 1-click copyable county checklists/task-order riders.
2. **25-Question County Readiness Self-Check**: Interactive 5-pillar readiness assessment across all **55 West Virginia counties**, calculating a live **Readiness Score (`%`)**, **FEMA Deobligation Risk Badge**, and auto-sorted **Prioritized County Action Plan** with `.json` export and print-ready layout.
3. **Forensic Record-Gap Crosswalk**: Reconciles unmonitored disaster hauling periods (`Weeks 1–3 Unmonitored Gap`) against an independently monitored empirical benchmark (`Week 4 Monitored Baseline`) across **6 deterministic physics & identity checks**, featuring a live **Max Loaded-Trip Minutes Slider (`35–65 min`)** that recalculates `Independently Verified ($)` vs. `Questioned / Hold ($)` and drafts an audit-ready **Federal Reviewer Justification Memo** (`2 CFR § 200.403`).
4. **55-County / 28-Region Crosswalk ("SEOC Big Map" Matrix)**: Cross-indexes all **55 West Virginia counties**, County Seats, 6 WVEMD Base Areas, 3 USACE Districts (`Huntington`, `Pittsburgh`, `Baltimore`), 10 WVDOH Engineering Districts, 6 WV State Police Troops, 11 RPDCs, River Basins, and **132 tracked statewide flood-control works** (`112` outside the federal levee database).

---

## Quick Start Workflow

### Step 1: Scaffold the Default West Virginia FEMA PA & 55-County Kit

Run the built-in zero-dependency Node.js bundler (`Node >= 18`, zero `npm install`, zero Python):

```bash
node scripts/scaffold_ops_kit.mjs --target ./wv-field-ops-kit --force
```

Optional CLI flags:
- `--target <dir>`: Target output directory (required).
- `--template <json>`: Path to a custom agency/county JSON dataset (defaults to `assets/templates/wv-fema-pa-debris-and-crosswalk.json`).
- `--county <name>`: Pre-selects a specific county (e.g., `--county McDowell` or `--county Cabell`) in Tab 2.
- `--title <text>`: Overrides the top banner title.
- `--force`: Safely updates an existing target directory.

### Step 2: Open Offline or Preview in Side Pane

Open `<target>/ops-kit-standalone.html` directly via `file://` in any browser, air-gapped EOC laptop, or Antigravity Side Pane (`< 0.5s` cold load, zero external network requests).

---

## Customizing for Any County SOP or Hauling Dataset

When a user provides agency SOP documents, county standby contracts, or raw hauling spreadsheets (CSV/TSV/JSON of gate camera logs, certified landfill scale tickets, and contractor invoices):

1. Copy `assets/templates/wv-fema-pa-debris-and-crosswalk.json` to `<target>/data/custom-ops-kit.json`.
2. Map source policies and statutory gates into `binderTabs[]` (`id`, `shortCode`, `title`, `phaseWindow`, `summary`, and `tools[]` with `id`, `title`, `category`, `cite`, `riskLevel`, `summary`, `trapWarning`, `steps[]`, `copyChecklist[]`, and `endnote`).
3. Map readiness controls into `selfCheckPillars[]` (5 pillars x 5 controls recommended, with `severity` in `CRITICAL | HIGH | MODERATE`, `owner`, `cite`, and plain-language `actionItem`).
4. Map hauling reconciliation rows into `forensicCrosswalk.loads[]`:
   - `loadId`, `date`, `period` (`Weeks 1–3 Unmonitored Gap` vs. `Week 4 Monitored Baseline`)
   - `truckId`, `registeredTareTons`, `emptyTareTons`
   - `gateExitTime` (`HH:MM`), `scaleArrivalTime` (`HH:MM`), `loadedTransitMin`, `roundTripTurnaroundMin`
   - `scaleTicketId`, `netTonsWeighed`, `billedTons`, `ratePerTon`, `contractorBilledUsd`
   - `activeFleetCount`, `gatePhotoHash`, `photoContinuityOk`, `isDuplicateTicket`
5. Consult `references/wv_55_counties_crosswalk.json` and `references/erg2024_and_wv_code_verifier.json` when targeting West Virginia. **To adapt to any other US state ("Swap to My State")**, add top-level `stateMeta` (`stateName`, `stateCode`, `emaLabel`, `emaShort`, `dotShort`, `policeShort`, `rpdcLabel`, `closeoutAgency`, `regionsSub`) in `custom-ops-kit.json`, populate `regionalCrosswalk.counties[]` with your target state's counties, and update state emergency/environmental statutory citations—the Tab 4 filter dropdowns, area chips, headers, and FEMA closeout memo automatically re-brand with zero JavaScript edits.
6. Re-bundle with:
   ```bash
   node scripts/scaffold_ops_kit.mjs --target ./wv-field-ops-kit --template ./wv-field-ops-kit/data/custom-ops-kit.json --force
   ```

---

## Six-Check Forensic Debris Hauling Audit Specification

Every hauling row in `forensicCrosswalk.loads[]` is evaluated live in the browser against six independent controls:

1. **Loaded-Trip Time Window**: Verifies `minPhysicalTransitMin <= loadedTransitMin <= sliderMaxTransitMin` (catches physically impossible short-hauls picked up outside the TDMS as well as unauthorized route detours).
2. **Round-Trip Turnaround**: Verifies consecutive truck cycles meet or exceed `minRoundTripTurnaroundMin` (loaded transit + scale queue/tipping + empty return + loading).
3. **Tare Weight Identity Consistency**: Flags any scale ticket where `|emptyTareTons - registeredTareTons| > maxTareVarianceTons` (catches uncertified heavy chassis swapped under magnetic truck placards).
4. **Active Fleet Count**: Verifies concurrent active trucks per shift never exceed `certifiedFleetLimit`.
5. **Billed vs. Scale Tonnage Match**: Rejects duplicate `scaleTicketId` submissions and any invoice where `|billedTons - netTonsWeighed| > maxBilledVsScaleVarianceTons`.
6. **Photo Timestamp Continuity**: Requires a verified NTP-synced TDMS gate exit photo hash (`sha256:...`) matching each claimed load.

---

## Architecture & Mandatory Security Rules

- **Safe DOM Construction Only**: Frontend JavaScript (`assets/runtime/app.js`) builds every HTML and SVG element strictly via `document.createElement`, `document.createElementNS`, `element.replaceChildren()`, and `textContent`. Dynamic HTML string sinks, `document.write`, code-string evaluation, and blocking native `alert()`/`confirm()`/`prompt()` dialogs are strictly prohibited.
- **Zero External Network Dependencies**: No external stylesheets, web fonts, CDNs, or telemetry calls—ensuring air-gapped EOC reliability and `< 0.5s` offline rendering.
- **Safe Template Replacement**: `scripts/scaffold_ops_kit.mjs` uses function callbacks `.replace(token, () => value)` exclusively so currency strings (`$68.00`, `$23,140.40`) are never corrupted by regex replacement tokens, and escapes closing script sequences inside embedded JSON payloads.
- **Path & Input Validation**: `scripts/scaffold_ops_kit.mjs` validates CLI arguments against a strict flag allowlist, resolves directory boundaries via `path.resolve()`, blocks writes to system paths, and requires `--force` before updating non-empty directories.

## Verification Plan

### Automated Security & Quality Checks

- **Syntax & Bundler Check**: Run `node --check assets/runtime/app.js` and `node --check scripts/scaffold_ops_kit.mjs`, then execute `node scripts/scaffold_ops_kit.mjs --target <preview-dir> --force`.
- **DOM Sink & Network Audit**: Confirm zero unsafe HTML string injection sinks, zero external `http://`/`https://` asset URLs in `assets/runtime/`, and zero browser console errors in Headless Chrome across all 4 tabs.
- **Security Scanner & Scrubbing Verification**: Run the workspace security scanner (when active) and external scrub verification across all skill files to confirm zero XSS, path-traversal, or internal-artifact findings.
