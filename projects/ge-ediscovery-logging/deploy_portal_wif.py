#!/usr/bin/env python3
"""
deploy_portal_wif.py — Deploys a Workforce Identity Federation (WIF) & Microsoft Entra ID
Group-authenticated Compliance & eDiscovery Review Portal (`ge-ediscovery-portal-wif`)
to Google Cloud Run alongside the existing 1P Google IAP portal (`ge-ediscovery-portal`).

What this script does:
  1. Provisions/reuses the least-privilege `ge-ediscovery-portal-sa` service account
     (read-only GCS `roles/storage.objectViewer` + dataset-scoped BigQuery `READER`).
  2. Deploys a dedicated Cloud Run service (`ge-ediscovery-portal-wif` by default) with
     `--iap --no-allow-unauthenticated` and `ALLOWED_WIF_POOLS=<WIF_POOL_ID>`.
  3. Creates/reuses a GCP IAM Confidential OAuth 2.0 Client (`gcloud iam oauth-clients`)
     configured with IAP's `:handleRedirect` callback URI and applies
     `WorkforceIdentitySettings` (`WORKFORCE_IDENTITY_FEDERATION`) to the Cloud Run
     service's IAP configuration via `gcloud iap settings set`.
  4. Grants `roles/iap.httpsResourceAccessor` and `roles/run.invoker` to the specified
     WIF `principalSet://` (either an Entra ID Security Group
     `principalSet://iam.googleapis.com/locations/global/workforcePools/<POOL_ID>/group/<GROUP_ID>`
     or a dedicated auditor pool `principalSet://iam.googleapis.com/locations/global/workforcePools/<POOL_ID>/*`).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time

DEFAULT_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
DEFAULT_REGION = os.environ.get("CLOUD_RUN_REGION", "us-central1")
DEFAULT_WIF_SERVICE_NAME = os.environ.get("WIF_PORTAL_SERVICE_NAME", "ge-ediscovery-portal-wif")
DEFAULT_WIF_POOL = os.environ.get("WIF_POOL_ID", "")
DEFAULT_WIF_PROVIDER = os.environ.get("WIF_PROVIDER_ID", "")
DEFAULT_OAUTH_CLIENT_NAME = os.environ.get("WIF_IAM_OAUTH_CLIENT", "ge-ediscovery-wif-client")


def run_cmd(cmd: list[str], redact_output: bool = False) -> str:
    print(f"  $ {' '.join(cmd)}")
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT)
        decoded = out.decode("utf-8").strip()
        return decoded
    except subprocess.CalledProcessError as e:
        if not redact_output:
            print(e.output.decode("utf-8", errors="replace"))
        raise


def normalize_wif_pool_id(raw_pool: str) -> str:
    """Extracts the short Workforce Identity Pool ID from a full resource path or callback URL."""
    val = (raw_pool or "").strip()
    m = re.search(r"workforcePools/([a-zA-Z0-9-]+)", val)
    if m:
        return m.group(1).lower()
    val = val.strip("/").lower()
    if "/" not in val and re.fullmatch(r"[a-z0-9-]+", val):
        return val
    return ""


def normalize_wif_provider_id(raw_provider: str) -> str:
    """Extracts the short Workforce Identity Provider ID from a full resource path or callback URL."""
    val = (raw_provider or "").strip()
    m = re.search(r"providers/([a-zA-Z0-9-]+)", val)
    if m:
        return m.group(1).lower()
    val = val.strip("/").lower()
    if "/" not in val and re.fullmatch(r"[a-z0-9-]+", val):
        return val
    return ""


def ensure_iam_oauth_client_for_iap(project_id: str, oauth_client_name: str) -> tuple[str, str]:
    """
    Creates or reuses a GCP IAM Confidential OAuth Client (`gcloud iam oauth-clients`)
    and returns `(client_id, client_secret)` for IAP WorkforceIdentitySettings.
    """
    desc = subprocess.run(
        [
            "gcloud", "iam", "oauth-clients", "describe", oauth_client_name,
            "--location=global",
            f"--project={project_id}",
            "--format=value(clientId)",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )
    if desc.returncode != 0 or not desc.stdout.strip():
        run_cmd([
            "gcloud", "iam", "oauth-clients", "create", oauth_client_name,
            "--location=global",
            f"--project={project_id}",
            "--client-type=confidential-client",
            "--display-name=eDiscovery WIF Portal IAP Client",
            "--description=OAuth client for Cloud Run IAP Workforce Identity Federation",
            "--allowed-grant-types=authorization-code-grant",
            "--allowed-scopes=https://www.googleapis.com/auth/cloud-platform,openid,email,groups",
            "--allowed-redirect-uris=https://iap.googleapis.com",
            "--quiet",
        ])
        client_id = run_cmd([
            "gcloud", "iam", "oauth-clients", "describe", oauth_client_name,
            "--location=global",
            f"--project={project_id}",
            "--format=value(clientId)",
            "--quiet",
        ])
    else:
        client_id = desc.stdout.strip()

    redirect_uri = f"https://iap.googleapis.com/v1/oauth/clientIds/{client_id}:handleRedirect"
    run_cmd([
        "gcloud", "iam", "oauth-clients", "update", oauth_client_name,
        "--location=global",
        f"--project={project_id}",
        f"--allowed-redirect-uris={redirect_uri}",
        "--quiet",
    ])

    cred_name = f"{oauth_client_name}-cred"
    cred_desc = subprocess.run(
        [
            "gcloud", "iam", "oauth-clients", "credentials", "describe", cred_name,
            f"--oauth-client={oauth_client_name}",
            "--location=global",
            f"--project={project_id}",
            "--format=value(clientSecret)",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )
    if cred_desc.returncode != 0 or not cred_desc.stdout.strip():
        run_cmd([
            "gcloud", "iam", "oauth-clients", "credentials", "create", cred_name,
            f"--oauth-client={oauth_client_name}",
            "--location=global",
            f"--project={project_id}",
            "--display-name=IAP WIF Client Credential",
            "--quiet",
        ])
        client_secret = run_cmd(
            [
                "gcloud", "iam", "oauth-clients", "credentials", "describe", cred_name,
                f"--oauth-client={oauth_client_name}",
                "--location=global",
                f"--project={project_id}",
                "--format=value(clientSecret)",
                "--quiet",
            ],
            redact_output=True,
        )
    else:
        client_secret = cred_desc.stdout.strip()

    return client_id, client_secret


def resolve_organization_id(project_id: str, explicit_org_id: str = "") -> str:
    """Resolves the parent GCP Organization ID for a project if not explicitly provided."""
    if explicit_org_id.strip():
        return explicit_org_id.strip()
    anc_raw = run_cmd([
        "gcloud", "projects", "get-ancestors", project_id,
        "--format=json",
        "--quiet",
    ])
    for entry in json.loads(anc_raw):
        if entry.get("type") == "organization" and entry.get("id"):
            return str(entry["id"]).strip()
    raise RuntimeError(f"Could not resolve parent Organization ID for project {project_id}; pass --org-id explicitly.")


def resolve_entra_client_secret(project_id: str, explicit_secret: str, secret_name: str) -> str:
    """Resolves the Entra OIDC Client Secret from CLI flag, MS_CLIENT_SECRET env var, or Secret Manager."""
    if explicit_secret.strip():
        return explicit_secret.strip()
    env_sec = os.environ.get("MS_CLIENT_SECRET", "").strip()
    if env_sec:
        return env_sec
    if secret_name.strip():
        sec_res = subprocess.run(
            [
                "gcloud", "secrets", "versions", "access", "latest",
                f"--secret={secret_name.strip()}",
                f"--project={project_id}",
                "--quiet",
            ],
            capture_output=True,
            text=True,
        )
        if sec_res.returncode == 0 and sec_res.stdout.strip():
            print(f"  [+] Loaded Entra Client Secret from Secret Manager ({secret_name.strip()})")
            return sec_res.stdout.strip()
    return ""


def ensure_auditor_wif_pool_and_provider(
    project_id: str,
    org_id: str,
    pool_id: str,
    provider_id: str,
    entra_tenant_id: str,
    entra_client_id: str,
    entra_client_secret: str,
    entra_group_id: str = "",
) -> str:
    """
    Idempotently creates the dedicated 1-provider Workforce Identity Pool and Microsoft Entra ID
    OIDC Provider (using Authorization Code flow `CODE` when a client secret is provided).
    """
    resolved_org = resolve_organization_id(project_id, org_id)
    pool_desc = subprocess.run(
        ["gcloud", "iam", "workforce-pools", "describe", pool_id, "--location=global", "--quiet"],
        capture_output=True,
        text=True,
    )
    if pool_desc.returncode != 0:
        run_cmd([
            "gcloud", "iam", "workforce-pools", "create", pool_id,
            f"--organization={resolved_org}",
            "--location=global",
            "--display-name=eDiscovery Compliance Auditors Pool",
            "--description=Dedicated 1-provider WIF pool for Cloud Run Compliance Review Portal",
            "--quiet",
        ])
    else:
        print(f"  [+] Workforce Pool '{pool_id}' already exists in organization {resolved_org}.")

    if not entra_tenant_id.strip() or not entra_client_id.strip():
        raise RuntimeError(
            "--create-wif-pool requires --entra-tenant-id (or MS_TENANT_ID) and --entra-client-id (or MS_CLIENT_ID)."
        )

    eff_provider_id = provider_id or f"{pool_id}-provider"
    issuer_uri = entra_tenant_id.strip()
    if not issuer_uri.startswith("https://"):
        issuer_uri = f"https://login.microsoftonline.com/{issuer_uri}/v2.0"

    prov_desc = subprocess.run(
        [
            "gcloud", "iam", "workforce-pools", "providers", "describe", eff_provider_id,
            f"--workforce-pool={pool_id}",
            "--location=global",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )
    attr_map = "google.subject=assertion.email,google.display_name=assertion.preferred_username,google.groups=assertion.groups"
    cmd_verb = "update-oidc" if prov_desc.returncode == 0 else "create-oidc"
    prov_cmd = [
        "gcloud", "iam", "workforce-pools", "providers", cmd_verb, eff_provider_id,
        f"--workforce-pool={pool_id}",
        "--location=global",
        "--display-name=Entra Auditors OIDC Provider",
        f"--issuer-uri={issuer_uri}",
        f"--client-id={entra_client_id.strip()}",
        f"--attribute-mapping={attr_map}",
        "--detailed-audit-logging",
        "--quiet",
    ]
    if entra_group_id.strip():
        prov_cmd.append(f"--attribute-condition='{entra_group_id.strip()}' in assertion.groups")
    if entra_client_secret:
        prov_cmd.extend([
            "--web-sso-response-type=code",
            "--web-sso-assertion-claims-behavior=merge-user-info-over-id-token-claims",
            f"--client-secret-value={entra_client_secret}",
        ])
    else:
        print(
            "  [!] No Entra Client Secret provided (--entra-client-secret / Secret Manager); "
            "falling back to --web-sso-response-type=id-token."
        )
        prov_cmd.extend([
            "--web-sso-response-type=id-token",
            "--web-sso-assertion-claims-behavior=only-id-token-claims",
        ])

    # Avoid printing the raw --client-secret-value in stdout logs
    safe_preview = [
        "--client-secret-value=***REDACTED***" if a.startswith("--client-secret-value=") else a
        for a in prov_cmd
    ]
    print(f"  $ {' '.join(safe_preview)}")
    subprocess.check_call(prov_cmd)
    return eff_provider_id


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Deploy the Workforce Identity Federation (WIF) eDiscovery Review Portal to Cloud Run."
    )
    parser.add_argument("--project-id", "--project", dest="project_id", default=DEFAULT_PROJECT_ID, help="Google Cloud Project ID")
    parser.add_argument("--region", default=DEFAULT_REGION, help="Cloud Run region (default: us-central1)")
    parser.add_argument(
        "--service-name",
        default=DEFAULT_WIF_SERVICE_NAME,
        help="Cloud Run service name (default: ge-ediscovery-portal-wif — keeps ge-ediscovery-portal untouched)",
    )
    parser.add_argument("--bucket-name", default="", help="GCS compliance archive bucket (default: <project_id>-ge-ediscovery)")
    parser.add_argument("--bq-dataset", default="ge_ediscovery", help="BigQuery dataset name (default: ge_ediscovery)")
    parser.add_argument(
        "--wif-pool",
        required=True,
        default=DEFAULT_WIF_POOL,
        help="Workforce Identity Pool ID or callback URL (e.g. ediscovery-auditors-pool)",
    )
    parser.add_argument(
        "--wif-provider",
        default=DEFAULT_WIF_PROVIDER,
        help="Optional Workforce Identity Provider ID (default: <wif-pool>-provider)",
    )
    parser.add_argument(
        "--create-wif-pool",
        action="store_true",
        help="Automatically create the 1-provider Workforce Identity Pool and Entra ID OIDC provider (CODE flow)",
    )
    parser.add_argument(
        "--org-id",
        default=os.environ.get("GCP_ORG_ID", ""),
        help="GCP Organization ID for --create-wif-pool (auto-discovered from project if omitted)",
    )
    parser.add_argument(
        "--entra-tenant-id",
        default=os.environ.get("MS_TENANT_ID", ""),
        help="Microsoft Entra ID Tenant ID (or full issuer URI) for --create-wif-pool",
    )
    parser.add_argument(
        "--entra-client-id",
        default=os.environ.get("MS_CLIENT_ID", ""),
        help="Microsoft Entra ID Application (client) ID for --create-wif-pool",
    )
    parser.add_argument(
        "--entra-client-secret",
        default="",
        help="Microsoft Entra ID Client Secret value for CODE flow (or set MS_CLIENT_SECRET / --entra-secret-name)",
    )
    parser.add_argument(
        "--entra-secret-name",
        default=os.environ.get("MS_CLIENT_SECRET_NAME", "purview-ms-client-secret"),
        help="Secret Manager secret name to read Entra Client Secret from if --entra-client-secret is omitted (default: purview-ms-client-secret)",
    )
    parser.add_argument(
        "--entra-group-id",
        default="",
        help="Optional Microsoft Entra ID Auditor Group Object ID (scopes WIF provider CEL condition & IAP access to principalSet://.../group/<GROUP_ID>)",
    )
    parser.add_argument(
        "--wif-principal",
        default="",
        help="Explicit WIF principalSet or principal binding (defaults to .../group/<entra-group-id> or .../workforcePools/<wif-pool>/*)",
    )
    parser.add_argument(
        "--oauth-client-name",
        default=DEFAULT_OAUTH_CLIENT_NAME,
        help="GCP IAM OAuth Client ID name for IAP Workforce Identity Federation (default: ge-ediscovery-wif-client)",
    )
    parser.add_argument(
        "--allowed-reviewers",
        default=os.environ.get("ALLOWED_REVIEWER_EMAILS", ""),
        help="Optional comma-separated list of individual reviewer emails if restricting within the WIF pool",
    )
    args = parser.parse_args()

    if not args.project_id:
        print("Error: --project-id (or GCP_PROJECT_ID) is required.")
        sys.exit(1)

    pool_id = normalize_wif_pool_id(args.wif_pool)
    if not pool_id:
        print(f"Error: Could not parse a valid Workforce Pool ID from --wif-pool={args.wif_pool!r}")
        sys.exit(1)
    provider_id = normalize_wif_provider_id(args.wif_provider) if args.wif_provider else ""

    if args.create_wif_pool:
        print("======================================================================")
        print(f"0. Creating/Updating Dedicated 1-Provider Auditor WIF Pool ({pool_id})")
        print("======================================================================")
        resolved_secret = resolve_entra_client_secret(
            args.project_id, args.entra_client_secret, args.entra_secret_name
        )
        provider_id = ensure_auditor_wif_pool_and_provider(
            project_id=args.project_id,
            org_id=args.org_id,
            pool_id=pool_id,
            provider_id=provider_id,
            entra_tenant_id=args.entra_tenant_id,
            entra_client_id=args.entra_client_id,
            entra_client_secret=resolved_secret,
            entra_group_id=args.entra_group_id,
        )

    wif_member = args.wif_principal.strip()
    if not wif_member:
        if args.entra_group_id.strip():
            wif_member = f"principalSet://iam.googleapis.com/locations/global/workforcePools/{pool_id}/group/{args.entra_group_id.strip()}"
        else:
            wif_member = f"principalSet://iam.googleapis.com/locations/global/workforcePools/{pool_id}/*"

    if not wif_member.startswith(("principalSet://iam.googleapis.com/locations/global/workforcePools/", "principal://iam.googleapis.com/locations/global/workforcePools/")):
        print(
            "Error: --wif-principal must start with "
            "'principalSet://iam.googleapis.com/locations/global/workforcePools/' or "
            "'principal://iam.googleapis.com/locations/global/workforcePools/'."
        )
        sys.exit(1)

    prov_check = subprocess.run(
        [
            "gcloud", "iam", "workforce-pools", "providers", "list",
            f"--workforce-pool={pool_id}",
            "--location=global",
            "--limit=10",
            "--format=json(name,state)",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )
    if prov_check.returncode == 0 and prov_check.stdout.strip():
        try:
            provs = [p for p in json.loads(prov_check.stdout) if p.get("state") == "ACTIVE"]
            if len(provs) > 1:
                prov_names = [p.get("name", "").split("/")[-1] for p in provs]
                print(
                    f"\n[!] WARNING: Workforce Pool '{pool_id}' currently has {len(provs)} active providers: {prov_names}.\n"
                    "    Google Cloud IAP (WorkforceIdentitySettings) requires that a Workforce Pool attached to IAP\n"
                    "    contain EXACTLY ONE provider (otherwise IAP returns HTTP 400 Error code 701:\n"
                    "    MORE_THAN_ONE_PROVIDER_IN_WORKFORCE_POOL).\n"
                    "    Use a dedicated 1-provider Workforce Pool for your eDiscovery Auditors.\n"
                )
            elif len(provs) == 1 and not provider_id:
                provider_id = provs[0].get("name", "").split("/")[-1]
        except Exception:
            pass

    bucket_name = args.bucket_name or f"{args.project_id}-ge-ediscovery"
    sa_name = "ge-ediscovery-portal-sa"
    sa_email = f"{sa_name}@{args.project_id}.iam.gserviceaccount.com"
    portal_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "portal")

    print("======================================================================")
    print(f"1. Verifying Read-Only Service Account ({sa_email})")
    print("======================================================================")
    sa_check = subprocess.run(
        ["gcloud", "iam", "service-accounts", "describe", sa_email, f"--project={args.project_id}", "--quiet"],
        capture_output=True,
        text=True,
    )
    if sa_check.returncode != 0:
        run_cmd([
            "gcloud", "iam", "service-accounts", "create", sa_name,
            "--display-name=GE eDiscovery Read-Only Compliance Portal SA",
            f"--project={args.project_id}",
            "--quiet",
        ])

    run_cmd([
        "gcloud", "storage", "buckets", "add-iam-policy-binding", f"gs://{bucket_name}",
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/storage.objectViewer",
        f"--project={args.project_id}",
        "--quiet",
    ])
    run_cmd([
        "gcloud", "projects", "add-iam-policy-binding", args.project_id,
        f"--member=serviceAccount:{sa_email}",
        "--role=roles/bigquery.jobUser",
        "--condition=None",
        "--quiet",
    ])

    ds_ref = f"{args.project_id}:{args.bq_dataset}"
    ds_json_raw = run_cmd(["bq", "show", "--format=prettyjson", ds_ref])
    ds_meta = json.loads(ds_json_raw)
    access_list = ds_meta.get("access", [])
    reader_entry = {"role": "READER", "userByEmail": sa_email}
    if reader_entry not in access_list:
        access_list.append(reader_entry)
        ds_meta["access"] = access_list
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as tf:
            tmp_ds_path = tf.name
            json.dump(ds_meta, tf)
        try:
            run_cmd(["bq", "update", f"--source={tmp_ds_path}", ds_ref])
        finally:
            if os.path.exists(tmp_ds_path):
                os.remove(tmp_ds_path)

    now = time.time()
    for root, _dirs, files in os.walk(portal_dir):
        if "node_modules" in root:
            continue
        try:
            os.utime(root, (now, now))
        except OSError:
            pass
        for fname in files:
            try:
                os.utime(os.path.join(root, fname), (now, now))
            except OSError:
                pass

    proj_num = run_cmd([
        "gcloud", "projects", "describe", args.project_id, "--format=value(projectNumber)", "--quiet"
    ])
    iap_aud = f"/projects/{proj_num}/locations/{args.region}/services/{args.service_name}"

    env_pairs = [
        f"GCP_PROJECT_ID={args.project_id}",
        f"GCS_BUCKET_NAME={bucket_name}",
        f"BQ_DATASET={args.bq_dataset}",
        f"IAP_AUDIENCE={iap_aud}",
        f"ALLOWED_WIF_POOLS={pool_id}",
    ]
    if args.allowed_reviewers.strip():
        env_pairs.append(f"ALLOWED_REVIEWER_EMAILS={args.allowed_reviewers.strip()}")

    print("======================================================================")
    print(f"2. Deploying WIF Compliance Review Portal ({args.service_name}) to Cloud Run")
    print("======================================================================")
    setup_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "setup_storage_and_bigquery.py")
    if os.path.isfile(setup_script):
        run_cmd([
            sys.executable, setup_script,
            f"--project-id={args.project_id}",
            f"--bucket-name={bucket_name}",
            f"--bq-dataset={args.bq_dataset}",
            "--sinks-and-views-only",
        ])
    run_cmd(["gcloud", "services", "enable", "iap.googleapis.com", f"--project={args.project_id}", "--quiet"])
    run_cmd([
        "gcloud", "run", "deploy", args.service_name,
        f"--project={args.project_id}",
        f"--region={args.region}",
        f"--source={portal_dir}",
        f"--service-account={sa_email}",
        "--no-allow-unauthenticated",
        "--iap",
        f"--set-env-vars=^;^{';'.join(env_pairs)}",
        "--memory=1Gi",
        "--cpu=1",
        "--quiet",
    ])

    print("======================================================================")
    print(f"3. Configuring Cloud Run IAP WorkforceIdentitySettings (Pool: {pool_id})")
    print("======================================================================")
    client_id, client_secret = ensure_iam_oauth_client_for_iap(args.project_id, args.oauth_client_name)
    iap_settings_payload = {
        "access_settings": {
            "identity_sources": ["WORKFORCE_IDENTITY_FEDERATION"],
            "workforce_identity_settings": {
                "workforce_pools": [f"locations/global/workforcePools/{pool_id}"],
                "oauth2": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                },
            },
        }
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as sf:
        settings_path = sf.name
        json.dump(iap_settings_payload, sf)
    try:
        run_cmd([
            "gcloud", "iap", "settings", "set", settings_path,
            f"--project={args.project_id}",
            "--resource-type=cloud-run",
            f"--region={args.region}",
            f"--service={args.service_name}",
            "--quiet",
        ])
    finally:
        if os.path.exists(settings_path):
            os.remove(settings_path)

    print("======================================================================")
    print(f"4. Binding WIF Principal ({wif_member}) to IAP & Cloud Run Invoker")
    print("======================================================================")
    run_cmd([
        "gcloud", "iap", "web", "add-iam-policy-binding",
        f"--project={args.project_id}",
        "--resource-type=cloud-run",
        f"--service={args.service_name}",
        f"--region={args.region}",
        f"--member={wif_member}",
        "--role=roles/iap.httpsResourceAccessor",
        "--quiet",
    ])
    run_cmd([
        "gcloud", "run", "services", "add-iam-policy-binding", args.service_name,
        f"--project={args.project_id}",
        f"--region={args.region}",
        f"--member={wif_member}",
        "--role=roles/run.invoker",
        "--quiet",
    ])

    if os.path.isfile(setup_script):
        time.sleep(5)
        run_cmd([
            sys.executable, setup_script,
            f"--project-id={args.project_id}",
            f"--bucket-name={bucket_name}",
            f"--bq-dataset={args.bq_dataset}",
            "--views-only",
        ])

    service_url = run_cmd([
        "gcloud", "run", "services", "describe", args.service_name,
        f"--project={args.project_id}",
        f"--region={args.region}",
        "--format=value(status.url)",
        "--quiet",
    ])
    print("\n======================================================================")
    print("WIF PORTAL DEPLOYMENT COMPLETE")
    print("======================================================================")
    print(f"  WIF Cloud Run Service URL : {service_url}")
    print(f"  Workforce Identity Pool   : locations/global/workforcePools/{pool_id}")
    if provider_id:
        print(f"  WIF Sign-In Callback URL  : https://auth.cloud.google/signin-callback/locations/global/workforcePools/{pool_id}/providers/{provider_id}")
    print(f"  Authorized WIF Principal  : {wif_member}")


if __name__ == "__main__":
    main()
