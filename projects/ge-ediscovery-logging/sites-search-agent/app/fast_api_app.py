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

import contextlib
import json
import os
import re
import urllib.parse
from collections.abc import AsyncIterator

from a2a.server.tasks import InMemoryTaskStore
from dotenv import load_dotenv
from fastapi import FastAPI, Request, responses
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import Runner

from app.app_utils import services
from app.app_utils.a2a import attach_a2a_routes
from app.app_utils.auth import (
    AuthenticationError,
    AuthorizationError,
    verify_request_identity,
)
from app.app_utils.reasoning_engine_adapter import (
    attach_reasoning_engine_routes,
)

load_dotenv()
allow_origins = (
    [o.strip() for o in os.getenv("ALLOW_ORIGINS", "").split(",") if o.strip() and o.strip() != "*"]
    if os.getenv("ALLOW_ORIGINS")
    else None
)
otel_to_cloud = os.environ.get(
    "GOOGLE_CLOUD_AGENT_ENGINE_ENABLE_TELEMETRY", ""
).lower() in ("true", "1")

AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ADK_USER_PATH_RE = re.compile(r"^/apps/[^/]+/users/([^/]+)(?:/|$)")
_STATE_OAUTH_KEYS = frozenset({"temp:oauth_token", "oauth_token", "access_token", "temp:access_token"})


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    from app.agent import app as adk_app
    from app.agent import root_agent

    runner = Runner(
        app=adk_app,
        session_service=services.get_session_service(),
        artifact_service=services.get_artifact_service(),
        auto_create_session=True,
    )
    app.state.runner = runner
    app.state.agent_app_name = adk_app.name
    enable_a2a = (
        not os.environ.get("K_SERVICE")
        or os.environ.get("ENABLE_A2A_ROUTES", "false").lower() in ("true", "1")
    )
    if enable_a2a:
        await attach_a2a_routes(
            app,
            agent=root_agent,
            runner=runner,
            task_store=InMemoryTaskStore(),
            rpc_path=f"/a2a/{adk_app.name}",
        )
    yield


enable_web_ui = (
    not os.environ.get("K_SERVICE")
    and os.environ.get("ENABLE_ADK_WEB_UI", "false").lower() in ("true", "1")
)

app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    web=enable_web_ui,
    artifact_service_uri=services.ARTIFACT_SERVICE_URI,
    allow_origins=allow_origins,
    session_service_uri=services.SESSION_SERVICE_URI,
    otel_to_cloud=otel_to_cloud,
    lifespan=lifespan,
)
app.title = "sites-search-agent"
app.description = "API for interacting with the Agent sites-search-agent"


def _apply_security_headers(response: responses.Response) -> responses.Response:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    )
    return response


@app.middleware("http")
async def enforce_authentication_and_security_headers(
    request: Request, call_next
) -> responses.Response:
    """
    Enforces cryptographic IAP/OIDC authentication, RBAC, and per-caller session/artifact
    isolation across all ADK (`/apps/*`, `/run`, `/run_sse`), A2A, and Reasoning Engine routes.
    """
    client_host = request.client.host if request.client else None
    try:
        caller = verify_request_identity(request.headers, client_host=client_host)
        request.state.verified_caller = caller
    except AuthenticationError as exc:
        return _apply_security_headers(
            responses.JSONResponse(status_code=401, content={"detail": str(exc)})
        )
    except AuthorizationError as exc:
        return _apply_security_headers(
            responses.JSONResponse(status_code=403, content={"detail": str(exc)})
        )

    # Enforce strict per-user isolation on ADK's built-in /apps/*, /run, and /run_sse routes
    if caller.auth_mode in ("iap_jwt", "oidc_jwt"):
        path = request.url.path
        m_user = _ADK_USER_PATH_RE.match(path)
        if m_user:
            path_uid = urllib.parse.unquote(m_user.group(1)).strip()
            if path_uid != caller.user_id:
                return _apply_security_headers(
                    responses.JSONResponse(
                        status_code=403,
                        content={"detail": "Cross-user session or artifact access denied"},
                    )
                )
            if request.method in ("POST", "PATCH", "PUT"):
                raw_body = await request.body()
                if raw_body:
                    try:
                        payload = json.loads(raw_body)
                    except Exception:
                        payload = None
                    if isinstance(payload, dict):
                        state_obj = payload.get("state") or payload.get("stateDelta") or payload.get("state_delta")
                        if (
                            isinstance(state_obj, dict)
                            and any(k in state_obj for k in _STATE_OAUTH_KEYS)
                            and os.environ.get("ALLOW_DIRECT_STATE_OAUTH_TOKEN", "false").lower() != "true"
                        ):
                            return _apply_security_headers(
                                responses.JSONResponse(
                                    status_code=403,
                                    content={"detail": "Direct OAuth state token injection is forbidden"},
                                )
                            )
        elif path in ("/run", "/run_sse") and request.method == "POST":
            try:
                payload = json.loads(await request.body())
            except Exception:
                return _apply_security_headers(
                    responses.JSONResponse(status_code=400, content={"detail": "Invalid JSON request body"})
                )
            if not isinstance(payload, dict):
                return _apply_security_headers(
                    responses.JSONResponse(status_code=400, content={"detail": "JSON object required"})
                )
            req_uid = str(payload.get("userId") or payload.get("user_id") or "").strip()
            if req_uid != caller.user_id:
                return _apply_security_headers(
                    responses.JSONResponse(
                        status_code=403,
                        content={"detail": "Cross-user execution denied: userId must match authenticated caller"},
                    )
                )
            state_delta = payload.get("stateDelta") or payload.get("state_delta")
            if (
                isinstance(state_delta, dict)
                and any(k in state_delta for k in _STATE_OAUTH_KEYS)
                and os.environ.get("ALLOW_DIRECT_STATE_OAUTH_TOKEN", "false").lower() != "true"
            ):
                return _apply_security_headers(
                    responses.JSONResponse(
                        status_code=403,
                        content={"detail": "Direct OAuth stateDelta token injection is forbidden"},
                    )
                )

    response = await call_next(request)
    return _apply_security_headers(response)


# Proxy routes so the Vertex AI Console Playground (reasoning_engine SDK) can
# talk to this agent alongside the native adk_api routes.
attach_reasoning_engine_routes(app)


# Main execution (binds loopback 127.0.0.1 by default for local dev)
if __name__ == "__main__":
    import uvicorn

    bind_host = os.environ.get("HOST", "127.0.0.1")
    bind_port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=bind_host, port=bind_port)
