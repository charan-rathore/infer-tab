from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from decode import generate_cached, generate_naive, logical_kv_bytes, run_experiment  # noqa: E402
from tiny_lm import build_vocab, encode, seed_model, tokenize  # noqa: E402
from validate_trace import validate_trace  # noqa: E402


ADVERSARIAL = [
    ("a", 3, 1),
    ("the the the the", 4, 2),
    ("hello, world!", 5, 3),
    ("the cat sat on the mat and looked at the sun and then sat", 4, 4),
    ("the cat sat on the mat", 1, 5),
    ("cat", 8, 6),
    ("yes yes yes", 3, 0),
    ("yes yes yes", 3, 99),
]


def _ready(prompt, seed=42):
    tokens = tokenize(prompt)
    itos, stoi = build_vocab(tokens)
    ids = encode(tokens, stoi)
    return seed_model(len(itos), seed=seed), ids, itos


@pytest.mark.parametrize("prompt,max_new,seed", ADVERSARIAL)
def test_adversarial_prompts_stay_equivalent(prompt, max_new, seed):
    trace = run_experiment(prompt, max_new_tokens=max_new, seed=seed)
    assert validate_trace(trace) == []
    eq = trace["equivalence"]
    assert eq["outputsMatch"] is True
    assert eq["generatedTokenIds"]["naive"] == eq["generatedTokenIds"]["cached"]
    assert eq["maxAbsLogitDiff"] <= eq["tolerance"]
    model, ids, itos = _ready(prompt, seed)
    _, naive_ids, naive_logits = generate_naive(model, ids, itos, max_new)
    _, cached_ids, cached_logits = generate_cached(model, ids, itos, max_new)
    assert naive_ids == cached_ids
    for a, b in zip(naive_logits, cached_logits):
        assert torch.allclose(a, b, atol=1e-5, rtol=1e-5)


def test_reuse_counts_come_from_trace_arrays():
    trace = run_experiment("the cat sat on the mat", max_new_tokens=6, seed=42)
    for mode in trace["modes"].values():
        for step in mode["steps"]:
            assert step["kvRowsProjected"] == len(step["newlyComputed"])
            assert step["kvRowsReused"] == len(step["reused"])
        assert mode["totals"]["kvRowsProjected"] == sum(s["kvRowsProjected"] for s in mode["steps"])
        assert mode["totals"]["kvRowsReused"] == sum(s["kvRowsReused"] for s in mode["steps"])


def test_generation_length_updates_series():
    for n in (1, 3, 6, 8):
        trace = run_experiment("the cat sat on the mat", max_new_tokens=n, seed=42)
        p = len(trace["promptTokens"])
        naive = [s["kvRowsProjected"] for s in trace["modes"]["naive"]["steps"]]
        cached = [s["kvRowsProjected"] for s in trace["modes"]["cached"]["steps"]]
        assert naive == [p + i for i in range(n)]
        assert cached == [p] + [1] * (n - 1)
        assert trace["modes"]["cached"]["totals"]["kvRowsProjected"] == p + (n - 1)


def test_final_generated_token_is_not_cached():
    trace = run_experiment("the cat sat on the mat", max_new_tokens=6, seed=42)
    last = trace["modes"]["cached"]["generatedTokens"][-1]
    final_step = trace["modes"]["cached"]["steps"][-1]
    positions = [b["position"] for b in final_step["newlyComputed"] + final_step["reused"]]
    assert last["position"] not in positions


def test_wrong_schema_is_rejected():
    trace = run_experiment("the cat sat", max_new_tokens=2, seed=1)
    broken = copy.deepcopy(trace)
    broken["schemaVersion"] = "9.9.9"
    assert validate_trace(broken)


def test_stale_head_count_does_not_rewrite_bytes_formula():
    trace = run_experiment("the cat sat on the mat", max_new_tokens=3, seed=2)
    last = trace["modes"]["cached"]["steps"][-1]
    assert last["logicalKvBytes"] == logical_kv_bytes(last["cacheSizeTokens"], trace["config"]["dModel"])
    assert last["logicalKvBytes"] != logical_kv_bytes(last["cacheSizeTokens"], trace["config"]["nHeads"])


def test_wrong_cached_position_changes_hidden_state():
    model, ids, itos = _ready("the cat sat on the mat", 42)
    _, _, cached_logits = generate_cached(model, ids, itos, 2)
    hidden_right = model.embed(torch.tensor([ids[0]]), start_pos=len(ids))
    hidden_wrong = model.embed(torch.tensor([ids[0]]), start_pos=0)
    assert not torch.allclose(hidden_right, hidden_wrong, atol=1e-6)
    assert len(cached_logits) == 2
