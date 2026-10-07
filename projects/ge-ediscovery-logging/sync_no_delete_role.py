#!/usr/bin/env python3
"""
sync_no_delete_role.py — Compares the Google-managed 'roles/discoveryengine.user'
predefined role against the project's 'geUserNoDelete' custom role to detect
and safely sync newly added Discovery Engine permissions without ever
re-introducing chat or session file deletion permissions.

Why this is needed:
  Google periodically updates 'roles/discoveryengine.user' with new permissions
  as new Gemini Enterprise capabilities launch. Because GCP custom roles have a
  static permission list, 'projects/<PROJECT_ID>/roles/geUserNoDelete' can drift
  behind 'roles/discoveryengine.user' over time.

  This script:
    1. Fetches the latest permissions on 'roles/discoveryengine.user'.
    2. Filters to permissions supported in project-level custom roles
       (via iam.googleapis.com/v1/permissions:queryTestablePermissions).
    3. Enforces a two-layer Delete-Removal Guard:
       - Layer 1 (Explicit Denylist): Always blocks 'discoveryengine.sessions.delete'
         and 'discoveryengine.sessions.removeContextFile' (plus any custom
         --deny-permission flags).
       - Layer 2 (Heuristic Pattern Guard): Automatically blocks any newly
         introduced permission matching
         r'^discoveryengine\\.(sessions|conversations|assistAnswers|turns)\\..*(delete|remove|purge)'
         so a future Google API addition can never silently re-enable chat deletion.
    4. Compares the resulting safe target permission set against the live
       'projects/<PROJECT_ID>/roles/geUserNoDelete' custom role and reports:
       - Safe permissions to ADD (in roles/discoveryengine.user but missing in geUserNoDelete)
       - Obsolete permissions to REMOVE (removed by Google from roles/discoveryengine.user)
       - Blocked delete permissions (never added)
    5. When '--apply' is passed, patches 'geUserNoDelete' in-place (never deletes
       the role) to add the new safe permissions.

Usage:
  # 1. Check for drift (read-only dry run):
  python3 sync_no_delete_role.py --project="$GCP_PROJECT_ID"

  # 2. Apply updates to geUserNoDelete if new safe permissions exist:
  python3 sync_no_delete_role.py --project="$GCP_PROJECT_ID" --apply

  # 3. Machine-readable JSON report (for CI/CD or Cloud Monitoring):
  python3 sync_no_delete_role.py --project="$GCP_PROJECT_ID" --json
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

SSL_CTX = ssl.create_default_context()

STANDARD_GE_ROLE = "roles/discoveryengine.user"
DEFAULT_CUSTOM_ROLE_ID = os.environ.get("CUSTOM_ROLE_ID", "geUserNoDelete").strip()

# Explicit permissions that must NEVER be present in the custom role
EXPLICIT_DENIED_PERMISSIONS = {
    "discoveryengine.sessions.delete",
    "discoveryengine.sessions.removeContextFile",
}

# Heuristic regex guard: blocks any future session/conversation/turn/answer
# delete, remove, or purge permission Google might add to roles/discoveryengine.user
SESSION_DELETE_PATTERN = re.compile(
    r"^discoveryengine\.(sessions|conversations|assistAnswers|turns|chat|messages)\..*(delete|remove|purge)",
    re.IGNORECASE,
)


def get_access_token() -> str:
    """Obtains a Google Cloud access token via google.auth ADC or gcloud fallback."""
    try:
        import google.auth
        import google.auth.transport.requests

        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        if not creds.valid:
            creds.refresh(google.auth.transport.requests.Request())
        if creds.token:
            return creds.token
    except Exception:
        pass

    return (
        subprocess.check_output(["gcloud", "auth", "print-access-token"])
        .decode("utf-8")
        .strip()
    )


def api_request(
    method: str,
    url: str,
    token: str,
    project_id: str,
    payload: dict | None = None,
) -> dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "X-Goog-User-Project": project_id,
    }
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def fetch_testable_permissions(project_id: str, token: str) -> set[str]:
    """Returns all permissions supported in custom roles on the target project."""
    testable: set[str] = set()
    page_token = ""
    while True:
        body: dict = {
            "fullResourceName": f"//cloudresourcemanager.googleapis.com/projects/{project_id}",
            "pageSize": 1000,
        }
        if page_token:
            body["pageToken"] = page_token
        resp = api_request(
            "POST",
            "https://iam.googleapis.com/v1/permissions:queryTestablePermissions",
            token,
            project_id,
            body,
        )
        for p in resp.get("permissions", []):
            if p.get("customRolesSupportLevel") != "NOT_SUPPORTED":
                testable.add(p["name"])
        page_token = resp.get("nextPageToken", "")
        if not page_token:
            break
    return testable


def classify_permissions(
    base_perms: set[str],
    testable_perms: set[str],
    extra_denied: set[str],
) -> dict:
    """
    Classifies permissions from roles/discoveryengine.user into:
      - unsupported_in_custom_role (e.g. resourcemanager.projects.list)
      - blocked_explicit_delete (discoveryengine.sessions.delete, discoveryengine.sessions.removeContextFile, etc.)
      - blocked_heuristic_delete (any new session/conversation delete/remove/purge permission)
      - safe_target_permissions (all remaining supported permissions)
    """
    denied_all = EXPLICIT_DENIED_PERMISSIONS | extra_denied
    unsupported = sorted(base_perms - testable_perms)
    supported = base_perms & testable_perms

    blocked_explicit = sorted(p for p in supported if p in denied_all)
    blocked_heuristic = sorted(
        p
        for p in supported
        if p not in denied_all and SESSION_DELETE_PATTERN.search(p)
    )
    blocked_all = set(blocked_explicit) | set(blocked_heuristic)
    safe_target = sorted(supported - blocked_all)

    return {
        "unsupported_in_custom_role": unsupported,
        "blocked_explicit_delete": blocked_explicit,
        "blocked_heuristic_delete": blocked_heuristic,
        "safe_target_permissions": safe_target,
    }


def analyze_role_drift(
    project_id: str,
    role_id: str,
    token: str,
    extra_denied: set[str],
) -> dict:
    """Compares roles/discoveryengine.user against projects/{project_id}/roles/{role_id}."""
    base_role = api_request(
        "GET",
        f"https://iam.googleapis.com/v1/{STANDARD_GE_ROLE}",
        token,
        project_id,
    )
    base_perms = set(base_role.get("includedPermissions", []))

    custom_role_name = f"projects/{project_id}/roles/{role_id}"
    try:
        custom_role = api_request(
            "GET",
            f"https://iam.googleapis.com/v1/{custom_role_name}",
            token,
            project_id,
        )
    except urllib.error.HTTPError as e:
        if e.code == 404:
            sys.exit(
                f"ERROR: Custom role '{custom_role_name}' does not exist yet in project '{project_id}'.\n"
                f"Run 'python3 setup_no_delete_role.py --project={project_id} --ensure-custom-role' first."
            )
        raise

    current_custom_perms = set(custom_role.get("includedPermissions", []))
    testable_perms = fetch_testable_permissions(project_id, token)

    classified = classify_permissions(base_perms, testable_perms, extra_denied)
    safe_target_set = set(classified["safe_target_permissions"])
    blocked_set = set(classified["blocked_explicit_delete"]) | set(
        classified["blocked_heuristic_delete"]
    )

    # Permissions in roles/discoveryengine.user (safe & supported) that are missing from custom role
    to_add = sorted(safe_target_set - current_custom_perms)

    # Permissions in custom role that are no longer in roles/discoveryengine.user
    obsolete_in_custom = sorted(
        current_custom_perms - safe_target_set - blocked_set
    )

    # CRITICAL check: are any forbidden delete permissions currently inside the custom role?
    forbidden_present_in_custom = sorted(current_custom_perms & blocked_set)

    in_sync = (
        len(to_add) == 0
        and len(obsolete_in_custom) == 0
        and len(forbidden_present_in_custom) == 0
    )

    return {
        "project_id": project_id,
        "source_role": STANDARD_GE_ROLE,
        "source_role_total_permissions": len(base_perms),
        "custom_role": custom_role_name,
        "custom_role_title": custom_role.get("title", ""),
        "custom_role_deleted": bool(custom_role.get("deleted", False)),
        "custom_role_current_count": len(current_custom_perms),
        "safe_target_count": len(safe_target_set),
        "unsupported_in_custom_role": classified["unsupported_in_custom_role"],
        "blocked_explicit_delete": classified["blocked_explicit_delete"],
        "blocked_heuristic_delete": classified["blocked_heuristic_delete"],
        "permissions_to_add": to_add,
        "obsolete_permissions_in_custom": obsolete_in_custom,
        "forbidden_delete_present_in_custom": forbidden_present_in_custom,
        "safe_target_permissions": classified["safe_target_permissions"],
        "in_sync": in_sync,
    }


def print_human_report(report: dict) -> None:
    print("======================================================================")
    print("Gemini Enterprise Custom Role Drift & Delete-Guard Audit")
    print("======================================================================")
    print(f"  Project ID                 : {report['project_id']}")
    print(f"  Source Predefined Role     : {report['source_role']} ({report['source_role_total_permissions']} permissions)")
    print(f"  Target Custom Role         : {report['custom_role']} ({report['custom_role_current_count']} permissions)")
    print(f"  Expected Safe Target Count : {report['safe_target_count']} permissions")
    print("----------------------------------------------------------------------")

    print("\n1. Delete-Guard Protection (Permissions Blocked from Custom Role):")
    for p in report["blocked_explicit_delete"]:
        print(f"   [BLOCKED - EXPLICIT]  {p}")
    for p in report["blocked_heuristic_delete"]:
        print(f"   [BLOCKED - HEURISTIC] {p}  <-- caught by session/chat delete pattern guard!")
    for p in report["unsupported_in_custom_role"]:
        print(f"   [IGNORED - NOT_SUPP]  {p}  (not supported in project custom roles)")

    print("\n2. Current Custom Role Safety Check:")
    if report["forbidden_delete_present_in_custom"]:
        for p in report["forbidden_delete_present_in_custom"]:
            print(f"   [ALERT!] Custom role currently contains forbidden delete permission: {p}")
    else:
        print("   [PASS]   Custom role contains 0 session/file delete permissions.")

    print("\n3. Permission Drift Analysis (roles/discoveryengine.user -> geUserNoDelete):")
    if report["permissions_to_add"]:
        print(f"   [DRIFT]  {len(report['permissions_to_add'])} new safe permission(s) to ADD to {report['custom_role']}:")
        for p in report["permissions_to_add"]:
            print(f"            + {p}")
    else:
        print("   [OK]     0 missing permissions (all safe permissions from roles/discoveryengine.user are present).")

    if report["obsolete_permissions_in_custom"]:
        print(f"   [INFO]   {len(report['obsolete_permissions_in_custom'])} permission(s) in custom role no longer in {report['source_role']}:")
        for p in report["obsolete_permissions_in_custom"]:
            print(f"            - {p}")

    print("----------------------------------------------------------------------")
    if report["in_sync"]:
        print("STATUS: IN SYNC — Custom role has all current safe permissions and zero delete permissions.")
    else:
        print("STATUS: DRIFT DETECTED — Run with '--apply' to synchronize custom role permissions.")
    print("======================================================================")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare roles/discoveryengine.user against geUserNoDelete and sync new safe permissions."
    )
    parser.add_argument(
        "--project",
        default=os.environ.get("GCP_PROJECT_ID", "").strip(),
        help="Google Cloud Project ID hosting Gemini Enterprise",
    )
    parser.add_argument(
        "--role-id",
        default=DEFAULT_CUSTOM_ROLE_ID,
        help="Custom role ID to compare/update (default: geUserNoDelete)",
    )
    parser.add_argument(
        "--deny-permission",
        action="append",
        default=[],
        help="Additional permission(s) to explicitly exclude (may be specified multiple times)",
    )
    parser.add_argument(
        "--keep-obsolete",
        action="store_true",
        help="When --apply is used, only ADD new permissions and keep any extra permissions already on the custom role",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Patch the custom role in-place with the synchronized safe permission list",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output machine-readable JSON report",
    )
    args = parser.parse_args()

    project_id = args.project
    if not project_id:
        sys.exit("ERROR: --project or GCP_PROJECT_ID is required.")

    token = get_access_token()
    extra_denied = {p.strip() for p in args.deny_permission if p.strip()}

    report = analyze_role_drift(project_id, args.role_id, token, extra_denied)

    if args.json and not args.apply:
        output = {k: v for k, v in report.items() if k != "safe_target_permissions"}
        print(json.dumps(output, indent=2))
        return

    if not args.json:
        print_human_report(report)

    if args.apply:
        if report["in_sync"]:
            if not args.json:
                print("\n[=] Nothing to update; custom role is already in sync.")
            else:
                output = {k: v for k, v in report.items() if k != "safe_target_permissions"}
                output["applied"] = False
                print(json.dumps(output, indent=2))
            return

        custom_role_name = report["custom_role"]
        target_perms = set(report["safe_target_permissions"])
        if args.keep_obsolete:
            target_perms |= set(report["obsolete_permissions_in_custom"])

        # Final hard assertion: NEVER allow any explicit or heuristic delete permission into the patch payload
        blocked_all = set(report["blocked_explicit_delete"]) | set(
            report["blocked_heuristic_delete"]
        )
        assert not (target_perms & blocked_all), (
            f"SAFETY ABORT: Attempted to include blocked delete permissions: {target_perms & blocked_all}"
        )

        final_perms = sorted(target_perms)
        denied_list_str = ", ".join(sorted(blocked_all))
        description = f"{STANDARD_GE_ROLE} minus {denied_list_str}, for eDiscovery retention."

        if not args.json:
            print(
                f"\n[*] Patching {custom_role_name} in-place -> {len(final_perms)} safe permissions "
                f"(+{len(report['permissions_to_add'])} added, "
                f"-{len(report['forbidden_delete_present_in_custom'])} forbidden removed)..."
            )

        api_request(
            "PATCH",
            f"https://iam.googleapis.com/v1/{custom_role_name}?updateMask=includedPermissions,description",
            token,
            project_id,
            {
                "description": description,
                "includedPermissions": final_perms,
            },
        )

        if args.json:
            output = {k: v for k, v in report.items() if k != "safe_target_permissions"}
            output["applied"] = True
            output["updated_permission_count"] = len(final_perms)
            print(json.dumps(output, indent=2))
        else:
            print(f"[+] Successfully synchronized {custom_role_name} ({len(final_perms)} permissions)!")


if __name__ == "__main__":
    main()
