"""Validate an arithmetic-vs-memory trace without extra deps."""

from __future__ import annotations

import json
import re
from typing import Any, List

TRAFFIC_CLAIM_LEAF = re.compile(
    r"^(hbm|dram)(traffic|bytes|bandwidth)$|^(measured)(hbm|dram|traffic|bandwidth)$",
    re.I,
)

REQUIRED_CAVEATS = (
    "attentionFlopsAreNotTotalModelFlops",
    "logicalBytesAreNotPhysicalMemoryTraffic",
    "arithmeticIntensityIsNotMeasuredPerformance",
    "cpuToyTimingsCannotEstablishGpuBottlenecks",
    "ffnProjectionAndWeightMovementDeferred",
    "rooflineNotImplemented",
)


def _walk_keys(value: Any, prefix: str = "") -> List[str]:
    keys: List[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            keys.append(path)
            keys.extend(_walk_keys(child, path))
    elif isinstance(value, list):
        for i, child in enumerate(value):
            keys.extend(_walk_keys(child, f"{prefix}[{i}]"))
    return keys


def validate_trace(trace: Any) -> List[str]:
    errors: List[str] = []
    if not isinstance(trace, dict):
        return ["trace must be an object"]
    if trace.get("schemaVersion") != "0.4.0":
        errors.append("schemaVersion must be 0.4.0")
    if trace.get("experimentId") != "03-arithmetic-vs-memory":
        errors.append("experimentId must be 03-arithmetic-vs-memory")

    for key in ("prompt", "measurementDisclaimer", "nextQuestion"):
        if not isinstance(trace.get(key), str) or not trace[key]:
            errors.append(f"{key} must be a non-empty string")

    convention = trace.get("flopConvention")
    if not isinstance(convention, dict):
        errors.append("flopConvention is required")
    else:
        warning = convention.get("warning")
        if not isinstance(warning, str) or "Different FLOP-counting conventions" not in warning:
            errors.append("flopConvention.warning must mention differing conventions")
        if not isinstance(convention.get("statement"), str) or "2 FLOPs" not in convention["statement"]:
            errors.append("flopConvention.statement must use multiply + add = 2 FLOPs")

    units = trace.get("units")
    if not isinstance(units, dict):
        errors.append("units is required")
    else:
        if units.get("arithmetic") != "FLOPs":
            errors.append("units.arithmetic must be FLOPs")
        if units.get("logicalPayload") != "bytes":
            errors.append("units.logicalPayload must be bytes")
        if units.get("arithmeticIntensity") != "FLOPs per byte":
            errors.append("units.arithmeticIntensity must be FLOPs per byte")

    errors.extend(_validate_job(trace.get("prefill"), "prefill"))
    errors.extend(_validate_job(trace.get("decode"), "decode"))

    caveats = trace.get("caveats")
    if not isinstance(caveats, dict):
        errors.append("caveats is required")
    else:
        for key in REQUIRED_CAVEATS:
            if caveats.get(key) is not True:
                errors.append(f"caveats.{key} must be true")

    scaling = trace.get("scaling")
    if not isinstance(scaling, list) or len(scaling) < 1:
        errors.append("scaling must be a non-empty list")

    dtype = trace.get("dtypeComparison")
    if not isinstance(dtype, dict) or dtype.get("symbolicAttentionOutputUnchanged") is not True:
        errors.append("dtypeComparison.symbolicAttentionOutputUnchanged must be true")

    for path in _walk_keys(trace):
        leaf = path.rsplit(".", 1)[-1]
        if TRAFFIC_CLAIM_LEAF.match(leaf):
            errors.append(f"trace field claims measured traffic: {path}")

    disclaimer = trace.get("measurementDisclaimer") or ""
    lowered = disclaimer.lower()
    if "hbm" in lowered and "not" not in lowered:
        errors.append("disclaimer must not claim measured HBM traffic")
    return errors


def _validate_job(job: Any, name: str) -> List[str]:
    if not isinstance(job, dict):
        return [f"{name} is required"]
    errors: List[str] = []
    arithmetic = job.get("arithmetic")
    data = job.get("data")
    intensity = job.get("intensity")
    if not isinstance(arithmetic, dict):
        errors.append(f"{name}.arithmetic is required")
        return errors
    if not isinstance(data, dict):
        errors.append(f"{name}.data is required")
        return errors
    if not isinstance(intensity, dict):
        errors.append(f"{name}.intensity is required")
        return errors

    if arithmetic.get("unit") != "FLOPs":
        errors.append(f"{name}.arithmetic.unit must be FLOPs")
    if data.get("unit") != "bytes":
        errors.append(f"{name}.data.unit must be bytes")
    if intensity.get("unit") != "FLOPs per byte":
        errors.append(f"{name}.intensity.unit must be FLOPs per byte")
    if data.get("notMeasuredTraffic") is not True:
        errors.append(f"{name}.data.notMeasuredTraffic must be true")
    if intensity.get("notAProductionBenchmark") is not True:
        errors.append(f"{name}.intensity.notAProductionBenchmark must be true")

    flops = arithmetic.get("attentionFlopsPerHead")
    considered = data.get("logicalBytesConsidered")
    shown = intensity.get("arithmeticIntensity")
    if isinstance(flops, int) and isinstance(considered, int) and isinstance(shown, (int, float)):
        expected = flops / considered
        if abs(shown - expected) > 1e-12:
            errors.append(f"{name} arithmetic intensity must equal FLOPs / logical bytes")
        display = intensity.get("display")
        if not isinstance(display, str) or "FLOPs" not in display or "bytes" not in display:
            errors.append(f"{name}.intensity.display must include FLOPs and bytes")
        if not isinstance(display, str) or "FLOPs per byte" not in display:
            errors.append(f"{name}.intensity.display must include FLOPs per byte")
    else:
        errors.append(f"{name} FLOPs, bytes, and intensity must be numeric")

    for key in ("qBytes", "kBytes", "vBytes", "scoreBytes", "outputBytes", "logicalCachedKvBytes"):
        if not isinstance(data.get(key), int):
            errors.append(f"{name}.data.{key} must be an integer")
    return errors


def load_and_validate(path: str) -> List[str]:
    with open(path, encoding="utf-8") as f:
        return validate_trace(json.load(f))


if __name__ == "__main__":
    import sys

    target = sys.argv[1] if len(sys.argv) > 1 else "traces/sample-p8.json"
    found = load_and_validate(target)
    if found:
        print("INVALID")
        for err in found:
            print(" -", err)
        sys.exit(1)
    print("valid:", target)
