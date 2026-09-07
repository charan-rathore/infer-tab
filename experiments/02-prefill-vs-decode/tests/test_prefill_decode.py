from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiment import (  # noqa: E402
    D_HEAD,
    D_MODEL,
    N_HEADS,
    SCALING_LENGTHS,
    TOLERANCE,
    _ready,
    full_recompute_last_logits,
    logical_kv_bytes,
    prompt_of_length,
    run_decode,
    run_experiment,
    run_pair,
    run_prefill,
    score_cell_counts,
)
from validate_trace import load_and_validate, validate_trace  # noqa: E402

SAMPLE = ROOT / "traces" / "sample-p6.json"


def _outputs(model, token_ids):
    prefix = torch.tensor(token_ids, dtype=torch.long)
    hidden = model.embed(prefix, start_pos=0)
    q, k, v = model.project_qkv(hidden)
    pos = torch.arange(len(token_ids))
    return model.attend(q, k, v, pos, pos)


def test_causal_mask_future_token_does_not_change_earlier_outputs():
    model, ids, _itos, _tokens = _ready(prompt_of_length(8), seed=42)
    assert len(ids) >= 3
    ids_b = list(ids)
    ids_b[-1] = ids_b[-2] if ids_b[-1] != ids_b[-2] else (ids_b[-1] + 1) % model.vocab_size
    if ids_b[-1] == ids[-1]:
        ids_b[-1] = (ids_b[-1] + 2) % model.vocab_size

    a = _outputs(model, ids)
    b = _outputs(model, ids_b)
    assert torch.allclose(a[:-1], b[:-1], atol=1e-5, rtol=1e-5)


def test_causal_directionality_past_may_change_future():
    """Changing the future must not rewrite the past. Changing the past may rewrite later outputs."""
    model, ids, _itos, _tokens = _ready(prompt_of_length(8), seed=3)
    future = list(ids)
    future[-1] = (future[-1] + 3) % model.vocab_size
    if future[-1] == ids[-1]:
        future[-1] = (future[-1] + 1) % model.vocab_size
    past = list(ids)
    past[0] = (past[0] + 3) % model.vocab_size
    if past[0] == ids[0]:
        past[0] = (past[0] + 1) % model.vocab_size

    base = _outputs(model, ids)
    after_future = _outputs(model, future)
    after_past = _outputs(model, past)
    assert torch.allclose(base[:-1], after_future[:-1], atol=1e-5, rtol=1e-5)
    assert not torch.allclose(base[1:], after_past[1:], atol=1e-5, rtol=1e-5)


def test_prefill_and_decode_tensor_shapes_p6():
    pair = run_pair(6, seed=42)
    p = 6
    d = D_MODEL
    assert pair["prefill"]["shapes"]["X"] == [p, d]
    assert pair["prefill"]["shapes"]["Q"] == [p, d]
    assert pair["prefill"]["shapes"]["K"] == [p, d]
    assert pair["prefill"]["shapes"]["V"] == [p, d]
    assert pair["prefill"]["shapes"]["scoresPerHead"] == [p, p]
    assert pair["prefill"]["shapes"]["scoresAllHeads"] == [N_HEADS, p, p]
    assert pair["prefill"]["scoreTensorShape"] == [N_HEADS, p, p]
    assert pair["decode"]["shapes"]["Q_new"] == [1, d]
    assert pair["decode"]["shapes"]["K_new"] == [1, d]
    assert pair["decode"]["shapes"]["V_new"] == [1, d]
    assert pair["decode"]["shapes"]["K_cache"] == [p + 1, d]
    assert pair["decode"]["shapes"]["V_cache"] == [p + 1, d]
    assert pair["decode"]["shapes"]["scoresPerHead"] == [1, p + 1]
    assert pair["decode"]["scoreTensorShape"] == [N_HEADS, 1, p + 1]


def test_cached_decode_matches_full_recompute():
    pair = run_pair(6, seed=42)
    assert pair["equivalence"]["cachedMatchesFullRecompute"] is True
    assert pair["equivalence"]["maxAbsLogitDiff"] <= pair["equivalence"]["tolerance"]

    model, ids, itos, _ = _ready(prompt_of_length(6), seed=42)
    prefill, k_cache, v_cache, new_id, _ = run_prefill(model, ids, itos)
    _decode, cached_logits = run_decode(
        model, ids, itos, k_cache, v_cache, new_id, start_pos=len(ids)
    )
    full = full_recompute_last_logits(model, ids + [new_id])
    assert torch.allclose(cached_logits, full, atol=TOLERANCE, rtol=TOLERANCE)
    assert prefill["generatedToken"]["id"] == new_id


