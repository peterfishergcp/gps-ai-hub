import os
from google import genai
from google.genai import types

def test_thinking_budget():
    """
    Demonstrates controlling thinking budget in Gemini 2.5 models using google-genai SDK on Vertex AI.
    Saves full responses and thought processes to a markdown file (thinking_budget_output.md).
    """
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "ai-hub-459714")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")

    client = genai.Client(
        vertexai=True,
        project=project,
        location=location,
        http_options={'timeout': 60000}
    )

    prompt = "Design a low-latency caching architecture for a real-time bidding system."
    model_name = "gemini-2.5-flash"
    
    budgets = [0, 512, 2048]
    md_output_path = "thinking_budget_output.md"
    
    md_content = f"# Gemini 2.5 Thinking Budget Demo Output\n\n"
    md_content += f"- **Project**: `{project}`\n"
    md_content += f"- **Location**: `{location}`\n"
    md_content += f"- **Model**: `{model_name}`\n"
    md_content += f"- **Prompt**: *\"{prompt}\"*\n\n"
    md_content += "---\n\n"

    print("=" * 60)
    print(f"Testing Thinking Budgets (Gemini 2.5) for Prompt: '{prompt}'")
    print("=" * 60)
    
    for budget in budgets:
        print(f"\n--- [THINKING BUDGET: {budget} tokens] ---")
        md_content += f"## ⏱️ Thinking Budget: `{budget}` tokens\n\n"
        
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(
                        thinking_budget=budget,
                        include_thoughts=True
                    )
                ),
            )
            
            thoughts_found = False
            thought_text = ""
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'thought') and part.thought:
                        thoughts_found = True
                        thought_text += part.text + "\n"
            
            if thoughts_found:
                print("\n[Thought Process]:")
                print(thought_text)
                md_content += "### 💭 Thought Process\n\n"
                md_content += f"```text\n{thought_text.strip()}\n```\n\n"
            else:
                print("[No thought content returned (as expected for budget=0 or un-summarized output)]")
                md_content += "*No thought content returned (as expected for budget=0 or un-summarized output).*\n\n"
                
            print("\n[Model Final Answer]:")
            print(response.text)
            
            md_content += "### 📝 Model Final Answer\n\n"
            md_content += f"{response.text}\n\n"
            md_content += "---\n\n"
            
        except Exception as e:
            error_msg = f"Error demonstrating budget {budget}: {e}"
            print(error_msg)
            md_content += f"> ⚠️ **Error**: {error_msg}\n\n---\n\n"

    with open(md_output_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    print("\n" + "=" * 60)
    print(f"✅ Full output saved to markdown file: {md_output_path}")
    print("=" * 60)

if __name__ == "__main__":
    test_thinking_budget()
