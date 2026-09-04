"""Naive vs cached autoregressive decode, both emitting the same trace shape.

Naive path: at every new token, re-project Q, K, and V for the entire prefix.
Cached path: after prefill, project Q/K/V only for the newest token and
concatenate stored K/V with torch.cat (intentionally simple, not a real allocator).

The educational count is redundant K/V *rows*, not FLOPs.
The two paths must match on generated ids and raw logits. If they do not,
the cache is wrong.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

import torch

from tiny_lm import TinyCausalLM, build_vocab, encode, seed_model, tokenize

EXPERIMENT_ID = "01-why-kv-cache"
SCHEMA_VERSION = "0.2.0"
TOLERANCE = 1e-5
BYTES_PER_FLOAT = 4  # float32

MEASUREMENT_DISCLAIMER = (
    "This experiment counts redundant K/V row projections, not FLOPs. "
    "Naive decoding re-projects Q, K, and V across the whole prefix at every step. "
    "Cached decoding, after prefill, projects Q/K/V only for the newest token and "
    "reuses stored K/V. logicalKvBytes is tokens × d_model × 2 × 4 (float32 K and V "
    "payload), not process peak memory. Repeated torch.cat is intentionally simple "
    "and can copy extra buffers; later experiments will motivate better allocation. "
    "elapsedMs is an educational laptop timer on a 16-dimensional toy. It does not "
    "measure production LLM throughput, GPU memory-bandwidth, or serving latency."
)


def _preview(vec: torch.Tensor, n: int = 4) -> List[float]:
    return [round(float(x), 5) for x in vec.detach().flatten()[:n].tolist()]


def _block(token_id: int, text: str, position: int, k: torch.Tensor, v: torch.Tensor) -> Dict[str, Any]:
    return {
        "id": int(token_id),
        "text": text,
        "position": int(position),
        "kNorm": round(float(k.norm().item()), 5),
        "vNorm": round(float(v.norm().item()), 5),
        "kPreview": _preview(k),
        "vPreview": _preview(v),
    }


def _token(token_id: int, text: str, position: int) -> Dict[str, Any]:
    return {"id": int(token_id), "text": text, "position": int(position)}


def logical_kv_bytes(n_tokens: int, d_model: int) -> int:
    """Logical float32 K/V payload: tokens × d_model × 2 × 4.

    This is not RSS or allocator peak. torch.cat below may copy the growing
    cache on every step; we leave that waste visible on purpose.
    """
    return n_tokens * d_model * 2 * BYTES_PER_FLOAT


def _pick_next(
    model: TinyCausalLM, hidden: torch.Tensor
) -> Tuple[int, torch.Tensor]:
    logits = model.logits_from_hidden(hidden[-1])
    masked = logits.clone()
    # WHY we ban specials: <pad> and <unk> are bookkeeping ids, not words.
    # Equivalence still compares the raw logits from attention.
    for banned in (0, 1):
        if banned < masked.numel():
            masked[banned] = -1e9
    return int(torch.argmax(masked).item()), logits


@torch.no_grad()
def generate_naive(
    model: TinyCausalLM,
    prompt_ids: List[int],
    itos: List[str],
    max_new_tokens: int,
) -> Tuple[Dict[str, Any], List[int], List[torch.Tensor]]:
    """Re-project Q, K, and V for every prefix token at every step.

    WHY this is wasteful: a causal Transformer will not let a future token
    change a past hidden state, so those past K/V rows are identical if we
    recompute them. We still rebuild Q for the whole prefix here, but the
    number we record is only how many K/V rows were projected — not FLOPs.
    """
    ids = list(prompt_ids)
    steps: List[Dict[str, Any]] = []
    logits_hist: List[torch.Tensor] = []
    generated: List[int] = []

    for step in range(max_new_tokens):
        t0 = time.perf_counter()
        prefix = torch.tensor(ids, dtype=torch.long)
        hidden = model.embed(prefix)
        q, k, v = model.project_qkv(hidden)
        t = prefix.shape[0]
        positions = torch.arange(t)
        attn = model.attend(q, k, v, positions, positions)
        next_id, logits = _pick_next(model, attn)
        elapsed = (time.perf_counter() - t0) * 1000.0

        # Every K/V in this prefix was projected again. Nothing was reused.
        newly = [
            _block(ids[i], itos[ids[i]], i, k[i], v[i]) for i in range(t)
        ]
        generated.append(next_id)
        ids.append(next_id)
        logits_hist.append(logits)
        steps.append(
            {
                "step": step,
                "position": t,
                "inputTokens": [_token(ids[i], itos[ids[i]], i) for i in range(t)],
                "newlyComputed": newly,
                "reused": [],
                "kvRowsProjected": t,
                "kvRowsReused": 0,
                "cacheSizeTokens": 0,
                "logicalKvBytes": 0,
                "elapsedMs": round(elapsed, 4),
                "generatedToken": _token(next_id, itos[next_id], t),
            }
        )

    return _mode("naive", "Without memory — rebuild every time", generated, itos, prompt_ids, steps), generated, logits_hist


@torch.no_grad()
def generate_cached(
    model: TinyCausalLM,
    prompt_ids: List[int],
    itos: List[str],
    max_new_tokens: int,
) -> Tuple[Dict[str, Any], List[int], List[torch.Tensor]]:
    """Store past K/V. After prefill, only the newest token is projected.

    WHY this is correct: a past token's K/V may depend on its token, its
    position, and all causally preceding context at this layer. Future
    tokens change the new Q (what we ask now) but cannot alter an
    already-computed past hidden state, so those K/V rows stay valid.
    """
    ids = list(prompt_ids)
    steps: List[Dict[str, Any]] = []
    logits_hist: List[torch.Tensor] = []
    generated: List[int] = []

    k_cache: Optional[torch.Tensor] = None
    v_cache: Optional[torch.Tensor] = None

    for step in range(max_new_tokens):
        t0 = time.perf_counter()
        if k_cache is None:
            # First step: we have never seen these tokens, so we must compute.
            prefix = torch.tensor(ids, dtype=torch.long)
            hidden = model.embed(prefix, start_pos=0)
            q, k_new, v_new = model.project_qkv(hidden)
            k_cache, v_cache = k_new, v_new
            reused_k = None
            start_pos = 0
        else:
            # Only the token we just appended is new. Past rows stay.
            start_pos = k_cache.shape[0]
            new_id = torch.tensor([ids[-1]], dtype=torch.long)
            hidden = model.embed(new_id, start_pos=start_pos)
            q, k_new, v_new = model.project_qkv(hidden)
            reused_k = k_cache
            # Intentionally naive growth: each cat may copy the whole cache.
            # We do not preallocate. That waste is the next lesson, not this one.
            k_cache = torch.cat([k_cache, k_new], dim=0)
            v_cache = torch.cat([v_cache, v_new], dim=0)

        t = k_cache.shape[0]
        q_pos = torch.arange(start_pos, start_pos + q.shape[0])
        k_pos = torch.arange(t)
        attn = model.attend(q, k_cache, v_cache, q_pos, k_pos)
        next_id, logits = _pick_next(model, attn)
        elapsed = (time.perf_counter() - t0) * 1000.0

        newly = [
            _block(ids[start_pos + i], itos[ids[start_pos + i]], start_pos + i, k_new[i], v_new[i])
            for i in range(k_new.shape[0])
        ]
        reused = []
        if reused_k is not None:
            reused = [
                _block(ids[i], itos[ids[i]], i, k_cache[i], v_cache[i])
                for i in range(start_pos)
            ]

        generated.append(next_id)
        ids.append(next_id)
        logits_hist.append(logits)
        steps.append(
            {
                "step": step,
                "position": t,
                "inputTokens": [_token(ids[i], itos[ids[i]], i) for i in range(t)],
                "newlyComputed": newly,
                "reused": reused,
                "kvRowsProjected": len(newly),
                "kvRowsReused": len(reused),
                "cacheSizeTokens": t,
                "logicalKvBytes": logical_kv_bytes(t, model.d_model),
                "elapsedMs": round(elapsed, 4),
                "generatedToken": _token(next_id, itos[next_id], t),
            }
        )

    return _mode("cached", "With memory — keep what we already learned", generated, itos, prompt_ids, steps), generated, logits_hist


def _mode(
    mode_id: str,
    title: str,
    generated: List[int],
    itos: List[str],
    prompt_ids: List[int],
    steps: List[Dict[str, Any]],
) -> Dict[str, Any]:
    gen_tokens = [
        _token(tok, itos[tok], len(prompt_ids) + i) for i, tok in enumerate(generated)
    ]
    return {
        "id": mode_id,
        "title": title,
        "generatedTokens": gen_tokens,
        "steps": steps,
        "totals": {
            "kvRowsProjected": sum(s["kvRowsProjected"] for s in steps),
            "kvRowsReused": sum(s["kvRowsReused"] for s in steps),
            "peakCacheTokens": max(s["cacheSizeTokens"] for s in steps),
            "peakLogicalKvBytes": max(s["logicalKvBytes"] for s in steps),
            "elapsedMs": round(sum(s["elapsedMs"] for s in steps), 4),
        },
    }


def run_experiment(
    prompt: str,
    max_new_tokens: int = 6,
    seed: int = 42,
    d_model: int = 16,
    n_heads: int = 2,
) -> Dict[str, Any]:
    prompt_tokens = tokenize(prompt)
    itos, stoi = build_vocab(prompt_tokens)
    prompt_ids = encode(prompt_tokens, stoi)
    model = seed_model(len(itos), seed, d_model=d_model, n_heads=n_heads)

    naive_mode, naive_ids, naive_logits = generate_naive(
        model, prompt_ids, itos, max_new_tokens
    )
    # Same weights, second pass. Caching must not change the answer.
    cached_mode, cached_ids, cached_logits = generate_cached(
        model, prompt_ids, itos, max_new_tokens
    )

    diffs = [
        float((a - b).abs().max().item()) for a, b in zip(naive_logits, cached_logits)
    ]
    max_diff = max(diffs) if diffs else 0.0

    return {
        "schemaVersion": SCHEMA_VERSION,
        "experimentId": EXPERIMENT_ID,
        "prompt": " ".join(prompt_tokens),
        "promptTokens": [
            _token(i, t, p) for p, (i, t) in enumerate(zip(prompt_ids, prompt_tokens))
        ],
        "config": {
            "dModel": d_model,
            "nHeads": n_heads,
            "nLayers": 1,
            "vocabSize": len(itos),
            "maxNewTokens": max_new_tokens,
            "seed": seed,
            "device": "cpu",
        },
        "modes": {"naive": naive_mode, "cached": cached_mode},
        "equivalence": {
            "outputsMatch": naive_ids == cached_ids and max_diff <= TOLERANCE,
            "maxAbsLogitDiff": max_diff,
            "tolerance": TOLERANCE,
            "generatedTokenIds": {"naive": naive_ids, "cached": cached_ids},
        },
        "measurementDisclaimer": MEASUREMENT_DISCLAIMER,
    }
