"""Validate an InferTab trace without extra Python dependencies."""

from __future__ import annotations

import json
from typing import Any, List


def validate_trace(trace: Any) -> List[str]:
    errors: List[str] = []
    if not isinstance(trace, dict):
        return ["trace must be an object"]

    if trace.get("schemaVersion") != "0.1.0":
        errors.append("schemaVersion must be 0.1.0")
    for key in ("experimentId", "prompt", "measurementDisclaimer"):
        if not isinstance(trace.get(key), str) or not trace[key]:
            errors.append(f"{key} must be a non-empty string")

    tokens = trace.get("promptTokens")
    if not isinstance(tokens, list) or not all(_is_token(t) for t in tokens):
        errors.append("promptTokens is invalid")

    config = trace.get("config")
    if not isinstance(config, dict):
        errors.append("config is required")
    else:
        for key in ("dModel", "nHeads", "nLayers", "vocabSize", "maxNewTokens", "seed"):
            if not isinstance(config.get(key), int):
                errors.append(f"config.{key} must be an integer")

    modes = trace.get("modes")
    if not isinstance(modes, dict):
        errors.append("modes is required")
    else:
        for name in ("naive", "cached"):
            errors.extend(_validate_mode(modes.get(name), name))

    eq = trace.get("equivalence")
    if not isinstance(eq, dict) or not isinstance(eq.get("outputsMatch"), bool):
        errors.append("equivalence.outputsMatch is required")

    return errors


def _is_token(value: Any) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("id"), int)
        and isinstance(value.get("text"), str)
        and isinstance(value.get("position"), int)
    )


def _is_block(value: Any) -> bool:
    return (
        _is_token(value)
        and isinstance(value.get("kNorm"), (int, float))
        and isinstance(value.get("vNorm"), (int, float))
        and isinstance(value.get("kPreview"), list)
        and isinstance(value.get("vPreview"), list)
    )


def _validate_mode(mode: Any, name: str) -> List[str]:
    if not isinstance(mode, dict):
        return [f"modes.{name} is required"]
    errors: List[str] = []
    if mode.get("id") != name:
        errors.append(f"modes.{name}.id must be '{name}'")
    steps = mode.get("steps")
    if not isinstance(steps, list) or not steps:
        errors.append(f"modes.{name}.steps must be a non-empty list")
        return errors
    for i, step in enumerate(steps):
        prefix = f"modes.{name}.steps[{i}]"
        if not isinstance(step, dict):
            errors.append(f"{prefix} must be an object")
            continue
        for key in ("newlyComputed", "reused", "inputTokens"):
            items = step.get(key)
            checker = _is_block if key != "inputTokens" else _is_token
            if not isinstance(items, list) or not all(checker(x) for x in items):
                errors.append(f"{prefix}.{key} is invalid")
        for key in ("recomputedOps", "reusedOps", "cacheSizeTokens", "cacheBytes"):
            if not isinstance(step.get(key), int):
                errors.append(f"{prefix}.{key} must be an integer")
        if not _is_token(step.get("generatedToken")):
            errors.append(f"{prefix}.generatedToken is invalid")
    return errors


def load_and_validate(path: str) -> List[str]:
    with open(path, encoding="utf-8") as f:
        return validate_trace(json.load(f))


if __name__ == "__main__":
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "traces/sample.json"
    found = load_and_validate(target)
    if found:
        print("INVALID")
        for err in found:
            print(" -", err)
        sys.exit(1)
    print("valid:", target)
