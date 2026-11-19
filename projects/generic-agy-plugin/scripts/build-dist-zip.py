#!/usr/bin/env python3
"""Builds dist/generic-agy-plugin.zip (<200 KB), mirrors it to workshop/dist/, and embeds SHA-256 hashes into version-manifest.json."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import shutil
import zipfile


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def update_manifest_hashes(suite_root: Path) -> None:
    manifest_path = suite_root / "version-manifest.json"
    if not manifest_path.exists():
        return
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    plugins_dir = suite_root / "plugins"
    skill_manifest: dict[str, dict] = {}

    if plugins_dir.is_dir():
        for plugin_dir in sorted(p for p in plugins_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
            skills_root = plugin_dir / "skills"
            if not skills_root.is_dir():
                continue
            for skill_dir in sorted(s for s in skills_root.iterdir() if s.is_dir() and not s.name.startswith(".")):
                files_map: dict[str, str] = {}
                combined = hashlib.sha256()
                for root, dirs, files in os.walk(skill_dir):
                    dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
                    for fname in sorted(files):
                        if fname.startswith(".") or fname.endswith(".pyc") or fname.endswith(".disabled"):
                            continue
                        fpath = Path(root) / fname
                        if fpath.is_symlink():
                            continue
                        rel = fpath.relative_to(skill_dir).as_posix()
                        fhash = sha256_file(fpath)
                        files_map[rel] = fhash
                        combined.update(f"{rel}:{fhash}\n".encode("utf-8"))
                skill_manifest[skill_dir.name] = {
                    "plugin": plugin_dir.name,
                    "skill": skill_dir.name,
                    "treeSha256": combined.hexdigest()[:16],
                    "files": files_map,
                }

    manifest["skillManifest"] = skill_manifest

    sidecar_manifest: dict[str, dict] = {}
    if plugins_dir.is_dir():
        for plugin_dir in sorted(p for p in plugins_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
            sidecars_root = plugin_dir / "sidecars"
            if not sidecars_root.is_dir():
                continue
            for sc_dir in sorted(s for s in sidecars_root.iterdir() if s.is_dir() and not s.name.startswith(".")):
                sc_files: dict[str, str] = {}
                for root, dirs, files in os.walk(sc_dir):
                    dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d != "node_modules")
                    for fname in sorted(files):
                        if fname.startswith(".") or fname.endswith(".pyc"):
                            continue
                        fpath = Path(root) / fname
                        if fpath.is_symlink():
                            continue
                        rel = fpath.relative_to(sc_dir).as_posix()
                        sc_files[rel] = sha256_file(fpath)
                sidecar_manifest[sc_dir.name] = {
                    "plugin": plugin_dir.name,
                    "sidecar": sc_dir.name,
                    "files": sc_files,
                }
    manifest["sidecarManifest"] = sidecar_manifest
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def build_zip() -> Path:
    suite_root = Path(__file__).resolve().parent.parent
    update_manifest_hashes(suite_root)

    dist_dir = suite_root / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    out_zip = dist_dir / "generic-agy-plugin.zip"

    include_roots = [
        suite_root / "version-manifest.json",
        suite_root / "README.md",
        suite_root / "scripts" / "install-agy-suite.ps1",
        suite_root / "scripts" / "install-agy-suite.sh",
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

    workshop_dist = suite_root / "workshop" / "dist"
    if workshop_dist.parent.is_dir():
        workshop_dist.mkdir(parents=True, exist_ok=True)
        shutil.copy2(out_zip, workshop_dist / out_zip.name)

    return out_zip


if __name__ == "__main__":
    archive = build_zip()
    size_kb = archive.stat().st_size / 1024.0
    print(f"Built {archive} ({size_kb:.1f} KB)")
