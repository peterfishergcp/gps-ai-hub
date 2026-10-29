#!/usr/bin/env python3
"""
Provisions the 'ediscovery-archiver' OIDC Provider inside an existing
Google Cloud Workforce Identity Pool backed by a Google Cloud KMS
Asymmetric Signing Key (RSA_SIGN_PKCS1_2048_SHA256) so that private keys
never exist on disk or inside containers.

Zero third-party Python dependencies required (uses standard library + openssl + gcloud).

Usage:
  export GCP_PROJECT_ID="<YOUR_GCP_PROJECT_ID>"
  export WORKFORCE_POOL_ID="<YOUR_WORKFORCE_POOL_ID>"
  python3 setup_ediscovery_archiver_provider.py
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()
WORKFORCE_POOL_ID = os.environ.get("WORKFORCE_POOL_ID", "").strip()
PROVIDER_ID = os.environ.get("ARCHIVER_PROVIDER_ID", "ediscovery-archiver").strip()
CLIENT_ID = os.environ.get("ARCHIVER_CLIENT_ID", "ediscovery-archiver").strip()

KMS_LOCATION = os.environ.get("KMS_LOCATION", "us-central1").strip()
KMS_KEYRING = os.environ.get("KMS_KEYRING", "ge-ediscovery-kr").strip()
KMS_KEY = os.environ.get("KMS_KEY", "ediscovery-archiver-jwt-key").strip()
KMS_KEY_VERSION = os.environ.get("KMS_KEY_VERSION", "1").strip()
KMS_KEY_ID = "archiver-kms-key-1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JWKS_PATH = os.path.join(BASE_DIR, "archiver_jwks.json")


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def jwk_from_modulus_hex(mod_hex: str, kid: str) -> dict:
    n_bytes = bytes.fromhex(mod_hex.strip())
    e_bytes = (65537).to_bytes(3, byteorder="big")
    return {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": kid,
        "n": b64url_encode(n_bytes),
        "e": b64url_encode(e_bytes),
    }


def ensure_kms_key_and_jwks() -> None:
    print(f"[1/4] Enabling cloudkms.googleapis.com in project '{PROJECT_ID}'...")
    subprocess.run(
        ["gcloud", "services", "enable", "cloudkms.googleapis.com", f"--project={PROJECT_ID}"],
        check=True,
    )

    print(f"[2/4] Ensuring Cloud KMS KeyRing '{KMS_KEYRING}' and CryptoKey '{KMS_KEY}' in '{KMS_LOCATION}'...")
    kr_desc = subprocess.run(
        [
            "gcloud", "kms", "keyrings", "describe", KMS_KEYRING,
            f"--location={KMS_LOCATION}",
            f"--project={PROJECT_ID}",
        ],
        capture_output=True,
        text=True,
    )
    if kr_desc.returncode != 0:
        subprocess.run(
            [
                "gcloud", "kms", "keyrings", "create", KMS_KEYRING,
                f"--location={KMS_LOCATION}",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )

    key_desc = subprocess.run(
        [
            "gcloud", "kms", "keys", "describe", KMS_KEY,
            f"--keyring={KMS_KEYRING}",
            f"--location={KMS_LOCATION}",
            f"--project={PROJECT_ID}",
        ],
        capture_output=True,
        text=True,
    )
    if key_desc.returncode != 0:
        subprocess.run(
            [
                "gcloud", "kms", "keys", "create", KMS_KEY,
                f"--keyring={KMS_KEYRING}",
                f"--location={KMS_LOCATION}",
                "--purpose=asymmetric-signing",
                "--default-algorithm=rsa-sign-pkcs1-2048-sha256",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )

    with tempfile.NamedTemporaryFile("w+", suffix=".pem", delete=False) as tmp_pub:
        pub_pem_path = tmp_pub.name

    try:
        subprocess.run(
            [
                "gcloud", "kms", "keys", "versions", "get-public-key", KMS_KEY_VERSION,
                f"--key={KMS_KEY}",
                f"--keyring={KMS_KEYRING}",
                f"--location={KMS_LOCATION}",
                f"--output-file={pub_pem_path}",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )
        mod_out = subprocess.check_output(
            ["openssl", "rsa", "-pubin", "-in", pub_pem_path, "-modulus", "-noout"]
        ).decode("ascii").strip()
    finally:
        if os.path.exists(pub_pem_path):
            os.remove(pub_pem_path)

    if not mod_out.startswith("Modulus="):
        raise RuntimeError(f"Unexpected openssl modulus output: {mod_out}")
    kms_mod_hex = mod_out.split("=", 1)[1].strip()
    keys_list = [jwk_from_modulus_hex(kms_mod_hex, KMS_KEY_ID)]

    jwks = {"keys": keys_list}
    with open(JWKS_PATH, "w", encoding="utf-8") as f:
        json.dump(jwks, f, indent=2)
    print(f"[3/4] Wrote Cloud KMS JWKS public key (kid={KMS_KEY_ID}) to {JWKS_PATH}")


def ensure_oidc_provider(
    allowed_subject_domain: str = "",
    denied_subjects: list[str] | None = None,
    subject_cel_condition: str = "",
    allow_shared_workforce_pool: bool = False,
) -> None:
    issuer_uri = f"https://ediscovery.{PROJECT_ID}.internal"
    # Mitigates C2 & ED-1:
    #   1. Require explicit `purpose == 'ediscovery_harvest'` claim and block service account subjects.
    #   2. Enforce optional subject domain allowlist, explicit admin subject denylist, and custom CEL condition.
    #   3. Check Workforce Pool isolation so `ediscovery-archiver` is not silently attached to an unscoped
    #      Org-wide GCP Console Admin Workforce Pool without subject restrictions.
    attr_condition = (
        f"assertion.iss == '{issuer_uri}' "
        f"&& assertion.aud == '{CLIENT_ID}' "
        f"&& assertion.purpose == 'ediscovery_harvest' "
        f"&& assertion.sub != '' "
        f"&& !(assertion.sub.endsWith('.gserviceaccount.com'))"
    )
    domain_clean = (allowed_subject_domain or os.environ.get("ARCHIVER_ALLOWED_SUBJECT_DOMAIN", "")).strip().lstrip("@")
    if domain_clean:
        escaped_domain = domain_clean.replace("'", "")
        attr_condition = f"({attr_condition}) && assertion.sub.endsWith('@{escaped_domain}')"

    raw_denied = denied_subjects if denied_subjects is not None else [
        s.strip() for s in os.environ.get("ARCHIVER_DENIED_SUBJECTS", "").split(",") if s.strip()
    ]
    if raw_denied:
        denied_literals = ", ".join(f"'{s.replace(chr(39), '')}'" for s in raw_denied)
        attr_condition = f"({attr_condition}) && !(assertion.sub in [{denied_literals}])"

    allowed_subjects_cel = (subject_cel_condition or os.environ.get("ARCHIVER_ALLOWED_SUBJECTS_CEL", "")).strip()
    if allowed_subjects_cel:
        attr_condition = f"({attr_condition}) && ({allowed_subjects_cel})"

    prov_list = subprocess.run(
        [
            "gcloud", "iam", "workforce-pools", "providers", "list",
            f"--workforce-pool={WORKFORCE_POOL_ID}",
            "--location=global",
            "--limit=20",
            "--format=json(name,displayName)",
        ],
        capture_output=True,
        text=True,
    )
    if prov_list.returncode == 0 and prov_list.stdout.strip():
        try:
            existing_providers = json.loads(prov_list.stdout)
            other_providers = [
                p.get("name", "").split("/")[-1]
                for p in existing_providers
                if isinstance(p, dict) and not str(p.get("name", "")).endswith(f"/providers/{PROVIDER_ID}")
            ]
            if other_providers and not (domain_clean or raw_denied or allowed_subjects_cel):
                print(
                    f"\n  [SECURITY NOTICE] Workforce Pool '{WORKFORCE_POOL_ID}' also hosts IdP provider(s): {other_providers}.\n"
                    "  Best Practice: Use a dedicated Gemini Enterprise Workforce Pool separate from GCP Console Admin\n"
                    "  Workforce Pools, and pass --allowed-subject-domain / --denied-subjects to restrict impersonatable subjects.\n"
                    "  (Note: ge_harvest.py also attaches an IAM Credential Access Boundary restricting STS tokens strictly\n"
                    f"  to //discoveryengine.googleapis.com/projects/{PROJECT_ID}.)\n"
                )
        except Exception:
            pass

    print(f"[4/5] Ensuring OIDC provider '{PROVIDER_ID}' in workforce pool '{WORKFORCE_POOL_ID}'...")
    desc = subprocess.run(
        [
            "gcloud", "iam", "workforce-pools", "providers", "describe",
            PROVIDER_ID,
            f"--workforce-pool={WORKFORCE_POOL_ID}",
            "--location=global",
            "--format=json",
        ],
        capture_output=True,
        text=True,
    )

    if desc.returncode == 0:
        print(f"      Provider '{PROVIDER_ID}' exists; updating JWKS, attribute mapping, and attribute condition...")
        subprocess.run(
            [
                "gcloud", "iam", "workforce-pools", "providers", "update-oidc",
                PROVIDER_ID,
                f"--workforce-pool={WORKFORCE_POOL_ID}",
                "--location=global",
                f"--issuer-uri={issuer_uri}",
                f"--client-id={CLIENT_ID}",
                f"--jwk-json-path={JWKS_PATH}",
                "--attribute-mapping=google.subject=assertion.sub,google.display_name=assertion.sub",
                f"--attribute-condition={attr_condition}",
                "--web-sso-response-type=id-token",
                "--web-sso-assertion-claims-behavior=only-id-token-claims",
            ],
            check=True,
        )
    else:
        print(f"      Creating OIDC provider '{PROVIDER_ID}'...")
        subprocess.run(
            [
                "gcloud", "iam", "workforce-pools", "providers", "create-oidc",
                PROVIDER_ID,
                f"--workforce-pool={WORKFORCE_POOL_ID}",
                "--location=global",
                "--display-name=eDiscovery Archiver Provider",
                "--description=Self-issued OIDC provider for GE eDiscovery server-side session and file archival (Cloud KMS backed)",
                f"--issuer-uri={issuer_uri}",
                f"--client-id={CLIENT_ID}",
                f"--jwk-json-path={JWKS_PATH}",
                "--attribute-mapping=google.subject=assertion.sub,google.display_name=assertion.sub",
                f"--attribute-condition={attr_condition}",
                "--web-sso-response-type=id-token",
                "--web-sso-assertion-claims-behavior=only-id-token-claims",
            ],
            check=True,
        )
    print(f"Done! OIDC provider locations/global/workforcePools/{WORKFORCE_POOL_ID}/providers/{PROVIDER_ID} is ACTIVE and backed by Cloud KMS.")


def ensure_kms_key_iam_and_monitoring() -> None:
    """
    Mitigates C2:
      1. Locks down key-level IAM on `ediscovery-archiver-jwt-key` so ONLY `ge-ediscovery-harvester-sa`
         holds `roles/cloudkms.signerVerifier` at the key level.
      2. Provisions a Cloud Logging log-based metric (`ediscovery_kms_asymmetric_sign_calls`)
         tracking every `AsymmetricSign` invocation on `ediscovery-archiver-jwt-key` for audit alerting.
    """
    harvester_sa_name = "ge-ediscovery-harvester-sa"
    harvester_sa = f"{harvester_sa_name}@{PROJECT_ID}.iam.gserviceaccount.com"
    print(f"[5/5] Ensuring '{harvester_sa}' exists and locking down Cloud KMS key IAM + AsymmetricSign monitoring...")
    sa_check = subprocess.run(
        ["gcloud", "iam", "service-accounts", "describe", harvester_sa, f"--project={PROJECT_ID}"],
        capture_output=True,
        text=True,
    )
    if sa_check.returncode != 0:
        print(f"      Pre-creating dedicated service account '{harvester_sa}' so KMS key IAM is locked down immediately...")
        subprocess.run(
            [
                "gcloud", "iam", "service-accounts", "create", harvester_sa_name,
                "--display-name=GE eDiscovery Real-Time Harvester SA",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )

    with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=False) as tf:
        policy_path = tf.name
        json.dump(
            {
                "bindings": [
                    {
                        "role": "roles/cloudkms.signerVerifier",
                        "members": [f"serviceAccount:{harvester_sa}"],
                    }
                ]
            },
            tf,
        )
    try:
        subprocess.run(
            [
                "gcloud", "kms", "keys", "set-iam-policy", KMS_KEY,
                policy_path,
                f"--keyring={KMS_KEYRING}",
                f"--location={KMS_LOCATION}",
                f"--project={PROJECT_ID}",
                "--quiet",
            ],
            check=True,
        )
    finally:
        if os.path.exists(policy_path):
            os.remove(policy_path)

    metric_name = "ediscovery_kms_asymmetric_sign_calls"
    metric_filter = (
        'resource.type="cloudkms_cryptokeyversion" '
        'AND protoPayload.serviceName="cloudkms.googleapis.com" '
        'AND protoPayload.methodName="AsymmetricSign" '
        f'AND protoPayload.resourceName:"{KMS_KEY}"'
    )
    m_check = subprocess.run(
        ["gcloud", "logging", "metrics", "describe", metric_name, f"--project={PROJECT_ID}"],
        capture_output=True,
        text=True,
    )
    if m_check.returncode == 0:
        subprocess.run(
            [
                "gcloud", "logging", "metrics", "update", metric_name,
                "--description=Tracks every Cloud KMS AsymmetricSign call on the eDiscovery Archiver JWT key",
                f"--log-filter={metric_filter}",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )
    else:
        subprocess.run(
            [
                "gcloud", "logging", "metrics", "create", metric_name,
                "--description=Tracks every Cloud KMS AsymmetricSign call on the eDiscovery Archiver JWT key",
                f"--log-filter={metric_filter}",
                f"--project={PROJECT_ID}",
            ],
            check=True,
        )
    print(f"      Cloud Logging metric '{metric_name}' configured for AsymmetricSign audit alerting.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Provision Cloud KMS asymmetric signing key and register the ediscovery-archiver OIDC provider in a Workforce Identity Pool."
    )
    parser.add_argument(
        "--project-id",
        "--project",
        dest="project_id",
        default=PROJECT_ID,
        help="Google Cloud Project ID (or set GCP_PROJECT_ID)",
    )
    parser.add_argument(
        "--workforce-pool-id",
        dest="workforce_pool_id",
        default=WORKFORCE_POOL_ID,
        help="Workforce Identity Pool ID (or set WORKFORCE_POOL_ID)",
    )
    parser.add_argument(
        "--provider-id",
        dest="provider_id",
        default=PROVIDER_ID,
        help="OIDC Provider ID (default: ediscovery-archiver)",
    )
    parser.add_argument(
        "--allowed-subject-domain",
        dest="allowed_subject_domain",
        default=os.environ.get("ARCHIVER_ALLOWED_SUBJECT_DOMAIN", ""),
        help="Optional email domain allowlist for WIF subjects (e.g. agency.gov)",
    )
    parser.add_argument(
        "--denied-subjects",
        dest="denied_subjects",
        default=os.environ.get("ARCHIVER_DENIED_SUBJECTS", ""),
        help="Optional comma-separated list of privileged/admin WIF subjects never allowed for archival impersonation",
    )
    parser.add_argument(
        "--subject-cel-condition",
        dest="subject_cel_condition",
        default=os.environ.get("ARCHIVER_ALLOWED_SUBJECTS_CEL", ""),
        help="Optional additional CEL expression appended to the OIDC provider --attribute-condition",
    )
    args = parser.parse_args()
    PROJECT_ID = (args.project_id or "").strip()
    WORKFORCE_POOL_ID = (args.workforce_pool_id or "").strip()
    PROVIDER_ID = (args.provider_id or "ediscovery-archiver").strip()
    denied_list = [s.strip() for s in (args.denied_subjects or "").split(",") if s.strip()]

    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please pass --project-id or set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")
    if not WORKFORCE_POOL_ID or WORKFORCE_POOL_ID.startswith("<"):
        sys.exit("ERROR: Please pass --workforce-pool-id or set WORKFORCE_POOL_ID (e.g., export WORKFORCE_POOL_ID='your-workforce-pool-id').")
    try:
        ensure_kms_key_and_jwks()
        ensure_oidc_provider(
            allowed_subject_domain=args.allowed_subject_domain,
            denied_subjects=denied_list,
            subject_cel_condition=args.subject_cel_condition,
        )
        ensure_kms_key_iam_and_monitoring()
    finally:
        if os.path.exists(JWKS_PATH):
            os.remove(JWKS_PATH)
