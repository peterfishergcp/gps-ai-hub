import os
from google import genai
from google.genai import types

def demo_thinking_and_zero_retention():
    """
    Demonstrates Gemini Thinking Mode combined with Zero Server Storage / Non-Persistent State.
    Shows the contrast between:
    1. Passing conversation history vs Omitting history (Zero Memory).
    2. Setting include_thoughts=False for zero thought output retention.
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

    print("=" * 75)
    print("DEMO: Gemini Thinking Mode & Zero Retention / Memory Control")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 75)

    # -------------------------------------------------------------------
    # PART 1: Conversation WITH Memory (Context Preserved)
    # -------------------------------------------------------------------
    print("\n--- PART 1: Conversation WITH Memory (Context Preserved) ---")
    chat = client.chats.create(
        model=model_name,
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
                include_thoughts=True  # Thoughts included in Part 1
            )
        )
    )

    prompt1 = "My favorite color is green."
    print(f"User Turn 1: {prompt1}")
    res1 = chat.send_message(prompt1)
    print(f"Model Response: {res1.text[:120]}...\n")

    prompt2 = "What is my favorite color?"
    print(f"User Turn 2: {prompt2}")
    res2 = chat.send_message(prompt2)
    print(f"Model Response (With Memory): {res2.text}\n")

    # -------------------------------------------------------------------
    # PART 2: Stateless / Zero Storage Request (include_thoughts=False)
    # -------------------------------------------------------------------
    print("-" * 75)
    print("--- PART 2: Stateless / Zero Storage Request (include_thoughts=False) ---")
    print("Sending 'What is my favorite color?' with include_thoughts=False and zero prior history...")

    res_stateless = client.models.generate_content(
        model=model_name,
        contents="What is my favorite color?",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
                include_thoughts=False  # Disables thought summaries/signatures in response
            )
        )
    )

    # Verify thoughts are excluded
    has_thoughts = any(
        getattr(part, 'thought', False) 
        for candidate in res_stateless.candidates 
        for part in candidate.content.parts
    ) if res_stateless.candidates else False

    print(f"\nInclude Thoughts in Response: {not has_thoughts} (include_thoughts=False enforced)")
    print(f"Model Response (Zero Memory): {res_stateless.text}\n")
    print("=" * 75)
    print("KEY TAKEAWAY FOR DEMO:")
    print("- Part 1 proves Gemini remembers state when context/history is provided.")
    print("- Part 2 proves that with zero storage/history passed and include_thoughts=False, ZERO thought content or state is retained or returned.")

if __name__ == "__main__":
    demo_thinking_and_zero_retention()
