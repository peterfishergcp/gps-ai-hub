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


def enable_agent_sensitive_logging(token: str, loc: str, prefix: str, engine_id: str) -> int:
    """Enables observabilityConfig (observabilityEnabled=true, sensitiveLoggingEnabled=true) on all custom Agents in an Engine."""
    agents_url = (
        f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
        f"projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/"
        f"engines/{engine_id}/assistants/default_assistant/agents"
    )
    req = urllib.request.Request(
        agents_url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": PROJECT_ID,
        },
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode())
    except urllib.error.HTTPError:
        return 0

    agents = resp.get("agents", [])
    agents_updated = 0
    for ag in agents:
        ag_name = ag.get("name", "")
        ag_id = ag_name.split("/")[-1]
        # Skip built-in/system managed agents (e.g. deep_research) or skill definitions that cannot be patched with observabilityConfig
        if ag_id == "deep_research" or "managedAgentDefinition" in ag or "skillAgentDefinition" in ag:
            continue
        ag_display = ag.get("displayName", ag_id)
        ag_desc = ag.get("description", ag_display)
        before_obs = ag.get("observabilityConfig", {})

        patch_url = (
            f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
            f"projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/"
            f"engines/{engine_id}/assistants/default_assistant/agents/{ag_id}?updateMask=observabilityConfig"
        )
        patch_body = json.dumps({
            "name": f"projects/{PROJECT_ID}/locations/{loc}/collections/default_collection/engines/{engine_id}/assistants/default_assistant/agents/{ag_id}",
            "displayName": ag_display,
            "description": ag_desc,
            "observabilityConfig": {
                "observabilityEnabled": True,
                "sensitiveLoggingEnabled": True,
            },
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
            patched_ag = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode())
            after_obs = patched_ag.get("observabilityConfig", {})
            agents_updated += 1
            print(f"    -> Agent '{ag_display}' ({ag_id}): {json.dumps(before_obs)} -> {json.dumps(after_obs)}")
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"    -> Agent '{ag_display}' ({ag_id}) skipped ({e.code}): {err_msg[:120]}")
    return agents_updated


def main() -> None:
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")

    token = get_gcloud_token()
    total_updated = 0
    total_agents_updated = 0

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
                total_agents_updated += enable_agent_sensitive_logging(token, loc, prefix, engine_id)
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode("utf-8", errors="ignore")
                print(f"\n  App Display Name : {display_name} ({engine_id}) -> ERROR {e.code}: {err_msg[:200]}")

    nb_locations = enable_notebooklm_sensitive_logging(token)
    print(
        f"\nDone! Successfully enabled sensitive logging on {total_updated} Gemini Enterprise engine(s), "
        f"{total_agents_updated} Agent(s), and {nb_locations} NotebookLM Enterprise location(s) in {PROJECT_ID}."
    )


if __name__ == "__main__":
    main()

