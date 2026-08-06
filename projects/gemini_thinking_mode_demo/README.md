# Gemini Thinking Mode & Memory / Data Retention Demos

This project provides comprehensive code demonstrations and empirical proofs for controlling **Gemini Thinking Mode** (`thinking_level` & `thinking_budget`) and enforcing **Zero Memory / Data Retention** using the Google GenAI SDK (`google-genai>=1.0.0`).

---

## 📁 Summary of Demo Scripts

| Script | API / Feature | Key Demonstration & Takeaway |
| :--- | :--- | :--- |
| **[`demo_interactions_api_zero_memory.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_interactions_api_zero_memory.py)** | **Interactions API** (`client.interactions.create`) | **Recommended Interactions API Zero Memory**: Demonstrates that omitting `previous_interaction_id` ensures Turn 2 executes completely unlinked with **ZERO memory** of Turn 1 context. |
| **[`demo_prove_no_thoughts.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_prove_no_thoughts.py)** | **Payload Dissection** (`include_thoughts=False`) | **Empirical Proof**: Dissects candidate payload parts to prove that `include_thoughts=False` completely omits human-readable thought process text (`part.thought == None`) from responses. |
| **[`demo_thought_signature_comparison.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_thought_signature_comparison.py)** | **Thought Preservation** | **Thought Signature Comparison**: Shows how passing thought signatures across sessions preserves exact reasoning state vs inaccessible state across sessions. |
| **[`demo_vertex_zero_data_retention.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_vertex_zero_data_retention.py)** | **Vertex AI Stateless** (`generate_content`) | **Vertex AI Zero Retention**: Demonstrates stateless execution with zero server-side conversation or state retention. |
| **[`demo_thinking_levels.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_thinking_levels.py)** | **Gemini 3 Thinking Levels** | **Thinking Levels**: Demonstrates configuring `MINIMAL`, `LOW`, `MEDIUM`, and `HIGH` thinking levels on Gemini 3 models. |
| **[`demo_thinking_budget.py`](file:///Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo/demo_thinking_budget.py)** | **Gemini 2.5 Token Budget** | **Token Budget**: Demonstrates numerical token `thinking_budget` control (`0` to `32,768` tokens). |

---

## 🛠️ Environment Setup & Authentication

```bash
cd /Users/peterfisher/Documents/ai_hub/projects/gemini_thinking_mode_demo

# Activate virtual environment
source .venv/bin/activate

# Authenticate via Google Cloud Application Default Credentials (ADC)
gcloud auth application-default login

# Set GCP Project and Location
export GOOGLE_CLOUD_PROJECT="ai-hub-459714"
export GOOGLE_CLOUD_LOCATION="global"
```

---

## 🚀 Quick Execution Guide

```bash
# 1. Recommended Interactions API Zero Memory Demo
python3 demo_interactions_api_zero_memory.py

# 2. Empirical Proof of include_thoughts=False
python3 demo_prove_no_thoughts.py

# 3. Thought Signature Session Comparison
python3 demo_thought_signature_comparison.py

# 4. Thinking Levels Comparison
python3 demo_thinking_levels.py
```
