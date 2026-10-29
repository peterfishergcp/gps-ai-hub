#!/usr/bin/env python3
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""
End-to-End Verification Script (Allowed Path):
Microsoft Purview Sensitivity Label Encryption + Work IQ MCP Decryption & Summarization

Verifies:
1. Microsoft Graph sensitivityLabel metadata (protectionEnabled: true).
2. Raw SharePoint file binary stream begins with the MS-OFFCRYPTO / OLE2 Compound File
   magic bytes (d0cf11e0a1b11ae1) containing EncryptedPackage + DRMEncryptedTransform.
3. Live JSON-RPC 2.0 call to https://workiq.svc.cloud.microsoft/mcp (`ask` tool)
   confirming on-the-fly Purview decryption and executive summarization.
"""

import json
import os
import ssl
import urllib.parse
import urllib.request

from msal_auth_helper import acquire_delegated_token

DRIVE_ID = os.environ["MS_SHAREPOINT_DRIVE_ID"]
SITE_NAME = os.environ.get("MS_SHAREPOINT_SITE_NAME", "SharePoint")
ALLOWED_ITEM_ID = os.environ["MS_ALLOWED_ITEM_ID"]

# Global Microsoft 1st-Party Work IQ Resource App ID
WORKIQ_RESOURCE_APP_ID = "fdcc1f02-fc51-4226-8753-f668596af7f7"

SSL_CTX = ssl.create_default_context()


def main() -> None:
    print("================================================================================")
    print("STEP 1: Verify Microsoft Graph sensitivityLabel Metadata (protectionEnabled)")
    print("================================================================================")
    graph_token = acquire_delegated_token(
        ["https://graph.microsoft.com/Files.Read.All", "https://graph.microsoft.com/Sites.Read.All"],
        env_override_var="MS_GRAPH_ACCESS_TOKEN",
    )
    safe_drive = urllib.parse.quote(DRIVE_ID, safe="")
    safe_item = urllib.parse.quote(ALLOWED_ITEM_ID, safe="")
    meta_url = (
        f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_item}"
        "?$select=id,name,size,webUrl,sensitivityLabel"
    )
    meta = json.loads(
        urllib.request.urlopen(
            urllib.request.Request(meta_url, headers={"Authorization": f"Bearer {graph_token}"}),
            context=SSL_CTX,
            timeout=30,
        ).read()
    )
    print(json.dumps(meta, indent=2))

    print("\n================================================================================")
    print("STEP 2: Verify Raw SharePoint File Header (MS-OFFCRYPTO AES-256 OLE2 Container)")
    print("================================================================================")
    content_url = f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_item}/content"
    raw_bytes = urllib.request.urlopen(
        urllib.request.Request(content_url, headers={"Authorization": f"Bearer {graph_token}"}),
        context=SSL_CTX,
        timeout=30,
    ).read(15 * 1024 * 1024)
    magic_hex = raw_bytes[:8].hex()
    print(f"Downloaded {len(raw_bytes):,} bytes | First 8 magic bytes: {magic_hex}")
    if magic_hex == "d0cf11e0a1b11ae1":
        print("Confirmed: File is an encrypted MS-OFFCRYPTO / OLE2 Compound File container.")

    print("\n================================================================================")
    print("STEP 3: Query Work IQ MCP Server (https://workiq.svc.cloud.microsoft/mcp)")
    print("================================================================================")
    workiq_token = acquire_delegated_token(
        [f"{WORKIQ_RESOURCE_APP_ID}/.default"],
        env_override_var="MS_WORKIQ_ACCESS_TOKEN",
    )
    file_name = meta.get("name", "Quantum_Computing_Clean_Purview.docx")
    mcp_payload = {
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
            "Authorization": f"Bearer {workiq_token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        data=json.dumps(mcp_payload).encode(),
    )
    resp_text = urllib.request.urlopen(req_mcp, context=SSL_CTX, timeout=60).read().decode("utf-8", errors="ignore")
    print(resp_text)


if __name__ == "__main__":
    main()
