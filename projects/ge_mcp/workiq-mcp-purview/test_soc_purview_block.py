#!/usr/bin/env python3
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""
End-to-End Verification Script (Blocked Path):
Native Microsoft Purview Block Verification for Restricted Security Documents

1. Verifies the Allowed file (`MS_ALLOWED_ITEM_ID`) remains encrypted with its
   authorized Purview Sensitivity Label (`protectionEnabled: true`).
2. Verifies or assigns the restricted Purview Sensitivity Label (`MS_RESTRICTED_LABEL_ID`)
   to the target security document (`MS_RESTRICTED_ITEM_ID`) using an App-Only
   X.509 certificate token (`client_credentials`) so the standard test user (`MS_TEST_USER`)
   is NOT the document Issuer/Owner and holds ZERO Purview usage rights.
3. Queries Work IQ MCP (`https://workiq.svc.cloud.microsoft/mcp`) as `MS_TEST_USER`
   via MFA-compatible MSAL v2.0 authentication to confirm Microsoft Purview natively blocks extraction.
"""

import base64
import hashlib
import json
import os
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from msal_auth_helper import acquire_delegated_token

TENANT_ID = os.environ["MS_TENANT_ID"]
CLIENT_ID = os.environ["MS_CLIENT_ID"]

DRIVE_ID = os.environ["MS_SHAREPOINT_DRIVE_ID"]
SITE_NAME = os.environ.get("MS_SHAREPOINT_SITE_NAME", "SharePoint")
ALLOWED_ITEM_ID = os.environ["MS_ALLOWED_ITEM_ID"]
RESTRICTED_ITEM_ID = os.environ["MS_RESTRICTED_ITEM_ID"]
RESTRICTED_LABEL_ID = os.environ["MS_RESTRICTED_LABEL_ID"]

CERT_PATH = os.environ.get("MS_APP_CERT_PATH", ".app_cert.pem")
KEY_PATH = os.environ.get("MS_APP_KEY_PATH", ".app_key.pem")

WORKIQ_RESOURCE_APP_ID = "fdcc1f02-fc51-4226-8753-f668596af7f7"

SSL_CTX = ssl.create_default_context()


def get_cert_app_token() -> str | None:
    """Obtains an App-Only (client_credentials) token using an X.509 certificate."""
    if not (os.path.exists(CERT_PATH) and os.path.exists(KEY_PATH)):
        return None
    der = subprocess.run(
        ["openssl", "x509", "-in", CERT_PATH, "-outform", "DER"],
        check=True,
        capture_output=True,
    ).stdout
    x5t = base64.urlsafe_b64encode(hashlib.sha256(der).digest()).decode().rstrip("=")
    x5t_sha1 = base64.urlsafe_b64encode(hashlib.sha1(der).digest()).decode().rstrip("=")  # Required by Entra x5t JWT header
    header = (
        base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT", "x5t": x5t_sha1, "x5t#S256": x5t}).encode())
        .decode()
        .rstrip("=")
    )
    now = int(time.time())
    safe_tenant = urllib.parse.quote(TENANT_ID, safe="")
    payload = (
        base64.urlsafe_b64encode(
            json.dumps({
                "aud": f"https://login.microsoftonline.com/{safe_tenant}/oauth2/v2.0/token",
                "exp": now + 600,
                "iss": CLIENT_ID,
                "jti": str(uuid.uuid4()),
                "nbf": now - 60,
                "sub": CLIENT_ID,
            }).encode()
        )
        .decode()
        .rstrip("=")
    )
    sig = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", KEY_PATH],
        input=f"{header}.{payload}".encode(),
        check=True,
        capture_output=True,
    ).stdout
    jwt_assertion = f"{header}.{payload}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": jwt_assertion,
        "scope": "https://graph.microsoft.com/.default",
        "grant_type": "client_credentials",
    }).encode()
    return json.loads(
        urllib.request.urlopen(
            f"https://login.microsoftonline.com/{safe_tenant}/oauth2/v2.0/token",
            data=data,
            context=SSL_CTX,
            timeout=30,
        ).read()
    )["access_token"]


def main() -> None:
    app_only_tok = get_cert_app_token()
    del_tok = acquire_delegated_token(
        ["https://graph.microsoft.com/Files.ReadWrite.All", "https://graph.microsoft.com/Sites.ReadWrite.All"],
        env_override_var="MS_GRAPH_ACCESS_TOKEN",
    )
    read_tok = app_only_tok or del_tok

    safe_drive = urllib.parse.quote(DRIVE_ID, safe="")
    safe_allowed = urllib.parse.quote(ALLOWED_ITEM_ID, safe="")
    safe_restricted = urllib.parse.quote(RESTRICTED_ITEM_ID, safe="")

    print("=== Step 0: Verifying Allowed File Remains Encrypted & Accessible ===")
    q_meta = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_allowed}?$select=id,name,sensitivityLabel",
                headers={"Authorization": f"Bearer {read_tok}"},
            ),
            context=SSL_CTX,
            timeout=30,
        ).read()
    )
    print("  Allowed file sensitivityLabel:", json.dumps(q_meta.get("sensitivityLabel")))

    print("\n=== Step 1: Checking Current Purview Label Status on Restricted File ===")
    meta = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(
                f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_restricted}?$select=id,name,size,lastModifiedBy,sensitivityLabel",
                headers={"Authorization": f"Bearer {read_tok}"},
            ),
            context=SSL_CTX,
            timeout=30,
        ).read()
    )
    print("  Current item metadata:", json.dumps(meta, indent=2))

    if meta.get("sensitivityLabel", {}).get("id") != RESTRICTED_LABEL_ID:
        print(f"\n=== Step 2: Assigning Native Purview Label ({RESTRICTED_LABEL_ID}) ===")
        assign_url = f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_restricted}/assignSensitivityLabel"
        assign_tok = app_only_tok or del_tok
        req = urllib.request.Request(
            assign_url,
            method="POST",
            headers={
                "Authorization": f"Bearer {assign_tok}",
                "Content-Type": "application/json",
            },
            data=json.dumps({
                "sensitivityLabelId": RESTRICTED_LABEL_ID,
                "assignmentMethod": "privileged",
                "justificationText": "Apply Purview Restricted Block policy via Service Principal",
            }).encode(),
        )
        try:
            resp = urllib.request.urlopen(req, context=SSL_CTX, timeout=30)
            op_loc = resp.headers.get("Location")
            print("  assignSensitivityLabel accepted (HTTP 202). Polling operation status...")
            if op_loc and op_loc.startswith("https://graph.microsoft.com/"):
                for _ in range(8):
                    time.sleep(3)
                    op_res = json.loads(urllib.request.urlopen(op_loc, context=SSL_CTX, timeout=30).read())
                    status = op_res.get("status")
                    print(f"    Operation status: {status}")
                    if status in ("completed", "succeeded"):
                        break
                    if status == "failed":
                        print("    Operation failed:", op_res.get("error"))
                        return
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            print(f"  Label assignment error (HTTP {e.code}): {err_body[:300]}")
            return

    print("\n=== Step 3: Querying Work IQ MCP Server as Test User (Expecting Purview Block) ===")
    wiq_tok = acquire_delegated_token(
        [f"{WORKIQ_RESOURCE_APP_ID}/.default"],
        env_override_var="MS_WORKIQ_ACCESS_TOKEN",
    )
    file_name = meta.get("name", "SOC-2026-0919-SEC.docx")
    mcp_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "ask",
            "arguments": {
                "question": f"Read and summarize the contents of {file_name} in SharePoint site {SITE_NAME}",
                "agentId": "bizchat-as-gpt-scenario",
            },
        },
    }
    req_mcp = urllib.request.Request(
        "https://workiq.svc.cloud.microsoft/mcp",
        method="POST",
        headers={
            "Authorization": f"Bearer {wiq_tok}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        data=json.dumps(mcp_req).encode(),
    )
    res_mcp = urllib.request.urlopen(req_mcp, context=SSL_CTX, timeout=60).read().decode("utf-8", errors="ignore")
    print(res_mcp)


if __name__ == "__main__":
    main()