@pytest.mark.parametrize("seed", [0, 1, 7, 42])
def test_cached_matches_full_recompute_across_seeds(seed):
    pair = run_pair(6, seed=seed)
    assert pair["equivalence"]["cachedMatchesFullRecompute"] is True
    assert pair["equivalence"]["maxAbsLogitDiff"] <= TOLERANCE


def test_decode_uses_absolute_position_not_zero():
    pair = run_pair(6, seed=42)
    p = 6
    assert pair["decode"]["newTokenPosition"] == p

    model, ids, itos, _ = _ready(prompt_of_length(p), seed=42)
    _pre, k_cache, v_cache, new_id, _ = run_prefill(model, ids, itos)
    hidden_right = model.embed(torch.tensor([new_id]), start_pos=p)
    hidden_wrong = model.embed(torch.tensor([new_id]), start_pos=0)
    assert not torch.allclose(hidden_right, hidden_wrong, atol=1e-6)

    q_r, k_r, v_r = model.project_qkv(hidden_right)
    q_w, k_w, v_w = model.project_qkv(hidden_wrong)
    k_ok = torch.cat([k_cache, k_r], dim=0)
    v_ok = torch.cat([v_cache, v_r], dim=0)
    k_bad = torch.cat([k_cache, k_w], dim=0)
    v_bad = torch.cat([v_cache, v_w], dim=0)
    pos_ok = torch.tensor([p])
    pos_wrong = torch.tensor([0])
    hist = torch.arange(p + 1)
    attn_ok = model.attend(q_r, k_ok, v_ok, pos_ok, hist)
    attn_wrong = model.attend(q_w, k_bad, v_bad, pos_wrong, hist)
    assert not torch.allclose(attn_ok, attn_wrong, atol=1e-6)


@pytest.mark.parametrize("p", [1, 6, 16, 32, 64, 128])
def test_score_cell_formulas(p):
    cells = score_cell_counts(p, p, newest_query=False)
    assert cells["attentionScoreCellsPerHead"] == p * p
    assert cells["attentionScoreCellsCausal"] == p * (p + 1) // 2
    assert cells["attentionScoreCellsMasked"] == p * (p - 1) // 2
    assert (
        cells["attentionScoreCellsCausal"] + cells["attentionScoreCellsMasked"]
        == cells["attentionScoreCellsPerHead"]
    )
    decode = score_cell_counts(1, p + 1, newest_query=True)
    assert decode["attentionScoreCellsMasked"] == 0
    assert decode["attentionScoreCellsCausal"] == p + 1


def test_p6_mask_counts():
    pair = run_pair(6, seed=42)
    pre = pair["prefill"]
    assert pre["attentionScoreCellsPerHead"] == 36
    assert pre["attentionScoreCellsCausal"] == 21
    assert pre["attentionScoreCellsMasked"] == 15
    assert pre["attentionScoreCellsCausal"] + pre["attentionScoreCellsMasked"] == 36


def test_mask_formulas_on_all_scaling_lengths():
    trace = run_experiment(6, seed=42)
    for row in trace["scaling"]:
        p = row["promptLength"]
        pre = row["prefill"]
        expected = score_cell_counts(p, p, newest_query=False)
        assert pre["attentionScoreCellsPerHead"] == p * p == expected["attentionScoreCellsPerHead"]
        assert pre["attentionScoreCellsCausal"] == p * (p + 1) // 2
        assert pre["attentionScoreCellsMasked"] == p * (p - 1) // 2
        assert (
            pre["attentionScoreCellsCausal"] + pre["attentionScoreCellsMasked"]
            == pre["attentionScoreCellsPerHead"]
        )
        dec = row["decode"]
        t = p + 1
        assert dec["attentionScoreCellsPerHead"] == t
        assert dec["attentionScoreCellsCausal"] == t
        assert dec["attentionScoreCellsMasked"] == 0
        assert dec["scoreTensorShape"][0] == N_HEADS if "scoreTensorShape" in dec else True


