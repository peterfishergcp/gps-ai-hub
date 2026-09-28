#!/usr/bin/env python3
"""
Provisions the 'ediscovery-archiver' OIDC Provider inside an existing
Google Cloud Workforce Identity Pool using a locally generated RSA-2048 keypair
(.archiver_private_key.pem) and offline JWKS (archiver_jwks.json).

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

PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "").strip()
WORKFORCE_POOL_ID = os.environ.get("WORKFORCE_POOL_ID", "").strip()
PROVIDER_ID = os.environ.get("ARCHIVER_PROVIDER_ID", "ediscovery-archiver").strip()
CLIENT_ID = os.environ.get("ARCHIVER_CLIENT_ID", "ediscovery-archiver").strip()
KEY_ID = "archiver-key-1"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRIVATE_KEY_PATH = os.path.join(BASE_DIR, ".archiver_private_key.pem")
JWKS_PATH = os.path.join(BASE_DIR, "archiver_jwks.json")


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def ensure_keypair_and_jwks() -> None:
    if not os.path.exists(PRIVATE_KEY_PATH):
        print(f"[1/3] Generating 2048-bit RSA private key at {PRIVATE_KEY_PATH}...")
        subprocess.run(
            ["openssl", "genrsa", "-out", PRIVATE_KEY_PATH, "2048"],
            check=True,
            capture_output=True,
        )
        os.chmod(PRIVATE_KEY_PATH, 0o600)
    else:
        print(f"[1/3] Reusing existing RSA private key at {PRIVATE_KEY_PATH}")

    mod_out = subprocess.check_output(
        ["openssl", "rsa", "-in", PRIVATE_KEY_PATH, "-modulus", "-noout"]
    ).decode("ascii").strip()
    if not mod_out.startswith("Modulus="):
        raise RuntimeError(f"Unexpected openssl modulus output: {mod_out}")
    mod_hex = mod_out.split("=", 1)[1].strip()
    n_bytes = bytes.fromhex(mod_hex)
    e_bytes = (65537).to_bytes(3, byteorder="big")

    jwks = {
        "keys": [
            {
                "kty": "RSA",
                "alg": "RS256",
                "use": "sig",
                "kid": KEY_ID,
                "n": b64url_encode(n_bytes),
                "e": b64url_encode(e_bytes),
            }
        ]
    }
    with open(JWKS_PATH, "w", encoding="utf-8") as f:
        json.dump(jwks, f, indent=2)
    print(f"[2/3] Wrote offline JWKS public key to {JWKS_PATH}")


def ensure_oidc_provider() -> None:
    issuer_uri = f"https://ediscovery.{PROJECT_ID}.internal"
    print(f"[3/3] Ensuring OIDC provider '{PROVIDER_ID}' in workforce pool '{WORKFORCE_POOL_ID}'...")
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
                "--description=Self-issued OIDC provider for GE eDiscovery server-side session and file archival",
                f"--issuer-uri={issuer_uri}",
                f"--client-id={CLIENT_ID}",
                f"--jwk-json-path={JWKS_PATH}",
                "--attribute-mapping=google.subject=assertion.sub,google.display_name=assertion.sub,google.groups=assertion.groups",
                "--web-sso-response-type=id-token",
                "--web-sso-assertion-claims-behavior=only-id-token-claims",
            ],
            check=True,
        )
    print(f"Done! OIDC provider locations/global/workforcePools/{WORKFORCE_POOL_ID}/providers/{PROVIDER_ID} is ACTIVE.")


if __name__ == "__main__":
    if not PROJECT_ID or PROJECT_ID.startswith("<"):
        sys.exit("ERROR: Please set GCP_PROJECT_ID (e.g., export GCP_PROJECT_ID='your-project-id').")
    if not WORKFORCE_POOL_ID or WORKFORCE_POOL_ID.startswith("<"):
        sys.exit("ERROR: Please set WORKFORCE_POOL_ID (e.g., export WORKFORCE_POOL_ID='your-workforce-pool-id').")
    ensure_keypair_and_jwks()
    ensure_oidc_provider()
