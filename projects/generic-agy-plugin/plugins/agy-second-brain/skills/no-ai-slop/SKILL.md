---
name: no-ai-slop
description: Hardlined anti-slop editor and writing guardrail. Strips 17 common LLM filler patterns (binary contrasts, throat-clearing openers, colon reveals, trailing -ing puffery, buzzword bloat, em-dash clusters, and repetitive summary endings) from emails, memos, docs, and slide talk tracks while protecting concrete facts and numbers. Trigger on /no-ai-slop, "strip AI slop", "tighten this draft", or "make this sound human".
---

# Hardlined Anti-AI-Slop Editor (`/no-ai-slop`)

Sharpen any draft, document, or presentation script so it reads like a clear, direct human practitioner rather than an LLM trying to sound impressive.

## Two Modes

1. **Rewrite / Tighten (Default):** Make targeted edits to cut filler while keeping 100% of concrete facts, timestamps, dollar amounts, SQL/CLI flags, statutory citations, and links intact.
2. **Audit Only (`/no-ai-slop audit`):** Quote each filler pattern found and give the 5-word fix without rewriting the whole document.

## 10 High-Frequency Slop Patterns to Cut

1. **Binary Contrasts:** Cut *"It's not X. It's Y."* or *"The question isn't X, it's Y."* State Y directly.
2. **Throat-Clearing Openers:** Cut *"First and foremost,"* *"In today's fast-paced environment,"* *"I hope this finds you well,"* and *"Let me be clear."*
3. **Colon Reveals & Dramatic Fragments:** Replace *"The best part: zero downtime."* with *"Upgrades finish with zero downtime."*
4. **Trailing `-ing` Commentary:** Cut participial tails (*"...highlighting the team's dedication"*, *"...ensuring future scalability"*). State the concrete mechanism instead.
5. **Importance Puffery:** Cut *"plays a vital role,"* *"marks a pivotal milestone,"* and *"testament to."*
6. **Interpretive Metadiscourse:** Delete *"The key takeaway here is"* and *"This distinction matters because"* - let the fact speak for itself.
7. **Synonym Cycling:** Do not call the same system a *"pipeline"*, *"ingestion fabric"*, *"orchestration layer"*, and *"engine"* in four consecutive sentences. Pick the plainest word and keep it consistent.
8. **Title & Heading Bloat:** Shorten *"Comprehensive End-to-End Vendor Risk & Compliance Synthesis Guide"* to *"Vendor Risk Review Checklist"*.
9. **Em-Dash Clusters & Decorative Formatting:** Replace repeated em-dashes with spaced hyphens (` - `), commas, or parentheses. Remove decorative emojis and mid-sentence bolding.
10. **Summary-Recap Endings:** Never end an email or memo with a paragraph restating what was already said; end on the final concrete next step.
