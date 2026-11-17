# WV Design Studio (`wv-design-studio`)

Empowers State of West Virginia analysts, program leads, and communications teams to build **dynamic dashboards**, **executive slide decks**, and **print-ready branded documents** with **zero local libraries or runtimes required on corporate laptops**.

## Included Skills & Agent
- **`/wv-dashboard`** — Creates interactive dashboards with visual drag-and-drop **Customize Layout** editing, screenshot style emulation, **Zero-Node `file://` Browser Mode** (saves directly to `dashboard.config.json` in Chrome/Edge via `window.showSaveFilePicker()`), federated Gemini Enterprise data synthesis, and optional `127.0.0.1:4173` live BigQuery queries when `node` is present.
- **`/slides`** — Generates responsive **16:9 HTML/CSS Presentation Decks** with keyboard navigation, speaker notes drawer, WV `#053254` Navy / `#C1452C` Rust / `#D5A245` Gold brand theming, and crisp `Print -> Save as PDF` export.
- **`/doc-design`** — Produces 1–2 page print-CSS stakeholder flyers, Bottom-Line-Up-Front (BLUF) decision memos, executive summaries, press releases, and plain-language public notices.
- **`wv-design-architect` (Agent)** — Multimodal visual style & schema specialist that extracts exact hex tokens, typography, and card geometry from reference screenshots or agency PDFs.
