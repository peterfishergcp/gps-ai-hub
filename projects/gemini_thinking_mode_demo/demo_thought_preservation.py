import os
from google import genai
from google.genai import types

def test_thought_preservation():
    """
    Demonstrates multi-turn chat thought signature preservation across turns on Vertex AI.
    Saves full responses and thought processes to a markdown file (thought_preservation_output.md).
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
    md_output_path = "thought_preservation_output.md"
    
    md_content = f"# Multi-Turn Chat Thought Preservation Output\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n\n"
    md_content += "---\n\n"

    print("=" * 60)
    print("Testing Multi-Turn Chat Thought Preservation")
    print("=" * 60)
    
    chat = client.chats.create(
        model=model_name,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=True
            )
        )
    )
    
    # Turn 1
    prompt1 = "I have 3 apples and 2 oranges. If I buy double the amount of apples I have, how many total fruits do I have?"
    print(f"\nUser Turn 1: {prompt1}")
    md_content += f"## Turn 1\n\n**User**: *\"{prompt1}\"*\n\n"
    
    res1 = chat.send_message(prompt1)
    
    thought_1 = ""
    for part in res1.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            thought_1 += part.text + "\n"
            
    if thought_1:
        print("\n[Turn 1 Thoughts]:")
        print(thought_1)
        md_content += "### 💭 Turn 1 Thoughts\n\n"
        md_content += f"```text\n{thought_1.strip()}\n```\n\n"
        
    print(f"\n[Turn 1 Model Response]:\n{res1.text}")
    md_content += "### 📝 Turn 1 Response\n\n"
    md_content += f"{res1.text}\n\n---\n\n"
    
    # Turn 2
    prompt2 = "Now I give away half of my total fruits. How many fruits remain?"
    print(f"\nUser Turn 2: {prompt2}")
    md_content += f"## Turn 2\n\n**User**: *\"{prompt2}\"*\n\n"
    
    res2 = chat.send_message(prompt2)
    
    thought_2 = ""
    for part in res2.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            thought_2 += part.text + "\n"
            
    if thought_2:
        print("\n[Turn 2 Thoughts (Building on Turn 1 Context & Thought Signatures)]:")
        print(thought_2)
        md_content += "### 💭 Turn 2 Thoughts (Building on Turn 1 Context & Thought Signatures)\n\n"
        md_content += f"```text\n{thought_2.strip()}\n```\n\n"
        
    print(f"\n[Turn 2 Model Response]:\n{res2.text}")
    md_content += "### 📝 Turn 2 Response\n\n"
    md_content += f"{res2.text}\n\n---\n\n"

    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("\n" + "=" * 60)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 60)

if __name__ == "__main__":
    test_thought_preservation()
