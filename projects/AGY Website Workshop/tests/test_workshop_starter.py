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
"""Security & functional verification suite for AGY Website Workshop."""

from __future__ import annotations

from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import re
import sys
import threading
import unittest
import urllib.error
import urllib.request

WORKSHOP_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSHOP_ROOT / "scripts"))

import preview_lab1  # noqa: E402


class PreviewServerSecurityTests(unittest.TestCase):
    """Verifies path traversal protections, dotfile blocking, loopback binding, and CSP."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.starter_dir = os.path.realpath(WORKSHOP_ROOT / "starters" / "lab1-mission-portal")
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            preview_lab1.make_handler(cls.starter_dir),
        )
        cls.host, cls.port = cls.server.server_address
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

        cls.guide_dir = os.path.realpath(WORKSHOP_ROOT / "guide")
        cls.guide_server = ThreadingHTTPServer(
            ("127.0.0.1", 0),
            preview_lab1.make_handler(cls.guide_dir),
        )
        cls.guide_host, cls.guide_port = cls.guide_server.server_address
        cls.guide_thread = threading.Thread(target=cls.guide_server.serve_forever, daemon=True)
        cls.guide_thread.start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.guide_server.shutdown()
        cls.guide_server.server_close()

    def test_binds_strictly_to_loopback(self) -> None:
        self.assertEqual(self.host, "127.0.0.1")
        self.assertEqual(self.guide_host, "127.0.0.1")

    def test_serves_index_with_security_headers(self) -> None:
        url = f"http://127.0.0.1:{self.port}/"
        with urllib.request.urlopen(url, timeout=5) as resp:
            self.assertEqual(resp.status, 200)
            csp = resp.headers.get("Content-Security-Policy", "")
            self.assertIn("default-src 'self'", csp)
            self.assertNotIn("unsafe-inline", csp)
            self.assertEqual(resp.headers.get("X-Content-Type-Options"), "nosniff")
            self.assertEqual(resp.headers.get("X-Frame-Options"), "DENY")
            body = resp.read().decode("utf-8")
            self.assertIn("Mission AI Services Portal", body)

    def test_blocks_path_traversal_and_dotfiles(self) -> None:
        attack_paths = [
            "/../.env.example",
            "/..%2f.env.example",
            "/..%5c.env.example",
            "/.env",
            "/.git/config",
            "/../../README.md",
            "/scripts/preflight.sh",
        ]
        for port in (self.port, self.guide_port):
            for path in attack_paths:
                with self.subTest(port=port, path=path):
                    url = f"http://127.0.0.1:{port}{path}"
                    with self.assertRaises(urllib.error.HTTPError) as ctx:
                        urllib.request.urlopen(url, timeout=5)
                    self.assertEqual(ctx.exception.code, 404)
                    ctx.exception.close()

    def test_interactive_guide_assets_and_strict_csp_compliance(self) -> None:
        guide_html = (Path(self.guide_dir) / "index.html").read_text(encoding="utf-8")
        # Must not contain inline style="" or inline <script> bodies so strict CSP works
        self.assertIsNone(re.search(r"\bstyle\s*=", guide_html))
        self.assertIsNone(re.search(r"<script(?![^>]*\bsrc=)[^>]*>", guide_html))

        for rel_asset in (
            "/",
            "/styles.css",
            "/guide.js",
            "/theme-init.js",
            "/img/l1-04-permissions-menu.webp",
            "/skills/mission-notes-to-action-items.zip",
            "/skills/mission-notes-to-action-items/SKILL.md",
        ):
            with self.subTest(asset=rel_asset):
                url = f"http://127.0.0.1:{self.guide_port}{rel_asset}"
                with urllib.request.urlopen(url, timeout=5) as resp:
                    self.assertEqual(resp.status, 200)
                    self.assertGreater(len(resp.read()), 100)

    def test_javascript_files_contain_zero_unsafe_dom_sinks(self) -> None:
        js_files = [
            Path(self.starter_dir) / "script.js",
            Path(self.guide_dir) / "guide.js",
            Path(self.guide_dir) / "theme-init.js",
        ]
        unsafe_pattern = re.compile(
            r"\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b"
        )
        for js_path in js_files:
            with self.subTest(js=js_path.name):
                source = js_path.read_text(encoding="utf-8")
                code_only = "\n".join(
                    line for line in source.splitlines() if not line.strip().startswith("//")
                )
                self.assertIsNone(
                    unsafe_pattern.search(code_only),
                    f"{js_path} must not contain unsafe HTML DOM sinks.",
                )


if __name__ == "__main__":
    unittest.main()
