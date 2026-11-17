# WV Design Studio — Standing Rules

When creating or updating dashboards, slide decks, or branded documents in a workspace:

1. **Preserve Visual Edits (`dashboard.config.json` Is Source of Truth):**
   - Always read `dashboard.config.json` from disk immediately before editing it so you never overwrite layout spans, card order, titles, or theme colors the user saved visually in Chrome or Edge.
   - Whenever you update `dashboard.config.json` or `data/snapshot.json` in a dashboard project, also keep `<script id="initial-data" type="application/json">` inside `index.html` synced (escaping `<` as `\u003c`) so **Zero-Node `file://` Browser Mode** stays current on laptops without Node.js.
2. **Official West Virginia Brand Defaults & Screenshot Emulation:**
   - Default palette when no reference screenshot is supplied: WV Navy `#053254`, WV Rust `#C1452C`, WV Gold `#D5A245`, neutral `#F4F6F8` / `#FFFFFF`, `Fira Sans` typography.
   - When the user shares a screenshot or brand PDF, extract its exact hex tokens and density into `dashboard.config.json` (or slide/flyer CSS variables).
3. **Zero Unsafe DOM Sinks & Read-Only Parameterized SQL:**
   - Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or `document.write` in generated JS; construct DOM/SVG nodes via `createElement`, `createElementNS`, and `textContent`.
   - Enforce read-only `SELECT` / `WITH ... SELECT` SQL with parameterized inputs (`@param`) and `maximumBytesBilled` cost caps on BigQuery; bind any local preview server strictly to `127.0.0.1`.
