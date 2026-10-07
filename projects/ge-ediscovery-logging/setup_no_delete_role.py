#!/usr/bin/env python3
"""
setup_no_delete_role.py — Provisions the 'geUserNoDelete' Custom IAM Role and
safely swaps a principal from 'roles/discoveryengine.user' to the no-delete role.

Why this is required for eDiscovery:
  File bytes (:downloadFile) and >64 KiB untruncated turns (GetSession) exist
  in the user's Discovery Engine session until harvested. A user with the
  standard 'roles/discoveryengine.user' role could delete a conversation
  ('discoveryengine.sessions.delete') or remove a context file
  ('discoveryengine.sessions.removeContextFile') seconds after sending a prompt.
  Replacing 'roles/discoveryengine.user' with 'projects/<PROJECT_ID>/roles/geUserNoDelete'
  closes that spoliation window while preserving all chat, search, agent, and
  file upload/download permissions.

Safety Guarantees:
  1. NEVER deletes any IAM role (if the custom role exists, it is updated in-place;
     if soft-deleted, it is undeleted first).
  2. Additive-first: Ensures the target principal is granted 'geUserNoDelete'
     before '--apply' will ever remove 'roles/discoveryengine.user'.
  3. Non-authoritative member swap: Only modifies the single target principal
     binding (with condition=None) using ETag concurrency control, leaving all
     other members of 'roles/discoveryengine.user' completely untouched.
  4. Automatic Backup & 1-Command Rollback: Writes a timestamped JSON backup of
     the project IAM policy before any change and supports '--rollback'.

Usage:
  # 1. Create/update custom role & additively grant to WIF pool (Dry-Run check of swap):
  python3 setup_no_delete_role.py --project="$GCP_PROJECT_ID" \
    --principal="principalSet://iam.googleapis.com/locations/global/workforcePools/$WORKFORCE_POOL_ID/*"

  # 2. Apply the swap (remove roles/discoveryengine.user from this principal only):
  python3 setup_no_delete_role.py --project="$GCP_PROJECT_ID" \
    --principal="principalSet://iam.googleapis.com/locations/global/workforcePools/$WORKFORCE_POOL_ID/*" \
    --apply

  # 3. Rollback (restore roles/discoveryengine.user to this principal):
  python3 setup_no_delete_role.py --project="$GCP_PROJECT_ID" \
    --principal="principalSet://iam.googleapis.com/locations/global/workforcePools/$WORKFORCE_POOL_ID/*" \
    --rollback
"""

import argparse
import datetime
import json
import os
import ssl
import subprocess
import sys
import urllib.error
import urllib.request

SSL_CTX = ssl.create_default_context()

DEFAULT_CUSTOM_ROLE_ID = os.environ.get("CUSTOM_ROLE_ID", "geUserNoDelete").strip()
STANDARD_GE_ROLE = "roles/discoveryengine.user"
DENIED_PERMISSIONS = [
    "discoveryengine.sessions.delete",
    "discoveryengine.sessions.removeContextFile",
]


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


def compute_no_delete_permissions(project_id: str, token: str) -> list[str]:
    """
    Computes (roles/discoveryengine.user intersect project testable permissions)
    minus DENIED_PERMISSIONS, matching terraform/custom_role.tf.
    """
    base_role = api_request(
        "GET",
        f"https://iam.googleapis.com/v1/{STANDARD_GE_ROLE}",
        token,
        project_id,
    )
    base_perms = set(base_role.get("includedPermissions", []))

    testable_perms: set[str] = set()
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
                testable_perms.add(p["name"])
        page_token = resp.get("nextPageToken", "")
        if not page_token:
            break

    allowed = (base_perms & testable_perms) - set(DENIED_PERMISSIONS)
    return sorted(allowed)


def ensure_custom_role(
    project_id: str,
    role_id: str,
    token: str,
) -> str:
    """
    Creates or updates projects/{project_id}/roles/{role_id} in-place.
    Never deletes the role. If soft-deleted, undeletes it first.
    """
    role_name = f"projects/{project_id}/roles/{role_id}"
    permissions = compute_no_delete_permissions(project_id, token)
    title = "Gemini Enterprise User (no chat/file deletion)"
    description = (
        f"{STANDARD_GE_ROLE} minus {', '.join(DENIED_PERMISSIONS)}, "
        "for eDiscovery retention."
    )

    existing = None
    try:
        existing = api_request(
            "GET",
            f"https://iam.googleapis.com/v1/{role_name}",
            token,
            project_id,
        )
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise

    if existing is None:
        print(f"[+] Creating custom role {role_name} ({len(permissions)} permissions)...")
        api_request(
            "POST",
            f"https://iam.googleapis.com/v1/projects/{project_id}/roles",
            token,
            project_id,
            {
                "roleId": role_id,
                "role": {
                    "title": title,
                    "description": description,
                    "includedPermissions": permissions,
                    "stage": "GA",
                },
            },
        )
        return role_name

    if existing.get("deleted"):
        print(f"[*] Custom role {role_name} was soft-deleted; undeleting...")
        existing = api_request(
            "POST",
            f"https://iam.googleapis.com/v1/{role_name}:undelete",
            token,
            project_id,
            {},
        )

    current_perms = sorted(existing.get("includedPermissions", []))
    if current_perms != permissions or existing.get("title") != title:
        print(f"[*] Updating custom role {role_name} permissions ({len(permissions)} permissions)...")
        api_request(
            "PATCH",
            f"https://iam.googleapis.com/v1/{role_name}?updateMask=title,description,includedPermissions,stage",
            token,
            project_id,
            {
                "title": title,
                "description": description,
                "includedPermissions": permissions,
                "stage": "GA",
            },
        )
    else:
        print(f"[=] Custom role {role_name} is up-to-date ({len(permissions)} permissions, no delete perms).")

    return role_name


