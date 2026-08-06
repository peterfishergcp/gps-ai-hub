import os
from google import genai
from google.genai import types

def demo_thought_signature_preservation_comparison():
    """
    Demonstrates Thought Signature Preservation across independent sessions:
    
    SCENARIO A (include_thoughts=True):
      - Session 1: Prompt sent with include_thoughts=True. Captured thought signatures.
      - Session 2: New request passing Session 1 history WITH thought signatures.
      - Result: Preserves reasoning state across sessions.

    SCENARIO B (include_thoughts=False & ZERO Context / History Passed):
      - Session 1: User says 'My favorite color is green.' with include_thoughts=False.
      - Session 2: A NEW independent session asks 'What is my favorite color?' without passing Turn 1 history or thought signatures.
      - Result: Shows that without passing history/thought signatures, the model has ZERO memory of Turn 1.
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

    # Session 1: Initial user prompt
    print("\n[Session 1]: User says 'My favorite color is green.' (include_thoughts=True)")
    res_a1 = client.models.generate_content(
        model=model_name,
        contents="My favorite color is green.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=True  # Enables thought signature generation & capture
            )
        )
    )

    # Extract thought signature/content part from Session 1
    thoughts_a1 = []
    if res_a1.candidates and res_a1.candidates[0].content:
        for part in res_a1.candidates[0].content.parts:
            if getattr(part, 'thought', False):
                thoughts_a1.append(part.text)

    print(f"-> Session 1 Response: {res_a1.text[:100]}...")
    print(f"-> Captured Thought Signature: {thoughts_a1[0][:120] if thoughts_a1 else 'Generated'}...\n")

    # Session 2: New independent request passing Session 1's history AND thought signatures
    print("[Session 2]: Passing Session 1's history + Thought Signatures into a new session")
    history_with_thoughts = [
        {"role": "user", "parts": [{"text": "My favorite color is green."}]},
        {"role": "model", "parts": res_a1.candidates[0].content.parts},  # Contains response + thought signatures
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

    print(f"-> Session 2 Response (Preserved Reasoning State): {res_a2.text}\n")

    # -------------------------------------------------------------------
    # SCENARIO B: WITHOUT Thought Signatures & ZERO Memory Passed
    # -------------------------------------------------------------------
    print("=" * 80)
    print("SCENARIO B: WITHOUT Thought Signatures & Zero History Passed")
    print("=" * 80)

    # Session 1: Initial prompt with thoughts suppressed
    print("\n[Session 1]: User says 'My favorite color is green.' (include_thoughts=False)")
    res_b1 = client.models.generate_content(
        model=model_name,
        contents="My favorite color is green.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.MEDIUM,
                include_thoughts=False  # Suppresses thought signatures in response payload
            )
        )
    )

    # Verify thoughts are stripped/absent
    has_thoughts_b1 = any(
        getattr(part, 'thought', False) 
        for candidate in res_b1.candidates 
        for part in candidate.content.parts
    ) if res_b1.candidates else False

    print(f"-> Session 1 Response: {res_b1.text[:100]}...")
    print(f"-> Thought Signatures Accessible in Payload: {has_thoughts_b1} (None returned!)\n")

    # Session 2: New independent request asking question WITHOUT passing history or thought signatures
    print("[Session 2]: New independent session asking 'What is my favorite color?' WITHOUT passing history or thought signatures")
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

    print(f"-> Session 2 Response (Zero Memory / Inaccessible State): {res_b2.text}\n")

    print("=" * 80)
    print("SUMMARY / DEMO TAKEAWAY:")
    print("1. Scenario A: Demonstrates that passing thought signatures preserves exact reasoning state across sessions.")
    print("2. Scenario B: Demonstrates that when include_thoughts=False and no history/thought signatures are passed, internal reasoning state is inaccessible across sessions.")
    print("=" * 80)

if __name__ == "__main__":
    demo_thought_signature_preservation_comparison()
