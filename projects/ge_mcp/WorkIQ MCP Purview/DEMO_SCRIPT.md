# Live Demo Script: Gemini Enterprise + Work IQ MCP + Microsoft Purview Encryption

This 5-step demo showcases **Google Cloud Gemini Enterprise (Agentspace)** connected to **Microsoft's Managed Work IQ MCP Server (`https://workiq.svc.cloud.microsoft/mcp`)** enforcing **Microsoft Purview Sensitivity Labels & AES-256 Rights Management (RMS) Encryption** in real time on behalf of the signed-in user.

> **Before Running the Demo**: Replace `<YOUR_SHAREPOINT_SITE>`, `<YOUR_DRIVE_ID>`, `<ALLOWED_ITEM_ID>`, and `<RESTRICTED_ITEM_ID>` in the prompts below with the identifiers from your `.env` file.

---

## Step 1: Discover Accessible SharePoint Sites via Work IQ MCP
**Goal**: Prove live delegated connectivity from Gemini Enterprise $\rightarrow$ Work IQ MCP $\rightarrow$ SharePoint Online using your signed-in Microsoft Entra ID identity.

### 📋 Copy-Paste Prompt 1
```text
Using the WorkIQ Ask tool (with agentId "bizchat-as-gpt-scenario"), list the SharePoint sites and document libraries I have access to, and list the Word documents currently stored in my <YOUR_SHAREPOINT_SITE> site.
```

### 🎤 Presenter Talking Points
- *"First, let's verify that Gemini Enterprise is connected directly to Microsoft's managed **Work IQ MCP Server** (`https://workiq.svc.cloud.microsoft/mcp`) using my federated Entra ID login."*
- *"When I submit this prompt, Gemini Enterprise displays a Human-in-the-Loop (HITL) confirmation card before invoking the MCP tool."*
- *"Work IQ MCP lists the SharePoint sites I have permission to access and finds both **`Quantum_Computing_Clean_Purview.docx`** and **`SOC-2026-0919-SEC.docx`** sitting side-by-side in the same SharePoint document library."*

---

## Step 2: Summarize the Purview-Encrypted Document (`Confidential - RMS` — Allowed Path)
**Goal**: Show that even though `Quantum_Computing_Clean_Purview.docx` is encrypted at rest with AES-256 (`protectionEnabled: true`), Work IQ MCP seamlessly decrypts and summarizes it because the signed-in user holds `VIEW` + `EXTRACT` rights on the **`Confidential - RMS`** label.

### 📋 Copy-Paste Prompt 2
```text
Using a single call to the WorkIQ Ask tool (with agentId "bizchat-as-gpt-scenario"), read and provide an executive summary of Quantum_Computing_Clean_Purview.docx in the <YOUR_SHAREPOINT_SITE> SharePoint site.
```

### 🎤 Presenter Talking Points
- *"Now let's ask Gemini Enterprise to read and summarize **`Quantum_Computing_Clean_Purview.docx`**."*
- *"Behind the scenes, this file is not stored as plain text—it is wrapped in an AES-256 encrypted Microsoft Purview OLE2 container (`d0cf11e0a1b11ae1`)."*
- *"Because Work IQ MCP presents my delegated user token to Microsoft Purview / Azure Rights Management, and my identity has **`VIEW` and `EXTRACT` rights** on the **`Confidential - RMS`** label, Purview issues a dynamic Use License on the fly and returns the full 7-section executive summary with a clickable SharePoint citation."*

---

## Step 3: Inspect the Live Purview Label & Encryption Status via Work IQ `Fetch`
**Goal**: Prove to the audience directly from Gemini Enterprise that `Quantum_Computing_Clean_Purview.docx` is genuinely encrypted by Microsoft Purview (`protectionEnabled: true`).

### 📋 Copy-Paste Prompt 3
```text
Using the WorkIQ Fetch tool, retrieve the Purview sensitivityLabel metadata for Quantum_Computing_Clean_Purview.docx using this entityUrl:
["/drives/<YOUR_DRIVE_ID>/items/<ALLOWED_ITEM_ID>?$select=id,name,size,sensitivityLabel,webUrl"]
Show the exact sensitivityLabel JSON object and confirm whether Purview encryption (protectionEnabled) is active.
```

