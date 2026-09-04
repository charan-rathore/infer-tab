from __future__ import annotations

import copy
import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from experiment import (  # noqa: E402
    D_MODEL,
    N_HEADS,
    SCALING_LENGTHS,
    TOLERANCE,
    _ready,
    full_recompute_last_logits,
    prompt_of_length,
    run_decode,
    run_experiment,
    run_pair,
    run_prefill,
)
from validate_trace import load_and_validate, validate_trace  # noqa: E402

SAMPLE = ROOT / "traces" / "sample-p6.json"


def test_causal_mask_future_token_does_not_change_earlier_outputs():
    model, ids, _itos, _tokens = _ready(prompt_of_length(8), seed=42)
    assert len(ids) >= 3
    ids_b = list(ids)
    ids_b[-1] = ids_b[-2] if ids_b[-1] != ids_b[-2] else (ids_b[-1] + 1) % model.vocab_size
    if ids_b[-1] == ids[-1]:
        ids_b[-1] = (ids_b[-1] + 2) % model.vocab_size

    def outputs(token_ids):
        prefix = torch.tensor(token_ids, dtype=torch.long)
        hidden = model.embed(prefix, start_pos=0)
        q, k, v = model.project_qkv(hidden)
        pos = torch.arange(len(token_ids))
        return model.attend(q, k, v, pos, pos)

    a = outputs(ids)
    b = outputs(ids_b)
    # Positions before the changed future token must match.
    assert torch.allclose(a[:-1], b[:-1], atol=1e-5, rtol=1e-5)


def test_prefill_and_decode_tensor_shapes_p6():
    pair = run_pair(6, seed=42)
    p = 6
    d = D_MODEL
    assert pair["prefill"]["shapes"] == {
        "X": [p, d],
        "Q": [p, d],
        "K": [p, d],
        "V": [p, d],
        "scoresPerHead": [p, p],
    }
    assert pair["prefill"]["scoreTensorShape"] == [N_HEADS, p, p]
    assert pair["decode"]["shapes"] == {
        "Q_new": [1, d],
        "K_new": [1, d],
        "V_new": [1, d],
        "K_cache": [p + 1, d],
        "V_cache": [p + 1, d],
        "scoresPerHead": [1, p + 1],
    }
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


def test_scaling_prefill_is_p_squared_decode_is_about_p():
    trace = run_experiment(6, seed=42)
    lengths = [row["promptLength"] for row in trace["scaling"]]
    assert lengths == list(SCALING_LENGTHS)
    for row in trace["scaling"]:
        p = row["promptLength"]
        pre = row["prefill"]
        dec = row["decode"]
        assert pre["attentionScoreElementsPerHead"] == p * p
        assert pre["qRowsProjected"] == pre["kRowsProjected"] == pre["vRowsProjected"] == p
        assert dec["attentionScoreElementsPerHead"] == p + 1
        assert dec["qRowsProjected"] == dec["kRowsProjected"] == dec["vRowsProjected"] == 1
        assert dec["shapes"]["scoresPerHead"] == [1, p + 1]
        assert pre["shapes"]["scoresPerHead"] == [p, p]


def test_same_seed_same_structural_measurements():
    a = run_experiment(6, seed=42)
    b = run_experiment(6, seed=42)
    for key in ("shapes", "qRowsProjected", "kRowsProjected", "vRowsProjected",
                "attentionScoreElementsPerHead", "logicalKvBytesWritten"):
        assert a["prefill"][key] == b["prefill"][key]
        assert a["decode"][key] == b["decode"][key]
    assert a["decode"]["newTokenPosition"] == b["decode"]["newTokenPosition"]
    scale_a = [{k: row[k] for k in ("promptLength",)} | {
        "prefillCells": row["prefill"]["attentionScoreElementsPerHead"],
        "decodeCells": row["decode"]["attentionScoreElementsPerHead"],
    } for row in a["scaling"]]
    scale_b = [{k: row[k] for k in ("promptLength",)} | {
        "prefillCells": row["prefill"]["attentionScoreElementsPerHead"],
        "decodeCells": row["decode"]["attentionScoreElementsPerHead"],
    } for row in b["scaling"]]
    assert scale_a == scale_b


def test_generated_trace_is_valid():
    assert validate_trace(run_experiment(6, seed=42)) == []


def test_committed_sample_is_valid():
    assert SAMPLE.exists(), "run `python3 run.py --prompt-length 6`"
    assert load_and_validate(str(SAMPLE)) == []


def test_sample_has_p6_detail_and_full_scaling():
    import json

    data = json.loads(SAMPLE.read_text(encoding="utf-8"))
    assert data["schemaVersion"] == "0.3.0"
    assert data["config"]["promptLength"] == 6
    assert [row["promptLength"] for row in data["scaling"]] == list(SCALING_LENGTHS)
    assert "educational" in data["measurementDisclaimer"].lower()


def test_mutating_trace_breaks_validation():
    trace = run_experiment(6, seed=1)
    broken = copy.deepcopy(trace)
    del broken["prefill"]["shapes"]
    assert validate_trace(broken)
