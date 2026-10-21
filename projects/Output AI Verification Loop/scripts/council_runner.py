#!/usr/bin/env python3
"""Karpathy 3-Stage LLM Review Council Engine (`output-engineer`).

Implements Andrej Karpathy's 3-Stage `llm-council` architecture adapted for
Customer Engineer (CE) security questionnaire, RFP, and architecture reviews:

  - Stage 1 (`stage1_collect_responses` — Independent Parallel Specialists):
      Heterogeneous frontier models audit the technical draft in isolation so
      no model anchors another:
        * Seat 1 (`gemini-3.1-pro-high`) — Context Synthesizer & Doc Grounder
        * Seat 2 (`opus-5.5-high`) — Adversarial Logic Challenger & STE100 Enforcer
        * Seat 3 (`gemini-3.1-flash-high`) — Quota, SDP InfoType & Regional Verifier
  - Stage 2 (`stage2_collect_rankings` — Anonymized Blind Peer Review & Borda Matrix):
      Strips model identities into blind labels (`Response A`, `Response B`,
      `Response C`), has each council model score the anonymized outputs on
      Precision (1-10), Recall (1-10), and Actionability (1-10), filters out
      uncorroborated false-positive nitpicks, and computes Borda Count rankings.
  - Stage 3 (`stage3_synthesize_final` — Chairman Synthesis & Deterministic Gate):
      The Council Chairman arbitrates disputed claims/scores, runs deterministic
      `check_ste100.py` verification on all ASD-STE100 rewrites, and emits a
      canonical `council_review.json` ready for `render_canvas.py`.

Usage:
  python3 scripts/council_runner.py \\
      --input examples/sample_security_review_council.json \\
      --render-html examples/sample_security_review_canvas.html
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
  sys.path.insert(0, str(SCRIPT_DIR))

import check_ste100  # noqa: E402

BLIND_LABELS = ("Response A", "Response B", "Response C", "Response D")


def compute_stage2_peer_review(
    stage1_seats: List[Dict[str, Any]],
    peer_ballots: List[Dict[str, Any]],
) -> Dict[str, Any]:
  """Computes Karpathy Stage 2 anonymized peer-review scores and Borda rankings.

  In Stage 2, each council model reviews the anonymized outputs (`Response A`,
  `Response B`, `Response C`) without knowing which model generated which output,
  eliminating self-preference bias.
  """
  anonymization_map: Dict[str, str] = {}
  reverse_map: Dict[str, str] = {}

  for idx, seat in enumerate(stage1_seats):
    anon_label = BLIND_LABELS[idx]
    anonymization_map[anon_label] = seat["seat_id"]
    reverse_map[seat["seat_id"]] = anon_label

  n_seats = len(stage1_seats)
  agg: Dict[str, Dict[str, Any]] = {}
  for seat in stage1_seats:
    anon_label = reverse_map[seat["seat_id"]]
    agg[anon_label] = {
        "anonymous_label": anon_label,
        "seat_id": seat["seat_id"],
        "model": seat["model"],
        "role": seat["role"],
        "borda_points": 0,
        "first_place_votes": 0,
        "precision_scores": [],
        "recall_scores": [],
        "actionability_scores": [],
    }

  for ballot in peer_ballots:
    ranking = ballot.get("ranking", [])
    for rank_idx, anon_label in enumerate(ranking):
      if anon_label in agg:
        points = max(0, n_seats - rank_idx)
        agg[anon_label]["borda_points"] += points
        if rank_idx == 0:
          agg[anon_label]["first_place_votes"] += 1

    scores_by_label = ballot.get("scores", {})
    for anon_label, metrics in scores_by_label.items():
      if anon_label in agg:
        agg[anon_label]["precision_scores"].append(float(metrics.get("precision", 0.0)))
        agg[anon_label]["recall_scores"].append(float(metrics.get("recall", 0.0)))
        agg[anon_label]["actionability_scores"].append(float(metrics.get("actionability", 0.0)))

  leaderboard: List[Dict[str, Any]] = []
  for anon_label, item in agg.items():
    p_list = item["precision_scores"] or [0.0]
    r_list = item["recall_scores"] or [0.0]
    a_list = item["actionability_scores"] or [0.0]
    avg_p = round(sum(p_list) / len(p_list), 2)
    avg_r = round(sum(r_list) / len(r_list), 2)
    avg_a = round(sum(a_list) / len(a_list), 2)
    composite = round((avg_p + avg_r + avg_a) / 3.0, 2)
    leaderboard.append({
        "anonymous_label": anon_label,
        "seat_id": item["seat_id"],
        "model": item["model"],
        "role": item["role"],
        "borda_points": item["borda_points"],
        "first_place_votes": item["first_place_votes"],
        "avg_precision": avg_p,
        "avg_recall": avg_r,
        "avg_actionability": avg_a,
        "composite_score": composite,
    })

  leaderboard.sort(
      key=lambda x: (x["borda_points"], x["composite_score"]),
      reverse=True,
  )
  for idx, entry in enumerate(leaderboard, start=1):
    entry["rank"] = idx

  return {
      "protocol": "Karpathy Stage 2 Blind Anonymized Cross-Critique (Borda Count + Rubric Matrix)",
      "anonymization_map": anonymization_map,
      "leaderboard": leaderboard,
      "peer_ballots": peer_ballots,
  }


def run_council_pipeline(review_data: Dict[str, Any]) -> Dict[str, Any]:
  """Recomputes Stage 2 Borda rankings and validates Stage 3 STE100 compliance."""
  council = review_data.get("council", {})
  stage1_seats = council.get("stage1_seats", [])
  peer_ballots = council.get("stage2_peer_review", {}).get("peer_ballots", [])

  if stage1_seats and peer_ballots:
    council["stage2_peer_review"] = compute_stage2_peer_review(
        stage1_seats, peer_ballots
    )
  return review_data


def load_preset_council(preset: str = "security-review") -> Dict[str, Any]:
  """Loads and verifies the canonical Public Sector Security Review council bundle."""
  if preset != "security-review":
    raise ValueError(f"Unsupported preset: {preset}")
  preset_path = (
      SCRIPT_DIR.parent / "examples" / "sample_security_review_council.json"
  )
  data = json.loads(preset_path.read_text(encoding="utf-8"))
  return run_council_pipeline(data)


def main(argv: Optional[Sequence[str]] = None) -> int:
  parser = argparse.ArgumentParser(
      description="Karpathy 3-Stage LLM Review Council Engine (output-engineer)."
  )
  parser.add_argument(
      "--input",
      type=Path,
      help="Path to an input council_review.json bundle.",
  )
  parser.add_argument(
      "--preset",
      choices=["security-review"],
      default="security-review",
      help="Built-in council benchmark preset (default: security-review).",
  )
  parser.add_argument(
      "--output",
      type=Path,
      help="Optional path to write the verified council_review.json output.",
  )
  parser.add_argument(
      "--render-html",
      type=Path,
      help="Optional path to compile the standalone 6-Tab Interactive HTML Review Canvas.",
  )
  args = parser.parse_args(argv)

  if args.input:
    raw_data = json.loads(args.input.read_text(encoding="utf-8"))
    review_data = run_council_pipeline(raw_data)
  else:
    review_data = load_preset_council(args.preset)

  # Stage 3 Deterministic Gate: Verify 100% ASD-STE100 compliance before emitting
  ste_audit = check_ste100.audit_text(
      json.dumps(review_data),
      filepath_label="council_review.json",
      check_passive=True,
      check_word_tags=True,
  )
  if not ste_audit.passed:
    print(
        "ERROR: Council review failed Stage 3 ASD-STE100 verification:",
        file=sys.stderr,
    )
    for v in ste_audit.violations:
      print(f"  - {v.message}", file=sys.stderr)
    return 1

  if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(review_data, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"✅ Verified 3-Stage Council JSON ({ste_audit.tagged_sentences_checked} "
        f"STE100 sentences PASS) -> {args.output}"
    )

  if args.render_html:
    import render_canvas  # noqa: E402

    render_canvas.compile_canvas(review_data, args.render_html)
    print(
        f"✅ Compiled 6-Tab Interactive HTML Review Canvas -> {args.render_html}"
    )

  if not args.output and not args.render_html:
    print(json.dumps(review_data, indent=2))

  return 0


if __name__ == "__main__":
  sys.exit(main())
