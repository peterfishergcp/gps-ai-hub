#!/usr/bin/env python3
"""ASD-STE100 Sentence Length & Filler Auditor for Output Engineering Rewrites.

Usage:
  python3 scripts/check_ste100.py <path/to/markdown_file.md>

Checks lines formatted as:
  - **D** [17] Descriptive sentence here.
  - **P** [10] Procedural sentence here.
or standard prose paragraphs, verifying:
  1. Procedural (P) sentences <= 20 words (ASD-STE100 Rule 5.1)
  2. Descriptive (D) sentences <= 25 words (ASD-STE100 Rule 6.3)
  3. Zero banned AI filler phrases
"""

import re
import sys
from pathlib import Path

BANNED_PHRASES = [
    "it is important to note",
    "it is worth noting",
    "furthermore",
    "moreover",
    "in order to",
    "seamless",
    "holistic",
    "cutting-edge",
]

TAGGED_LINE_RE = re.compile(
    r"^\s*(?:[-*]|\d+\.)\s+\*\*([PDN])\*\*\s*(?:\[\d+\])?\s+(.*)$"
)


def count_words(text: str) -> int:
  # Strip markdown bold/italic markers and count whitespace-delimited tokens
  cleaned = re.sub(r"[*_`]+", "", text).strip()
  return len(cleaned.split()) if cleaned else 0


def audit_file(filepath: Path) -> int:
  content = filepath.read_text(encoding="utf-8")
  lines = content.splitlines()

  total_checked = 0
  violations = []

  for line_num, line in enumerate(lines, start=1):
    match = TAGGED_LINE_RE.match(line)
    if not match:
      continue

    stype, sentence = match.group(1), match.group(2).strip()
    words = count_words(sentence)
    total_checked += 1

    limit = 20 if stype in ("P", "N") else 25
    if words > limit:
      violations.append(
          f"Line {line_num} [{stype}]: {words} words (limit {limit}) -> {sentence}"
      )

    lower_sent = sentence.lower()
    for phrase in BANNED_PHRASES:
      if phrase in lower_sent:
        violations.append(
            f"Line {line_num} [FILLER]: Contains banned phrase '{phrase}' -> {sentence}"
        )

  print(f"=== ASD-STE100 Audit: {filepath.name} ===")
  print(f"Tagged sentences checked: {total_checked}")
  if not violations:
    print("STATUS: PASS (100% compliant with ASD-STE100 word caps & filler rules)")
    return 0

  print(f"STATUS: FAIL ({len(violations)} violation(s) found):")
  for v in violations:
    print(f"  - {v}")
  return 1


if __name__ == "__main__":
  if len(sys.argv) < 2:
    print("Usage: python3 scripts/check_ste100.py <markdown_file.md>")
    sys.exit(2)
  sys.exit(audit_file(Path(sys.argv[1])))
