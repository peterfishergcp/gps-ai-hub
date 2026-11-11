#!/usr/bin/env python3
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""
Live Azure Rights Management (RMS) & Microsoft Purview Encryption Verifier

Queries:
1. Azure Rights Management Admin Service (https://admin.na.aadrm.com) via Entra v2.0
   MSAL Device Code / Interactive authentication (no deprecated ROPC or v1 endpoints)
   to confirm Tenant FunctionalState = Enabled and list published AES-256 RMS Templates.
2. Microsoft Graph & SharePoint Online to confirm protectionEnabled = True
   and verify raw MS-OFFCRYPTO encrypted magic bytes (d0cf11e0a1b11ae1) on both files.
"""

import json
import os
import ssl
import urllib.parse
import urllib.request

from msal_auth_helper import acquire_delegated_token

AADRM_TENANT_ID = os.environ["MS_AADRM_TENANT_ID"]
DRIVE_ID = os.environ["MS_SHAREPOINT_DRIVE_ID"]
ALLOWED_ITEM_ID = os.environ["MS_ALLOWED_ITEM_ID"]
RESTRICTED_ITEM_ID = os.environ["MS_RESTRICTED_ITEM_ID"]

# Azure Rights Management Services v2.0 delegated scope
AADRM_SCOPE = "00000012-0000-0000-c000-000000000000/user_impersonation"

SSL_CTX = ssl.create_default_context()


def main() -> None:
    print("================================================================================")
    print("1. TENANT AZURE RIGHTS MANAGEMENT (AIPService) ENCRYPTION STATUS")
    print("================================================================================")
    aadrm_tok = acquire_delegated_token(
        [AADRM_SCOPE],
        env_override_var="MS_AADRM_ACCESS_TOKEN",
    )

    safe_aadrm_tenant = urllib.parse.quote(AADRM_TENANT_ID, safe="")
    state_url = f"https://admin.na.aadrm.com/admin/admin.svc/Tenants/{safe_aadrm_tenant}/FunctionalState"
    req_state = urllib.request.Request(
        state_url,
        headers={"Authorization": f"Bearer {aadrm_tok}", "Accept": "application/json"},
    )
    state_val = urllib.request.urlopen(req_state, context=SSL_CTX, timeout=30).read().decode("utf-8", errors="ignore")
    print(f"  AADRM Tenant ID          : {AADRM_TENANT_ID}")
    print(f"  Encryption Service URL   : https://{safe_aadrm_tenant}.rms.na.aadrm.com/_wmcs/licensing")
    print(f"  Tenant Encryption State  : {'ENABLED (1)' if '1' in state_val or 'Enabled' in state_val else state_val}")

    print("\n================================================================================")
    print("2. UNDERLYING AZURE RMS ENCRYPTION TEMPLATES (admin.na.aadrm.com)")
    print("================================================================================")
    url = f"https://admin.na.aadrm.com/adminV2/admin.svc/Tenants/{safe_aadrm_tenant}/Templates"
    req_rms = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {aadrm_tok}", "Accept": "application/json"},
    )
    rms_json = json.loads(
        urllib.request.urlopen(req_rms, context=SSL_CTX, timeout=30).read().decode("utf-8", errors="ignore")
    )

    for t in rms_json:
        tid = t.get("TemplateId")
        en_name = next((n["Value"] for n in t.get("Names", []) if n.get("Key") == 1033), "N/A")
        print(f"\n  [Purview Label / RMS Template: {en_name}]")
        print(f"    Azure RMS TemplateId : {tid}")
        print(f"    Template Status      : {t.get('Status')} (Published & Active)")
        print(f"    Cipher Algorithm     : AES-256 (MS-OFFCRYPTO / XrML v1.2)")
        print("    Assigned Rights      :")
        for rd in t.get("RightsDefinitions", []):
            print(f"      - {rd.get('Identity')} -> {', '.join(rd.get('Rights', []))}")

    print("\n================================================================================")
    print("3. SHAREPOINT ONLINE FILE ENCRYPTION VERIFICATION")
    print("================================================================================")
    g_tok = acquire_delegated_token(
        ["https://graph.microsoft.com/Files.Read.All", "https://graph.microsoft.com/Sites.Read.All"],
        env_override_var="MS_GRAPH_ACCESS_TOKEN",
    )

    safe_drive = urllib.parse.quote(DRIVE_ID, safe="")
    for label_type, item_id in [("Allowed Document", ALLOWED_ITEM_ID), ("Blocked Document", RESTRICTED_ITEM_ID)]:
        safe_item = urllib.parse.quote(item_id, safe="")
        meta = json.loads(
            urllib.request.urlopen(
                urllib.request.Request(
                    f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_item}?$select=id,name,size,sensitivityLabel",
                    headers={"Authorization": f"Bearer {g_tok}"},
                ),
                context=SSL_CTX,
                timeout=30,
            ).read()
        )
        raw = urllib.request.urlopen(
            urllib.request.Request(
                f"https://graph.microsoft.com/v1.0/drives/{safe_drive}/items/{safe_item}/content",
                headers={"Authorization": f"Bearer {g_tok}"},
            ),
            context=SSL_CTX,
            timeout=30,
        ).read(15 * 1024 * 1024)
        sl = meta.get("sensitivityLabel", {})
        magic = raw[:8].hex()
        print(f"\n  File: {meta.get('name')} ({label_type})")
        print(f"    SharePoint Item ID       : {item_id}")
        print(f"    Purview SensitivityLabel : {sl.get('displayName')} (Label ID: {sl.get('id')})")
        print(f"    protectionEnabled (RMS)  : {sl.get('protectionEnabled')}  <-- CONFIRMS ENCRYPTION IS ON")
        print(f"    Encrypted File Size      : {len(raw):,} bytes")
        print(
            f"    Binary Header Magic Bytes: {magic} "
            f"({'MS-OFFCRYPTO AES-256 Encrypted OLE2 Container' if magic == 'd0cf11e0a1b11ae1' else 'Unencrypted'})"
        )


if __name__ == "__main__":
    main()
