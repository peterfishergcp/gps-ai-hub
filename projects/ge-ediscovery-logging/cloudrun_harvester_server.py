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
import traceback

import ge_harvest

MAX_BODY_BYTES = 1_048_576  # 1 MiB


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

    def do_POST(self) -> None:
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
            except Exception as e:
                traceback.print_exc()
                # Return 500 so Pub/Sub retries transient errors with exponential backoff
                self._send_json(500, {"error": "Harvest execution failed", "detail": str(e)[:200]})
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
            except Exception as e:
                traceback.print_exc()
                self._send_json(500, {"error": "Sweep failed", "detail": str(e)[:200]})
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
