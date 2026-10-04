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
"""Unit tests for Google Sites Search Agent tools, including PDF generation."""

from typing import Any

import pytest
from google.genai import types

from app.tools import generate_pdf_summary


class _FakeToolContext:
    def __init__(self) -> None:
        self.saved_artifacts: dict[str, types.Part] = {}
        self.state: dict[str, Any] = {}

    async def save_artifact(self, filename: str, artifact: types.Part) -> int:
        self.saved_artifacts[filename] = artifact
        return 0


@pytest.mark.asyncio
async def test_generate_pdf_summary_creates_valid_pdf_artifact() -> None:
    """Verify generate_pdf_summary produces a valid 1-2 page PDF binary and saves it via ToolContext."""
    ctx = _FakeToolContext()
    sections = "\n\n".join(
        [
            f"## Section {i}: Quantum Architecture and Algorithms\n"
            + "\n".join(
                [
                    f"- Detailed bullet point {j} explaining superposition, entanglement, "
                    "quantum error correction, surface codes, and enterprise cryptographic impact."
                    for j in range(1, 7)
                ]
            )
            for i in range(1, 6)
        ]
    )
    res = await generate_pdf_summary(
        title="Quantum Computing: Executive Summary",
        subtitle="Core Principles, Hardware Architectures, and Enterprise Impact",
        executive_summary=(
            "Quantum computing leverages quantum-mechanical phenomena such as superposition "
            "and entanglement to solve computational problems intractable for classical supercomputers."
        ),
        sections_markdown=sections,
        key_takeaways=(
            "- Begin post-quantum cryptography migration immediately.\n"
            "- Evaluate hybrid quantum-classical algorithms for optimization and chemistry."
        ),
        filename="Quantum_Computing_Summary.pdf",
        tool_context=ctx,  # type: ignore[arg-type]
    )

    assert res["status"] == "success"
    assert res["filename"] == "Quantum_Computing_Summary.pdf"
    assert 1 <= res["page_count"] <= 2
    assert res["byte_size"] > 1000
    assert "Quantum_Computing_Summary.pdf" in ctx.saved_artifacts

    part = ctx.saved_artifacts["Quantum_Computing_Summary.pdf"]
    assert part.inline_data is not None
    assert part.inline_data.mime_type == "application/pdf"
    assert part.inline_data.data is not None
    assert part.inline_data.data.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_adk_app_streaming_run_response_includes_pdf_artifact() -> None:
    """Verify AdkApp._convert_response_events serializes the saved PDF artifact for Gemini Enterprise."""
    from agentplatform.agent_engines.templates.adk import AdkApp
    from fastapi import encoders
    from google.adk.artifacts import InMemoryArtifactService
    from google.adk.events.event import Event
    from google.adk.events.event_actions import EventActions

    from app.agent import app as adk_app

    artifact_service = InMemoryArtifactService()
    runtime = AdkApp(
        app=adk_app,
        artifact_service_builder=lambda: artifact_service,
    )
    runtime.set_up()

    pdf_bytes = b"%PDF-1.4\n%test-pdf-binary\n"
    pdf_part = types.Part(
        inline_data=types.Blob(
            mime_type="application/pdf",
            data=pdf_bytes,
            display_name="Quantum_Computing_Summary.pdf",
        )
    )
    version = await artifact_service.save_artifact(
        app_name=runtime._app_name(),
        user_id="test_user",
        session_id="test_session",
        filename="Quantum_Computing_Summary.pdf",
        artifact=pdf_part,
    )
    event = Event(
        author="sites_search_agent",
        content=types.Content(
            role="model",
            parts=[types.Part.from_text(text="Generated PDF summary.")],
        ),
        actions=EventActions(artifact_delta={"Quantum_Computing_Summary.pdf": version}),
    )
    converted = await runtime._convert_response_events(
        user_id="test_user",
        session_id="test_session",
        events=[event],
        artifact_service=artifact_service,
    )
    encoded = encoders.jsonable_encoder(converted, exclude_none=True)
    assert "artifacts" in encoded
    assert len(encoded["artifacts"]) == 1
    assert encoded["artifacts"][0]["file_name"] == "Quantum_Computing_Summary.pdf"
    inline_data = encoded["artifacts"][0]["versions"][0]["data"]["inlineData"]
    assert inline_data["mimeType"] == "application/pdf"
    assert inline_data["data"]


