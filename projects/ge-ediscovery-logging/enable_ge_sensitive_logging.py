#!/usr/bin/env python3
"""
Enables observabilityEnabled and sensitiveLoggingEnabled across all Gemini Enterprise
(Discovery Engine) apps/engines in the specified Google Cloud project.

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  python3 enable_ge_sensitive_logging.py
"""

import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()
LOCATIONS = ["global", "us", "eu"]

SSL_CTX = (
    ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    if os.path.exists("/etc/ssl/cert.pem")
    else ssl.create_default_context()
)


def get_gcloud_token() -> str:
    return subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode().strip()


def enable_notebooklm_sensitive_logging(token: str) -> int:
    """Enables Project-level customerProvidedConfig.notebooklmConfig.observabilityConfig across locations."""
    print("\n=== Enabling Project-Level NotebookLM Enterprise Sensitive Logging ===")
    nb_updated = 0
    for loc in LOCATIONS:
        prefix = f"{loc}-" if loc != "global" else ""
        proj_url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/projects/{PROJECT_ID}"
        get_req = urllib.request.Request(
            proj_url,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": PROJECT_ID,
            },
        )
        try:
            proj_before = json.loads(urllib.request.urlopen(get_req, context=SSL_CTX).read().decode())
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"  [NotebookLM {loc}] Skipping ({e.code}): {err_msg[:150]}")
            continue

        before_nb_cfg = (
            proj_before.get("customerProvidedConfig", {})
            .get("notebooklmConfig", {})
            .get("observabilityConfig", {})
        )
        patch_url = (
            f"{proj_url}?updateMask=customerProvidedConfig.notebooklmConfig.observabilityConfig"
        )
        patch_body = json.dumps({
            "customerProvidedConfig": {
                "notebooklmConfig": {
                    "observabilityConfig": {
                        "observabilityEnabled": True,
                        "sensitiveLoggingEnabled": True,
                    }
                }
            }
        }).encode()
        patch_req = urllib.request.Request(
            patch_url,
            data=patch_body,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": PROJECT_ID,
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        try:
            proj_after = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode())
            after_nb_cfg = (
                proj_after.get("customerProvidedConfig", {})
                .get("notebooklmConfig", {})
                .get("observabilityConfig", {})
            )
            nb_updated += 1
            print(f"  [NotebookLM {loc}] Before: {json.dumps(before_nb_cfg)} -> After: {json.dumps(after_nb_cfg)}")
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"  [NotebookLM {loc}] ERROR {e.code}: {err_msg[:200]}")
    return nb_updated


def main() -> None:
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")

    token = get_gcloud_token()
    total_updated = 0

    for loc in LOCATIONS:
        prefix = f"{loc}-" if loc != "global" else ""
        list_url = (
            f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
            f"projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/engines"
        )
        req = urllib.request.Request(
            list_url,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": PROJECT_ID,
            },
        )
        try:
            resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode())
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"[{loc}] Skipping or error ({e.code}): {err_msg[:200]}")
            continue

        engines = resp.get("engines", [])
        if not engines:
            continue

        print(f"=== Location: {loc} ({len(engines)} Gemini Enterprise Apps Found) ===")
        for eng in engines:
            full_name = eng["name"]
            engine_id = full_name.split("/")[-1]
            display_name = eng.get("displayName", engine_id)
            before_cfg = eng.get("observabilityConfig", {})

            patch_url = (
                f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
                f"projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/"
                f"engines/{engine_id}?updateMask=observabilityConfig"
            )
            patch_body = json.dumps({
                "observabilityConfig": {
                    "observabilityEnabled": True,
                    "sensitiveLoggingEnabled": True,
                }
            }).encode()

            patch_req = urllib.request.Request(
                patch_url,
                data=patch_body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Goog-User-Project": PROJECT_ID,
                    "Content-Type": "application/json",
                },
                method="PATCH",
            )
            try:
                patched = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode())
                after_cfg = patched.get("observabilityConfig", {})
                total_updated += 1
                print(f"\n  App Display Name : {display_name}")
                print(f"  Engine ID        : {engine_id}")
                print(f"  Before           : {json.dumps(before_cfg)}")
                print(f"  After            : {json.dumps(after_cfg)}")
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode("utf-8", errors="ignore")
                print(f"\n  App Display Name : {display_name} ({engine_id}) -> ERROR {e.code}: {err_msg[:200]}")

    nb_locations = enable_notebooklm_sensitive_logging(token)
    print(
        f"\nDone! Successfully enabled sensitive logging on {total_updated} Gemini Enterprise engine(s) "
        f"and {nb_locations} NotebookLM Enterprise location(s) in {PROJECT_ID}."
    )


if __name__ == "__main__":
    main()
