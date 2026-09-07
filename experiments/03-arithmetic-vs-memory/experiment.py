"""Arithmetic vs stored data on the same prefill / one-token decode pair.

Experiment 02 showed the square versus the row. This experiment does not
change that mechanism. It asks a different first-principles question:

    Why can an inference step do relatively little new arithmetic and
    still be slow?

We answer by keeping two currencies separate:

1. arithmetic performed (FLOPs under a stated convention)
2. data that must be available (logical tensor payloads)

Only after both are visible do we form their ratio - arithmetic intensity.

This is attention-only, symbolic, and educational. It is not a roofline,
not total Transformer cost, and not measured GPU traffic.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, List

EXPERIMENT_ID = "03-arithmetic-vs-memory"
SCHEMA_VERSION = "0.4.0"

# Same tiny causal model as Experiments 01 and 02.
D_MODEL = 16
N_HEADS = 2
D_HEAD = D_MODEL // N_HEADS
BYTES_PER_FLOAT32 = 4
BYTES_PER_FLOAT16 = 2
SCALING_LENGTHS = (8, 16, 32, 64, 128)

# WHY 2: a fused multiply-add is one multiply plus one add. InferTab counts
# that pair as approximately two floating-point operations. Other writers
# count a MAC as one. The choice is a convention, not a measurement.
FLOPS_PER_MULTIPLY_ADD = 2

FLOP_CONVENTION = (
    "one multiply + one add = approximately 2 FLOPs"
)
FLOP_CONVENTION_WARNING = (
    "Different FLOP-counting conventions exist. InferTab uses "
    "multiply + add = 2 FLOPs. Some references count a multiply-accumulate "
    "as 1. This is a convention for teaching, not a hardware measurement."
)

LOGICAL_BYTES_DENOMINATOR = "qBytes + kBytes + vBytes"
LOGICAL_BYTES_DENOMINATOR_DETAIL = (
    "per-head Q, K, and V payloads that the attention step needs available"
)

MEASUREMENT_DISCLAIMER = (
    "Attention FLOPs here are score calculation plus value aggregation per "
    "head under multiply+add = 2 FLOPs. They are not total Transformer "
    "FLOPs (Q/K/V projections, the output mix, and any FFN are deferred). "
    "Byte counts are logical tensor payloads: elements × bytesPerElement. "
    "They are not measured HBM or DRAM traffic; real hardware movement "
    "depends on caching, tiling, kernel fusion, SRAM/register reuse, and "
    "the implementation. Arithmetic intensity is FLOPs / those logical "
    "bytes - an educational lower-level model of the trade-off, not a "
    "production benchmark and not measured performance. CPU toy timings "
    "cannot establish GPU bottlenecks. No roofline is implemented."
)

NEXT_QUESTION = (
    "Once math and data are visible as two currencies, how would we tell "
    "whether a real machine is waiting on arithmetic or waiting to fetch "
    "the bytes the arithmetic needs?"
)


def matmul_flops(m: int, n: int, k: int) -> int:
    """FLOPs for C[m, n] = A[m, k] × B[k, n].

    WHY 2×m×n×k: each of the m×n outputs is a dot product of length k.
    Each dot-product term is one multiply plus one add ≈ 2 FLOPs.
    """
    if min(m, n, k) < 0:
        raise ValueError("matrix dimensions must be non-negative")
    return FLOPS_PER_MULTIPLY_ADD * m * n * k


def tensor_bytes(elements: int, bytes_per_element: int) -> int:
    """Logical payload of a tensor: elements × bytes per element.

    WHY 'logical': this is the size of the array in the math, not the
    number of bytes a GPU actually moved through HBM.
    """
    if elements < 0 or bytes_per_element < 1:
        raise ValueError("elements must be >= 0 and bytes_per_element >= 1")
    return elements * bytes_per_element


def arithmetic_intensity(flops: int, logical_bytes: int) -> float:
    """How much math we get to perform for each byte we need available."""
    if logical_bytes <= 0:
        raise ValueError("logical byte denominator must be positive")
    return flops / logical_bytes


def format_intensity(flops: int, logical_bytes: int, intensity: float) -> str:
    """Division written with units, e.g. '112 FLOPs / 56 bytes = 2 FLOPs per byte'."""
    rounded = round(intensity, 3)
    if abs(rounded - round(rounded)) < 1e-9:
        shown = str(int(round(rounded)))
    else:
        shown = f"{rounded:.3f}".rstrip("0").rstrip(".")
    return f"{flops} FLOPs / {logical_bytes} bytes = {shown} FLOPs per byte"


def symbolic_attention_depends_on_dtype() -> bool:
    """In this symbolic model, dtype changes payload size, not the algebra."""
    return False


def prefill_attention_flops_per_head(p: int, d_head: int) -> Dict[str, Any]:
    """Attention-only work for one prefill head. Not total model FLOPs.

    Score:  Q[P, d_h] × Kᵀ[d_h, P] → [P, P]   ≈  2 × P × P × d_h
    Value:  A[P, P] × V[P, d_h]     → [P, d_h] ≈  2 × P × P × d_h
    """
    if p < 1 or d_head < 1:
        raise ValueError("P and d_h must be >= 1")
    score = matmul_flops(p, p, d_head)
    value = matmul_flops(p, d_head, p)
    return {
        "score": {
            "shape": "Q[P,d_h] × Kᵀ[d_h,P] → [P,P]",
            "formula": "2 × P × P × d_h",
            "flops": score,
        },
        "value": {
            "shape": "A[P,P] × V[P,d_h] → [P,d_h]",
            "formula": "2 × P × P × d_h",
            "flops": value,
        },
        "attentionFlopsPerHead": score + value,
        "symbolicFormula": "4 × P × P × d_h",
        "unit": "FLOPs",
        "countsWhat": "attention score + value aggregation per head, not total Transformer FLOPs",
    }


def decode_attention_flops_per_head(t: int, d_head: int) -> Dict[str, Any]:
    """Attention-only work for one new decode query against a cache of T.

    Score:  Q_new[1, d_h] × K_cacheᵀ[d_h, T] → [1, T]   ≈  2 × T × d_h
    Value:  A[1, T] × V_cache[T, d_h]        → [1, d_h] ≈  2 × T × d_h
    """
    if t < 1 or d_head < 1:
        raise ValueError("T and d_h must be >= 1")
    score = matmul_flops(1, t, d_head)
    value = matmul_flops(1, d_head, t)
    return {
        "score": {
            "shape": "Q_new[1,d_h] × K_cacheᵀ[d_h,T] → [1,T]",
            "formula": "2 × T × d_h",
            "flops": score,
        },
        "value": {
            "shape": "A[1,T] × V_cache[T,d_h] → [1,d_h]",
            "formula": "2 × T × d_h",
            "flops": value,
        },
        "attentionFlopsPerHead": score + value,
        "symbolicFormula": "4 × T × d_h",
        "unit": "FLOPs",
        "countsWhat": "attention score + value aggregation per head, not total Transformer FLOPs",
    }


def logical_kv_payload_bytes(
    n_tokens: int,
    d_model: int = D_MODEL,
    bytes_per_element: int = BYTES_PER_FLOAT32,
) -> int:
    """Logical cached K/V payload across all heads: tokens × D × 2 × dtype bytes."""
    return tensor_bytes(n_tokens * d_model * 2, bytes_per_element)


def _tensor_payloads(
    n_query: int,
    n_key: int,
    d_head: int,
    bytes_per_element: int,
) -> Dict[str, int]:
    q = tensor_bytes(n_query * d_head, bytes_per_element)
    k = tensor_bytes(n_key * d_head, bytes_per_element)
    v = tensor_bytes(n_key * d_head, bytes_per_element)
    scores = tensor_bytes(n_query * n_key, bytes_per_element)
    output = tensor_bytes(n_query * d_head, bytes_per_element)
    return {
        "qBytes": q,
        "kBytes": k,
        "vBytes": v,
        "scoreBytes": scores,
        "outputBytes": output,
        "logicalBytesConsidered": q + k + v,
        "logicalCachedKvBytesPerHead": k + v,
    }


def account_job(
    job: str,
    n_tokens: int,
    d_head: int = D_HEAD,
    bytes_per_element: int = BYTES_PER_FLOAT32,
    d_model: int = D_MODEL,
) -> Dict[str, Any]:
    """Symbolic arithmetic + logical bytes + intensity for one attention job."""
    if job == "prefill":
        p = n_tokens
        arithmetic = prefill_attention_flops_per_head(p, d_head)
        payloads = _tensor_payloads(p, p, d_head, bytes_per_element)
        length_fields = {"P": p, "T": None}
        cached_tokens = p
    elif job == "decode":
        t = n_tokens
        arithmetic = decode_attention_flops_per_head(t, d_head)
        payloads = _tensor_payloads(1, t, d_head, bytes_per_element)
        length_fields = {"P": None, "T": t}
        cached_tokens = t
    else:
        raise ValueError("job must be 'prefill' or 'decode'")

    flops = arithmetic["attentionFlopsPerHead"]
    considered = payloads["logicalBytesConsidered"]
    intensity = arithmetic_intensity(flops, considered)
    dtype = "float16" if bytes_per_element == BYTES_PER_FLOAT16 else "float32"

    data = {
        **payloads,
        "logicalCachedKvBytes": logical_kv_payload_bytes(
            cached_tokens, d_model, bytes_per_element
        ),
        "bytesPerElement": bytes_per_element,
        "dtype": dtype,
        "unit": "bytes",
        "kind": "logical tensor payloads, not measured hardware traffic",
        "denominator": LOGICAL_BYTES_DENOMINATOR,
        "denominatorDetail": LOGICAL_BYTES_DENOMINATOR_DETAIL,
        "notMeasuredTraffic": True,
    }
    return {
        "job": job,
        **length_fields,
        "dHead": d_head,
        "arithmetic": arithmetic,
        "data": data,
        "intensity": {
            "flops": flops,
            "logicalBytesConsidered": considered,
            "arithmeticIntensity": intensity,
            "unit": "FLOPs per byte",
            "display": format_intensity(flops, considered, intensity),
            "formula": f"attentionFlopsPerHead / ({LOGICAL_BYTES_DENOMINATOR})",
            "meaning": (
                "How much math do we get to perform for each byte of data "
                "we need available?"
            ),
            "educationalModel": True,
            "notAProductionBenchmark": True,
        },
    }


def _load_exp02():
    """Load Experiment 02 without stealing the name `experiment`."""
    path = (
        Path(__file__).resolve().parents[1]
        / "02-prefill-vs-decode"
        / "experiment.py"
    )
    spec = importlib.util.spec_from_file_location("infertab_exp02", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("could not load Experiment 02")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _scaling_row(p: int, d_head: int = D_HEAD) -> Dict[str, Any]:
    t = p + 1
    prefill = account_job("prefill", p, d_head)
    decode = account_job("decode", t, d_head)
    return {
        "P": p,
        "T": t,
        "dHead": d_head,
        "prefill": {
            "attentionFlopsPerHead": prefill["arithmetic"]["attentionFlopsPerHead"],
            "qBytes": prefill["data"]["qBytes"],
            "kBytes": prefill["data"]["kBytes"],
            "vBytes": prefill["data"]["vBytes"],
            "scoreBytes": prefill["data"]["scoreBytes"],
            "outputBytes": prefill["data"]["outputBytes"],
            "logicalBytesConsidered": prefill["data"]["logicalBytesConsidered"],
            "logicalCachedKvBytes": prefill["data"]["logicalCachedKvBytes"],
            "arithmeticIntensity": prefill["intensity"]["arithmeticIntensity"],
            "intensityDisplay": prefill["intensity"]["display"],
            "symbolicFormula": prefill["arithmetic"]["symbolicFormula"],
            "unitFlops": "FLOPs",
            "unitBytes": "bytes",
            "unitIntensity": "FLOPs per byte",
        },
        "decode": {
            "attentionFlopsPerHead": decode["arithmetic"]["attentionFlopsPerHead"],
            "qBytes": decode["data"]["qBytes"],
            "kBytes": decode["data"]["kBytes"],
            "vBytes": decode["data"]["vBytes"],
            "scoreBytes": decode["data"]["scoreBytes"],
            "outputBytes": decode["data"]["outputBytes"],
            "logicalBytesConsidered": decode["data"]["logicalBytesConsidered"],
            "logicalCachedKvBytes": decode["data"]["logicalCachedKvBytes"],
            "arithmeticIntensity": decode["intensity"]["arithmeticIntensity"],
            "intensityDisplay": decode["intensity"]["display"],
            "symbolicFormula": decode["arithmetic"]["symbolicFormula"],
            "unitFlops": "FLOPs",
            "unitBytes": "bytes",
            "unitIntensity": "FLOPs per byte",
        },
    }


def dtype_comparison(p: int, t: int, d_head: int = D_HEAD) -> Dict[str, Any]:
    """Same algebra, half the logical bytes when float32 becomes float16."""
    out: Dict[str, Any] = {
        "symbolicAttentionOutputUnchanged": not symbolic_attention_depends_on_dtype(),
        "flopsUnchanged": True,
        "note": (
            "Changing float32 → float16 halves every logical tensor payload "
            "because each element occupies 2 bytes instead of 4. The "
            "symbolic attention formulas and FLOP counts do not change. "
            "This model does not claim a different numerical attention "
            "output."
        ),
    }
    for name, bpe in (("float32", BYTES_PER_FLOAT32), ("float16", BYTES_PER_FLOAT16)):
        pre = account_job("prefill", p, d_head, bpe)
        dec = account_job("decode", t, d_head, bpe)
        out[name] = {
            "bytesPerElement": bpe,
            "prefill": {
                "attentionFlopsPerHead": pre["arithmetic"]["attentionFlopsPerHead"],
                "logicalBytesConsidered": pre["data"]["logicalBytesConsidered"],
                "qBytes": pre["data"]["qBytes"],
                "kBytes": pre["data"]["kBytes"],
                "vBytes": pre["data"]["vBytes"],
                "logicalCachedKvBytes": pre["data"]["logicalCachedKvBytes"],
                "arithmeticIntensity": pre["intensity"]["arithmeticIntensity"],
            },
            "decode": {
                "attentionFlopsPerHead": dec["arithmetic"]["attentionFlopsPerHead"],
                "logicalBytesConsidered": dec["data"]["logicalBytesConsidered"],
                "qBytes": dec["data"]["qBytes"],
                "kBytes": dec["data"]["kBytes"],
                "vBytes": dec["data"]["vBytes"],
                "logicalCachedKvBytes": dec["data"]["logicalCachedKvBytes"],
                "arithmeticIntensity": dec["intensity"]["arithmeticIntensity"],
            },
        }
    return out


def run_experiment(prompt_length: int = 8, seed: int = 42) -> Dict[str, Any]:
    """Reuse Experiment 02's prefill + one decode, then add symbolic accounting."""
    if prompt_length < 1:
        raise ValueError("prompt length must be at least 1")

    exp02 = _load_exp02()
    pair = exp02.run_pair(prompt_length, seed)
    p = prompt_length
    t = p + 1

    prefill = account_job("prefill", p)
    decode = account_job("decode", t)
    prefill["shapes"] = pair["prefill"]["shapes"]
    decode["shapes"] = pair["decode"]["shapes"]

    scaling: List[Dict[str, Any]] = [_scaling_row(length) for length in SCALING_LENGTHS]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "experimentId": EXPERIMENT_ID,
        "prompt": pair["prompt"],
        "promptTokens": pair["promptTokens"],
        "config": {
            "dModel": D_MODEL,
            "nHeads": N_HEADS,
            "dHead": D_HEAD,
            "nLayers": 1,
            "vocabSize": pair["config"]["vocabSize"],
            "seed": seed,
            "device": "cpu",
            "maxPos": pair["config"]["maxPos"],
            "promptLength": p,
            "decodeSteps": 1,
            "bytesPerElement": BYTES_PER_FLOAT32,
            "dtype": "float32",
            "flopConvention": FLOP_CONVENTION,
            "logicalBytesDenominator": LOGICAL_BYTES_DENOMINATOR,
        },
        "flopConvention": {
            "statement": FLOP_CONVENTION,
            "warning": FLOP_CONVENTION_WARNING,
            "countsWhat": "attention score + value aggregation per head",
            "notTotalTransformerFlops": True,
        },
        "units": {
            "arithmetic": "FLOPs",
            "logicalPayload": "bytes",
            "arithmeticIntensity": "FLOPs per byte",
        },
        "prefill": prefill,
        "decode": decode,
        "dtypeComparison": dtype_comparison(p, t),
        "scaling": scaling,
        "sourcePair": {
            "experimentId": "02-prefill-vs-decode",
            "prefillShapes": pair["prefill"]["shapes"],
            "decodeShapes": pair["decode"]["shapes"],
            "equivalence": pair["equivalence"],
        },
        "caveats": {
            "attentionFlopsAreNotTotalModelFlops": True,
            "logicalBytesAreNotPhysicalMemoryTraffic": True,
            "arithmeticIntensityIsNotMeasuredPerformance": True,
            "cpuToyTimingsCannotEstablishGpuBottlenecks": True,
            "ffnProjectionAndWeightMovementDeferred": True,
            "rooflineNotImplemented": True,
        },
        "measurementDisclaimer": MEASUREMENT_DISCLAIMER,
        "nextQuestion": NEXT_QUESTION,
    }
