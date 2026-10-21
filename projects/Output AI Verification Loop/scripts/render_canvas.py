#!/usr/bin/env python3
"""Compiles a Karpathy 3-Stage Council Review JSON into a standalone 6-Tab HTML Canvas.

Usage:
  python3 scripts/render_canvas.py <path/to/council_review.json> --output <output.html>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TEMPLATE_PATH = (
    SCRIPT_DIR.parent / "skill" / "output-engineer" / "resources" / "review_canvas_template.html"
)

START_MARKER = "/*__COUNCIL_REVIEW_JSON_START__*/"
END_MARKER = "/*__COUNCIL_REVIEW_JSON_END__*/"


def render_canvas_html(
    review_data: Dict[str, Any],
    template_path: Path = DEFAULT_TEMPLATE_PATH,
) -> str:
  """Injects review_data JSON into the HTML Review Canvas template."""
  template_html = template_path.read_text(encoding="utf-8")
  if START_MARKER not in template_html or END_MARKER not in template_html:
    raise ValueError(
        f"Template {template_path} is missing {START_MARKER} / {END_MARKER} markers."
    )

  start_idx = template_html.index(START_MARKER) + len(START_MARKER)
  end_idx = template_html.index(END_MARKER)

  json_payload = json.dumps(review_data, indent=2).replace("</script>", "<\\/script>")
  compiled = (
      template_html[:start_idx]
      + "\nconst COUNCIL_REVIEW_DATA = "
      + json_payload
      + ";\n    "
      + template_html[end_idx:]
  )

  # Also set the HTML <title> tag dynamically
  title = review_data.get("header", {}).get(
      "title", "Output Engineering Review Canvas"
  )
  compiled = compiled.replace(
      "<title>Output Engineering Review Canvas — Enterprise Security Architecture Audit</title>",
      f"<title>{title} — Output Engineering Review Canvas</title>",
  )
  return compiled


def compile_canvas(
    review_data: Dict[str, Any],
    output_path: Path,
    template_path: Path = DEFAULT_TEMPLATE_PATH,
) -> Path:
  """Writes the compiled standalone HTML Canvas to output_path."""
  html_str = render_canvas_html(review_data, template_path=template_path)
  output_path.parent.mkdir(parents=True, exist_ok=True)
  output_path.write_text(html_str, encoding="utf-8")
  return output_path


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = argparse.ArgumentParser(
      description="Compile a council_review.json file into a standalone 6-Tab HTML Review Canvas."
  )
  parser.add_argument("input_json", type=Path, help="Path to council_review.json")
  parser.add_argument(
      "-o",
      "--output",
      type=Path,
      required=True,
      help="Destination path for the standalone HTML file.",
  )
  parser.add_argument(
      "--template",
      type=Path,
      default=DEFAULT_TEMPLATE_PATH,
      help="Path to review_canvas_template.html.",
  )
  args = parser.parse_args(argv)

  review_data = json.loads(args.input_json.read_text(encoding="utf-8"))
  compile_canvas(review_data, args.output, template_path=args.template)
  print(f"✅ Compiled standalone 6-Tab HTML Review Canvas -> {args.output}")
  return 0


if __name__ == "__main__":
  sys.exit(main())
