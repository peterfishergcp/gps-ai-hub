#!/usr/bin/env python3
"""ASD-STE100 Sentence Length, Active Voice & Filler Auditor for Output Engineering.

Usage:
  python3 scripts/check_ste100.py <path/to/markdown_or_json_file> [options]

Supported tagged line formats:
  - **D** [17] Descriptive sentence here.
  - **[D] (17w)** Descriptive sentence here.
  - [D] (17w) Descriptive sentence here.
  - [P] [7w] Procedural sentence here.
  1. **P** [10] Procedural sentence here.

Checks:
  1. Procedural (P / N) sentences <= 20 words (ASD-STE100 Rule 5.1)
  2. Descriptive (D) sentences <= 25 words (ASD-STE100 Rule 6.3)
  3. Zero banned AI filler phrases
  4. Non-zero sentences audited (fails if 0 tagged sentences found unless --prose or --allow-empty)
  5. Optional (--check-passive): Flags passive voice constructions (ASD-STE100 Rule 3.6)
  6. Optional (--check-word-tags): Verifies that inline [17] / (17w) badges match actual word count
  7. Optional (--prose): Audits untagged prose paragraphs and checks <= 6 sentences/paragraph (Rule 6.6)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

BANNED_PHRASES: Tuple[str, ...] = (
    "it is important to note",
    "it is worth noting",
    "it is worth mentioning",
    "furthermore",
    "moreover",
    "in order to",
    "seamless",
    "seamlessly",
    "holistic",
    "cutting-edge",
    "state-of-the-art",
    "leverage",
    "leveraging",
)

# Matches all supported STE100 tag conventions:
#   - **D** [17] Text...
#   - **[D] (17w)** Text...
#   - [D] (17w) Text...
#   - **P** (10w) Text...
#   1. [P] [10] Text...
TAGGED_LINE_RE = re.compile(
    r"^\s*(?:[-*+]|\d+\.)\s+"
    r"(?:\*\*)?\[?([PDN])\]?(?:\*\*)?"
    r"(?:\s*(?:\[\s*(\d+)\s*w?\s*\]|\(\s*(\d+)\s*w?\s*\))(?:\*\*)?)?"
    r"\s+(.*\S)\s*$"
)

# Passive voice heuristic: form of "to be" + optional adverb + regular/irregular past participle
PASSIVE_VOICE_RE = re.compile(
    r"\b(?:is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?"
    r"(?:[a-z]{3,}ed|written|sent|taken|given|shown|known|made|done|found|built|kept|held|set|run|put|cut|read|drawn|driven|eaten|fallen|forgotten|forgiven|frozen|gotten|grown|hidden|ridden|risen|shaken|spoken|stolen|sworn|torn|worn|woven|broken|chosen)\b",
    re.IGNORECASE,
)

# Exceptions where "is/are + <word>ed" functions as an adjectival state rather than hidden-actor passive
PASSIVE_STATE_EXCEPTIONS = {
    "is enabled",
    "are enabled",
    "is disabled",
    "are disabled",
    "is required",
    "are required",
    "is supported",
    "are supported",
    "is configured",
    "are configured",
    "is included",
    "are included",
    "is allowed",
    "are allowed",
    "is blocked",
    "are blocked",
    "is excluded",
    "are excluded",
    "is bundled",
    "are bundled",
    "is locked",
    "are locked",
}

CODE_SPAN_RE = re.compile(r"`[^`]+`")
SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9`\"'(\[])")


@dataclass
class STE100Violation:
  line_num: int
  category: str  # WORD_CAP, FILLER, PASSIVE_VOICE, WORD_TAG_MISMATCH, PARAGRAPH_LEN, EMPTY_AUDIT
  sentence_type: str
  word_count: int
  limit: int
  message: str
  sentence: str


@dataclass
class STE100AuditResult:
  filepath: str
  tagged_sentences_checked: int = 0
  prose_sentences_checked: int = 0
  avg_words_per_sentence: float = 0.0
  max_words_seen: int = 0
  violations: List[STE100Violation] = field(default_factory=list)

  @property
  def passed(self) -> bool:
    return len(self.violations) == 0


def count_words(text: str) -> int:
  """Counts words per ASD-STE100 rules, treating each inline code token as a single word."""
  if not text or not text.strip():
    return 0
  # Replace each inline backtick code span (`...`) with a single token placeholder
  normalized = CODE_SPAN_RE.sub("CODETOKEN", text)
  # Remove markdown links [label](url) -> label
  normalized = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", normalized)
  # Strip emphasis markers (*, _) at token boundaries without merging words
  normalized = re.sub(r"[*`]+", "", normalized)
  normalized = re.sub(r"(?<!\w)_+|_+(?!\w)", "", normalized)
  cleaned = normalized.strip()
  return len(cleaned.split()) if cleaned else 0


def find_passive_voice(sentence: str) -> Optional[str]:
  """Returns the matched passive construction if present and not an adjectival state exception."""
  # Strip inline code spans so variable names like `is_enabled` don't trigger
  scrubbed = CODE_SPAN_RE.sub("CODETOKEN", sentence)
  for match in PASSIVE_VOICE_RE.finditer(scrubbed):
    phrase = match.group(0).lower()
    if phrase in PASSIVE_STATE_EXCEPTIONS:
      continue
    return match.group(0)
  return None


def parse_tagged_line(line: str) -> Optional[Tuple[str, Optional[int], str]]:
  """Parses a tagged STE100 line into (stype, claimed_words, sentence)."""
  match = TAGGED_LINE_RE.match(line)
  if not match:
    return None
  stype = match.group(1)
  claimed_str = match.group(2) or match.group(3)
  claimed_words = int(claimed_str) if claimed_str is not None else None
  sentence = match.group(4).strip()
  return stype, claimed_words, sentence


def audit_sentence(
    sentence: str,
    stype: str,
    line_num: int,
    claimed_words: Optional[int] = None,
    check_passive: bool = False,
    check_word_tags: bool = False,
) -> Tuple[int, List[STE100Violation]]:
  """Audits a single sentence against ASD-STE100 rules."""
  violations: List[STE100Violation] = []
  words = count_words(sentence)
  limit = 20 if stype in ("P", "N") else 25

  if words > limit:
    violations.append(
        STE100Violation(
            line_num=line_num,
            category="WORD_CAP",
            sentence_type=stype,
            word_count=words,
            limit=limit,
            message=f"Line {line_num} [{stype}]: {words} words (limit {limit}) -> {sentence}",
            sentence=sentence,
        )
    )

  if check_word_tags and claimed_words is not None and claimed_words != words:
    violations.append(
        STE100Violation(
            line_num=line_num,
            category="WORD_TAG_MISMATCH",
            sentence_type=stype,
            word_count=words,
            limit=claimed_words,
            message=(
                f"Line {line_num} [TAG]: Badge says {claimed_words}w but actual count is {words}w"
                f" -> {sentence}"
            ),
            sentence=sentence,
        )
    )

  lower_sent = CODE_SPAN_RE.sub("", sentence).lower()
  for phrase in BANNED_PHRASES:
    if re.search(rf"\b{re.escape(phrase)}\b", lower_sent):
      violations.append(
          STE100Violation(
              line_num=line_num,
              category="FILLER",
              sentence_type=stype,
              word_count=words,
              limit=limit,
              message=f"Line {line_num} [FILLER]: Contains banned phrase '{phrase}' -> {sentence}",
              sentence=sentence,
          )
      )

  if check_passive:
    passive_hit = find_passive_voice(sentence)
    if passive_hit:
      violations.append(
          STE100Violation(
              line_num=line_num,
              category="PASSIVE_VOICE",
              sentence_type=stype,
              word_count=words,
              limit=limit,
              message=(
                  f"Line {line_num} [PASSIVE]: Passive voice '{passive_hit}' (Rule 3.6: use active"
                  f" voice) -> {sentence}"
              ),
              sentence=sentence,
          )
      )

  return words, violations


def audit_text(
    content: str,
    filepath_label: str = "<memory>",
    prose_mode: bool = False,
    check_passive: bool = False,
    check_word_tags: bool = False,
    allow_empty: bool = False,
) -> STE100AuditResult:
  """Audits markdown or JSON content for ASD-STE100 compliance."""
  result = STE100AuditResult(filepath=filepath_label)
  word_counts: List[int] = []

  # Support auditing council_review.json directly if JSON is passed
  if filepath_label.endswith(".json"):
    try:
      data = json.loads(content)
      ste_sections = data.get("ste100_rewrites", [])
      line_idx = 1
      for sec in ste_sections:
        for item in sec.get("lines", []):
          stype = item.get("type", "D")
          claimed = item.get("words")
          sent = item.get("text", "")
          words, v_list = audit_sentence(
              sent,
              stype=stype,
              line_num=line_idx,
              claimed_words=claimed,
              check_passive=check_passive,
              check_word_tags=check_word_tags,
          )
          result.tagged_sentences_checked += 1
          word_counts.append(words)
          result.violations.extend(v_list)
          line_idx += 1
      if word_counts:
        result.avg_words_per_sentence = round(sum(word_counts) / len(word_counts), 2)
        result.max_words_seen = max(word_counts)
      elif not allow_empty:
        result.violations.append(
            STE100Violation(
                line_num=0,
                category="EMPTY_AUDIT",
                sentence_type="N/A",
                word_count=0,
                limit=0,
                message="0 STE100 sentences found in JSON file.",
                sentence="",
            )
        )
      return result
    except json.JSONDecodeError:
      pass

  lines = content.splitlines()
  in_code_block = False
  current_paragraph_sentences: List[Tuple[int, str]] = []

  def flush_paragraph() -> None:
    if not current_paragraph_sentences:
      return
    if prose_mode and len(current_paragraph_sentences) > 6:
      first_line = current_paragraph_sentences[0][0]
      result.violations.append(
          STE100Violation(
              line_num=first_line,
              category="PARAGRAPH_LEN",
              sentence_type="D",
              word_count=len(current_paragraph_sentences),
              limit=6,
              message=(
                  f"Line {first_line} [PARAGRAPH]: {len(current_paragraph_sentences)} sentences in"
                  " paragraph (ASD-STE100 Rule 6.6 limit is 6)"
              ),
              sentence=current_paragraph_sentences[0][1],
          )
      )
    current_paragraph_sentences.clear()

  for line_num, raw_line in enumerate(lines, start=1):
    stripped = raw_line.strip()
    if stripped.startswith("```"):
      in_code_block = not in_code_block
      flush_paragraph()
      continue
    if in_code_block:
      continue

    parsed = parse_tagged_line(raw_line)
    if parsed is not None:
      flush_paragraph()
      stype, claimed_words, sentence = parsed
      words, v_list = audit_sentence(
          sentence,
          stype=stype,
          line_num=line_num,
          claimed_words=claimed_words,
          check_passive=check_passive,
          check_word_tags=check_word_tags,
      )
      result.tagged_sentences_checked += 1
      word_counts.append(words)
      result.violations.extend(v_list)
      continue

    if not prose_mode:
      continue

    # Skip markdown structural lines in untagged prose mode
    if (
        not stripped
        or stripped.startswith("#")
        or stripped.startswith("|")
        or stripped.startswith(">")
        or stripped.startswith("---")
        or stripped.startswith("![")
        or stripped.startswith("<")
    ):
      flush_paragraph()
      continue

    # Clean bullet prefix if untagged bullet
    clean_line = re.sub(r"^\s*(?:[-*+]|\d+\.)\s+", "", stripped)
    sentences = [s.strip() for s in SENTENCE_SPLIT_RE.split(clean_line) if s.strip()]
    for sent in sentences:
      if count_words(sent) < 3:
        continue
      words, v_list = audit_sentence(
          sent,
          stype="D",
          line_num=line_num,
          claimed_words=None,
          check_passive=check_passive,
          check_word_tags=False,
      )
      result.prose_sentences_checked += 1
      word_counts.append(words)
      result.violations.extend(v_list)
      current_paragraph_sentences.append((line_num, sent))

  flush_paragraph()

  total_checked = result.tagged_sentences_checked + result.prose_sentences_checked
  if word_counts:
    result.avg_words_per_sentence = round(sum(word_counts) / len(word_counts), 2)
    result.max_words_seen = max(word_counts)

  if total_checked == 0 and not allow_empty:
    result.violations.append(
        STE100Violation(
            line_num=0,
            category="EMPTY_AUDIT",
            sentence_type="N/A",
            word_count=0,
            limit=0,
            message=(
                "0 tagged ASD-STE100 sentences found (expected '- **D** [17] ...' or '- **[D]"
                " (17w)** ...' or '- [D] (17w) ...'). Pass --prose to audit untagged prose or"
                " --allow-empty."
            ),
            sentence="",
        )
    )

  return result


def audit_file(
    filepath: Path,
    prose_mode: bool = False,
    check_passive: bool = False,
    check_word_tags: bool = False,
    allow_empty: bool = False,
    json_output: bool = False,
) -> int:
  content = filepath.read_text(encoding="utf-8")
  res = audit_text(
      content,
      filepath_label=filepath.name,
      prose_mode=prose_mode,
      check_passive=check_passive,
      check_word_tags=check_word_tags,
      allow_empty=allow_empty,
  )

  if json_output:
    payload = asdict(res)
    payload["passed"] = res.passed
    print(json.dumps(payload, indent=2))
    return 0 if res.passed else 1

  print(f"=== ASD-STE100 Audit: {filepath.name} ===")
  print(f"Tagged sentences checked: {res.tagged_sentences_checked}")
  if prose_mode:
    print(f"Untagged prose sentences checked: {res.prose_sentences_checked}")
  if res.tagged_sentences_checked + res.prose_sentences_checked > 0:
    print(
        f"Word count stats: avg {res.avg_words_per_sentence}w/sentence | max {res.max_words_seen}w"
    )

  if res.passed:
    print("STATUS: PASS (100% compliant with ASD-STE100 word caps & filler rules)")
    return 0

  print(f"STATUS: FAIL ({len(res.violations)} violation(s) found):")
  for v in res.violations:
    print(f"  - {v.message}")
  return 1


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = argparse.ArgumentParser(
      description="ASD-STE100 Sentence Length, Active Voice & Filler Auditor."
  )
  parser.add_argument("files", nargs="+", type=Path, help="Markdown or JSON file(s) to audit.")
  parser.add_argument(
      "--prose",
      action="store_true",
      help="Also audit untagged prose paragraphs (<=25w/sentence, <=6 sentences/paragraph).",
  )
  parser.add_argument(
      "--check-passive",
      action="store_true",
      help="Flag passive voice constructions (ASD-STE100 Rule 3.6).",
  )
  parser.add_argument(
      "--check-word-tags",
      action="store_true",
      help="Verify that inline [17] or (17w) badges match the exact word count.",
  )
  parser.add_argument(
      "--allow-empty",
      action="store_true",
      help="Do not fail if 0 tagged STE100 sentences are found.",
  )
  parser.add_argument(
      "--json",
      action="store_true",
      help="Emit machine-readable JSON output.",
  )
  args = parser.parse_args(argv)

  exit_code = 0
  for path in args.files:
    rc = audit_file(
        path,
        prose_mode=args.prose,
        check_passive=args.check_passive,
        check_word_tags=args.check_word_tags,
        allow_empty=args.allow_empty,
        json_output=args.json,
    )
    if rc != 0:
      exit_code = rc
  return exit_code


if __name__ == "__main__":
  sys.exit(main())
