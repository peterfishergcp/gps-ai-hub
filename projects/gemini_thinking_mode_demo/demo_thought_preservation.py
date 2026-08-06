import os
from google import genai
from google.genai import types

def test_thought_preservation():
    """
    Demonstrates multi-turn chat thought signature preservation across turns on Vertex AI.
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
    res1 = chat.send_message(prompt1)
    
    for part in res1.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            print("\n[Turn 1 Thoughts]:")
            print(part.text)
    print(f"\n[Turn 1 Model Response]:\n{res1.text}")
    
    # Turn 2
    prompt2 = "Now I give away half of my total fruits. How many fruits remain?"
    print(f"\nUser Turn 2: {prompt2}")
    res2 = chat.send_message(prompt2)
    
    for part in res2.candidates[0].content.parts:
        if hasattr(part, 'thought') and part.thought:
            print("\n[Turn 2 Thoughts (Building on Turn 1 Context & Thought Signatures)]:")
            print(part.text)
    print(f"\n[Turn 2 Model Response]:\n{res2.text}")

if __name__ == "__main__":
    test_thought_preservation()
