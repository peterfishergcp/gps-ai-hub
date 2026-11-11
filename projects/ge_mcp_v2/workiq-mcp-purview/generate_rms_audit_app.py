#!/usr/bin/env python3
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""
Offline-Safe SEP-2640 Skill Manifest Verifier & SEP-1865 MCP App Audit Dashboard Generator
for Microsoft WorkIQ MCP + Azure RMS / Purview Encryption Verification (v2.0).
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys
from typing import Any


BASE_DIR = pathlib.Path(__file__).resolve().parent
SKILLS_DIR = BASE_DIR / "skills" / "workiq-purview-rms-verification"


def build_sep2640_skill_manifest() -> dict[str, Any]:
    skill_md = SKILLS_DIR / "SKILL.md"
    if not skill_md.exists():
        raise FileNotFoundError(f"Missing SKILL.md at {skill_md}")

    resources = []
    for file_path in sorted(SKILLS_DIR.rglob("*")):
        if file_path.is_file() and not file_path.name.startswith("."):
            rel = file_path.relative_to(SKILLS_DIR).as_posix()
            raw = file_path.read_bytes()
            resources.append({
                "uri": f"skill://workiq-purview-rms-verification/{rel}",
                "digest": f"sha256:{hashlib.sha256(raw).hexdigest()}",
                "size": len(raw),
            })

    return {
        "uri": "skill://workiq-purview-rms-verification/SKILL.md",
        "frontmatter": {
            "name": "workiq-purview-rms-verification",
            "description": (
                "End-to-end verification workflow for Azure Rights Management (RMS) "
                "MS-OFFCRYPTO encryption headers and delegated WorkIQ MCP Purview access controls."
            ),
        },
        "resources": resources,
    }


def render_rms_mcp_app_html(audit_records: list[dict[str, Any]] | None = None) -> str:
    records = audit_records or [
        {
            "id": "scenario-allowed",
            "title": "Allowed Document (Confidential - RMS)",
            "category": "MS-OFFCRYPTO Encrypted • ALLOW",
            "magic": "d0cf11e0a1b11ae1",
            "verdict": "Delegated WorkIQ MCP decrypted & summarized successfully.",
        },
        {
            "id": "scenario-blocked",
            "title": "Restricted Security Document (SOC Block)",
            "category": "MS-OFFCRYPTO Encrypted • BLOCK",
            "magic": "d0cf11e0a1b11ae1",
            "verdict": "Zero EXTRACT rights confirmed; Purview natively blocked content extraction.",
        },
    ]
    safe_json = (
        json.dumps(records)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )
    return f"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <title>WorkIQ Purview RMS Encryption Audit App</title>
  <style>
    body {{ font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; padding: 16px; }}
    .card {{ background: #ffffff; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }}
    .mono {{ font-family: ui-monospace, monospace; font-size: 12px; color: #475569; margin-top: 4px; }}
  </style>
</head>
<body>
  <h2 id="hdr">WorkIQ MCP & Azure RMS Encryption Posture (v2.0)</h2>
  <div id="list"></div>
  <script>
    (function () {{
      const DATA = {safe_json};
      const root = document.getElementById("list");
      for (const item of DATA) {{
        const card = document.createElement("div");
        card.className = "card";
        const t = document.createElement("strong");
        t.textContent = item.title + " [" + item.category + "]";
        const m = document.createElement("div");
        m.className = "mono";
        m.textContent = "Header Magic: " + item.magic + " | " + item.verdict;
        card.appendChild(t);
        card.appendChild(m);
        root.appendChild(card);
      }}
      if (window.parent && window.parent !== window) {{
        window.parent.postMessage({{ jsonrpc: "2.0", method: "ui/notifications/initialized", params: {{}} }}, "*");
      }}
    }})();
  </script>
</body>
</html>"""


def main() -> int:
    manifest = build_sep2640_skill_manifest()
    html = render_rms_mcp_app_html()
    if "--verify" in sys.argv:
        assert len(manifest["resources"]) >= 2
        assert "innerHTML" not in html
        print(json.dumps({"status": "ok", "skill": manifest["uri"], "files": len(manifest["resources"])}))
        return 0
    out_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else BASE_DIR / "rms_audit_app.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"Wrote SEP-1865 MCP App HTML preview to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
