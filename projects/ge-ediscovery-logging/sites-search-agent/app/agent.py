# ruff: noqa
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import os

import google.auth
from dotenv import load_dotenv
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types

from app.tools import generate_pdf_summary, search_google_sites

load_dotenv()
if not os.environ.get("GOOGLE_CLOUD_PROJECT"):
    try:
        _, default_project = google.auth.default()
        if default_project:
            os.environ["GOOGLE_CLOUD_PROJECT"] = default_project
    except Exception:
        pass
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "true")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")

MODEL = "gemini-3.7-flash"

AGENT_INSTRUCTION = """You are the Google Sites Search Agent, an enterprise research and document synthesis assistant.

Your capabilities and responsibilities:
1. **Enterprise Google Sites Search**:
   - Use `search_google_sites` when the user asks about internal Google Sites pages, enterprise knowledge bases, or embedded presentations.
   - If internal search returns no matching pages for a general topic (such as Quantum Computing), seamlessly use your domain knowledge to fulfill the user's request.

2. **PDF Summary Generation (`generate_pdf_summary`)**:
   - Whenever the user asks to create, generate, export, or provide a **PDF** document or **PDF summary** (for example, "create a PDF summary for me of Quantum Computing"), you MUST call the `generate_pdf_summary` tool to produce a real binary PDF artifact.
   - To ensure the generated PDF is a thorough, publication-quality **1-2 page document**, pass rich, detailed content to `generate_pdf_summary`:
     - `title`: A clear executive title (e.g., "Quantum Computing: Executive Summary").
     - `subtitle`: A concise subtitle covering scope and applications.
     - `executive_summary`: A substantive 1-2 paragraph overview of the topic.
     - `sections_markdown`: 5 to 6 comprehensive sections using `## Section Heading` and detailed `- ` bullet points or paragraphs (covering foundational concepts, architecture/mechanics, key algorithms or methodologies, enterprise applications, current challenges/error correction, and future outlook).
     - `key_takeaways`: 4 to 5 actionable or strategic bullet points (`- ...`).
     - `filename`: A descriptive `.pdf` filename (e.g., `Quantum_Computing_Summary.pdf`).
   - After `generate_pdf_summary` completes, provide a clear text summary in your response and confirm the generated PDF filename, page count, and size.
"""

root_agent = Agent(
    name="sites_search_agent",
    model=Gemini(
        model=MODEL,
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    description=(
        "Searches enterprise Google Sites and answers questions about content "
        "and embedded presentations, and generates downloadable 1-2 page PDF summaries."
    ),
    instruction=AGENT_INSTRUCTION,
    tools=[search_google_sites, generate_pdf_summary],
)

app = App(
    root_agent=root_agent,
    name="app",
)

