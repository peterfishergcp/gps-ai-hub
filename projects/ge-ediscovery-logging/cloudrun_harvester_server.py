#!/usr/bin/env python3
"""
cloudrun_harvester_server.py — Event-Driven Cloud Run Service for GE eDiscovery

Receives real-time Cloud Logging log entries via Authenticated Pub/Sub Push
subscriptions (POST /pubsub) and immediately harvests the affected Gemini Enterprise
session or NotebookLM Enterprise notebook into GCS and BigQuery using
Cloud KMS asymmetric JWT signing (zero private keys on disk).

Also supports POST /sweep for optional scheduled catch-up sweeps.
"""

import base64
import http.server
import json
import os
import subprocess
import tempfile
import time
import traceback
import urllib.request

import ge_harvest

MAX_BODY_BYTES = 1_048_576  # 1 MiB
_GOOGLE_OIDC_CERTS_CACHE: dict[str, object] = {"certs": {}, "expires_at": 0.0}


def _fetch_google_oidc_certs() -> dict[str, str]:
    """Fetches and caches Google's OIDC X.509 PEM certificates keyed by kid."""
    now = time.time()
    cached_certs = _GOOGLE_OIDC_CERTS_CACHE.get("certs")
    if isinstance(cached_certs, dict) and cached_certs and float(_GOOGLE_OIDC_CERTS_CACHE.get("expires_at", 0.0)) > now:
        return cached_certs
    req = urllib.request.Request("https://www.googleapis.com/oauth2/v1/certs")
    with urllib.request.urlopen(req, context=ge_harvest.SSL_CTX, timeout=5) as resp:
        certs = json.loads(resp.read().decode("utf-8"))
        if isinstance(certs, dict):
            _GOOGLE_OIDC_CERTS_CACHE["certs"] = certs
            _GOOGLE_OIDC_CERTS_CACHE["expires_at"] = now + 3600.0
            return certs
    return {}


def _verify_rs256_jwt_with_x509_cert(signing_input: bytes, signature: bytes, cert_pem: str) -> bool:
    """Verifies an RS256 JWT signature against an X.509 PEM certificate using openssl."""
    with tempfile.NamedTemporaryFile("w", suffix=".crt", delete=False) as cf, tempfile.NamedTemporaryFile(
        "wb", suffix=".Pub", delete=False
    ) as pf, tempfile.NamedTemporaryFile("wb", suffix=".sig", delete=False) as sf:
        cert_path, pub_path, sig_path = cf.name, pf.name, sf.name
        cf.write(cert_pem)
        sf.write(signature)
    try:
        pub_pem = subprocess.check_output(
            ["openssl", "x509", "-pubkey", "-noout", "-in", cert_path],
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
        with open(pub_path, "wb") as pf_out:
            pf_out.write(pub_pem)
        res = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", pub_path, "-signature", sig_path],
            input=signing_input,
            capture_output=True,
            timeout=5,
        )
        return res.returncode == 0
    except Exception:
        return False
    finally:
        for p in (cert_path, pub_path, sig_path):
            if os.path.exists(p):
                try:
                    os.remove(p)
                except OSError:
                    pass


