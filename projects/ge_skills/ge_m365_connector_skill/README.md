# Gemini Enterprise: Microsoft 365 (SharePoint & Outlook) Federated Connector Quality Skills

This directory contains production-ready **Gemini Enterprise Skills (`SKILL.md`)** designed to dramatically improve retrieval precision, page-level citation accuracy, Table of Contents (TOC) offset math, and temporal email reasoning for **Microsoft SharePoint** and **Microsoft Outlook**.

---

## 🎯 Strategic Value: Upgrading the Standard SharePoint Federated Connector (Zero Infrastructure)

Many enterprise customers use the **Standard Out-of-the-Box (OOTB) SharePoint Federated Connector** in Gemini Enterprise / Vertex AI Search because it requires zero custom infrastructure. However, out-of-the-box federated connectors exhibit four critical user experience gaps:

1. **The `?web=1` Broken Link Bug**:
   - SharePoint Online returns document URLs ending in `?web=1` (e.g., `.../Statement%20of%20Work_%20Project%20Cal-Nexus%20%282%29.pdf?web=1`).
   - When the AI appends `#page=2` to `?web=1`, SharePoint opens its proprietary Office Web Previewer wrapper (`AllItems.aspx`), which **completely ignores `#page=N` hash fragments** and dumps the user on Page 1.
   - **Skill Fix**: Instructs the model to **always strip `?web=1`** before appending `#page=N`, forcing the browser to open the PDF in its native PDF viewer (Chrome/Edge/Acrobat) where `#page=N` jumps immediately to the exact page.
2. **The "Previous Page" (Off-by-One) & Table of Contents (TOC) Trap When Finding Sections**:
   - When asked to find a specific section (e.g., *"Find the Scope of Work section in Project Cal-Nexus SOW"*), federated search chunks frequently return:
     - The **Table of Contents on Page 2** where the section is listed (`Section 3: Scope of Work ...... 3`), causing the AI to cite `#page=2` instead of `#page=3`, OR
     - A chunk starting at the bottom of **Page $N-1$** that spills onto **Page $N$**, causing the AI to cite the preceding page ($N-1$).
   - **Skill Fix**: Enforces strict section verification rules: never cite TOC listings, inspect explicit printed page footers/headers inside the text chunk, and always cite `#page=N` where the full section body text begins.
3. **Table of Contents (TOC) & Front-Matter Page Shifts**:
   - When a formal PDF has Roman numeral front matter (`i, ii, iii, iv`), a citation pointing to Printed Page 3 lands on the wrong page unless offset math is applied ($\text{Physical Page } N = \text{Printed Page } P + \text{Front-Matter Offset } F$).
   - For standard Statements of Work (SOWs) with continuous page numbering (Title = Page 1, second page = `Page 2`), the skill enforces $N = P$ without adding artificial offsets.
4. **Word (`.docx`) Page Ambiguity**:
   - `.docx` files do not have fixed physical pages across screen sizes, requiring `#section=HeadingName` deep links.

---

## 📊 Connector Architecture Comparison Matrix

| Capability | Standard SharePoint Federated Connector (Default OOTB) | Standard SharePoint Federated Connector + **GE Skill (`SKILL.md`)** | Custom Cloud Run Graph MCP Server + **GE Skill (`SKILL.md`)** |
| :--- | :--- | :--- | :--- |
| **Infrastructure to Maintain** | **Zero** (100% Managed Google Cloud) | **Zero** (100% Managed Google Cloud) | Cloud Run service + Entra ID App Credentials |
| **Clickable Citations** | Root document URL or broken `?web=1#page=N` | **Clean `.pdf#page=N` & `#section=Name` Deep Links** | **Clean `.pdf#page=N` & `#section=Name` Deep Links** |
| **`?web=1` Stripping for Native PDF Viewer** | ❌ Leaves `?web=1` (breaks page anchors) | ✅ **Strips `?web=1` so `#page=N` jumps to exact page** | ✅ **Programmatically & Prompt-Stripped** |
| **Section Search "Previous Page" Fix** | ❌ Cites TOC page or chunk start ($N-1$) | ✅ **Verifies Section Body Page & Footers** | ✅ **Verifies Section Body Page & Footers** |
| **TOC / Cover Page Offset Correction** | ❌ Off-by-N page errors common | ✅ **Resolved via Physical vs. Printed Page Math** | ✅ **Resolved via Physical vs. Printed Page Math** |
| **Outlook Temporal Reasoning (`last week`, `earliest`)** | Basic keyword matching | ✅ **Strict ISO Date Arithmetic & Thread Synthesis** | ✅ **Native OData Filtering + Batch/Thread Tools** |
| **Write Actions (Create/Update/Move Files & Send Mail)** | ❌ Read-Only Federated Search | ❌ Read-Only Federated Search | ✅ **Full Write Governance with Action Approval** |

---

## 📁 Repository Structure

1. **[`SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_m365_connector_skill/SKILL.md) (`m365-sharepoint-outlook-quality`)**
   - **Unified Master Skill**: Combines both SharePoint Federated/MCP citation rules (`?web=1` stripping, section-finding off-by-one prevention, TOC offset math) and Microsoft Outlook temporal search & thread aggregation guidelines.
2. **[`sharepoint_federated_skill/SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_m365_connector_skill/sharepoint_federated_skill/SKILL.md) (`sharepoint-federated-quality-enhancer`)**
   - **Dedicated SharePoint Federated Skill**: Focused specifically on upgrading the **Standard SharePoint Federated Connector** with mandatory `?web=1` stripping, section-body page verification, `#page=X` deep links, and `.docx` section anchors.
3. **[`outlook_connector_skill/SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_m365_connector_skill/outlook_connector_skill/SKILL.md) (`outlook-connector-temporal-enhancer`)**
   - **Dedicated Outlook Skill**: Focused on dynamic system time anchoring (`today`, `latest`, `oldest`, `last week`), full email conversation thread reconstruction, and mandatory `[Subject - Sender (Date)](webLink)` citations.

---

## 🛠️ Step-by-Step Setup in Gemini Enterprise

### Option A: Upgrading the Standard SharePoint Federated Connector (No MCP Required)
1. Open **Google Cloud Console** $\rightarrow$ **Agent Builder / Gemini Enterprise** $\rightarrow$ select your Enterprise App.
2. Ensure your **Standard SharePoint Online Federated Data Store / Connector** is linked to the app.
3. Navigate to **Skills** (or **Agent Instructions / System Instructions**) $\rightarrow$ **Create Skill**.
4. Copy and paste the contents of **[`sharepoint_federated_skill/SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_m365_connector_skill/sharepoint_federated_skill/SKILL.md)**:
   - **Skill Name**: `sharepoint-federated-quality-enhancer`
   - **Description**: *Enhance answer quality, deep-link precision, URL sanitization (?web=1 removal), and section-finding page accuracy for the Standard SharePoint Federated Connector.*
5. Click **Save / Publish**.

### Option B: Deploying the Unified Microsoft 365 (SharePoint + Outlook) Skill
1. Inside your Gemini Enterprise App, navigate to **Skills** $\rightarrow$ **Create Skill**.
2. Copy and paste the contents of **[`SKILL.md`](file:///Users/peterfisher/Documents/Jetski_Work/ge_m365_connector_skill/SKILL.md)**:
   - **Skill Name**: `m365-sharepoint-outlook-quality`
3. Link your SharePoint and Outlook data stores and click **Save / Publish**.
