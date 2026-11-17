# WV Design Studio (`wv-design-studio`)

Empowers State of West Virginia analysts, program leads, and communications teams to build **dynamic dashboards**, **executive slide decks**, and **print-ready branded documents** with **zero local libraries or runtimes required on corporate laptops**.

## Included Skills, Agent & Live Preview Panel
- **`/wv-dashboard`** — Creates interactive dashboards with automatic **Rendered Side-Pane Artifact preview** (`dashboard-standalone.html`), **1-Click Browser Launch URL Card** (`http://127.0.0.1:4175/view/<id>`), visual drag-and-drop **Customize Layout** editing, screenshot style emulation, **Zero-Node `file://` Browser Mode**, federated Gemini Enterprise data synthesis, and optional live BigQuery queries.
- **`/slides`** — Generates responsive **16:9 HTML/CSS Presentation Decks** with automatic Side-Pane visual preview, 1-click browser launch, keyboard navigation, speaker notes drawer, WV `#053254` Navy / `#C1452C` Rust / `#D5A245` Gold brand theming, and crisp `Print -> Save as PDF` export.
- **`/doc-design`** — Produces 1–2 page print-CSS stakeholder flyers, Bottom-Line-Up-Front (BLUF) decision memos, executive summaries, press releases, and plain-language public notices—rendered visually in the Side Pane and launchable in Chrome/Edge in 1 click.
- **`WV Preview` (`wv-design-preview` UI Sidecar)** — Built-in Sidebar & AuxPane panel (`http://127.0.0.1:4175`) that renders all generated Dashboards, Slide Decks, and Flyers visually inside Antigravity and launches them in Chrome/Edge in 1 click with zero terminal confirmation prompts.
- **`wv-design-architect` (Agent)** — Multimodal visual style & schema specialist that extracts exact hex tokens, typography, and card geometry from reference screenshots or agency PDFs.
