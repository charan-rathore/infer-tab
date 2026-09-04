#!/usr/bin/env python3
"""Run prefill vs decode and write a JSON trace.

  python3 run.py --prompt-length 6
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from experiment import SCALING_LENGTHS, run_experiment
from validate_trace import validate_trace


def main() -> None:
    parser = argparse.ArgumentParser(description="InferTab: prefill vs decode")
    parser.add_argument("--prompt-length", type=int, default=6, choices=list(SCALING_LENGTHS))
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent / "traces" / "sample-p6.json"),
    )
    args = parser.parse_args()

    trace = run_experiment(args.prompt_length, seed=args.seed)
    errors = validate_trace(trace)
    if errors:
        raise SystemExit("trace failed validation:\n  " + "\n  ".join(errors))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(trace, indent=2) + "\n", encoding="utf-8")

    pre = trace["prefill"]
    dec = trace["decode"]
    print(f"wrote {out}")
    print(f"P={trace['config']['promptLength']}")
    print(f"prefill shapes: {pre['shapes']}")
    print(f"decode  shapes: {dec['shapes']}")
    print(
        f"score cells/head  prefill={pre['attentionScoreElementsPerHead']}  "
        f"decode={dec['attentionScoreElementsPerHead']}"
    )
    print(f"equivalence: {trace['equivalence']}")
    print("scaling P:", [row["promptLength"] for row in trace["scaling"]])
    print(trace["measurementDisclaimer"])


if __name__ == "__main__":
    main()
