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
import os

os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "test-project")

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
        instrumentor_builder=lambda _project_id: object(),
    )
    runtime.project_id = lambda: "test-project"  # type: ignore[method-assign]
    runtime._telemetry_enabled = lambda: False  # type: ignore[method-assign]
    runtime._tracing_enabled = lambda: False  # type: ignore[method-assign]
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


def test_extract_bearer_token_fails_closed_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify search_google_sites / _extract_bearer_token requires an end-user OAuth token by default."""
    from app.tools import _extract_bearer_token

    monkeypatch.delenv("REQUIRE_USER_OAUTH_TOKEN", raising=False)
    ctx = _FakeToolContext()
    with pytest.raises(PermissionError, match="REQUIRE_USER_OAUTH_TOKEN"):
        _extract_bearer_token(ctx)  # type: ignore[arg-type]

    ctx.state["temp:oauth_token"] = "mock-end-user-oauth-bearer-token-123456"
    assert _extract_bearer_token(ctx) == "mock-end-user-oauth-bearer-token-123456"  # type: ignore[arg-type]


def test_auth_rejects_spoofed_headers_and_unverified_jwt(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify spoofable X-Goog-Authenticated-User-Email and unsigned base64 JWTs are rejected."""
    import base64
    import json

    from app.app_utils.auth import (
        AuthenticationError,
        AuthorizationError,
        verify_request_identity,
    )

    monkeypatch.delenv("ALLOW_LOCAL_UNAUTHENTICATED_DEV", raising=False)
    monkeypatch.delenv("INTEGRATION_TEST", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_AGENT_ENGINE_ID", raising=False)
    monkeypatch.setenv("K_SERVICE", "sites-search-agent")
    monkeypatch.setenv("EXPECTED_OIDC_AUDIENCE", "test-client.apps.googleusercontent.com")

    # 1. Spoofed plaintext header alone -> 401 AuthenticationError
    with pytest.raises(AuthenticationError):
        verify_request_identity(
            {"X-Goog-Authenticated-User-Email": "accounts.google.com:attacker@example.com"},
            client_host="203.0.113.10",
        )

    # 2. Forged unsigned JWT -> 401 AuthenticationError
    fake_hdr = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).decode().rstrip("=")
    fake_body = base64.urlsafe_b64encode(json.dumps({"email": "attacker@example.com"}).encode()).decode().rstrip("=")
    with pytest.raises(AuthenticationError):
        verify_request_identity(
            {"Authorization": f"Bearer {fake_hdr}.{fake_body}."},
            client_host="203.0.113.10",
        )

    # 3. ALLOW_LOCAL_UNAUTHENTICATED_DEV is ignored when K_SERVICE is set (Cloud Run)
    monkeypatch.setenv("ALLOW_LOCAL_UNAUTHENTICATED_DEV", "true")
    with pytest.raises(AuthenticationError):
        verify_request_identity({}, client_host="127.0.0.1")

    # 4. Verified OIDC token enforces ALLOWED_CALLER_DOMAINS RBAC (403 AuthorizationError)
    monkeypatch.setattr(
        "app.app_utils.auth.id_token.verify_oauth2_token",
        lambda token, req, audience=None: {
            "iss": "https://accounts.google.com",
            "aud": audience,
            "email": "outsider@unauthorized.example",
            "email_verified": True,
            "sub": "12345",
        },
    )
    monkeypatch.setenv("ALLOWED_CALLER_DOMAINS", "agency.gov")
    with pytest.raises(AuthorizationError):
        verify_request_identity(
            {"Authorization": "Bearer valid.signed.jwt"},
            client_host="203.0.113.10",
        )

    # Authorized domain succeeds and binds user_id
    monkeypatch.setattr(
        "app.app_utils.auth.id_token.verify_oauth2_token",
        lambda token, req, audience=None: {
            "iss": "https://accounts.google.com",
            "aud": audience,
            "email": "counsel@agency.gov",
            "email_verified": True,
            "sub": "67890",
        },
    )
    caller = verify_request_identity(
        {"Authorization": "Bearer valid.signed.jwt"},
        client_host="203.0.113.10",
    )
    assert caller.user_id == "counsel@agency.gov"
    assert caller.auth_mode == "oidc_jwt"


def test_fastapi_middleware_blocks_unauthenticated_requests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify FastAPI HTTP middleware returns 401 with security headers when unauthenticated."""
    from fastapi.testclient import TestClient

    from app.fast_api_app import app

    monkeypatch.delenv("ALLOW_LOCAL_UNAUTHENTICATED_DEV", raising=False)
    monkeypatch.delenv("INTEGRATION_TEST", raising=False)
    monkeypatch.delenv("GOOGLE_CLOUD_AGENT_ENGINE_ID", raising=False)
    monkeypatch.setenv("K_SERVICE", "sites-search-agent")

    client = TestClient(app)
    resp = client.post(
        "/api/reasoning_engine",
        json={"class_method": "list_sessions", "input": {"user_id": "victim@agency.gov"}},
        headers={"X-Goog-Authenticated-User-Email": "accounts.google.com:victim@agency.gov"},
    )
    assert resp.status_code == 401
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"

    # Verify cross-user session/artifact theft and temp:oauth_token stateDelta injection are blocked (403)
    monkeypatch.setenv("EXPECTED_OIDC_AUDIENCE", "test-client.apps.googleusercontent.com")
    monkeypatch.setenv("ALLOWED_CALLER_DOMAINS", "agency.gov")
    monkeypatch.setattr(
        "app.app_utils.auth.id_token.verify_oauth2_token",
        lambda token, req, audience=None: {
            "iss": "https://accounts.google.com",
            "aud": audience,
            "email": "counsel@agency.gov",
            "email_verified": True,
            "sub": "67890",
        },
    )
    cross_user_resp = client.get(
        "/apps/sites-search-agent/users/victim@agency.gov/sessions",
        headers={"Authorization": "Bearer valid.signed.jwt"},
    )
    assert cross_user_resp.status_code == 403

    inject_resp = client.post(
        "/run",
        json={
            "appName": "sites-search-agent",
            "userId": "counsel@agency.gov",
            "sessionId": "s1",
            "newMessage": {"role": "user", "parts": [{"text": "hi"}]},
            "stateDelta": {"temp:oauth_token": "injected"},
        },
        headers={"Authorization": "Bearer valid.signed.jwt"},
    )
    assert inject_resp.status_code == 403



