# Emergency Readiness & HSEEP Crisis Studio — Standing Rules

When building or customizing Tabletop Exercises (`/ttx-simulator`) or Field Readiness & Forensic Crosswalk Kits (`/field-ops-kit`), enforce these rules at all times:

## 1. Preserve Facilitator Customizations (Spec Files Are Source of Truth)
- Always read existing `ttx.config.json` or `data/ops-kit-data.json` (`custom-ops-kit.json`) from disk immediately before modifying an exercise or field kit so facilitator edits to injects, role blind spots, readiness questions, or transit thresholds are never overwritten.
- When adapting to another US state or jurisdiction, populate `stateMeta` and `jurisdictions[]` / `regionalCrosswalk.counties[]` in JSON rather than hardcoding state strings inside `assets/runtime/app.js`.

## 2. Deterministic Life-Safety, ERG 2024 & Statutory Accuracy
- Never guess protective action distances for hazardous materials. Verify every isolation radius, day/night downwind protective action distance, and water-reactivity warning against the **2024 PHMSA Emergency Response Guidebook (`ERG 2024`)** (`references/erg2024_and_wv_code_verifier.json`).
- Cite exact federal rules (`2 CFR §§ 200.318–200.327` procurement & `<= 70-hour` emergency Time-and-Materials cap, `2 CFR § 200.403` cost allowability, `44 CFR § 206.224` debris removal, `33 CFR Parts 203 & 208` flood works, `FEMA EMPG` 90-day `AAR/IP` requirement) alongside verified state emergency statutes.

## 3. Zero-Dependency, Air-Gapped EOC & Locked-Down Endpoint Readiness
- Keep scaffolders (`scaffold_ttx.mjs`, `scaffold_ops_kit.mjs`) 100% free of external `npm` or Python dependencies (Node.js 18+ built-in modules only) so exercises build cleanly on locked-down government laptops.
- Keep generated `*-standalone.html` bundles 100% self-contained with **zero** external CDN, web font, or telemetry requests so exercises run offline in Emergency Operations Centers (`EOCs`) or from a USB drive in `< 0.5s`.
- Construct all HTML and SVG elements strictly via `document.createElement`, `document.createElementNS`, `replaceChildren`, and `textContent` (`0` `innerHTML`, `outerHTML`, `document.write`, or `eval` sinks).
