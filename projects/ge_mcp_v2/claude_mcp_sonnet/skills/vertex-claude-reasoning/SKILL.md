---
name: vertex-claude-reasoning
description: Multi-model comparative reasoning, adversarial code review, and token-bounded critique workflow using Anthropic Claude on Google Cloud Vertex AI.
---

# Vertex AI Claude Comparative Reasoning Skill

Use this skill when delegating second-opinion architectural reviews, adversarial code audits, or comparative document synthesis to Anthropic Claude on Vertex AI via the `vertex-claude-mcp` server.

## Core Workflow

1. **Scope the Task & Budget:**
   - Read `references/model-routing-rubric.md` when choosing `max_tokens` (`1..8192`) and `system_prompt` constraints.
   - Keep prompts self-contained because each `ask_claude` call is stateless.
2. **Execute Structured Critique (`ask_claude`):**
   - Pass explicit acceptance criteria in `system_prompt` (for example: security invariants, output schema, or diff constraints).
   - Inspect structured telemetry (`model`, `clamped_max_tokens`, `latency_ms`) alongside the text response.
3. **Interactive Workbench (`open_claude_reasoning_workbench`):**
   - Launch the inline MCP App (`ui://vertex-claude-mcp/reasoning-workbench.html`) whenever the user wants to iteratively refine system prompts, compare outputs side-by-side, or attach a verified critique back into the main conversation context.