def get_project_iam_policy(project_id: str, token: str) -> dict:
    return api_request(
        "POST",
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy",
        token,
        project_id,
        {"options": {"requestedPolicyVersion": 3}},
    )


def set_project_iam_policy(project_id: str, policy: dict, token: str) -> dict:
    return api_request(
        "POST",
        f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:setIamPolicy",
        token,
        project_id,
        {"policy": policy},
    )


def has_unconditional_binding(policy: dict, role: str, member: str) -> bool:
    for b in policy.get("bindings", []):
        if b.get("role") == role and not b.get("condition"):
            if member in b.get("members", []):
                return True
    return False


def add_unconditional_member(policy: dict, role: str, member: str) -> bool:
    """Adds member to unconditional role binding in policy dict. Returns True if modified."""
    for b in policy.get("bindings", []):
        if b.get("role") == role and not b.get("condition"):
            if member not in b.get("members", []):
                b.setdefault("members", []).append(member)
                return True
            return False
    policy.setdefault("bindings", []).append({"role": role, "members": [member]})
    return True


def remove_unconditional_member(policy: dict, role: str, member: str) -> bool:
    """Removes member from unconditional role binding in policy dict. Returns True if modified."""
    modified = False
    new_bindings = []
    for b in policy.get("bindings", []):
        if b.get("role") == role and not b.get("condition"):
            members = b.get("members", [])
            if member in members:
                b["members"] = [m for m in members if m != member]
                modified = True
            if b["members"]:
                new_bindings.append(b)
        else:
            new_bindings.append(b)
    if modified:
        policy["bindings"] = new_bindings
    return modified


def save_policy_backup(project_id: str, policy: dict) -> str:
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_file = f"iam-policy-{project_id}-{ts}.backup.json"
    with open(backup_file, "w", encoding="utf-8") as f:
        json.dump(policy, f, indent=2)
    return backup_file


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Provision geUserNoDelete custom role and safely swap GE user role."
    )
    parser.add_argument(
        "--project",
        default=os.environ.get("GCP_PROJECT_ID", "").strip(),
        help="Google Cloud Project ID hosting Gemini Enterprise",
    )
    parser.add_argument(
        "--principal",
        default="",
        help="IAM principal to grant/swap (e.g. principalSet://iam.googleapis.com/locations/global/workforcePools/POOL/*)",
    )
    parser.add_argument(
        "--role-id",
        default=DEFAULT_CUSTOM_ROLE_ID,
        help="Custom role ID (default: geUserNoDelete)",
    )
    parser.add_argument(
        "--ensure-custom-role",
        action="store_true",
        help="Ensure the custom role exists and additively bind --principal to it before checking/swapping",
    )
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--apply",
        action="store_true",
        help="Remove roles/discoveryengine.user from --principal (requires custom role already bound)",
    )
    mode_group.add_argument(
        "--rollback",
        action="store_true",
        help="Restore roles/discoveryengine.user to --principal",
    )
    args = parser.parse_args()

    project_id = args.project
    if not project_id:
        sys.exit("ERROR: --project or GCP_PROJECT_ID is required.")

    principal = args.principal
    if not principal:
        wf_pool = os.environ.get("WORKFORCE_POOL_ID", "").strip()
        if wf_pool:
            principal = f"principalSet://iam.googleapis.com/locations/global/workforcePools/{wf_pool}/*"
        else:
            sys.exit("ERROR: --principal or WORKFORCE_POOL_ID is required.")

    token = get_access_token()
    custom_role = f"projects/{project_id}/roles/{args.role_id}"

    if args.ensure_custom_role:
        ensure_custom_role(project_id, args.role_id, token)
        policy = get_project_iam_policy(project_id, token)
        if not has_unconditional_binding(policy, custom_role, principal):
            backup = save_policy_backup(project_id, policy)
            print(f"backup  : {backup}")
            add_unconditional_member(policy, custom_role, principal)
            set_project_iam_policy(project_id, policy, token)
            print(f"[+] Additively granted {custom_role} to {principal}")

    policy = get_project_iam_policy(project_id, token)
    has_custom = has_unconditional_binding(policy, custom_role, principal)
    has_old = has_unconditional_binding(policy, STANDARD_GE_ROLE, principal)

    print(f"project : {project_id}")
    print(f"member  : {principal}")
    print(f"has {custom_role} : {has_custom}")
    print(f"has {STANDARD_GE_ROLE}  : {has_old}")

    if args.apply:
        if not has_custom:
            sys.exit(
                f"ABORT: grant {custom_role} first (--ensure-custom-role or terraform: ge_user_principals), "
                "or users lose GE access."
            )
        backup = save_policy_backup(project_id, policy)
        print(f"backup  : {backup}")
        if has_old:
            remove_unconditional_member(policy, STANDARD_GE_ROLE, principal)
            set_project_iam_policy(project_id, policy, token)
            print(f"removed {STANDARD_GE_ROLE}. Verify after ~2 min: a user can chat but cannot delete a chat.")
        else:
            print(f"{STANDARD_GE_ROLE} was already absent for {principal}.")
    elif args.rollback:
        backup = save_policy_backup(project_id, policy)
        print(f"backup  : {backup}")
        if not has_old:
            add_unconditional_member(policy, STANDARD_GE_ROLE, principal)
            set_project_iam_policy(project_id, policy, token)
            print(f"restored {STANDARD_GE_ROLE} (users can delete chats again).")
        else:
            print(f"{STANDARD_GE_ROLE} is already present on {principal}.")
    else:
        print(f"(dry run; pass --apply to remove {STANDARD_GE_ROLE} from this member)")


if __name__ == "__main__":
    main()
