from __future__ import annotations

import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
sys.path.insert(0, str(ROOT))

from experiment import (  # noqa: E402
    BYTES_PER_FLOAT16,
    BYTES_PER_FLOAT32,
    D_HEAD,
    D_MODEL,
    FLOP_CONVENTION_WARNING,
    SCALING_LENGTHS,
    account_job,
    arithmetic_intensity,
    decode_attention_flops_per_head,
    dtype_comparison,
    format_intensity,
    logical_kv_payload_bytes,
    matmul_flops,
    prefill_attention_flops_per_head,
    run_experiment,
    symbolic_attention_depends_on_dtype,
    tensor_bytes,
)
from validate_trace import load_and_validate, validate_trace  # noqa: E402

SAMPLE = ROOT / "traces" / "sample-p8.json"
README = (ROOT / "README.md").read_text(encoding="utf-8")


def test_matmul_flop_formula_tiny_shapes():
    # C[2, 4] = A[2, 3] × B[3, 4] → 2 × 2 × 4 × 3 = 48
    assert matmul_flops(2, 4, 3) == 48
    # C[1, 1] = A[1, 1] × B[1, 1] → 2
    assert matmul_flops(1, 1, 1) == 2
    # Prefill scores Q[8, 8] × Kᵀ[8, 8]
    assert matmul_flops(8, 8, 8) == 2 * 8 * 8 * 8 == 1024
    # Decode scores Q[1, 8] × Kᵀ[8, 9]
    assert matmul_flops(1, 9, 8) == 2 * 9 * 8 == 144


def test_bytes_are_elements_times_dtype_bytes():
    assert tensor_bytes(8 * 8, 4) == 256
    assert tensor_bytes(8 * 8, 2) == 128
    assert tensor_bytes(0, 4) == 0
    assert logical_kv_payload_bytes(8, D_MODEL, 4) == 8 * 16 * 2 * 4 == 1024


def test_units_remain_explicit_and_correct():
    pre = account_job("prefill", 8)
    dec = account_job("decode", 9)
    assert pre["arithmetic"]["unit"] == "FLOPs"
    assert dec["arithmetic"]["unit"] == "FLOPs"
    assert pre["data"]["unit"] == "bytes"
    assert dec["data"]["unit"] == "bytes"
    assert pre["intensity"]["unit"] == "FLOPs per byte"
    assert dec["intensity"]["unit"] == "FLOPs per byte"
    for job in (pre, dec):
        display = job["intensity"]["display"]
        assert "FLOPs /" in display
        assert "bytes =" in display
        assert display.endswith("FLOPs per byte")
    assert format_intensity(112, 56, 2.0) == "112 FLOPs / 56 bytes = 2 FLOPs per byte"


def test_prefill_attention_flops_scale_with_p_squared():
    d_h = D_HEAD
    for p in (1, 8, 16, 32, 64, 128):
        rec = prefill_attention_flops_per_head(p, d_h)
        assert rec["score"]["flops"] == 2 * p * p * d_h
        assert rec["value"]["flops"] == 2 * p * p * d_h
        assert rec["attentionFlopsPerHead"] == 4 * p * p * d_h
        assert rec["symbolicFormula"] == "4 × P × P × d_h"
    eight = prefill_attention_flops_per_head(8, d_h)["attentionFlopsPerHead"]
    sixteen = prefill_attention_flops_per_head(16, d_h)["attentionFlopsPerHead"]
    assert sixteen / eight == (16 * 16) / (8 * 8) == 4


def test_decode_attention_flops_scale_with_t():
    d_h = D_HEAD
    for t in (1, 2, 9, 17, 33, 65, 129):
        rec = decode_attention_flops_per_head(t, d_h)
        assert rec["score"]["flops"] == 2 * t * d_h
        assert rec["value"]["flops"] == 2 * t * d_h
        assert rec["attentionFlopsPerHead"] == 4 * t * d_h
        assert rec["symbolicFormula"] == "4 × T × d_h"
    a = decode_attention_flops_per_head(9, d_h)["attentionFlopsPerHead"]
    b = decode_attention_flops_per_head(18, d_h)["attentionFlopsPerHead"]
    assert b / a == 2


def test_kv_logical_payload_scales_linearly_with_t():
    for t in (1, 8, 9, 16, 32, 64, 128, 129):
        assert logical_kv_payload_bytes(t) == t * D_MODEL * 2 * BYTES_PER_FLOAT32
        rec = account_job("decode", t)
        assert rec["data"]["logicalCachedKvBytes"] == logical_kv_payload_bytes(t)
        assert rec["data"]["kBytes"] + rec["data"]["vBytes"] == 2 * t * D_HEAD * 4
    assert logical_kv_payload_bytes(16) == 2 * logical_kv_payload_bytes(8)