class HarvesterRequestHandler(http.server.BaseHTTPRequestHandler):
    server_version = "GEHarvester/1.0"
    sys_version = ""

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/healthz" or self.path == "/":
            self._send_json(200, {"status": "ok", "service": "ge-ediscovery-harvester"})
            return
        self._send_json(404, {"error": "Not found"})

    def _verify_oidc_caller(self) -> tuple[bool, str]:
        """
        Cryptographically verifies the Google-signed OIDC Bearer token sent by
        Authenticated Pub/Sub Push or Cloud Scheduler when running in Cloud Run
        (defense-in-depth behind Cloud Run IAM; mitigates N1).
        """
        auth_header = self.headers.get("Authorization", "").strip()
        if not auth_header.startswith("Bearer "):
            if os.environ.get("K_SERVICE"):
                return False, "Missing Authorization Bearer token"
            if os.environ.get("ALLOW_LOCAL_DEV_BYPASS", "false").lower() == "true":
                return True, "local-dev"
            return False, "Missing Authorization Bearer token (set ALLOW_LOCAL_DEV_BYPASS=true for local loopback testing)"

        token = auth_header.split(" ", 1)[1].strip()
        parts = token.split(".")
        if len(parts) != 3:
            return False, "Malformed OIDC JWT"
        try:
            hdr_b64 = parts[0] + "=" * (-len(parts[0]) % 4)
            payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
            sig_b64 = parts[2] + "=" * (-len(parts[2]) % 4)
            header = json.loads(base64.urlsafe_b64decode(hdr_b64).decode("utf-8"))
            claims = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
            signature = base64.urlsafe_b64decode(sig_b64)
        except Exception:
            return False, "Unable to decode OIDC JWT header, claims, or signature"

        if header.get("alg") != "RS256":
            return False, f"Unsupported OIDC JWT alg: {header.get('alg')!r}"
        kid = str(header.get("kid") or "").strip()
        if not kid:
            return False, "Missing OIDC JWT kid header"

        now = time.time()
        exp = float(claims.get("exp") or 0)
        iat = float(claims.get("iat") or 0)
        if exp <= now - 30:
            return False, "Expired OIDC JWT"
        if iat > now + 120:
            return False, "OIDC JWT issued in the future"

        iss = str(claims.get("iss") or "")
        if iss not in ("https://accounts.google.com", "accounts.google.com"):
            return False, "Untrusted OIDC issuer"

        expected_aud = os.environ.get("EXPECTED_OIDC_AUDIENCE", "").strip()
        if os.environ.get("K_SERVICE") and not expected_aud:
            return False, "Server misconfiguration: EXPECTED_OIDC_AUDIENCE must be set in Cloud Run"
        if expected_aud:
            base_service_url = expected_aud[:-7] if expected_aud.endswith("/pubsub") else expected_aud.rstrip("/")
            allowed_audiences = {expected_aud, base_service_url, f"{base_service_url}/pubsub", f"{base_service_url}/sweep"}
            if str(claims.get("aud") or "") not in allowed_audiences:
                return False, "OIDC audience mismatch"

        email = str(claims.get("email") or "").strip()
        if not email or claims.get("email_verified") is not True:
            return False, "Missing or unverified email claim in OIDC token"

        expected_sa = os.environ.get(
            "EXPECTED_INVOKER_SA",
            f"ge-ediscovery-harvester-sa@{ge_harvest.PROJECT_ID}.iam.gserviceaccount.com"
            if ge_harvest.PROJECT_ID
            else "",
        )
        if expected_sa and email != expected_sa:
            return False, f"Unauthorized invoker principal: {email}"

        try:
            certs = _fetch_google_oidc_certs()
            cert_pem = certs.get(kid, "")
            if not cert_pem:
                _GOOGLE_OIDC_CERTS_CACHE["expires_at"] = 0.0
                certs = _fetch_google_oidc_certs()
                cert_pem = certs.get(kid, "")
            if not cert_pem:
                return False, f"Unknown Google OIDC signing key kid={kid}"
            signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
            if not _verify_rs256_jwt_with_x509_cert(signing_input, signature, cert_pem):
                return False, "Invalid OIDC JWT cryptographic signature"
        except Exception as exc:
            return False, f"OIDC certificate verification error: {exc}"

        return True, email

    def do_POST(self) -> None:
        ok, caller_info = self._verify_oidc_caller()
        if not ok:
            self._send_json(403, {"error": "Forbidden", "reason": caller_info})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return

        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self._send_json(413, {"error": "Payload size out of bounds"})
            return

        raw_body = self.rfile.read(content_length)
        try:
            envelope = json.loads(raw_body.decode("utf-8"))
        except Exception:
            self._send_json(400, {"error": "Malformed JSON body"})
            return

        if self.path == "/pubsub":
            if not isinstance(envelope, dict) or not isinstance(envelope.get("message"), dict):
                self._send_json(400, {"error": "Invalid Pub/Sub push envelope"})
                return

            msg = envelope["message"]
            data_b64 = msg.get("data", "")
            if not data_b64 or not isinstance(data_b64, str):
                self._send_json(200, {"status": "ignored", "reason": "Empty Pub/Sub message.data"})
                return

            try:
                decoded_bytes = base64.b64decode(data_b64)
                log_entry = json.loads(decoded_bytes.decode("utf-8"))
            except Exception:
                self._send_json(400, {"error": "Invalid base64 or JSON in message.data"})
                return

            if not isinstance(log_entry, dict):
                self._send_json(400, {"error": "Decoded log_entry must be a JSON object"})
                return

            try:
                result = ge_harvest.harvest_single_event(log_entry)
                print(f"[Pub/Sub Event Processed] {json.dumps(result)}")
                self._send_json(200, result)
            except Exception:
                traceback.print_exc()
                # Return 500 so Pub/Sub retries transient errors with exponential backoff
                self._send_json(500, {"error": "Harvest execution failed"})
            return

        elif self.path == "/sweep":
            hours = 24
            if isinstance(envelope, dict) and isinstance(envelope.get("hours"), int):
                hours = max(1, min(720, envelope["hours"]))
            try:
                project_id = ge_harvest.PROJECT_ID
                workforce_pool_id = ge_harvest.WORKFORCE_POOL_ID
                bucket_name = ge_harvest.get_bucket_name(project_id)
                sessions = ge_harvest.discover_from_cloud_logging(project_id, hours=hours)
                all_rows: list[dict] = []
                known_principals: set[str] = set()
                for _, sinfo in sessions.items():
                    if sinfo.get("user_iam_principal"):
                        known_principals.add(sinfo["user_iam_principal"])
                    try:
                        all_rows.extend(
                            ge_harvest.harvest_session(sinfo, project_id, workforce_pool_id, bucket_name)
                        )
                    except Exception as err:
                        print(f"[!] Session sweep error: {err}")
                try:
                    all_rows.extend(
                        ge_harvest.harvest_notebooklm_enterprise(
                            project_id=project_id,
                            workforce_pool_id=workforce_pool_id,
                            bucket_name=bucket_name,
                            hours=max(hours, 168),
                            known_principals=known_principals,
                        )
                    )
                except Exception as err:
                    print(f"[!] NotebookLM sweep error: {err}")
                ge_harvest.load_rows_to_bigquery(all_rows, project_id)
                self._send_json(
                    200,
                    {
                        "status": "sweep_completed",
                        "sessions_discovered": len(sessions),
                        "rows_loaded": len(all_rows),
                    },
                )
            except Exception:
                traceback.print_exc()
                self._send_json(500, {"error": "Sweep failed"})
            return

        self._send_json(404, {"error": "Not found"})


def main() -> None:
    port = int(os.environ.get("PORT", "8080"))
    # Bind to 0.0.0.0 inside Cloud Run (where K_SERVICE is set), or 127.0.0.1 locally
    bind_host = "0.0.0.0" if os.environ.get("K_SERVICE") else "127.0.0.1"
    server = http.server.ThreadingHTTPServer((bind_host, port), HarvesterRequestHandler)
    print(f"Starting ge-ediscovery-harvester on {bind_host}:{port}...")
    server.serve_forever()


if __name__ == "__main__":
    main()
