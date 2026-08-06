# Demo Script: Controlling Gemini Thinking Mode & Memory / Data Retention

This step-by-step guide explains how to walk through and present the **Gemini Thinking Mode & Zero Data Retention** project as a live demo or presentation.

---

## 🛠️ Step 0: Initial Environment Setup

Open a terminal and set your Google Cloud Project credentials:

```bash
cd /Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo

# Ensure python environment is active
source .venv/bin/activate

# Set environment variables for Vertex AI / Google Cloud
export GOOGLE_CLOUD_PROJECT="ai-hub-459714"
export GOOGLE_CLOUD_LOCATION="global"
```

---

## 🎬 Act 1: Controlling Thinking Mode Levels (Gemini 3)

### Concept
Explain that **Gemini 3 models** use `thinking_level` to control the reasoning budget dynamically (`MINIMAL`, `LOW`, `MEDIUM`, `HIGH`).

### Command
```bash
python3 demo_thinking_levels.py
```

### Talking Points to Highlight
1. **`MINIMAL`**: Optimized for ultra-low latency on simple tasks. Minimal thought tokens generated.
2. **`LOW` & `MEDIUM`**: Balanced latency and reasoning for high-throughput or moderate complexity prompts.
3. **`HIGH`**: Maximizes multi-step planning and deep reasoning (ideal for math, code review, or complex logic).
4. **Thought Inspection**: Show how setting `include_thoughts=True` allows developers to inspect the model's internal reasoning process in `part.text` when `part.thought == True`.

---

## 🎬 Act 2: Thinking Budget Control for Gemini 2.5

### Concept
Explain that earlier models (like **Gemini 2.5 Flash** and **Gemini 2.5 Pro**) use `thinking_budget` to specify a soft upper limit on token count (`0` to `32,768` tokens).

### Command
```bash
python3 demo_thinking_budget.py
```

### Talking Points to Highlight
- Setting `thinking_budget = 0` on Flash models suppresses thought content returning in the API response, saving tokens and lowering latency.
- Setting higher token limits gives the model room to reason through complex technical architectures.

---

## 🎬 Act 3: Zero Data Retention & Memory Control (`store=False`)

### Concept
Demonstrate how privacy-sensitive enterprise workloads can use **`store=False`** or non-persistent interaction state to ensure zero server-side memory or retention on Google's servers.

### Command
```bash
python3 demo_thinking_and_zero_retention.py
```

### Talking Points & Demonstration
1. **Turn 1**: The user tells the model *"My favorite color is green"* with `thinking_level="low"` and `store=False`.
2. **Turn 2**: When attempting to ask *"What is my favorite color?"* using an unstored or invalid `previous_interaction_id`, Google's API fails or returns no context retention.
3. **Conclusion**: Proves that no state or personal data persists on Google servers when memory retention is disabled.

---

## 🎬 Act 4: Multi-Turn Thought Preservation

### Concept
Show that in multi-turn conversations, thought signatures are preserved across turns so reasoning state carries forward seamlessly.

### Command
```bash
python3 demo_thought_preservation.py
```

---

## 📋 Quick Run Cheatsheet

```bash
# Run All Demos in Sequence:
python3 demo_thinking_levels.py
python3 demo_thinking_budget.py
python3 demo_thinking_and_zero_retention.py
python3 demo_thought_preservation.py
```
