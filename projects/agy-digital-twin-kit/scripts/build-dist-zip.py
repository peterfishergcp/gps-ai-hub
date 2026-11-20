#!/usr/bin/env python3
"""Builds version-manifest.json and dist/antigravity-digital-twin-kit.zip."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import zipfile

SUITE_ROOT = Path(__file__).resolve().parent.parent
PLUGINS_DIR = SUITE_ROOT / "plugins"
DIST_DIR = SUITE_ROOT / "dist"
MANIFEST_PATH = SUITE_ROOT / "version-manifest.json"
ZIP_PATH = DIST_DIR / "antigravity-digital-twin-kit.zip"
SUITE_VERSION = "1.0.3"

INCLUDE_ROOTS = ("plugins", "scripts", "docs", "README.md")
SKIP_NAMES = {"__pycache__", ".DS_Store", "Thumbs.db", "node_modules"}


def sha256_bytes(data: bytes) -> str:
  return hashlib.sha256(data).hexdigest()


def build_manifest_and_zip() -> dict:
  skill_manifest: dict[str, dict] = {}
  sidecar_manifest: dict[str, dict] = {}
  plugins_summary: list[dict] = []

  for pdir in sorted(PLUGINS_DIR.iterdir()):
    if not pdir.is_dir() or pdir.name.startswith("."):
      continue
    pjson_path = pdir / "plugin.json"
    if not pjson_path.is_file():
      continue
    pjson = json.loads(pjson_path.read_text(encoding="utf-8"))
    pname = pjson["name"]

    skills_dir = pdir / "skills"
    skill_ids: list[str] = []
    if skills_dir.is_dir():
      for sdir in sorted(skills_dir.iterdir()):
        if not sdir.is_dir() or sdir.name.startswith("."):
          continue
        files_map: dict[str, str] = {}
        for f in sorted(sdir.rglob("*")):
          if f.is_file() and not f.is_symlink() and not any(part in SKIP_NAMES for part in f.parts):
            rel = f.relative_to(sdir).as_posix()
            files_map[rel] = sha256_bytes(f.read_bytes())
        if "SKILL.md" in files_map:
          skill_ids.append(sdir.name)
          skill_manifest[sdir.name] = {
              "plugin": pname,
              "files": files_map,
          }

    sidecars_dir = pdir / "sidecars"
    sidecar_ids: list[str] = []
    if sidecars_dir.is_dir():
      for scdir in sorted(sidecars_dir.iterdir()):
        if not scdir.is_dir() or scdir.name.startswith("."):
          continue
        files_map = {}
        for f in sorted(scdir.rglob("*")):
          if f.is_file() and not f.is_symlink() and not any(part in SKIP_NAMES for part in f.parts):
            rel = f.relative_to(scdir).as_posix()
            files_map[rel] = sha256_bytes(f.read_bytes())
        if "sidecar.json" in files_map:
          sidecar_ids.append(scdir.name)
          if pname != "agy-twin-automations":
            sidecar_manifest[f"{pname}/{scdir.name}"] = {
                "plugin": pname,
                "sidecar": scdir.name,
                "files": files_map,
            }

    plugins_summary.append({
        "name": pname,
        "version": pjson.get("version", SUITE_VERSION),
        "skills": skill_ids,
        "sidecars": sidecar_ids,
    })

  manifest = {
      "suiteName": "antigravity-digital-twin-kit",
      "suiteVersion": SUITE_VERSION,
      "plugins": plugins_summary,
      "skillManifest": skill_manifest,
      "sidecarManifest": sidecar_manifest,
  }
  MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

  DIST_DIR.mkdir(parents=True, exist_ok=True)
  with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as zf:
    for item_name in (*INCLUDE_ROOTS, "version-manifest.json"):
      target = SUITE_ROOT / item_name
      if target.is_file():
        zf.write(target, target.relative_to(SUITE_ROOT).as_posix())
      elif target.is_dir():
        for f in sorted(target.rglob("*")):
          if f.is_file() and not f.is_symlink() and not any(part in SKIP_NAMES for part in f.parts):
            zf.write(f, f.relative_to(SUITE_ROOT).as_posix())

  return {
      "manifestPath": str(MANIFEST_PATH),
      "zipPath": str(ZIP_PATH),
      "zipSizeBytes": ZIP_PATH.stat().st_size,
      "pluginCount": len(plugins_summary),
      "skillCount": len(skill_manifest),
      "sidecarCount": len(sidecar_manifest),
  }


if __name__ == "__main__":
  summary = build_manifest_and_zip()
  print(json.dumps(summary, indent=2))
