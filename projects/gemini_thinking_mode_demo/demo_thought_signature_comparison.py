import os
from google import genai
from google.genai import types

def demo_thought_signature_preservation_comparison():
    """
    Demonstrates Thought Signature Preservation across independent sessions.
    Saves full responses and thought processes to a markdown file (thought_signature_comparison_output.md).
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
    md_output_path = "thought_signature_comparison_output.md"

    md_content = f"# Thought Signature Preservation Comparison Output\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n\n"
    md_content += "---\n\n"

    print("=" * 80)
    print("DEMO: Thought Signature Preservation Across Independent Sessions")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 80)

    # -------------------------------------------------------------------
    # SCENARIO A: WITH Thought Signatures Enabled (include_thoughts=True)
    # -------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("SCENARIO A: WITH Thought Signatures (include_thoughts=True)")
    print("=" * 80)
    
    md_content += "## SCENARIO A: WITH Thought Signatures (`include_thoughts=True`)\n\n"

    # Session 1
    print("\n[Session 1]: User says 'My favorite color is green.' (include_thoughts=True)")
    md_content += "### Session 1\n\n**User**: *\"My favorite color is green.\"*\n\n"
    
    res_a1 = client.models.generate_content(
        model=model_name,
        contents="My favorite color is green.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=True
            )
        )
    )

    thoughts_a1 = []
    if res_a1.candidates and res_a1.candidates[0].content:
        for part in res_a1.candidates[0].content.parts:
            if getattr(part, 'thought', False):
                thoughts_a1.append(part.text)

    print(f"-> Session 1 Response: {res_a1.text}")
    md_content += f"**Session 1 Response**:\n\n{res_a1.text}\n\n"
    if thoughts_a1:
        print(f"\n[Captured Thought Signature]:\n{thoughts_a1[0]}\n")
        md_content += "### 💭 Captured Thought Signature\n\n"
        md_content += f"```text\n{thoughts_a1[0]}\n```\n\n"

    # Session 2
    print("[Session 2]: Passing Session 1's history + Thought Signatures into a new session")
    md_content += "### Session 2 (Passing Session 1 History + Thought Signatures)\n\n"
    md_content += "**User**: *\"What is my favorite color?\"*\n\n"
    
    history_with_thoughts = [
        {"role": "user", "parts": [{"text": "My favorite color is green."}]},
        {"role": "model", "parts": res_a1.candidates[0].content.parts},
        {"role": "user", "parts": [{"text": "What is my favorite color?"}]}
    ]

    res_a2 = client.models.generate_content(
        model=model_name,
        contents=history_with_thoughts,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=True
            )
        )
    )

    print(f"-> Session 2 Response (Preserved Reasoning State):\n{res_a2.text}\n")
    md_content += f"**Session 2 Response (Preserved Reasoning State)**:\n\n{res_a2.text}\n\n---\n\n"

    # -------------------------------------------------------------------
    # SCENARIO B: WITHOUT Thought Signatures & ZERO Memory Passed
    # -------------------------------------------------------------------
    print("=" * 80)
    print("SCENARIO B: WITHOUT Thought Signatures & Zero History Passed")
    print("=" * 80)
    
    md_content += "## SCENARIO B: WITHOUT Thought Signatures & Zero History Passed\n\n"

    # Session 1
    print("\n[Session 1]: User says 'My favorite color is green.' (include_thoughts=False)")
    md_content += "### Session 1\n\n**User**: *\"My favorite color is green.\"*\n\n"
    
    res_b1 = client.models.generate_content(
        model=model_name,
        contents="My favorite color is green.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=False
            )
        )
    )

    has_thoughts_b1 = any(
        getattr(part, 'thought', False) 
        for candidate in res_b1.candidates 
        for part in candidate.content.parts
    ) if res_b1.candidates else False

    print(f"-> Session 1 Response:\n{res_b1.text}\n")
    print(f"-> Thought Signatures Accessible in Payload: {has_thoughts_b1} (None returned!)\n")
    
    md_content += f"**Session 1 Response**:\n\n{res_b1.text}\n\n"
    md_content += f"*Thought Signatures Accessible in Payload*: `{has_thoughts_b1}`\n\n"

    # Session 2
    print("[Session 2]: New independent session asking 'What is my favorite color?' WITHOUT passing history or thought signatures")
    md_content += "### Session 2 (Independent Session WITHOUT History or Thought Signatures)\n\n"
    md_content += "**User**: *\"What is my favorite color?\"*\n\n"
    
    res_b2 = client.models.generate_content(
        model=model_name,
        contents="What is my favorite color?",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=False
            )
        )
    )

    print(f"-> Session 2 Response (Zero Memory / Inaccessible State):\n{res_b2.text}\n")
    md_content += f"**Session 2 Response (Zero Memory / Inaccessible State)**:\n\n{res_b2.text}\n\n---\n\n"

    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("=" * 80)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 80)

if __name__ == "__main__":
    demo_thought_signature_preservation_comparison()
