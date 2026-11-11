#!/usr/bin/env python3
"""
Enables OpenTelemetry trace observability (observabilityEnabled=True) and optional
sensitive prompt/response logging (sensitiveLoggingEnabled) across all Gemini Enterprise
(Discovery Engine) apps/engines, custom ADK/Low-Code/A2A agents, and Project-level
NotebookLM Enterprise configurations in the specified Google Cloud project.

Why this is required for Token Tracking:
- Setting `observabilityEnabled: true` instructs Gemini Enterprise and its agents to emit:
  1. OpenTelemetry model execution spans to the Cloud Trace `_Trace` bucket containing
     `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.model`,
     and `gen_ai.conversation.id`.
  2. Structured user activity logs (`discoveryengine.googleapis.com/gemini_enterprise_user_activity`)
     containing `trace`, `userIamPrincipal` (WIF subject or Workspace user), `session_id`,
     and `engine_id`.
- You can optionally pass `--no-sensitive-logging` (or `SENSITIVE_LOGGING_ENABLED=false`)
  if you want full per-user and per-model token telemetry without logging raw prompt or
  response text into Cloud Logging (ideal for higher-education / FERPA / strict privacy environments).

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  python3 enable_ge_observability.py
  # Or metadata/token-only mode (no prompt/response text logged):
  python3 enable_ge_observability.py --no-sensitive-logging
"""

import argparse
import json
import os
import re
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

DEFAULT_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", os.environ.get("PROJECT_ID", "")).strip()
DEFAULT_SENSITIVE = os.environ.get("SENSITIVE_LOGGING_ENABLED", "true").strip().lower() not in ("false", "0", "no")
LOCATIONS = ["global", "us", "eu"]
PROJECT_ID_RE = re.compile(r"^[a-z][a-z0-9\-]{4,28}[a-z0-9]$")

SSL_CTX = (
    ssl.create_default_context(cafile="/etc/ssl/cert.pem")
    if os.path.exists("/etc/ssl/cert.pem")
    else ssl.create_default_context()
)


def get_gcloud_token() -> str:
    return subprocess.check_output(["gcloud", "auth", "print-access-token"]).decode("utf-8").strip()


def enable_notebooklm_observability(project_id: str, token: str, sensitive_logging: bool) -> int:
    """Enables Project-level customerProvidedConfig.notebooklmConfig.observabilityConfig across locations."""
    print("\n=== Enabling Project-Level NotebookLM Enterprise Observability ===")
    nb_updated = 0
    for loc in LOCATIONS:
        prefix = f"{loc}-" if loc != "global" else ""
        proj_url = f"https://{prefix}discoveryengine.googleapis.com/v1alpha/projects/{project_id}"
        get_req = urllib.request.Request(
            proj_url,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": project_id,
            },
        )
        try:
            proj_before = json.loads(urllib.request.urlopen(get_req, context=SSL_CTX).read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"  [NotebookLM {loc}] Skipping ({e.code}): {err_msg[:150]}")
            continue

        before_nb_cfg = (
            proj_before.get("customerProvidedConfig", {})
            .get("notebooklmConfig", {})
            .get("observabilityConfig", {})
        )
        patch_url = f"{proj_url}?updateMask=customerProvidedConfig.notebooklmConfig.observabilityConfig"
        patch_body = json.dumps({
            "customerProvidedConfig": {
                "notebooklmConfig": {
                    "observabilityConfig": {
                        "observabilityEnabled": True,
                        "sensitiveLoggingEnabled": bool(sensitive_logging),
                    }
                }
            }
        }).encode("utf-8")
        patch_req = urllib.request.Request(
            patch_url,
            data=patch_body,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": project_id,
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        try:
            proj_after = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode("utf-8"))
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


