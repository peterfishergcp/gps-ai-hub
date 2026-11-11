#!/usr/bin/env python3
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""
MFA-Compatible Microsoft Entra ID v2.0 Delegated Token Helper (MSAL).

Replaces deprecated OAuth 2.0 Resource Owner Password Credentials (ROPC) and legacy v1 endpoints
with MSAL PublicClientApplication supporting silent token cache reuse, OAuth 2.0
Device Code flow (default for headless/SSH terminals), and Interactive Browser flow.
"""

from __future__ import annotations

import os
import pathlib
import sys
from typing import Sequence


CACHE_FILE = pathlib.Path(
    os.environ.get(
        "MS_TOKEN_CACHE_PATH",
        str(pathlib.Path.home() / ".cache" / "workiq_mcp_purview_token_cache.bin"),
    )
)


def _load_cache():
    import msal  # Imported lazily so syntax/help checks work before pip install

    cache = msal.SerializableTokenCache()
    if CACHE_FILE.exists():
        cache.deserialize(CACHE_FILE.read_text(encoding="utf-8"))
    return cache


def _save_cache(cache) -> None:
    if not cache.has_state_changed:
        return
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(CACHE_FILE), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(cache.serialize())


def acquire_delegated_token(
    scopes: Sequence[str],
    *,
    client_id: str | None = None,
    tenant_id: str | None = None,
    login_hint: str | None = None,
    env_override_var: str | None = None,
) -> str:
    """Acquires a Microsoft Entra ID v2.0 delegated access token with MFA support."""
    if env_override_var and os.environ.get(env_override_var):
        return os.environ[env_override_var].strip()

    try:
        import msal
    except ImportError as exc:
        raise RuntimeError(
            "Missing required dependency 'msal'. Install via: pip install -r requirements.txt"
        ) from exc

    resolved_tenant = (tenant_id or os.environ["MS_TENANT_ID"]).strip()
    resolved_client = (client_id or os.environ["MS_CLIENT_ID"]).strip()
    resolved_hint = (login_hint or os.environ.get("MS_TEST_USER", "")).strip() or None
    auth_flow = os.environ.get("MS_AUTH_FLOW", "device_code").strip().lower()

    authority = f"https://login.microsoftonline.com/{resolved_tenant}"
    cache = _load_cache()
    app = msal.PublicClientApplication(
        client_id=resolved_client,
        authority=authority,
        token_cache=cache,
    )

    scope_list = list(scopes)
    accounts = app.get_accounts(username=resolved_hint) if resolved_hint else app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(scope_list, account=accounts[0])
        if result and "access_token" in result:
            _save_cache(cache)
            return result["access_token"]

    if auth_flow == "interactive":
        result = app.acquire_token_interactive(scopes=scope_list, login_hint=resolved_hint)
    else:
        flow = app.initiate_device_flow(scopes=scope_list)
        if "user_code" not in flow:
            raise RuntimeError(f"Failed to initiate Entra Device Code flow: {flow.get('error_description') or flow}")
        print(flow["message"], file=sys.stderr, flush=True)
        result = app.acquire_token_by_device_flow(flow)

    if not result or "access_token" not in result:
        err_desc = (result or {}).get("error_description") or (result or {}).get("error") or "Unknown MSAL error"
        raise RuntimeError(f"Failed to acquire delegated Entra v2.0 token: {err_desc}")

    _save_cache(cache)
    return result["access_token"]
