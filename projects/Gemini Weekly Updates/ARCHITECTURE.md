# Reference Architecture: Gemini Weekly & Monthly Customer Updates

> **Disclaimer**: This repository and its contents are provided for illustration and educational purposes only as example code. This is not an official Google product or officially supported Google Cloud project. This code is provided as-is for demonstration purposes and is NOT intended or supported for production workloads.

![Gemini Weekly Updates Reference Architecture](./architecture_diagram.svg)

---

## 1. Architectural Overview: How It Works for a Particular Customer

Enterprise and Public Sector customers adopting **Google Cloud Gemini Enterprise** and **Google Antigravity** experience rapid platform evolution—spanning new foundation models, Bring-Your-Own (BYO) Model Context Protocol (MCP) connectors, security guardrails (Model Armor), and subtle connector permission or behavior changes.

To establish a standardized, executive-grade communication cadence without overwhelming Customer Engineers (CEs) and Field Sales Representatives (FSRs), the **Gemini Weekly Updates** architecture pairs **automated release & telemetry aggregation** with **customer-aware AI filtering** and a **mandatory Human-in-the-Loop (HITL) CE curation gate**:

```mermaid
flowchart LR
    subgraph S1["1. Global Feeds & Per-Customer Context"]
        direction TB
        RN["🌐 Global Release Feeds<br/>• Gemini Enterprise Release Notes<br/>• Antigravity 2.0 IDE / CLI Changelog<br/>• Cloud Public Sector & AI Blogs"]
        BC["⚠️ Operational & Behavior Advisories<br/>• Connector OAuth / IAM Scope Changes<br/>  (e.g., Sites.Selected vs. AllSites.Read)<br/>• Federated vs. Ingestion Shifts<br/>• Quota & API Deprecation Notices"]
        CP["🏛️ Customer Architecture Profile<br/>(sample_customer_profile.json)<br/>• Deployed Connectors (SharePoint, MCP, WIF)<br/>• Compliance Regime (StateRAMP / FedRAMP / HIPAA)<br/>• Active Support Cases & Bugs (CS-xxxxx / FE-xxxxx)"]
    end

    subgraph S2["2. Per-Customer Synthesis & Rendering Engine (FastAPI)"]
        direction TB
        MATCH["🧠 Vertex AI (Gemini) Impact Matcher<br/>• Intersects global updates with customer's<br/>  deployed connectors & compliance posture<br/>• Flags breaking / permission changes<br/>• Generates tailored Best Practice Idea 💡"]
        SCHEMA["📐 Pydantic v2 Modular Schema<br/>• HeaderBanner & Seasonal Palette<br/>• ReleaseHighlights & OperationalAdvisories<br/>• SupportTelemetryTable<br/>• EnablementConnect & AntigravitySpotlight<br/>• StrategicTrends"]
        JINJA["🍂 Jinja2 Seasonal HTML Renderer<br/>• Applies seasonal palette (October Fall 🍂)<br/>• Compiles Inline-CSS HTML tables<br/>  for Outlook, Gmail & Apple Mail<br/>• Emits Markdown fallback"]

        MATCH --> SCHEMA --> JINJA
    end

    subgraph S3["3. CE Human-in-the-Loop (HITL) Gate & Delivery"]
        direction TB
        DRAFT["📝 Workspace Gmail API<br/>users.drafts.create()<br/>Stages formatted HTML draft in<br/>CE's Gmail Drafts folder"]
        HITL["🛡️ Mandatory CE / Specialist Review<br/>• Verifies support ticket statuses<br/>• Adds bespoke field observations &<br/>  connector permission guidance<br/>• Confirms link access permissions"]
        EXEC["📬 Customer Executive Inbox<br/>Delivered to Agency CTO / CIO &<br/>Enterprise Architecture Leadership"]

        DRAFT --> HITL --> EXEC
    end

    RN --> MATCH
    BC --> MATCH
    CP --> MATCH
    JINJA --> DRAFT

    classDef inputFill fill:#e8f0fe,stroke:#1a73e8,stroke-width:2px,color:#0d47a1;
    classDef warnFill fill:#fef7e0,stroke:#f29900,stroke-width:2px,color:#b06000;
    classDef engineFill fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#bf360c;
    classDef hitlFill fill:#e6f4ea,stroke:#1e8e3e,stroke-width:2px,color:#0d652d;

    class RN,CP inputFill;
    class BC warnFill;
    class MATCH,SCHEMA,JINJA engineFill;
    class DRAFT,HITL,EXEC hitlFill;
```

---

## 2. End-to-End Sequence Diagram: Generating a Briefing for a Single Customer

