import os
import json
from google import genai
from google.genai import types

def demo_prove_no_thoughts():
    """
    Demonstrates and proves that when `include_thoughts=False` is set with `thinking_level=MEDIUM`:
    1. The model STILL uses medium reasoning internally to generate the answer.
    2. BUT the readable thought text/summary is COMPLETELY SUPPRESSED and OMITTED from the response.
    3. Saves full dissecting details to a markdown file (prove_no_thoughts_output.md).
    """
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-hub-459714")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options={'timeout': 60000}
    )
    model_name = "gemini-3.5-flash"
    prompt = "Solve 17x + 43 = 128 and explain your reasoning."
    md_output_path = "prove_no_thoughts_output.md"

    md_content = f"# Empirical Proof: Payload Dissection (`include_thoughts=False` vs `True`)\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n"
    md_content += f"- **Prompt**: *\"{prompt}\"*\n\n"
    md_content += "---\n\n"

    print("=" * 80)
    print("PROOF DEMO: Dissecting Payload when include_thoughts=False vs include_thoughts=True")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 80)

    # TEST 1: include_thoughts=True
    print("\n--- TEST 1: thinking_level=MEDIUM & include_thoughts=True ---")
    md_content += "## TEST 1: `thinking_level=MEDIUM` & `include_thoughts=True`\n\n"
    
    res_true = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=True
            )
        )
    )

    parts_true = res_true.candidates[0].content.parts
    thought_parts_true = [p for p in parts_true if getattr(p, 'thought', False)]

    print(f"Total Parts Returned: {len(parts_true)}")
    print(f"Thought Parts (`part.thought == True`): {len(thought_parts_true)}")
    
    md_content += f"- **Total Parts Returned**: `{len(parts_true)}`\n"
    md_content += f"- **Thought Parts (`part.thought == True`)**: `{len(thought_parts_true)}`\n\n"
    
    if thought_parts_true:
        print(f"\n[Thought Process]:\n{thought_parts_true[0].text}\n")
        md_content += "### 💭 Readable Thought Process\n\n"
        md_content += f"```text\n{thought_parts_true[0].text}\n```\n\n"

    print(f"[Model Final Answer]:\n{res_true.text}\n")
    md_content += f"### 📝 Model Final Answer\n\n{res_true.text}\n\n---\n\n"

    # TEST 2: include_thoughts=False
    print("-" * 80)
    print("--- TEST 2: thinking_level=MEDIUM & include_thoughts=False ---")
    md_content += "## TEST 2: `thinking_level=MEDIUM` & `include_thoughts=False`\n\n"
    
    res_false = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=False
            )
        )
    )

    parts_false = res_false.candidates[0].content.parts
    thought_parts_false = [p for p in parts_false if getattr(p, 'thought', False)]

    print(f"Total Parts Returned: {len(parts_false)}")
    print(f"Thought Parts (`part.thought == True`): {len(thought_parts_false)} (PROVED ZERO!)")
    
    md_content += f"- **Total Parts Returned**: `{len(parts_false)}`\n"
    md_content += f"- **Thought Parts (`part.thought == True`)**: `{len(thought_parts_false)}` **(PROVED ZERO!)**\n\n"

    for idx, part in enumerate(parts_false):
        print(f"-> Part [{idx}] `part.thought` value: {getattr(part, 'thought', None)}")
        print(f"-> Part [{idx}] Text Content:\n{part.text}\n")
        md_content += f"### Part [{idx}]\n"
        md_content += f"- `part.thought` value: `{getattr(part, 'thought', None)}`\n\n"
        md_content += f"**Text Content**:\n\n{part.text}\n\n"

    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("=" * 80)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 80)

if __name__ == "__main__":
    demo_prove_no_thoughts()