def test_decode_newest_query_has_no_future_cells():
    pair = run_pair(6, seed=42)
    dec = pair["decode"]
    assert dec["newTokenPosition"] == 6
    assert dec["attentionScoreCellsMasked"] == 0
    assert dec["attentionScoreCellsCausal"] == dec["attentionScoreCellsPerHead"] == 7


def test_score_shapes_respect_n_heads():
    pair = run_pair(16, seed=42)
    assert pair["prefill"]["scoreTensorShape"][0] == N_HEADS
    assert pair["decode"]["scoreTensorShape"][0] == N_HEADS
    assert pair["prefill"]["attentionScoreCellsTotal"] == pair["prefill"]["attentionScoreCellsPerHead"] * N_HEADS
    assert pair["prefill"]["attentionMath"]["dHead"] == D_HEAD


def test_logical_kv_bytes_scale_linearly():
    for p in (1, 6, 16, 32):
        pair = run_pair(p, seed=1)
        assert pair["prefill"]["logicalKvBytesWritten"] == logical_kv_bytes(p)
        assert pair["decode"]["logicalKvBytesWritten"] == logical_kv_bytes(1)
        assert pair["decode"]["logicalKvBytesAvailable"] == logical_kv_bytes(p + 1)


def test_p1_edge_case():
    pair = run_pair(1, seed=42)
    assert pair["prefill"]["shapes"]["scoresPerHead"] == [1, 1]
    assert pair["prefill"]["attentionScoreCellsPerHead"] == 1
    assert pair["prefill"]["attentionScoreCellsCausal"] == 1
    assert pair["prefill"]["attentionScoreCellsMasked"] == 0
    assert pair["decode"]["shapes"]["scoresPerHead"] == [1, 2]
    assert pair["decode"]["newTokenPosition"] == 1
    assert pair["equivalence"]["cachedMatchesFullRecompute"] is True


def test_scaling_prefill_is_p_squared_score_cells_not_model_flops():
    trace = run_experiment(6, seed=42)
    lengths = [row["promptLength"] for row in trace["scaling"]]
    assert lengths == list(SCALING_LENGTHS)
    for row in trace["scaling"]:
        p = row["promptLength"]
        pre = row["prefill"]
        dec = row["decode"]
        assert pre["attentionScoreCellsPerHead"] == p * p
        assert pre["qRowsProjected"] == pre["kRowsProjected"] == pre["vRowsProjected"] == p
        assert dec["attentionScoreCellsPerHead"] == p + 1
        assert dec["qRowsProjected"] == dec["kRowsProjected"] == dec["vRowsProjected"] == 1
        assert pre["shapes"]["scoresPerHead"] == [p, p]
        assert dec["shapes"]["scoresPerHead"] == [1, p + 1]
        assert "not whole-model" in pre["attentionMath"]["countsWhat"]


def test_same_seed_same_structural_measurements():
    a = run_experiment(6, seed=42)
    b = run_experiment(6, seed=42)
    for key in (
        "shapes",
        "qRowsProjected",
        "kRowsProjected",
        "vRowsProjected",
        "attentionScoreCellsPerHead",
        "attentionScoreCellsCausal",
        "logicalKvBytesWritten",
    ):
        assert a["prefill"][key] == b["prefill"][key]
        assert a["decode"][key] == b["decode"][key]
    assert a["decode"]["newTokenPosition"] == b["decode"]["newTokenPosition"]


def test_generated_trace_is_valid():
    assert validate_trace(run_experiment(6, seed=42)) == []


def test_committed_sample_is_valid():
    assert SAMPLE.exists(), "run `python3 run.py --prompt-length 6`"
    assert load_and_validate(str(SAMPLE)) == []


def test_sample_has_p6_detail_and_full_scaling():
    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert data["schemaVersion"] == "0.3.1"
    assert data["config"]["promptLength"] == 6
    assert data["prefill"]["attentionScoreCellsCausal"] == 21
    assert [row["promptLength"] for row in data["scaling"]] == list(SCALING_LENGTHS)
    assert "cells per head" in data["measurementDisclaimer"]


def test_mutating_trace_breaks_validation():
    trace = run_experiment(6, seed=1)
    broken = copy.deepcopy(trace)
    del broken["prefill"]["shapes"]
    assert validate_trace(broken)