def enable_agent_observability(
    project_id: str, token: str, loc: str, prefix: str, engine_id: str, sensitive_logging: bool
) -> int:
    """Enables observabilityConfig on all custom Agents in an Engine so agent turns emit token telemetry."""
    agents_url = (
        f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
        f"projects/{project_id}/locations/{loc}/collections/default_collection/"
        f"engines/{engine_id}/assistants/default_assistant/agents"
    )
    req = urllib.request.Request(
        agents_url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Goog-User-Project": project_id,
        },
    )
    try:
        resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
    except urllib.error.HTTPError:
        return 0

    agents = resp.get("agents", [])
    agents_updated = 0
    for ag in agents:
        ag_name = ag.get("name", "")
        ag_id = ag_name.split("/")[-1]
        if ag_id == "deep_research" or "managedAgentDefinition" in ag or "skillAgentDefinition" in ag:
            continue
        ag_display = ag.get("displayName", ag_id)
        ag_desc = ag.get("description", ag_display)
        before_obs = ag.get("observabilityConfig", {})

        patch_url = (
            f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
            f"projects/{project_id}/locations/{loc}/collections/default_collection/"
            f"engines/{engine_id}/assistants/default_assistant/agents/{ag_id}?updateMask=observabilityConfig"
        )
        patch_body = json.dumps({
            "name": (
                f"projects/{project_id}/locations/{loc}/collections/default_collection/"
                f"engines/{engine_id}/assistants/default_assistant/agents/{ag_id}"
            ),
            "displayName": ag_display,
            "description": ag_desc,
            "observabilityConfig": {
                "observabilityEnabled": True,
                "sensitiveLoggingEnabled": bool(sensitive_logging),
            },
        }).encode("utf-8")
        patch_req = urllib.request.Request(
            patch_url,
            data=patch_body,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": project_id,
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        try:
            patched_ag = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode("utf-8"))
            after_obs = patched_ag.get("observabilityConfig", {})
            agents_updated += 1
            print(f"    -> Agent '{ag_display}' ({ag_id}): {json.dumps(before_obs)} -> {json.dumps(after_obs)}")
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8", errors="ignore")
            print(f"    -> Agent '{ag_display}' ({ag_id}) skipped ({e.code}): {err_msg[:120]}")
    return agents_updated


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Enable OpenTelemetry token observability across Gemini Enterprise engines, custom agents, and NotebookLM."
    )
    parser.add_argument(
        "--project-id",
        default=DEFAULT_PROJECT_ID,
        help="Google Cloud Project ID (or set GCP_PROJECT_ID)",
    )
    parser.add_argument(
        "--sensitive-logging",
        action=argparse.BooleanOptionalAction,
        default=DEFAULT_SENSITIVE,
        help="Also log prompt/response text alongside token telemetry (default: True; pass --no-sensitive-logging for token/metadata-only mode)",
    )
    args = parser.parse_args()

    project_id = (args.project_id or "").strip()
    if not project_id or not PROJECT_ID_RE.match(project_id):
        sys.exit("ERROR: Please provide a valid --project-id or set GCP_PROJECT_ID='your-project-id'.")

    token = get_gcloud_token()
    total_updated = 0
    total_agents_updated = 0

    for loc in LOCATIONS:
        prefix = f"{loc}-" if loc != "global" else ""
        list_url = (
            f"https://{prefix}discoveryengine.googleapis.com/v1alpha/"
            f"projects/{project_id}/locations/{loc}/collections/default_collection/engines"
        )
        req = urllib.request.Request(
            list_url,
            headers={
                "Authorization": f"Bearer {token}",
                "X-Goog-User-Project": project_id,
            },
        )
        try:
            resp = json.loads(urllib.request.urlopen(req, context=SSL_CTX).read().decode("utf-8"))
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
                f"projects/{project_id}/locations/{loc}/collections/default_collection/"
                f"engines/{engine_id}?updateMask=observabilityConfig"
            )
            patch_body = json.dumps({
                "observabilityConfig": {
                    "observabilityEnabled": True,
                    "sensitiveLoggingEnabled": bool(args.sensitive_logging),
                }
            }).encode("utf-8")

            patch_req = urllib.request.Request(
                patch_url,
                data=patch_body,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-Goog-User-Project": project_id,
                    "Content-Type": "application/json",
                },
                method="PATCH",
            )
            try:
                patched = json.loads(urllib.request.urlopen(patch_req, context=SSL_CTX).read().decode("utf-8"))
                after_cfg = patched.get("observabilityConfig", {})
                total_updated += 1
                print(f"\n  App Display Name : {display_name}")
                print(f"  Engine ID        : {engine_id}")
                print(f"  Before           : {json.dumps(before_cfg)}")
                print(f"  After            : {json.dumps(after_cfg)}")
                total_agents_updated += enable_agent_observability(
                    project_id, token, loc, prefix, engine_id, args.sensitive_logging
                )
            except urllib.error.HTTPError as e:
                err_msg = e.read().decode("utf-8", errors="ignore")
                print(f"\n  App Display Name : {display_name} ({engine_id}) -> ERROR {e.code}: {err_msg[:200]}")

    nb_locations = enable_notebooklm_observability(project_id, token, args.sensitive_logging)
    print(
        f"\nDone! Enabled observability (sensitiveLoggingEnabled={args.sensitive_logging}) on "
        f"{total_updated} Gemini Enterprise engine(s), {total_agents_updated} Agent(s), and "
        f"{nb_locations} NotebookLM Enterprise location(s) in {project_id}."
    )


if __name__ == "__main__":
    main()