def test_float16_halves_bytes_not_symbolic_attention():
    p, t = 8, 9
    f32 = dtype_comparison(p, t)
    assert f32["symbolicAttentionOutputUnchanged"] is True
    assert f32["flopsUnchanged"] is True
    assert symbolic_attention_depends_on_dtype() is False

    pre32 = account_job("prefill", p, bytes_per_element=BYTES_PER_FLOAT32)
    pre16 = account_job("prefill", p, bytes_per_element=BYTES_PER_FLOAT16)
    dec32 = account_job("decode", t, bytes_per_element=BYTES_PER_FLOAT32)
    dec16 = account_job("decode", t, bytes_per_element=BYTES_PER_FLOAT16)

    assert pre16["data"]["logicalBytesConsidered"] == pre32["data"]["logicalBytesConsidered"] // 2
    assert dec16["data"]["logicalBytesConsidered"] == dec32["data"]["logicalBytesConsidered"] // 2
    assert pre16["data"]["logicalCachedKvBytes"] == pre32["data"]["logicalCachedKvBytes"] // 2
    for key in ("qBytes", "kBytes", "vBytes", "scoreBytes", "outputBytes"):
        assert pre16["data"][key] == pre32["data"][key] // 2
        assert dec16["data"][key] == dec32["data"][key] // 2

    assert pre16["arithmetic"]["attentionFlopsPerHead"] == pre32["arithmetic"]["attentionFlopsPerHead"]
    assert dec16["arithmetic"]["attentionFlopsPerHead"] == dec32["arithmetic"]["attentionFlopsPerHead"]
    assert pre16["arithmetic"]["symbolicFormula"] == pre32["arithmetic"]["symbolicFormula"]
    assert dec16["arithmetic"]["score"]["shape"] == dec32["arithmetic"]["score"]["shape"]
    assert f32["float16"]["prefill"]["attentionFlopsPerHead"] == f32["float32"]["prefill"]["attentionFlopsPerHead"]
    assert f32["float16"]["prefill"]["logicalBytesConsidered"] * 2 == f32["float32"]["prefill"]["logicalBytesConsidered"]


def test_arithmetic_intensity_is_flops_over_chosen_bytes():
    for job, n in (("prefill", 8), ("decode", 9), ("prefill", 1), ("decode", 2)):
        rec = account_job(job, n)
        flops = rec["arithmetic"]["attentionFlopsPerHead"]
        considered = rec["data"]["logicalBytesConsidered"]
        assert considered == rec["data"]["qBytes"] + rec["data"]["kBytes"] + rec["data"]["vBytes"]
        assert rec["intensity"]["arithmeticIntensity"] == arithmetic_intensity(flops, considered)
        assert rec["intensity"]["arithmeticIntensity"] == flops / considered
        assert rec["intensity"]["logicalBytesConsidered"] == considered
        assert rec["data"]["denominator"] == "qBytes + kBytes + vBytes"


def test_no_trace_field_claims_measured_hbm_or_dram():
    trace = run_experiment(8, seed=42)
    assert validate_trace(trace) == []
    blob = json.dumps(trace)
    for banned in ("hbmTraffic", "dramTraffic", "measuredHbm", "measuredDram", "measuredBandwidth"):
        assert banned not in blob
    assert "not measured HBM" in trace["measurementDisclaimer"]
    assert trace["prefill"]["data"]["notMeasuredTraffic"] is True
    assert trace["prefill"]["data"]["kind"] == "logical tensor payloads, not measured hardware traffic"


def test_p1_edge_case():
    pre = account_job("prefill", 1)
    dec = account_job("decode", 2)
    assert pre["P"] == 1
    assert pre["arithmetic"]["attentionFlopsPerHead"] == 4 * 1 * 1 * D_HEAD
    assert pre["data"]["qBytes"] == 1 * D_HEAD * 4
    assert pre["data"]["scoreBytes"] == 4
    assert dec["T"] == 2
    assert dec["arithmetic"]["attentionFlopsPerHead"] == 4 * 2 * D_HEAD

    trace = run_experiment(1, seed=42)
    assert trace["prefill"]["P"] == 1
    assert trace["decode"]["T"] == 2
    assert trace["sourcePair"]["prefillShapes"]["scoresPerHead"] == [1, 1]
    assert trace["sourcePair"]["decodeShapes"]["scoresPerHead"] == [1, 2]
    assert trace["sourcePair"]["equivalence"]["cachedMatchesFullRecompute"] is True
    assert validate_trace(trace) == []


