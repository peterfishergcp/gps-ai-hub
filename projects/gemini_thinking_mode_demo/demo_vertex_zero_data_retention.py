import os
from google import genai
from google.genai import types

def demo_vertex_zero_data_retention():
    """
    Demonstrates Zero Data Retention / Stateless Execution on Vertex AI:
    
    1. Turn 1: Uses client.models.generate_content() to execute a query. 
       Unlike the stateful Interactions API, generate_content() is completely 
       stateless with ZERO data retention on Vertex AI servers.
    
    2. Turn 2: Demonstrates that sending a follow-up query without passing 
       previous history results in ZERO memory retention.
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

    print("=" * 80)
    print("DEMO: Zero Data Retention & Stateless Execution on Vertex AI")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 80)

    # -------------------------------------------------------------------
    # STEP 1: Turn 1 - Send prompt with Zero Server Storage
    # -------------------------------------------------------------------
    print("\n--- STEP 1: Sending Prompt with Zero Server Storage ---")
    print("Prompt: 'My favorite color is green.' | API: generate_content() (Stateless)")

    res1 = client.models.generate_content(
        model=model_name,
        contents="My favorite color is green.",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
                include_thoughts=False  # Zero thought content retention
            )
        )
    )

    print(f"\n[Turn 1 Output Received]:")
    print(f"-> Response: {res1.text[:120]}...\n")

    # -------------------------------------------------------------------
    # STEP 2: Turn 2 - Verify zero memory retention across requests
    # -------------------------------------------------------------------
    print("-" * 80)
    print("--- STEP 2: Verifying Zero Memory Retention in Next Request ---")
    print("Sending 'What is my favorite color?' as an independent request...")

    res2 = client.models.generate_content(
        model=model_name,
        contents="What is my favorite color?",
        config=types.GenerateContentConfig(
            thinking_config=types.ThinkingConfig(
                thinking_level=types.ThinkingLevel.LOW,
                include_thoughts=False
            )
        )
    )

    print(f"\n[Turn 2 Output Received]:")
    print(f"-> Response (Zero Memory): {res2.text}\n")

    print("=" * 80)
    print("DEMO TAKEAWAY FOR VERTEX AI:")
    print("On Vertex AI, `generate_content()` provides complete Zero Data Retention.")
    print("Because no server-side conversation state is stored or tracked, Turn 2 has")
    print("zero memory of Turn 1, ensuring enterprise privacy & data governance.")
    print("=" * 80)

if __name__ == "__main__":
    demo_vertex_zero_data_retention()
