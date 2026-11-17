#!/usr/bin/env python3
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Hardened loopback-only static server for Lab 1 and the Interactive Lab Portal.

Why this exists instead of `python3 -m http.server`:
1. Binds strictly to `127.0.0.1` (never `0.0.0.0`).
2. Enforces canonical realpath sandboxing inside the target folder with a
   trailing directory separator check, preventing path traversal (`../`) or
   accidental exposure of repository `.env` / configuration files.
3. Allow-lists static web & skill-download extensions, blocks all dotfiles
   (`.env*`, `.git*`), disables directory listings, and sets strict security
   headers (`Content-Security-Policy` with zero `'unsafe-inline'`,
   `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).
"""

from __future__ import annotations

import argparse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
import os
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit

ALLOWED_EXTENSIONS = frozenset({
    ".html",
    ".css",
    ".js",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ico",
    ".json",
    ".woff2",
    ".md",
    ".zip",
    ".pdf",
})

CSP_HEADER = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "connect-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'none'; "
    "frame-ancestors 'none'"
)


def resolve_safe_asset(sandbox_root: str, raw_request_path: str) -> str | None:
    """Resolve `raw_request_path` strictly within `sandbox_root` or return None."""
    clean_url_path = unquote(urlsplit(raw_request_path).path)
    if clean_url_path in ("", "/"):
        clean_url_path = "/index.html"

    # Reject null bytes, backslashes, and hidden dot-segments immediately
    if "\x00" in clean_url_path or "\\" in clean_url_path:
        return None
    parts = [p for p in clean_url_path.split("/") if p]
    if any(p.startswith(".") for p in parts):
        return None

    candidate = os.path.realpath(os.path.join(sandbox_root, *parts))
    boundary = sandbox_root.rstrip(os.sep) + os.sep
    if not candidate.startswith(boundary):
        return None
    if not os.path.isfile(candidate):
        return None

    _, ext = os.path.splitext(candidate)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return None
    return candidate


def make_handler(sandbox_root: str):
    """Build a request handler bound to a single canonical static asset root."""

    class SafeStaticHandler(BaseHTTPRequestHandler):
        server_version = "WorkshopPreview/1.1"
        sys_version = ""

        def _send_security_headers(self) -> None:
            self.send_header("Content-Security-Policy", CSP_HEADER)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("X-Frame-Options", "DENY")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
            self.send_header("Cache-Control", "no-store")

        def do_GET(self) -> None:  # noqa: N802
            self._serve(include_body=True)

        def do_HEAD(self) -> None:  # noqa: N802
            self._serve(include_body=False)

        def _serve(self, *, include_body: bool) -> None:
            asset_path = resolve_safe_asset(sandbox_root, self.path)
            if asset_path is None:
                self.send_response(HTTPStatus.NOT_FOUND)
                self._send_security_headers()
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                body = b"404 Not Found\n"
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if include_body:
                    self.wfile.write(body)
                return

            try:
                with open(asset_path, "rb") as fh:
                    data = fh.read()
            except OSError:
                self.send_response(HTTPStatus.INTERNAL_SERVER_ERROR)
                self._send_security_headers()
                self.end_headers()
                return

            ctype, _ = mimetypes.guess_type(asset_path)
            if asset_path.lower().endswith(".md"):
                ctype = "text/markdown"
            elif not ctype:
                ctype = "application/octet-stream"
            if ctype.startswith(("text/", "application/javascript", "application/json")):
                ctype = f"{ctype}; charset=utf-8"

            self.send_response(HTTPStatus.OK)
            self._send_security_headers()
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            if include_body:
                self.wfile.write(data)

        def log_message(self, fmt: str, *args) -> None:
            sys.stderr.write(f"[preview 127.0.0.1] {fmt % args}\n")

    return SafeStaticHandler


def main() -> int:
    workshop_root = Path(__file__).resolve().parent.parent
    default_lab1_dir = workshop_root / "lab1-mission-portal"
    guide_dir = workshop_root / "guide"

    parser = argparse.ArgumentParser(
        description="Serve Lab 1 or the Interactive Lab Portal strictly on 127.0.0.1."
    )
    parser.add_argument(
        "--guide",
        action="store_true",
        help="Serve the Interactive Participant & Facilitator Lab Portal (./guide) on port 8082",
    )
    parser.add_argument(
        "--dir",
        default=None,
        help="Static directory to serve (default: ./lab1-mission-portal, or ./guide with --guide)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Loopback TCP port on 127.0.0.1 (default: 8082 for --guide, 8081 for Lab 1; 8080 reserved for adk web)",
    )
    args = parser.parse_args()

    chosen_dir = args.dir or (str(guide_dir) if args.guide else str(default_lab1_dir))
    chosen_port = args.port if args.port is not None else (8082 if args.guide else 8081)

    target_dir = os.path.realpath(chosen_dir)
    if not os.path.isdir(target_dir):
        sys.stderr.write(
            f"[ERROR] Directory not found: {target_dir}\n"
            "Build Lab 1 first, pass --guide, or pass --dir starters/lab1-mission-portal\n"
        )
        return 1

    server = ThreadingHTTPServer(("127.0.0.1", chosen_port), make_handler(target_dir))
    actual_port = server.server_address[1]
    print(f"Serving {target_dir} strictly at http://127.0.0.1:{actual_port}/")
    if args.guide:
        print(f"Facilitator Review Mode: http://127.0.0.1:{actual_port}/?review")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping preview server.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
