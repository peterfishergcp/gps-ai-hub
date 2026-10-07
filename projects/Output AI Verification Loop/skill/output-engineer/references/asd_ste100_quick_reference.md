# ASD-STE100 Pragmatic Quick Reference (~80% Strictness for Technical Reviews)

**ASD-STE100 (Simplified Technical English)** is an international aerospace and defense specification designed to eliminate ambiguity, synonym drift, and AI filler prose. In **Output Engineering**, applying ~80% pragmatic ASD-STE100 rules strips away hedging language where AI hallucinations hide.

---

## 1. Classify Every Sentence First (`P` vs. `D`)

| Dimension | Procedural (`P` — Instructions) | Descriptive (`D` — Explanations) |
| :--- | :--- | :--- |
| **Purpose** | Tells the engineer or customer what action to take | Explains how a system, API, or security boundary works |
| **Verb Form** | **Imperative verb first:** *"Configure the template."* | **Active Present Tense:** *"Model Armor screens the prompt."* |
| **Max Sentence Length** | **20 words** (Rule 5.1) | **25 words** (Rule 6.3) |
| **Unit Rule** | **1 instruction per sentence** (Rule 5.2) | **1 idea per sentence**; max **6 sentences per paragraph** (Rule 6.6) |

---

## 2. Core Lexical & Structural Rules

1. **One Term Per Concept (Rule 1.11):**
   - Pick ONE noun for each system component and use it identically throughout the document.
   - *Bad:* Rotating between *"Gemini Enterprise Assistant"*, *"the conversational orchestrator"*, *"the chat bot"*, and *"the AI agent"*.
   - *Good:* Define *"the Assistant"* once (`StreamAssist`) and use *"the Assistant"* everywhere.
2. **Active Voice Only (Rule 3.6):**
   - Never hide the actor in passive voice—passive voice conceals which service enforces a security control!
   - *Bad (Passive — hides whether enforcement is client or backend):* *"Untrusted Markdown images are stripped before rendering."*
   - *Good (Active — names the exact component):* *"The web UI (`ucs_widget`) blocks external Markdown images in the browser."*
3. **Eliminate AI Filler & Throat-Clearing:**
   - Delete phrases such as:
     - *"It is important to note that..."*
     - *"Furthermore, it is worth mentioning..."*
     - *"In order to provide comprehensive defense-in-depth..."*
     - *"Seamless", "robust", "cutting-edge", "holistic"*
4. **No Noun Clusters Over 3 Words (Rule 2.1):**
   - Break up long unhyphenated noun stacks with prepositions.
   - *Bad:* *"Enterprise connector retrieval snippet sanitization callback configuration"* (6 nouns)
   - *Good:* *"The callback configuration for snippet screening on connector results"*
5. **Preserve Untouchables:**
   - Never alter or split API method names (`StreamAssist`, `UploadSessionFile`), configuration flags (`failure_mode=FAIL_CLOSED`), SDP `infoType` identifiers (`US_SOCIAL_SECURITY_NUMBER`), or quota paths. Each code token counts as a single word.

---

## 3. Before & After Example

### Before (Verbose AI Draft — 54 words in 1 sentence)
> *"When integrated directly with a Gemini Enterprise App via Assistant settings (`userPromptTemplate` and `responseTemplate`), Model Armor is documented to screen incoming user prompts before LLM processing, directly uploaded session files/images (up to 4 MB for PDF, DOCX, PPTX, XLSX, TXT, CSV, PNG, JPEG), and final model responses before delivery to the user."*

### After (ASD-STE100 Controlled Rewrite — 4 sentences, max 17 words)
- **[D] (17w)** Model Armor screens the user prompt, uploaded session files up to 4 MB, and the final response.
- **[D] (17w)** SDP screens retrieved connector content and uploaded files up to 50 MB PDF or 30 MB Office.
- **[P] (7w)** Set `failure_mode=FAIL_CLOSED` on each Model Armor template.
- **[P] (7w)** Configure a `userPromptTemplate` to activate snippet screening.
