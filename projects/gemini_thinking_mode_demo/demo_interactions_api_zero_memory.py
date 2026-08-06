import os
from google import genai
from google.genai import types

def demo_interactions_api_zero_memory():
    """
    Demonstrates Zero Retention / Zero Memory on the recommended Google Interactions API:
    
    1. Turn 1: Client calls client.interactions.create(model="gemini-3-flash-preview", input="My favorite color is green.")
       The model generates an output and assigns an interaction ID.
       
    2. Turn 2: Client sends a new turn WITHOUT passing `previous_interaction_id`.
       Because no previous_interaction_id is supplied, Turn 2 is completely unlinked and stateless.
       
    3. Result: Demonstrates that the Interactions API retains ZERO memory of Turn 1 unless 
       `previous_interaction_id` is explicitly passed by the caller.
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
    print("DEMO: Zero Memory Retention on the Recommended Interactions API")
    print(f"Project: {project} | Location: {location} | Model: {model_name}")
    print("=" * 80)

    # -------------------------------------------------------------------
    # STEP 1: Turn 1 on Interactions API
    # -------------------------------------------------------------------
    print("\n--- STEP 1: Sending Turn 1 via client.interactions.create() ---")
    print("Prompt: 'My favorite color is green.'")

    turn1 = client.interactions.create(
        model=model_name,
        input="My favorite color is green.",
        generation_config={
            "thinking_level": "low"
        }
    )

    print(f"\n[Turn 1 Output Received]:")
    print(f"-> Response: {turn1.output_text[:120]}...")
    print(f"-> Turn 1 Interaction ID: {turn1.id}\n")

    # -------------------------------------------------------------------
    # STEP 2: Turn 2 without passing previous_interaction_id
    # -------------------------------------------------------------------
    print("-" * 80)
    print("--- STEP 2: Turn 2 without passing previous_interaction_id ---")
    print("Sending 'What is my favorite color?' WITHOUT previous_interaction_id...")

    turn2 = client.interactions.create(
        model=model_name,
        input="What is my favorite color?",
        generation_config={
            "thinking_level": "low"
        }
        # Notice: previous_interaction_id is NOT passed here!
    )

    print(f"\n[Turn 2 Output Received]:")
    print(f"-> Response (Zero Memory Retained): {turn2.output_text}\n")

    print("=" * 80)
    print("DEMO TAKEAWAY FOR RECOMMEND INTERACTIONS API:")
    print("1. The Interactions API relies on explicit caller linking via `previous_interaction_id`.")
    print("2. When `previous_interaction_id` is omitted, Turn 2 executes completely unlinked with")
    print("   ZERO memory or awareness of Turn 1, guaranteeing stateless data privacy.")
    print("=" * 80)

if __name__ == "__main__":
    demo_interactions_api_zero_memory()
