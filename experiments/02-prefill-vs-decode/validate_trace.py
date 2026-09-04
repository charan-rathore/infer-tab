"""Validate a Phase 1 (prefill vs decode) trace without extra deps."""

from __future__ import annotations

import json
from typing import Any, List


SHAPE_KEYS_PREFILL = ("X", "Q", "K", "V", "scoresPerHead")
SHAPE_KEYS_DECODE = ("Q_new", "K_new", "V_new", "K_cache", "V_cache", "scoresPerHead")
STAGE_INTS = (
    "inputTokenCount",
    "qRowsProjected",
    "kRowsProjected",
    "vRowsProjected",
    "attentionScoreElementsPerHead",
    "attentionScoreElementsTotal",
    "logicalKvBytesWritten",
    "logicalKvBytesAvailable",
)


def validate_trace(trace: Any) -> List[str]:
    errors: List[str] = []
    if not isinstance(trace, dict):
        return ["trace must be an object"]
    if trace.get("schemaVersion") != "0.3.0":
        errors.append("schemaVersion must be 0.3.0")
    if trace.get("experimentId") != "02-prefill-vs-decode":
        errors.append("experimentId must be 02-prefill-vs-decode")
    for key in ("prompt", "measurementDisclaimer"):
        if not isinstance(trace.get(key), str) or not trace[key]:
            errors.append(f"{key} must be a non-empty string")
    errors.extend(_validate_stage(trace.get("prefill"), "prefill", SHAPE_KEYS_PREFILL))
    errors.extend(_validate_stage(trace.get("decode"), "decode", SHAPE_KEYS_DECODE))
    if not isinstance(trace.get("decode"), dict) or not isinstance(
        trace["decode"].get("newTokenPosition"), int
    ):
        errors.append("decode.newTokenPosition must be an integer")
    eq = trace.get("equivalence")
    if not isinstance(eq, dict) or not isinstance(eq.get("cachedMatchesFullRecompute"), bool):
        errors.append("equivalence.cachedMatchesFullRecompute is required")
    scaling = trace.get("scaling")
    if not isinstance(scaling, list) or len(scaling) < 1:
        errors.append("scaling must be a non-empty list")
    return errors


def _validate_stage(stage: Any, name: str, shape_keys: tuple) -> List[str]:
    if not isinstance(stage, dict):
        return [f"{name} is required"]
    errors: List[str] = []
    for key in STAGE_INTS:
        if not isinstance(stage.get(key), int):
            errors.append(f"{name}.{key} must be an integer")
    shapes = stage.get("shapes")
    if not isinstance(shapes, dict):
        errors.append(f"{name}.shapes is required")
    else:
        for key in shape_keys:
            if not isinstance(shapes.get(key), list) or len(shapes[key]) != 2:
                errors.append(f"{name}.shapes.{key} must be [rows, cols]")
    if not isinstance(stage.get("elapsedMs"), (int, float)):
        errors.append(f"{name}.elapsedMs must be a number")
    return errors


def load_and_validate(path: str) -> List[str]:
    with open(path, encoding="utf-8") as f:
        return validate_trace(json.load(f))


if __name__ == "__main__":
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "traces/sample-p6.json"
    found = load_and_validate(target)
    if found:
        print("INVALID")
        for err in found:
            print(" -", err)
        sys.exit(1)
    print("valid:", target)