def test_worked_example_p8():
    pre = account_job("prefill", 8)
    dec = account_job("decode", 9)
    assert pre["arithmetic"]["score"]["flops"] == 1024
    assert pre["arithmetic"]["value"]["flops"] == 1024
    assert pre["arithmetic"]["attentionFlopsPerHead"] == 2048
    assert pre["data"]["qBytes"] == pre["data"]["kBytes"] == pre["data"]["vBytes"] == 256
    assert pre["data"]["logicalBytesConsidered"] == 768
    assert pre["intensity"]["display"] == "2048 FLOPs / 768 bytes = 2.667 FLOPs per byte"
    assert dec["arithmetic"]["score"]["flops"] == 144
    assert dec["arithmetic"]["attentionFlopsPerHead"] == 288
    assert dec["data"]["qBytes"] == 32
    assert dec["data"]["kBytes"] == dec["data"]["vBytes"] == 288
    assert dec["data"]["logicalBytesConsidered"] == 608
    assert dec["intensity"]["display"] == "288 FLOPs / 608 bytes = 0.474 FLOPs per byte"


def test_scaling_table_and_formulas():
    trace = run_experiment(8, seed=42)
    assert [row["P"] for row in trace["scaling"]] == list(SCALING_LENGTHS)
    for row in trace["scaling"]:
        p, t = row["P"], row["T"]
        assert t == p + 1
        assert row["dHead"] == D_HEAD
        assert row["prefill"]["attentionFlopsPerHead"] == 4 * p * p * D_HEAD
        assert row["decode"]["attentionFlopsPerHead"] == 4 * t * D_HEAD
        assert row["prefill"]["symbolicFormula"] == "4 × P × P × d_h"
        assert row["decode"]["symbolicFormula"] == "4 × T × d_h"
        assert row["prefill"]["logicalCachedKvBytes"] == logical_kv_payload_bytes(p)
        assert row["decode"]["logicalCachedKvBytes"] == logical_kv_payload_bytes(t)
        assert row["prefill"]["unitFlops"] == "FLOPs"
        assert row["prefill"]["unitBytes"] == "bytes"
        assert row["prefill"]["unitIntensity"] == "FLOPs per byte"


def test_starts_from_experiment_02_pair_without_claiming_timing():
    trace = run_experiment(8, seed=42)
    assert trace["sourcePair"]["experimentId"] == "02-prefill-vs-decode"
    assert trace["sourcePair"]["equivalence"]["cachedMatchesFullRecompute"] is True
    assert "elapsedMs" not in trace["prefill"]
    assert "elapsedMs" not in trace["decode"]
    assert trace["caveats"]["rooflineNotImplemented"] is True


def test_flop_convention_warning_is_deliberate():
    assert "Different FLOP-counting conventions exist" in FLOP_CONVENTION_WARNING
    assert "2 FLOPs" in FLOP_CONVENTION_WARNING
    assert "Different FLOP-counting conventions exist" in README
    assert "multiply + add" in README
    trace = run_experiment(8, seed=1)
    assert "Different FLOP-counting conventions" in trace["flopConvention"]["warning"]
    assert trace["flopConvention"]["notTotalTransformerFlops"] is True


def test_generated_trace_is_valid():
    assert validate_trace(run_experiment(8, seed=42)) == []


def test_committed_sample_is_valid():
    assert SAMPLE.exists(), "run `python3 run.py --prompt-length 8`"
    assert load_and_validate(str(SAMPLE)) == []


def test_sample_has_p8_detail_and_full_scaling():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert data["schemaVersion"] == "0.4.0"
    assert data["config"]["promptLength"] == 8
    assert data["prefill"]["arithmetic"]["attentionFlopsPerHead"] == 2048
    assert [row["P"] for row in data["scaling"]] == list(SCALING_LENGTHS)


def test_mutating_trace_breaks_validation():
    trace = run_experiment(8, seed=1)
    broken = copy.deepcopy(trace)
    del broken["prefill"]["arithmetic"]
    assert validate_trace(broken)


@pytest.mark.parametrize("name", ["01-why-kv-cache", "02-prefill-vs-decode"])
def test_prior_experiment_suites_remain_green(name):
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q"],
        cwd=str(REPO / "experiments" / name),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
