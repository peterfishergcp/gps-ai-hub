---
name: output-engineer
description: >-
  Deconstructs technical drafts, CE security questionnaire responses, and field
  architecture proposals into 4 verifiable output modalities: (1) ASD-STE100
  Simplified Technical English (~80% pragmatic strictness), (2) Declarative
  Mermaid.js architecture and sequence diagrams, (3) Interactive HTML Review
  Canvas dashboards, and (4) Timestamped explainer video storyboards, paired
  with a Dual-Model Adversarial Review (Gemini Pro vs. Claude Opus). Use when
  reviewing, auditing, or output-engineering AI-generated customer responses,
  security reviews, RFPs, or architecture docs.
metadata:
  icon: 🔍
---

# Output Engineering Verification Loop (`output-engineer`)

Use this skill to transform dense AI-generated technical drafts (such as Customer Engineer security questionnaire responses, Field Architect proposals, or RFP technical narratives) into a structured, multi-modal verification package that a human specialist can audit in under 3 minutes.

---

## Architecture of the Output Engineering Loop

When given a technical draft, email thread, or document to verify, execute the following four-phase pipeline:

```
[Raw AI / CE Technical Draft]
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Claim Extraction & Ground-Truth Verification       │
│ - Decompose prose into atomic, falsifiable technical claims │
│ - Verify APIs, quotas, flags, execution order, and IAM      │
│   against official documentation and codebase references    │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 2: Dual-Model Adversarial Cross-Examination           │
│ - Gemini Pro (Defender/Synthesizer): Deep codebase & doc    │
│   grounding across full context window                      │
│ - Claude Opus (Challenger/Auditor): Formal logic audit,     │
│   implicit assumption detection, and STE100 enforcement     │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 3: 4-Modality Transmutation Engine                    │
│ ├─ Modality 1: ASD-STE100 Controlled Writing (~80% Rules)   │
│ ├─ Modality 2: Declarative Mermaid.js Diagrams              │
│ ├─ Modality 3: Interactive HTML Review Canvas               │
│ └─ Modality 4: Explainer Video Storyboard & Narration       │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ Phase 4: Rapid Human Review Delivery                        │
│ - Save standalone Interactive HTML Canvas to artifact dir   │
│ - Render inline summary widget or side-pane Canvas          │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Atomic Claim Extraction & Ground-Truth Audit

Before rewriting or formatting any text, extract every testable assertion from the draft and classify it into one of five high-risk categories:

1. **Execution Order & Pipeline Gates:** Does the draft claim Service A runs before Service B (e.g., Model Armor vs. Sensitive Data Protection inspection order, or pre-planner vs. post-rewriter screening)? Verify the exact call sequence in official architecture docs or source code.
2. **Data Boundaries & Identity Propagation:** Does the draft claim "zero user identifiers cross into model serving"? Check whether `user_email`, `user_full_name`, or `cloud_principal_id` (`user_cpi`) are injected into `system_instruction` or request extensions (`tenant_stream_id`).
3. **Default Flag States & Client vs. Backend Enforcement:** Does the draft credit a backend service for a security control that is actually disabled by default (`enable_in_backend = false`) and enforced in the web client (`ucs_widget`) instead?
4. **Numeric Quotas, Limits & Thresholds:** Verify every number (MB upload limits, requests/minute, tool call caps per turn) against official quota documentation and configuration files. Never conflate Search quotas with Assistant quotas.
5. **Edition & Licensing Entitlements:** Confirm whether security controls (CMEK, VPC-SC, Data Residency, Access Transparency, Model Armor) are included in the customer's purchased tier (e.g., Standard vs. Plus) and note regional constraints (`us` / `eu` multi-regions).

Assign each claim a verification status:
- `VERIFIED`: Matches both public documentation and production behavior.
- `NUANCE_REQUIRED`: Public contract is simpler than runtime behavior, or requires a compensating control (e.g., single federated connector per app).
- `CONTRADICTED`: Draft statement is factually wrong or inverted compared to production reality.

---

## Phase 2: Dual-Model Adversarial Cross-Examination (Gemini Pro vs. Claude Opus)

When the user requests a dual-model benchmark or adversarial review, run the draft through both **Gemini Pro** (`gemini-3.1-pro-high`) and **Claude Opus** (`opus-5.5-high`) using Jetski/Antigravity `swarm` workers (or Vertex AI Model Garden endpoints) in a **Challenger-Defender** pattern:

| Evaluation Dimension | Gemini Pro Focus (`gemini-3.1-pro-high`) | Claude Opus Focus (`opus-5.5-high`) |
| :--- | :--- | :--- |
| **Primary Role** | **Context Synthesizer & Documentation Grounder** | **Adversarial Logic Challenger & STE100 Enforcer** |
| **Audit Strength** | Rapid multi-document synthesis, quota/config cross-referencing, and clean architectural diagrams | Exposing internal contradictions between sections, catching over-broad security promises ("NEVER transmitted"), and enforcing strict sentence-length caps |
| **Mandatory Deliverables** | • Top Architectural & Config Discrepancies<br>• Documentation & Code Citations<br>• Quota & Feature Verification Table | • Atomic Claim Ledger (`VERIFIED` / `NUANCE` / `CONTRADICTED`)<br>• Strict ASD-STE100 Rewrite (`<=20w` P / `<=25w` D)<br>• Missing Customer Edge Cases & Required Fixes |

---

## Phase 3: The 4 Output Modalities

### Modality 1: Controlled Technical Writing — ASD-STE100 (~80% Pragmatic Strictness)

Rewrite dense AI prose into **Simplified Technical English (ASD-STE100)** so a reviewer can verify every claim on a single read. See [references/asd_ste100_quick_reference.md](./references/asd_ste100_quick_reference.md) for the complete rule catalog.

- **Classify Every Sentence:** Tag **Procedural (`P`)** instructions (what the admin/user does) separately from **Descriptive (`D`)** architecture explanations (how the system works).
- **Hard Sentence Length Caps:**
  - **Procedural sentences (`P`):** Maximum **20 words** per sentence (ASD-STE100 Rule 5.1). One instruction per sentence (Rule 5.2).
  - **Descriptive sentences (`D`):** Maximum **25 words** per sentence (ASD-STE100 Rule 6.3). Maximum **6 sentences** per paragraph (Rule 6.6).
- **Active Voice Only:** Replace passive constructions (*"The payload is evaluated by SDP"*) with active Subject-Verb-Object clauses (*"SDP inspects the payload"*).
- **Imperative Verbs for Procedures:** Start every procedural step with a direct command verb (*"Configure the Model Armor template"*, *"Set `failure_mode=FAIL_CLOSED`"*).
- **One Term Per Concept (Rule 1.11):** Pick one technical noun per entity and never rotate synonyms.
- **Zero AI Filler:** Delete all throat-clearing transitions (*"It is important to note that"*, *"Furthermore"*, *"In order to ensure comprehensive security"*).
- **Untouchables:** Never alter code identifiers, file paths, `gcloud` flags, IAM role strings, or quota numbers.

### Modality 2: Declarative Diagrams (Mermaid.js)

Translate every architectural narrative into at least two declarative Mermaid diagrams:

1. **Topology & Trust Boundary Flowchart (`flowchart LR` or `flowchart TD`):**
   - Explicitly group components into trust zones using `subgraph` blocks (e.g., `Zone 1: Customer GCP Org`, `Zone 2: Single-Tenant Google Project`, `Zone 3: Stateless Multi-Tenant Model Serving`).
   - Label every edge with the protocol, credential type, or payload restriction (e.g., `ALTS / TLS 1.3 (Service Agent Identity)`).
   - Quote all node labels containing parentheses or special characters: `id["Label (Detail)"]`.
2. **Sequence & Gate Execution Diagram (`sequenceDiagram`):**
   - Show the exact chronological order of security gates (e.g., `CheckQuery` -> `SanitizeUserPrompt` -> `Dolphin Planner` -> `Connector Tool` -> `after_tool_callback (SDP + Model Armor)` -> `Vertex AI Gemini` -> `CheckResponse`).
   - Highlight parallel (`par`) vs. sequential execution paths and fail-closed (`alt`) rejection branches.

### Modality 3: Interactive HTML Review Canvas

Generate a self-contained, interactive HTML artifact based on [resources/review_canvas_template.html](./resources/review_canvas_template.html):

- **Host Theme & Tailwind Compliance:** Include `<script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>` and use semantic host CSS variables (`bg-[var(--background)]`, `bg-[var(--card)]`, `text-[var(--foreground)]`, `text-[var(--muted-foreground)]`, `border-[var(--border)]`) so the Canvas adapts automatically to light and dark modes in Jetski/Antigravity and standalone browsers.
- **Required Interactive Views (5-Tab Interface):**
  1. **Claim & Red-Flag Inspector:** Filterable table of atomic claims with V1 Statement vs. Production Reality vs. Required Fix.
  2. **Dual-Model Benchmark (Gemini Pro vs. Claude Opus):** Side-by-side comparison of model findings, latency, and Challenger-Defender insights.
  3. **Modality 1 — ASD-STE100 Rewrite & Diff:** Side-by-side comparison of the original verbose AI prose vs. the ASD-STE100 controlled rewrite with word-count badges (`[12w]`) and `P`/`D` tags.
  4. **Modality 2 — Architecture & Sequence Diagrams:** Interactive zone boundary cards and copyable Mermaid.js diagram specs.
  5. **Modality 4 — Explainer Video Storyboard & Audio Walkthrough:** Timestamped scene-by-scene visual storyboard with an interactive step-through player and Web Speech API (`window.speechSynthesis`) narration controls.

### Modality 4: Explainer Video Storyboard & Narration Script

For complex multi-zone architectures or end-to-end data flows:

- Produce a **4-to-5 scene timestamped storyboard** (`00:00–02:00` total runtime).
- For each scene, specify:
  - **Timestamp & Scene Title** (e.g., `[00:00 - 00:25] Scene 1: Zone 2 Ingestion & Parallel File Screening`)
  - **Visual Animation Cue** (what highlights, pans, or animates on screen)
  - **Spoken Narration Track** (written in crisp, conversational ASD-STE100 under 20 words per sentence)
  - **Reviewer Verification Gate** (the exact security invariant the viewer confirms in that scene)

---

## Validation Checklist Before Delivery

1. **Sentence Length Audit:** Run `python3 scripts/check_ste100.py <rewrite.md>` (or count words per sentence) to verify that >80% of sentences in the ASD-STE100 section are `<= 25` words (descriptive) and `<= 20` words (procedural).
2. **Contradiction Detection:** Confirm that every discrepancy (execution order, identity fields in prompts/extensions, client vs. backend sanitization, multi-layer tool caps, Search vs. Assistant quotas) is surfaced in the Red-Flag banner.
3. **Artifact Delivery:** Save the populated Interactive HTML Review Canvas to the conversation artifact directory with `UserFacing: true` so the user can inspect it immediately in the side pane.
