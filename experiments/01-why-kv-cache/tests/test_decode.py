from __future__ import annotations

import sys
from pathlib import Path

import pytest
import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from decode import generate_cached, generate_naive, run_experiment  # noqa: E402
from tiny_lm import build_vocab, encode, seed_model, tokenize  # noqa: E402


PROMPT = "the cat sat on the mat"
MAX_NEW = 6


def _ready(prompt=PROMPT, seed=42):
    tokens = tokenize(prompt)
    itos, stoi = build_vocab(tokens)
    ids = encode(tokens, stoi)
    model = seed_model(len(itos), seed=seed)
    return model, ids, itos


def test_naive_and_cached_emit_the_same_tokens():
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    naive = trace["equivalence"]["generatedTokenIds"]["naive"]
    cached = trace["equivalence"]["generatedTokenIds"]["cached"]
    assert naive == cached
    assert trace["equivalence"]["outputsMatch"] is True
    assert trace["equivalence"]["maxAbsLogitDiff"] <= trace["equivalence"]["tolerance"]


def test_logits_match_within_tolerance():
    model, ids, itos = _ready()
    _, _, naive_logits = generate_naive(model, ids, itos, MAX_NEW)
    _, _, cached_logits = generate_cached(model, ids, itos, MAX_NEW)
    assert len(naive_logits) == len(cached_logits) == MAX_NEW
    for a, b in zip(naive_logits, cached_logits):
        assert torch.allclose(a, b, atol=1e-5, rtol=1e-5)


def test_naive_projects_a_growing_prefix():
    """At step t the prefix has P+t tokens, and naive projects all of them."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    prompt_len = len(trace["promptTokens"])
    for step in trace["modes"]["naive"]["steps"]:
        expected = prompt_len + step["step"]
        assert step["kvRowsProjected"] == expected
        assert step["kvRowsReused"] == 0
        assert step["cacheSizeTokens"] == 0


def test_cached_reuses_everything_after_the_first_step():
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    prompt_len = len(trace["promptTokens"])
    steps = trace["modes"]["cached"]["steps"]
    assert steps[0]["kvRowsProjected"] == prompt_len
    assert steps[0]["kvRowsReused"] == 0
    for step in steps[1:]:
        assert step["kvRowsProjected"] == 1
        assert step["kvRowsReused"] == step["position"] - 1
        assert step["cacheSizeTokens"] == step["position"]


def test_naive_total_is_triangular():
    """P + (P+1) + ... + (P+N-1) = N*P + N*(N-1)/2."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    p = len(trace["promptTokens"])
    n = MAX_NEW
    expected = n * p + n * (n - 1) // 2
    assert trace["modes"]["naive"]["totals"]["kvRowsProjected"] == expected


def test_cached_total_is_linear():
    """Prefill P, then one new K/V row per later generated token that is fed back: P+(N-1)."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    p = len(trace["promptTokens"])
    n = MAX_NEW
    assert trace["modes"]["cached"]["totals"]["kvRowsProjected"] == p + (n - 1)
    assert trace["modes"]["cached"]["totals"]["kvRowsReused"] > 0


def test_sample_accounting_p6_n6():
    """Explicit P=6, N=6 ledger from the Phase 0 brief."""
    trace = run_experiment(PROMPT, max_new_tokens=6, seed=42)
    assert len(trace["promptTokens"]) == 6
    naive_rows = [s["kvRowsProjected"] for s in trace["modes"]["naive"]["steps"]]
    cached_proj = [s["kvRowsProjected"] for s in trace["modes"]["cached"]["steps"]]
    cached_reuse = [s["kvRowsReused"] for s in trace["modes"]["cached"]["steps"]]
    assert naive_rows == [6, 7, 8, 9, 10, 11]
    assert sum(naive_rows) == 51
    assert cached_proj == [6, 1, 1, 1, 1, 1]
    assert sum(cached_proj) == 11
    assert cached_reuse == [0, 6, 7, 8, 9, 10]
    assert sum(cached_reuse) == 40


def test_cached_does_not_project_the_final_generated_token():
    """Generation stops after sampling the last token, so it is never embedded.

    For P=6, N=6 the cache holds 11 rows (prompt + first 5 generated), not 12.
    The sixth generated token is the answer, not another prefix token.
    """
    trace = run_experiment(PROMPT, max_new_tokens=6, seed=42)
    cached = trace["modes"]["cached"]
    assert cached["totals"]["kvRowsProjected"] == 11
    assert cached["steps"][-1]["cacheSizeTokens"] == 11
    assert len(cached["generatedTokens"]) == 6
    last_generated_pos = cached["generatedTokens"][-1]["position"]
    assert last_generated_pos == 11
    assert last_generated_pos not in [b["position"] for b in cached["steps"][-1]["newlyComputed"]]
    assert last_generated_pos not in [b["position"] for b in cached["steps"][-1]["reused"]]


def test_logical_kv_bytes_are_payload_not_rss():
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    d = trace["config"]["dModel"]
    last = trace["modes"]["cached"]["steps"][-1]
    assert last["logicalKvBytes"] == last["cacheSizeTokens"] * d * 2 * 4
    assert last["logicalKvBytes"] > 0
    assert trace["modes"]["cached"]["totals"]["peakLogicalKvBytes"] == last["logicalKvBytes"]


EQUIVALENCE_CASES = [
    ("the cat sat on the mat", 6, 42),
    ("the cat sat on the mat", 6, 0),
    ("the cat sat on the mat", 3, 7),
    ("hello", 3, 1),
    ("the cat sat on the mat and looked at the sun", 4, 3),
    ("yes yes yes yes", 5, 2),
    ("hello, world!", 4, 5),
    ("a", 1, 9),
    ("the cat sat", 8, 11),
]


@pytest.mark.parametrize("prompt,max_new,seed", EQUIVALENCE_CASES)
def test_equivalence_across_prompts_seeds_and_lengths(prompt, max_new, seed):
    trace = run_experiment(prompt, max_new_tokens=max_new, seed=seed)
    eq = trace["equivalence"]
    assert eq["generatedTokenIds"]["naive"] == eq["generatedTokenIds"]["cached"]
    assert eq["maxAbsLogitDiff"] <= eq["tolerance"]
    assert eq["outputsMatch"] is True

    model, ids, itos = _ready(prompt, seed)
    _, naive_ids, naive_logits = generate_naive(model, ids, itos, max_new)
    _, cached_ids, cached_logits = generate_cached(model, ids, itos, max_new)
    assert naive_ids == cached_ids
    for a, b in zip(naive_logits, cached_logits):
        assert torch.allclose(a, b, atol=1e-5, rtol=1e-5)
