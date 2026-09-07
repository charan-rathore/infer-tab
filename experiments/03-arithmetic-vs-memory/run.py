#!/usr/bin/env python3
"""Run arithmetic vs memory accounting and write a JSON trace.

  python3 run.py --prompt-length 8
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from experiment import SCALING_LENGTHS, run_experiment
from validate_trace import validate_trace


def main() -> None:
    parser = argparse.ArgumentParser(description="InferTab: arithmetic vs memory")
    parser.add_argument(
        "--prompt-length",
        type=int,
        default=8,
        choices=list(SCALING_LENGTHS),
    )
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--out",
        default=str(Path(__file__).resolve().parent / "traces" / "sample-p8.json"),
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
    print(f"P={trace['config']['promptLength']} T={dec['T']} d_h={trace['config']['dHead']}")
    print(f"prefill {pre['intensity']['display']}")
    print(f"decode  {dec['intensity']['display']}")
    print("scaling P:", [row["P"] for row in trace["scaling"]])
    print(trace["flopConvention"]["warning"])
    print(trace["measurementDisclaimer"])


if __name__ == "__main__":
    main()
