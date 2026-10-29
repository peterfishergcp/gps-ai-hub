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

"""Serve the reasoning_engine ``{class_method, input}`` contract over HTTP.

Exists to guarantee support for the Vertex AI Console Playground and Gemini
Enterprise (via ADK registration), which both invoke the engine through this
contract. Agent Engine forwards calls to ``/api/reasoning_engine`` (sync) and
``/api/stream_reasoning_engine`` (streaming); dispatch is limited to the
:class:`AdkApp` ``register_operations()`` methods so the wire output matches a
packaged Agent Engine.
"""

import inspect
import json

try:
    from vertexai.agent_engines.templates.adk import AdkApp
except ImportError:
    from agentplatform.agent_engines.templates.adk import AdkApp
from fastapi import FastAPI, HTTPException, Request, encoders, responses
from starlette.concurrency import iterate_in_threadpool, run_in_threadpool

from app.app_utils import services
from app.app_utils.auth import (
    AuthenticationError,
    AuthorizationError,
    VerifiedCaller,
    verify_request_identity,
)

ALLOWED_STREAMING_METHODS = frozenset({"stream_query", "async_stream_query"})
ALLOWED_SYNC_METHODS = frozenset(
    {
        "query",
        "async_query",
        "create_session",
        "async_create_session",
        "get_session",
        "async_get_session",
        "list_sessions",
        "async_list_sessions",
    }
)


def _derive_authenticated_user_id(request: Request) -> str | None:
    """
    Derives a deterministic caller user_id strictly from cryptographically verified
    IAP / OIDC JWT claims (never trusting raw X-Goog-Authenticated-User-Email or
    unverified JWT base64 payloads).
    """
    caller: VerifiedCaller | None = getattr(request.state, "verified_caller", None)
    if caller is None:
        client_host = request.client.host if request.client else None
        try:
            caller = verify_request_identity(request.headers, client_host=client_host)
        except AuthenticationError as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except AuthorizationError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

    if caller.auth_mode in ("iap_jwt", "oidc_jwt"):
        return caller.user_id
    return None


def _no_op_instrumentor_builder(project_id: str) -> None:
    """No-op so set_up() keeps the startup instrumentor and generate_content spans."""
    return None


def attach_reasoning_engine_routes(app: FastAPI) -> None:
    """Register reasoning_engine routes that dispatch to an AdkApp."""
    runtime: AdkApp | None = None
    streaming_methods: set[str] = set()
    sync_methods: set[str] = set()

    def get_runtime() -> AdkApp:
        nonlocal runtime, streaming_methods, sync_methods
        if runtime is None:
            from app.agent import app as adk_app

            # Reuse the process-wide services so sessions created here are
            # visible to the adk_api and A2A paths, and vice versa (see services.py).
            runtime = AdkApp(
                app=adk_app,
                session_service_builder=services.get_session_service,
                artifact_service_builder=services.get_artifact_service,
                instrumentor_builder=_no_op_instrumentor_builder,
            )
            runtime.set_up()
            operations = runtime.register_operations()
            streaming_methods = (
                set(operations.get("stream", []))
                | set(operations.get("async_stream", []))
            ) & ALLOWED_STREAMING_METHODS
            sync_methods = (
                set(operations.get("", [])) | set(operations.get("async", []))
            ) & ALLOWED_SYNC_METHODS
        return runtime

    def resolve_method(class_method: str, *, streaming: bool):
        rt = get_runtime()
        allowed = streaming_methods if streaming else sync_methods
        if class_method not in allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Disallowed or unsupported reasoning_engine method: {class_method!r}",
            )
        return getattr(rt, class_method)

    def _enforce_caller_user_id(request: Request, kwargs: dict) -> dict:
        """Enforces that `user_id` matches the authenticated caller identity when present (mitigates M4)."""
        sanitized = dict(kwargs)
        verified_uid = _derive_authenticated_user_id(request)
        if verified_uid:
            caller_uid = str(sanitized.get("user_id") or "").strip()
            if caller_uid and caller_uid != verified_uid:
                raise HTTPException(
                    status_code=403,
                    detail="Cross-user session access denied: user_id does not match authenticated caller",
                )
            sanitized["user_id"] = verified_uid
        return sanitized

    @app.post("/api/stream_reasoning_engine")
    async def stream_query(request: Request) -> responses.StreamingResponse:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON request body") from exc
        if not isinstance(body, dict) or not isinstance(body.get("class_method"), str):
            raise HTTPException(
                status_code=400,
                detail="Request body must be a JSON object with a string 'class_method'",
            )
        method = resolve_method(body["class_method"], streaming=True)
        raw_input = body.get("input")
        if raw_input is not None and not isinstance(raw_input, dict):
            raise HTTPException(status_code=400, detail="'input' must be a JSON object")
        kwargs = _enforce_caller_user_id(request, raw_input or {})
        stream = (
            await method(**kwargs)
            if inspect.iscoroutinefunction(method)
            else method(**kwargs)
        )

        async def generator():
            if hasattr(stream, "__aiter__"):
                async for event in stream:
                    yield (
                        json.dumps(encoders.jsonable_encoder(event, exclude_none=True))
                        + "\n"
                    )
            else:
                async for event in iterate_in_threadpool(stream):
                    yield (
                        json.dumps(encoders.jsonable_encoder(event, exclude_none=True))
                        + "\n"
                    )

        return responses.StreamingResponse(
            content=generator(), media_type="application/json"
        )

    @app.post("/api/reasoning_engine")
    async def query(request: Request) -> responses.JSONResponse:
        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON request body") from exc
        if not isinstance(body, dict) or not isinstance(body.get("class_method"), str):
            raise HTTPException(
                status_code=400,
                detail="Request body must be a JSON object with a string 'class_method'",
            )
        method = resolve_method(body["class_method"], streaming=False)
        raw_input = body.get("input")
        if raw_input is not None and not isinstance(raw_input, dict):
            raise HTTPException(status_code=400, detail="'input' must be a JSON object")
        kwargs = _enforce_caller_user_id(request, raw_input or {})
        if inspect.iscoroutinefunction(method):
            output = await method(**kwargs)
        else:
            output = await run_in_threadpool(method, **kwargs)
        return responses.JSONResponse(
            content=encoders.jsonable_encoder({"output": output})
        )
