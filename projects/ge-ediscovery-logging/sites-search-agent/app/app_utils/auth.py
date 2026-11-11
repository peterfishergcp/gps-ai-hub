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

"""Cryptographic caller authentication and RBAC authorization for the ADK server.

Security invariants:
  - Never trusts spoofable plaintext `X-Goog-Authenticated-User-Email` headers or
    unverified base64-decoded JWT claims.
  - Verifies Cloud IAP `X-Goog-IAP-JWT-Assertion` (ES256) via `google.oauth2.id_token`
    against `https://www.gstatic.com/iap/verify/public_key-jwk` and mandatory `IAP_AUDIENCE`.
  - Verifies `Authorization: Bearer <id_token>` (RS256) via `google.oauth2.id_token`
    against Google OIDC certificates and mandatory `EXPECTED_OIDC_AUDIENCE`.
  - Fails closed (`401` / `403`) on Cloud Run (`K_SERVICE` set) and standalone HTTP
    deployments unless a cryptographically verified identity is presented.
  - Permits unauthenticated loopback (`127.0.0.1` / `::1` / `testclient`) access ONLY
    when running outside Cloud Run and `ALLOW_LOCAL_UNAUTHENTICATED_DEV=true` (or
    `INTEGRATION_TEST=TRUE`).
"""

from __future__ import annotations

import dataclasses
import os
from collections.abc import Mapping

from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token

