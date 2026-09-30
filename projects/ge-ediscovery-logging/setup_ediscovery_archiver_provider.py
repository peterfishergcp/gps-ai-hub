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
LOCAL_KEY_ID = "archiver-key-1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_KEY_PATH = os.path.join(BASE_DIR, ".archiver_private_key.pem")
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

    if os.path.exists(PRIVATE_KEY_PATH):
        local_mod_out = subprocess.check_output(
            ["openssl", "rsa", "-in", PRIVATE_KEY_PATH, "-modulus", "-noout"]
        ).decode("ascii").strip()
        if local_mod_out.startswith("Modulus="):
            keys_list.append(jwk_from_modulus_hex(local_mod_out.split("=", 1)[1], LOCAL_KEY_ID))

    jwks = {"keys": keys_list}
    with open(JWKS_PATH, "w", encoding="utf-8") as f:
        json.dump(jwks, f, indent=2)
    print(f"[3/4] Wrote Cloud KMS JWKS public key (kid={KMS_KEY_ID}) to {JWKS_PATH}")


def ensure_oidc_provider() -> None:
    issuer_uri = f"https://ediscovery.{PROJECT_ID}.internal"
    print(f"[4/4] Ensuring OIDC provider '{PROVIDER_ID}' in workforce pool '{WORKFORCE_POOL_ID}'...")
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
        print(f"      Provider '{PROVIDER_ID}' exists; updating JWKS and attribute mapping...")
        subprocess.run(
            [
                "gcloud", "iam", "workforce-pools", "providers", "update-oidc",
                PROVIDER_ID,
                f"--workforce-pool={WORKFORCE_POOL_ID}",
                "--location=global",
                f"--issuer-uri={issuer_uri}",
                f"--client-id={CLIENT_ID}",
                f"--jwk-json-path={JWKS_PATH}",
                "--attribute-mapping=google.subject=assertion.sub,google.display_name=assertion.sub,google.groups=assertion.groups",
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
                "--attribute-mapping=google.subject=assertion.sub,google.display_name=assertion.sub,google.groups=assertion.groups",
                "--web-sso-response-type=id-token",
                "--web-sso-assertion-claims-behavior=only-id-token-claims",
            ],
            check=True,
        )
    print(f"Done! OIDC provider locations/global/workforcePools/{WORKFORCE_POOL_ID}/providers/{PROVIDER_ID} is ACTIVE and backed by Cloud KMS.")


if __name__ == "__main__":
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")
    if not WORKFORCE_POOL_ID or WORKFORCE_POOL_ID.startswith("<"):
        sys.exit("ERROR: Please set WORKFORCE_POOL_ID (e.g., export WORKFORCE_POOL_ID='your-workforce-pool-id').")
    ensure_kms_key_and_jwks()
    ensure_oidc_provider()
