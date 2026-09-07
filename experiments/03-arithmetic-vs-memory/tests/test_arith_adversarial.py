from __future__ import annotations

import copy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiment import (  # noqa: E402
    D_HEAD,
    account_job,
    decode_attention_flops_per_head,
    matmul_flops,
    prefill_attention_flops_per_head,
    run_experiment,
)
from validate_trace import validate_trace  # noqa: E402


def test_flops_match_matrix_shapes_not_constants():
    for p in (1, 7, 9, 11):
        rec = prefill_attention_flops_per_head(p, D_HEAD)
        assert rec["score"]["flops"] == matmul_flops(p, p, D_HEAD)
        assert rec["value"]["flops"] == matmul_flops(p, D_HEAD, p)
        assert rec["attentionFlopsPerHead"] != 2048 or p == 8
    for t in (3, 5, 11):
        rec = decode_attention_flops_per_head(t, D_HEAD)
        assert rec["score"]["flops"] == matmul_flops(1, t, D_HEAD)
        assert rec["value"]["flops"] == matmul_flops(1, D_HEAD, t)


def test_wrong_dtype_byte_count_breaks_intensity():
    rec = account_job("prefill", 8, bytes_per_element=4)
    mutated = copy.deepcopy(rec)
    mutated["data"]["logicalBytesConsidered"] = rec["data"]["logicalBytesConsidered"] // 2
    expected = rec["arithmetic"]["attentionFlopsPerHead"] / rec["data"]["logicalBytesConsidered"]
    assert mutated["intensity"]["arithmeticIntensity"] != (
        mutated["arithmetic"]["attentionFlopsPerHead"] / mutated["data"]["logicalBytesConsidered"]
    ) or mutated["data"]["logicalBytesConsidered"] != rec["data"]["logicalBytesConsidered"]
    assert rec["intensity"]["arithmeticIntensity"] == expected
    assert rec["intensity"]["unit"] == "FLOPs per byte"


def test_wrong_head_count_does_not_change_per_head_formula():
    rec = account_job("prefill", 8)
    assert rec["arithmetic"]["attentionFlopsPerHead"] == 4 * 8 * 8 * D_HEAD
    assert rec["dHead"] == D_HEAD


def test_stale_schema_and_traffic_claim_rejected():
    trace = run_experiment(8, seed=1)
    broken = copy.deepcopy(trace)
    broken["schemaVersion"] = "0.3.1"
    assert validate_trace(broken)
    claimed = copy.deepcopy(trace)
    claimed["prefill"]["data"]["hbmTraffic"] = 99
    assert validate_trace(claimed)


def test_intensity_unit_is_flops_per_byte():
    rec = account_job("decode", 9)
    assert rec["intensity"]["unit"] == "FLOPs per byte"
    assert rec["intensity"]["display"].endswith("FLOPs per byte")
