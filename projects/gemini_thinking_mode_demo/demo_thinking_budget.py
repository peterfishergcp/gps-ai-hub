import os
from google import genai
from google.genai import types

def test_thinking_budget():
    """
    Demonstrates controlling thinking budget in Gemini 2.5 models using google-genai SDK on Vertex AI.
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
    
    print("=" * 60)
    print(f"Testing Thinking Budgets (Gemini 2.5) for Prompt: '{prompt}'")
    print("=" * 60)
    
    for budget in budgets:
        print(f"\n--- [THINKING BUDGET: {budget} tokens] ---")
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
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'thought') and part.thought:
                        thoughts_found = True
                        print("\n[Thought Process]:")
                        print(part.text)
            
            if not thoughts_found:
                print("[No thought content returned (as expected for budget=0 or un-summarized output)]")
                
            print("\n[Model Final Answer Preview]:")
            print(response.text[:250] + "...")
            
        except Exception as e:
            print(f"Error demonstrating budget {budget}: {e}")

if __name__ == "__main__":
    test_thinking_budget()
