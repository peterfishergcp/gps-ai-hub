import os
from google import genai
from google.genai import types

def demo_interactions_api_zero_memory():
    """
    Demonstrates Zero Retention / Zero Memory on the recommended Google Interactions API.
    Saves full responses and output to a markdown file (interactions_zero_memory_output.md).
    """
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-hub-459714")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options={'timeout': 60000}
    )
    
    model_name = "gemini-3-flash-preview"
    md_output_path = "interactions_zero_memory_output.md"

    md_content = f"# Interactions API Zero Memory Demo Output\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n\n"
    md_content += "---\n\n"

    print("=" * 80)
    print("DEMO: Zero Memory Retention on the Recommended Interactions API")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 80)

    # STEP 1
    prompt1 = "My favorite color is green."
    print("\n--- STEP 1: Sending Turn 1 via client.interactions.create() ---")
    print(f"Prompt: '{prompt1}'")
    
    md_content += f"## Step 1\n\n**User**: *\"{prompt1}\"*\n\n"

    turn1 = client.interactions.create(
        model=model_name,
        input=prompt1,
        generation_config={
            "thinking_level": "low"
        }
    )

    print(f"\n[Turn 1 Output Received]:")
    print(f"-> Response:\n{turn1.output_text}\n")
    print(f"-> Turn 1 Interaction ID: {turn1.id}\n")

    md_content += f"**Interaction ID**: `{turn1.id}`\n\n"
    md_content += f"**Model Response**:\n\n{turn1.output_text}\n\n---\n\n"

    # STEP 2
    prompt2 = "What is my favorite color?"
    print("-" * 80)
    print("--- STEP 2: Turn 2 without passing previous_interaction_id ---")
    print(f"Sending '{prompt2}' WITHOUT previous_interaction_id...")

    md_content += f"## Step 2 (WITHOUT passing `previous_interaction_id`)\n\n**User**: *\"{prompt2}\"*\n\n"

    turn2 = client.interactions.create(
        model=model_name,
        input=prompt2,
        generation_config={
            "thinking_level": "low"
        }
    )

    print(f"\n[Turn 2 Output Received]:")
    print(f"-> Response (Zero Memory Retained):\n{turn2.output_text}\n")

    md_content += f"**Model Response (Zero Memory Retained)**:\n\n{turn2.output_text}\n\n---\n\n"

    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("=" * 80)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 80)

if __name__ == "__main__":
    demo_interactions_api_zero_memory()
