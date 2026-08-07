import os
import sys
from google import genai
from google.genai import types

def test_thinking_levels():
    """
    Demonstrates controlling thinking levels in Gemini 3 models using google-genai SDK on Vertex AI.
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
    
    print("=" * 60)
    print(f"Testing Thinking Levels for Prompt: '{prompt}'")
    print("=" * 60)
    
    for level_name, level_enum in levels:
        print(f"\n--- [THINKING LEVEL: {level_name}] ---")
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
            
            # Print thoughts if available
            thoughts_found = False
            if response.candidates and response.candidates[0].content:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'thought') and part.thought:
                        thoughts_found = True
                        print("\n[Thought Summary Process]:")
                        print(part.text)
            
            if not thoughts_found:
                print("\n[No separate thought signature text returned in candidate parts]")
                
            print("\n[Model Final Answer]:")
            print(response.text)  # Print full response text without truncation
            
        except Exception as e:
            print(f"Error demonstrating {level_name}: {e}")

if __name__ == "__main__":
    test_thinking_levels()
