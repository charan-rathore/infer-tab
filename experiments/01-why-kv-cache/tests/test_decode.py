from __future__ import annotations

import sys
from pathlib import Path

import torch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from decode import generate_cached, generate_naive, run_experiment  # noqa: E402
from tiny_lm import build_vocab, encode, seed_model, tokenize  # noqa: E402


PROMPT = "the cat sat on the mat"
MAX_NEW = 6


def _ready():
    tokens = tokenize(PROMPT)
    itos, stoi = build_vocab(tokens)
    ids = encode(tokens, stoi)
    model = seed_model(len(itos), seed=42)
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


def test_naive_recomputes_a_growing_prefix():
    """At step t the prefix has P+t tokens, and naive projects all of them."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    prompt_len = len(trace["promptTokens"])
    for step in trace["modes"]["naive"]["steps"]:
        expected = prompt_len + step["step"]
        assert step["recomputedOps"] == expected
        assert step["reusedOps"] == 0
        assert step["cacheSizeTokens"] == 0


def test_cached_reuses_everything_after_the_first_step():
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    prompt_len = len(trace["promptTokens"])
    steps = trace["modes"]["cached"]["steps"]
    assert steps[0]["recomputedOps"] == prompt_len
    assert steps[0]["reusedOps"] == 0
    for step in steps[1:]:
        assert step["recomputedOps"] == 1
        assert step["reusedOps"] == step["position"] - 1
        assert step["cacheSizeTokens"] == step["position"]


def test_naive_total_is_triangular():
    """P + (P+1) + ... + (P+N-1) = N*P + (0+...+N-1) = N*P + N*(N-1)/2."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    p = len(trace["promptTokens"])
    n = MAX_NEW
    expected = n * p + n * (n - 1) // 2
    assert trace["modes"]["naive"]["totals"]["recomputedOps"] == expected


def test_cached_total_is_linear():
    """Prefill P, then one new K/V per later token: P + (N-1)."""
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    p = len(trace["promptTokens"])
    n = MAX_NEW
    assert trace["modes"]["cached"]["totals"]["recomputedOps"] == p + (n - 1)
    assert trace["modes"]["cached"]["totals"]["reusedOps"] > 0


def test_cache_bytes_grow_with_tokens():
    trace = run_experiment(PROMPT, max_new_tokens=MAX_NEW, seed=42)
    d = trace["config"]["dModel"]
    last = trace["modes"]["cached"]["steps"][-1]
    # K and V, float32, one row per prefix token.
    assert last["cacheBytes"] == last["cacheSizeTokens"] * d * 2 * 4
    assert last["cacheBytes"] > 0