_IAP_JWK_URL = "https://www.gstatic.com/iap/verify/public_key-jwk"
_GOOGLE_ISSUERS = frozenset({"https://accounts.google.com", "accounts.google.com"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost", "testclient"})

_AUTH_REQUEST = google_auth_requests.Request()


@dataclasses.dataclass(frozen=True)
class VerifiedCaller:
    """Cryptographically verified caller identity."""

    user_id: str
    email: str | None
    auth_mode: str


class AuthenticationError(PermissionError):
    """Raised when caller credentials are missing or invalid (HTTP 401)."""


class AuthorizationError(PermissionError):
    """Raised when a verified caller is denied by RBAC policy (HTTP 403)."""


def _parse_csv_env(name: str) -> set[str]:
    raw = os.environ.get(name, "")
    return {
        item.strip().lower()
        for item in raw.split(",")
        if item.strip() and not item.strip().startswith("<")
    }


def is_caller_authorized(email_or_sub: str | None) -> bool:
    """Evaluates optional caller email / domain allowlists (`ALLOWED_CALLER_EMAILS`, `ALLOWED_CALLER_DOMAINS`)."""
    allowed_emails = _parse_csv_env("ALLOWED_CALLER_EMAILS")
    allowed_domains = {d.lstrip("@") for d in _parse_csv_env("ALLOWED_CALLER_DOMAINS")}

    if not allowed_emails and not allowed_domains:
        return True

    if not email_or_sub or "@" not in email_or_sub:
        return False

    norm = email_or_sub.strip().lower()
    if norm in allowed_emails:
        return True
    domain = norm.rsplit("@", 1)[1]
    return domain in allowed_domains


def verify_iap_jwt(iap_jwt: str) -> VerifiedCaller:
    """Verifies an ES256 Cloud IAP JWT against Google IAP JWK public keys."""
    expected_aud = os.environ.get("IAP_AUDIENCE", "").strip()
    if not expected_aud:
        raise AuthenticationError(
            "IAP_AUDIENCE must be configured to verify X-Goog-IAP-JWT-Assertion."
        )
    try:
        claims = id_token.verify_token(
            iap_jwt,
            _AUTH_REQUEST,
            audience=expected_aud,
            certs_url=_IAP_JWK_URL,
        )
    except Exception as exc:
        raise AuthenticationError("Invalid X-Goog-IAP-JWT-Assertion token.") from exc

    if claims.get("iss") != "https://cloud.google.com/iap":
        raise AuthenticationError("Unexpected issuer in IAP token.")

    raw_email = str(claims.get("email") or "").strip()
    if ":" in raw_email:
        raw_email = raw_email.split(":", 1)[1].strip()
    sub = str(claims.get("sub") or "").strip()
    principal = (raw_email or sub).lower()
    if not principal:
        raise AuthenticationError("IAP token missing email/sub claim.")

    if not is_caller_authorized(raw_email or None):
        raise AuthorizationError("Caller is not permitted by ALLOWED_CALLER_EMAILS / ALLOWED_CALLER_DOMAINS.")

    return VerifiedCaller(
        user_id=principal,
        email=raw_email.lower() if raw_email else None,
        auth_mode="iap_jwt",
    )


def verify_oidc_bearer_jwt(bearer_token: str) -> VerifiedCaller:
    """Verifies an RS256 Google OIDC ID token against `EXPECTED_OIDC_AUDIENCE`."""
    audiences = [
        a.strip()
        for a in os.environ.get("EXPECTED_OIDC_AUDIENCE", "").split(",")
        if a.strip() and not a.strip().startswith("<")
    ]
    if not audiences:
        raise AuthenticationError(
            "EXPECTED_OIDC_AUDIENCE must be configured to verify Bearer ID tokens."
        )

    claims = None
    last_exc: Exception | None = None
    for aud in audiences:
        try:
            claims = id_token.verify_oauth2_token(
                bearer_token,
                _AUTH_REQUEST,
                audience=aud,
            )
            break
        except Exception as exc:
            last_exc = exc

    if claims is None:
        raise AuthenticationError("Invalid Google OIDC Bearer token.") from last_exc

    if claims.get("iss") not in _GOOGLE_ISSUERS:
        raise AuthenticationError("Unexpected OIDC token issuer.")

    raw_email = str(claims.get("email") or "").strip().lower()
    if raw_email and claims.get("email_verified") is False:
        raise AuthenticationError("OIDC token email is not verified.")

    sub = str(claims.get("sub") or "").strip()
    principal = raw_email or sub
    if not principal:
        raise AuthenticationError("OIDC token missing email/sub claim.")

    if not is_caller_authorized(raw_email or None):
        raise AuthorizationError("Caller is not permitted by ALLOWED_CALLER_EMAILS / ALLOWED_CALLER_DOMAINS.")

    return VerifiedCaller(
        user_id=principal,
        email=raw_email or None,
        auth_mode="oidc_jwt",
    )


def _is_local_dev_bypass_allowed(client_host: str | None) -> bool:
    if os.environ.get("K_SERVICE"):
        return False
    if (client_host or "") not in _LOOPBACK_HOSTS:
        return False
    return os.environ.get("ALLOW_LOCAL_UNAUTHENTICATED_DEV", "").lower() in (
        "true",
        "1",
    ) or os.environ.get("INTEGRATION_TEST", "").lower() in ("true", "1")


def _is_managed_agent_runtime(client_host: str | None) -> bool:
    """Managed Vertex AI Agent Runtime enforces `aiplatform.reasoningEngines.query` IAM upstream."""
    if os.environ.get("K_SERVICE"):
        return False
    if not os.environ.get("GOOGLE_CLOUD_AGENT_ENGINE_ID"):
        return False
    return (client_host or "") in _LOOPBACK_HOSTS or not client_host


def verify_request_identity(
    headers: Mapping[str, str],
    client_host: str | None = None,
) -> VerifiedCaller:
    """Authenticates and authorizes an incoming HTTP request or raises AuthenticationError / AuthorizationError."""
    iap_jwt = (headers.get("x-goog-iap-jwt-assertion") or headers.get("X-Goog-IAP-JWT-Assertion") or "").strip()
    if iap_jwt:
        return verify_iap_jwt(iap_jwt)

    auth_hdr = (headers.get("authorization") or headers.get("Authorization") or "").strip()
    if auth_hdr.lower().startswith("bearer "):
        token = auth_hdr.split(" ", 1)[1].strip()
        if token:
            return verify_oidc_bearer_jwt(token)

    if _is_managed_agent_runtime(client_host):
        return VerifiedCaller(
            user_id="agent-runtime-iam-caller",
            email=None,
            auth_mode="agent_runtime_iam",
        )

    if _is_local_dev_bypass_allowed(client_host):
        return VerifiedCaller(
            user_id="local-dev-user",
            email="local-dev@localhost",
            auth_mode="local_dev_bypass",
        )

    raise AuthenticationError(
        "Missing cryptographic authentication header (X-Goog-IAP-JWT-Assertion or Authorization: Bearer <id_token>)."
    )
