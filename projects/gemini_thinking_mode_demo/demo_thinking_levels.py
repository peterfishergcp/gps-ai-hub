import os
import sys
from google import genai
from google.genai import types

def test_thinking_levels():
    """
    Demonstrates controlling thinking levels in Gemini 3 models using google-genai SDK on Vertex AI.
    Saves the complete output and thought processes to a markdown file (thinking_levels_output.md).
    """
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-hub-459714")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    
    print(f"Using Project: {project}, Location: {location}")
    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options={'timeout': 60000}
    )
    
    prompt = "Solve the quadratic equation 3x^2 + 7x - 2 = 0 and explain your reasoning step-by-step."
    model_name = "gemini-3-flash-preview"
    
    levels = [
        ("MINIMAL", types.ThinkingLevel.MINIMAL),
        ("LOW", types.ThinkingLevel.LOW),
        ("MEDIUM", types.ThinkingLevel.MEDIUM),
        ("HIGH", types.ThinkingLevel.HIGH),
    ]
    
    md_output_path = "thinking_levels_output.md"
    
    # Initialize markdown content
    md_content = f"# Gemini 3 Thinking Levels Demo Output\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n"
    md_content += f"- **Prompt**: *\"{prompt}\"*\n\n"
    md_content += "---\n\n"

    print("=" * 60)
    print(f"Testing Thinking Levels for Prompt: '{prompt}'")
    print("=" * 60)
    
    for level_name, level_enum in levels:
        print(f"\n--- [THINKING LEVEL: {level_name}] ---")
        md_content += f"## 🧠 Thinking Level: `{level_name}`\n\n"
        
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(
                        thinking_level=level_enum,
                        include_thoughts=True
                    )
                ),
            )
            
            # Extract thoughts if available
            thoughts_found = False
            thought_text = ""
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'thought') and part.thought:
                        thoughts_found = True
                        thought_text += part.text + "\n"
            
            if thoughts_found:
                print("\n[Thought Summary Process]:")
                print(thought_text)
                md_content += "### 💭 Thought Process\n\n"
                md_content += f"```text\n{thought_text.strip()}\n```\n\n"
            else:
                print("\n[No separate thought signature text returned in candidate parts]")
                md_content += "*No separate thought signature text returned in candidate parts.*\n\n"
                
            print("\n[Model Final Answer]:")
            print(response.text)
            
            md_content += "### 📝 Model Final Answer\n\n"
            md_content += f"{response.text}\n\n"
            md_content += "---\n\n"
            
        except Exception as e:
            error_msg = f"Error demonstrating {level_name}: {e}"
            print(error_msg)
            md_content += f"> ⚠️ **Error**: {error_msg}\n\n---\n\n"

    # Save to Markdown file
    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    print("\n" + "=" * 60)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 60)

if __name__ == "__main__":
    test_thinking_levels()