```mermaid
sequenceDiagram
    autonumber
    actor CE as 👤 Customer Engineer (CE)
    participant API as ⚡ FastAPI Briefing Generator<br/>(/api/v1/generate-briefing)
    participant Feeds as 🌐 Release Notes, Blogs &<br/>Behavior Change Feeds
    participant VAI as 🧠 Vertex AI (Gemini)<br/>Relevance & Impact Matcher
    participant Jinja as 🍂 Jinja2 Seasonal<br/>HTML Template Engine
    participant Gmail as 📝 Google Workspace<br/>Gmail API (Drafts)
    actor Cust as 🏛️ Customer Leadership<br/>(Agency CTO / Architects)

    CE->>API: POST /api/v1/generate-briefing (sample_customer_profile.json, theme="autumn_fall")
    API->>Feeds: Fetch latest Gemini Enterprise & Antigravity release notes + connector advisories
    Feeds-->>API: Raw release entries, blog links, and OAuth/permission change bulletins
    API->>VAI: Intersect global updates with Customer Profile (Deployed: SharePoint, Work IQ MCP, WIF, HIPAA/StateRAMP)
    VAI-->>API: Structured JSON (Pydantic v2):<br/>1. Tailored Release Highlights & Best Practice Idea 💡<br/>2. Highlighted Operational Advisory (e.g., SharePoint Sites.Selected scope)<br/>3. Domain-Specific Antigravity 2.0 Unit-Testing Example<br/>4. Public Sector AI Strategic Trends
    API->>Jinja: Merge synthesized JSON + Customer Support Cases (CS-xxxxx / FE-xxxxx) into "autumn_fall" template
    Jinja-->>API: Compiled Inline-CSS HTML Email (Outlook/Gmail safe) + Markdown fallback
    API->>Gmail: gmail.users().drafts().create(userId="me", html_body=...)
    Gmail-->>CE: Returns Draft ID & URL in CE's Gmail Drafts folder
    Note over CE,Gmail: 🛡️ Mandatory Human-in-the-Loop (HITL) Curation Gate
    CE->>Gmail: Reviews draft, verifies ticket dates, refines connector permission advisory, and clicks Send
    Gmail->>Cust: Delivers seasonal executive HTML briefing to Customer Technology Leadership
```

---

## 3. Why Hybrid Automation + CE HITL Curation Matters

A core architectural lesson from real-world enterprise deployments is that **100% unattended newsletter automation is insufficient for complex enterprise cloud accounts**:

1. **Catching Subtle Operational & Permission Changes**:
   - Standard public release notes emphasize major feature launches (GA announcements), but customers are frequently impacted by nuanced connector behavior shifts or permission requirements—such as transitioning a SharePoint integration from broad `AllSites.Read` permissions to least-privilege `Sites.Selected` scopes, or understanding licensing dependencies between native data ingestion connectors and third-party MCP servers.
   - By feeding a **Customer Architecture Profile** (`deployed_connectors`, `identity_provider`, `compliance_frameworks`) into the synthesis prompt *and* staging the output as a **Gmail Draft**, the CE can inject immediate, high-value architectural guidance before sending.
2. **Accurate Support & Engineering Escalation Telemetry**:
   - Generic marketing newsletters never reflect an account's live support tickets, feature requests (`FE-xxxxx`), or active Proof-of-Concept (POC) blockers (`CS-xxxxx`).
   - Section 2 of the briefing embeds a structured **Account Health & Support Telemetry** table directly inside the executive update, giving customer leadership a single source of truth across platform releases and active support cases.
3. **Cross-Client Email Rendering (Gmail, Microsoft Outlook & Apple Mail)**:
   - Public sector agencies and large enterprises predominantly read email in **Microsoft Outlook (Desktop & Web)**, which strips external `<style>` sheets and renders raw Markdown pipe tables (`| Col 1 | Col 2 |`) without borders or cell padding.
   - The Jinja2 rendering layer compiles **explicit inline CSS** on every `<table>`, `<th>`, `<td>`, and callout banner, guaranteeing crisp typography and seasonal theming across Outlook, Gmail, and Apple Mail.

---

## 4. Modular Pydantic v2 Data Contract

Every section of the briefing is modeled as an isolated JSON-serializable schema so the FastAPI backend can populate templates deterministically:

| Module Name | Schema Responsibility | Primary Data Source |
| :--- | :--- | :--- |
| **`CustomerProfile`** | Agency/Organization name, recipient group, compliance frameworks (`StateRAMP`, `FedRAMP High`, `HIPAA`), deployed connectors, and Google Account Team roster. | Per-customer JSON profile / CRM |
| **`ThemeSelection`** | Visual color tokens (`primary_accent`, `secondary_accent`, `border_gold`, `bg_cream`) and seasonal emoji/banner metadata (`autumn_fall`, `winter_frost`, `spring_blossom`, `google_core`). | Request parameter |
| **`ReleaseHighlights`** | Top 2–3 GA/Preview platform launches mapped to the customer's compliance and architecture footprint, plus 1 actionable **Best Practice Idea 💡**. | Release Notes + Vertex AI Gemini |
| **`OperationalAdvisories`** |Proactive callout box highlighting connector permission changes, OAuth scope best practices (e.g., `Sites.Selected`), or deprecation timelines relevant to the customer. | Connector Advisories + CE Input |
| **`SupportTelemetry`** | Array of active support tickets, bug IDs, and feature escalations (`case_id`, `workload`, `description`, `status`, `target_date`, `google_lead`). | Support Case Tracker / CE Input |
| **`EnablementConnect`** | Upcoming virtual workshops, hands-on labs, and 1-click Google Calendar appointment schedule links for bi-weekly architecture office hours. | Account Team Calendar Config |
| **`AntigravitySpotlight`** | Pro-code developer agent highlights (Google Antigravity 2.0 IDE/CLI) paired with a domain-specific software engineering example. | Antigravity Changelog + Gemini |
| **`StrategicTrends`** | Forward-looking executive analysis covering Long-Running Autonomous Agents, Agent Gateway Zero-Trust governance, and Public Sector AI compliance. | Curated Field CTO / Specialist Briefs |
