# 1-Prompt "Swap to My State" Recipes (`agy-emergency-readiness`)

Both `/ttx-simulator` and `/field-ops-kit` are **100% data-driven via JSON** (`ttx.config.json` and `custom-ops-kit.json` + `stateMeta`). Every header, jurisdiction dropdown, agency filter chip, regional matrix column, and FEMA Public Assistance closeout memo re-brands automatically with **zero JavaScript edits**.

Copy and paste any prompt below into Google Antigravity after installing `emergency-readiness`:

---

## 1. Florida (`FDEM` Regions · Hurricane + Chlorine Water Plant + Coastal Debris)

### Tabletop Simulator (`/ttx-simulator`)
```text
Run /ttx-simulator and adapt the template to the State of Florida (stateMeta: FDEM Regions 1-10, FDOT Districts, FHP Troops, Regional Planning Councils, Fla. Stat. Ch. 252). Build "Operation Gulf Surge": a Category 4 landfall in Pinellas, Hillsborough, Lee, Miami-Dade, Leon, and Duval Counties triggering a 1-ton Chlorine cylinder leak (ERG 2024 Guide 124, UN1017) at a municipal water treatment plant plus an OT SCADA intrusion on coastal lift stations. Verify all ERG 2024 distances and open the standalone HTML simulator.
```

### Field Ops & Forensic Debris Kit (`/field-ops-kit`)
```text
Run /field-ops-kit for the State of Florida (FDEM / FDEP Disaster Debris Management Site rules, Fla. Stat. Ch. 252, 2 CFR Part 200, and FEMA PAPPG Category A). Populate a representative Florida county crosswalk across FDEM Regions, USACE Jacksonville/Mobile Districts, FDOT Districts, and FHP Troops, and generate the standalone Field Readiness & 6-Check Vegetative/C&D Debris Forensic Crosswalk Kit.
```

---

## 2. Texas (`TDEM` Regions · Gulf Coast Petrochemical Rail + Flash Flood)

### Tabletop Simulator (`/ttx-simulator`)
```text
Run /ttx-simulator and adapt the template to the State of Texas (stateMeta: TDEM Regions 1-8, TxDOT Districts, DPS Regions, COGs, Tex. Gov't Code Ch. 418). Build "Operation Brazos Shield" across Harris, Galveston, Travis, Bexar, Dallas, Tarrant, and El Paso Counties combining flash flooding with a multi-car Ethanol (UN1170, ERG 2024 Guide 127) and Liquefied Petroleum Gas (UN1075, Guide 115 BLEVE) rail derailment and county CAD/911 ransomware inject. Open the standalone HTML simulator.
```

---

## 3. California (`Cal OES` Mutual Aid Regions · Wildfire WUI + Hospital Surge + Debris)

### Tabletop Simulator (`/ttx-simulator`)
```text
Run /ttx-simulator and adapt the template to the State of California (stateMeta: Cal OES Mutual Aid Regions I-VI, Caltrans Districts, CHP Divisions, Cal. Gov. Code § 8550 / SEMS). Build "Operation Foothill Ember" across Butte, Shasta, Sonoma, Los Angeles, Ventura, and San Diego Counties featuring a fast-moving WUI wildfire threatening a cold-storage Anhydrous Ammonia (UN1005, ERG 2024 Guide 125) agricultural facility, PSPS power shutoffs, and skilled-nursing evacuation. Open the standalone HTML simulator.
```

---

## 4. Virginia / Mid-Atlantic (`VDEM` Regions · Nor'easter + Port/Rail Hazmat + Cyber)

### Tabletop Simulator (`/ttx-simulator`)
```text
Run /ttx-simulator and adapt the template to the Commonwealth of Virginia (stateMeta: VDEM Regions 1-7, VDOT Districts, VSP Divisions, PDCs, Va. Code § 44-146.16). Build "Operation Tidewater Ice" across Norfolk, Virginia Beach, Fairfax, Henrico, Roanoke, and Augusta Counties with a coastal storm surge, UN1005 cold-storage ammonia release near an interstate bridge, and municipal utility billing/SCADA intrusion. Open the standalone HTML simulator.
```

---

## 5. Bring Your Own State / County SOPs & Raw Hauling Spreadsheets

```text
Run /field-ops-kit for [YOUR STATE & COUNTY]. Ingest the attached County Emergency Debris Management Plan PDF and our raw CSV of TDMS gate logs, registered truck tares, landfill scale tickets, and contractor invoices. Map our state statutes into the 7-Tab Operational Binder, calibrate the 6-Check Forensic Crosswalk transit floor/ceiling to our haul corridor mileage, and generate an offline ops-kit-standalone.html ready for FEMA Public Assistance review.
```
