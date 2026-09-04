#!/usr/bin/env python3
"""Run the Phase 0 experiment and write a JSON trace.

  python3 run.py --prompt "the cat sat on the mat" --max-new-tokens 6
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from decode import run_experiment
from validate_trace import validate_trace


def main() -> None:
    parser = argparse.ArgumentParser(description="InferTab: why a KV cache exists")
    parser.add_argument("--prompt", default="the cat sat on the mat")
    parser.add_argument("--max-new-tokens", type=int, default=6)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent / "traces" / "sample.json"),
        help="Where to write the JSON trace",
    )
    args = parser.parse_args()

    if args.max_new_tokens < 1 or args.max_new_tokens > 16:
        raise SystemExit("--max-new-tokens must be between 1 and 16 (laptop-friendly)")

    trace = run_experiment(args.prompt, max_new_tokens=args.max_new_tokens, seed=args.seed)
    errors = validate_trace(trace)
    if errors:
        raise SystemExit("trace failed validation:\n  " + "\n  ".join(errors))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(trace, indent=2) + "\n", encoding="utf-8")

    naive = trace["modes"]["naive"]["totals"]
    cached = trace["modes"]["cached"]["totals"]
    print(f"wrote {out}")
    print(f"tokens generated: {trace['equivalence']['generatedTokenIds']['naive']}")
    print(f"outputs match:    {trace['equivalence']['outputsMatch']}")
    print(f"max logit diff:   {trace['equivalence']['maxAbsLogitDiff']:.2e}")
    print(f"naive K/V rows projected: {naive['kvRowsProjected']}   reused: {naive['kvRowsReused']}")
    print(f"cached K/V rows projected:{cached['kvRowsProjected']}   reused: {cached['kvRowsReused']}")
    print(f"peak logical K/V bytes: {cached['peakLogicalKvBytes']}  (payload, not RSS)")
    print(trace["measurementDisclaimer"])


if __name__ == "__main__":
    main()