### 🎤 Presenter Talking Points
- *"To prove that **`Quantum_Computing_Clean_Purview.docx`** isn't just an unencrypted file, let's ask Gemini Enterprise to call the Work IQ **`Fetch`** tool to inspect the file's live Microsoft Graph `sensitivityLabel` metadata."*
- *"Look at the JSON returned directly from Microsoft Graph via Work IQ MCP:"*
  ```json
  "sensitivityLabel": {
    "displayName": "Confidential - RMS",
    "id": "<ALLOWED_SENSITIVITY_LABEL_ID>",
    "protectionEnabled": true
  }
  ```
- *"And if we click the citation link to open the file in SharePoint Word Online, you can see the **`Confidential - RMS` shield icon** right at the top of the document."*

---

## Step 4: Attempt to Read `SOC-2026-0919-SEC.docx` (`SOC - Restricted Block` — Blocked Path)
**Goal**: Show that when a document (`SOC-2026-0919-SEC.docx`) carries a Purview Sensitivity Label (`SOC - Restricted Block`) that **denies `VIEW` and `EXTRACT` rights** to your user, Work IQ MCP natively blocks the document content from returning in Gemini Enterprise.

### 📋 Copy-Paste Prompt 4
```text
Using a single call to the WorkIQ Ask tool (with agentId "bizchat-as-gpt-scenario"), read and summarize the contents of SOC-2026-0919-SEC.docx in the <YOUR_SHAREPOINT_SITE> SharePoint site. Do not call any other tools.
```

### 🎤 Presenter Talking Points
- *"Now let's run the exact same `Ask` query against **`SOC-2026-0919-SEC.docx`**—a security incident document in the exact same SharePoint library where I am a Site Owner."*
- *"Even though I am an owner of the SharePoint site, the **`SOC - Restricted Block`** Purview Sensitivity Label on this file **denies `VIEW` and `EXTRACT` rights** to my user identity."*
- *"Because Work IQ MCP strictly executes On-Behalf-Of (OBO) my signed-in identity, Azure Rights Management denies the decryption Use License, and Work IQ MCP natively blocks the document's contents from returning to Gemini Enterprise!"*

---

## Step 5: Side-by-Side Purview Policy Comparison (Confirming the Block Metadata)
**Goal**: Answer *why* one file was summarized and the other was blocked by having Gemini Enterprise call **Work IQ `Fetch`** on both documents (`~1.5s` response time) and render a side-by-side comparison table of their Purview Sensitivity Labels!

### 📋 Copy-Paste Prompt 5
```text
Using a single call to the WorkIQ Fetch tool, fetch the sensitivityLabel metadata for both documents in <YOUR_SHAREPOINT_SITE> at once using these entityUrls:
[
  "/drives/<YOUR_DRIVE_ID>/items/<ALLOWED_ITEM_ID>?$select=id,name,size,sensitivityLabel",
  "/drives/<YOUR_DRIVE_ID>/items/<RESTRICTED_ITEM_ID>?$select=id,name,size,sensitivityLabel"
]
Display a side-by-side markdown table comparing Quantum_Computing_Clean_Purview.docx and SOC-2026-0919-SEC.docx, showing the file name, Purview Sensitivity Label displayName, Label ID, protectionEnabled status, and why WorkIQ MCP allowed the first document while blocking the second.
```

### 🎤 Presenter Talking Points
- *"Finally, even when Purview blocks a user from decrypting a file's content, SharePoint still exposes the file's `sensitivityLabel` header metadata so we can audit **why** it was blocked."*
- *"In a single **`Fetch`** call (`~1.5s`), Gemini Enterprise retrieves the `sensitivityLabel` metadata for both files and builds a side-by-side comparison table:"*
  - **`Quantum_Computing_Clean_Purview.docx`** $\rightarrow$ Label: **`Confidential - RMS`** (`protectionEnabled: true`) $\rightarrow$ **Allowed** (`VIEW` + `EXTRACT` granted).
  - **`SOC-2026-0919-SEC.docx`** $\rightarrow$ Label: **`SOC - Restricted Block`** (`protectionEnabled: true`) $\rightarrow$ **Blocked** (`VIEW` + `EXTRACT` denied by Purview policy).
