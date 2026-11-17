#!/usr/bin/env python3
"""Builds the lightweight dist/wv-antigravity-suite.zip (<200 KB) for <2s laptop onboarding."""

from __future__ import annotations

import os
from pathlib import Path
import zipfile


def build_zip() -> Path:
    suite_root = Path(__file__).resolve().parent.parent
    dist_dir = suite_root / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    out_zip = dist_dir / "wv-antigravity-suite.zip"

    include_roots = [
        suite_root / "version-manifest.json",
        suite_root / "README.md",
        suite_root / "scripts" / "install-wv-suite.ps1",
        suite_root / "scripts" / "install-wv-suite.sh",
        suite_root / "plugins",
    ]

    with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for item in include_roots:
            if item.is_file():
                rel = item.relative_to(suite_root).as_posix()
                zf.write(item, arcname=rel)
            elif item.is_dir():
                for root, dirs, files in os.walk(item):
                    dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
                    for fname in sorted(files):
                        if fname.startswith(".") or fname.endswith(".pyc"):
                            continue
                        fpath = Path(root) / fname
                        if fpath.is_symlink():
                            continue
                        rel = fpath.relative_to(suite_root).as_posix()
                        zf.write(fpath, arcname=rel)

    return out_zip


if __name__ == "__main__":
    archive = build_zip()
    size_kb = archive.stat().st_size / 1024.0
    print(f"Built {archive} ({size_kb:.1f} KB)")
