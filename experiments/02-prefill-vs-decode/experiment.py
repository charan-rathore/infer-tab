"""Prefill vs one decode step on the same tiny causal LM.

Prefill: many query rows, all prompt tokens in one parallel pass, causal mask.
Decode: one new query against a growing K/V history.

We count rows, score-matrix cells, and logical K/V bytes - not FLOPs,
bandwidth, or production latency.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import torch

EXP01 = Path(__file__).resolve().parents[1] / "01-why-kv-cache"
sys.path.insert(0, str(EXP01))
from tiny_lm import TinyCausalLM, build_vocab, encode, tokenize  # noqa: E402
sys.path.remove(str(EXP01))

EXPERIMENT_ID = "02-prefill-vs-decode"
SCHEMA_VERSION = "0.3.1"
TOLERANCE = 1e-5
BYTES_PER_FLOAT = 4
D_MODEL = 16
N_HEADS = 2
D_HEAD = D_MODEL // N_HEADS
MAX_POS = 256
SCALING_LENGTHS = (6, 16, 32, 64, 128)
WORD_CYCLE = ("the", "cat", "sat", "on", "the", "mat", "and", "saw", "a", "dog")

MEASUREMENT_DISCLAIMER = (
    "P² versus ~P here counts attention-score *cells per head*, not total "
    "Transformer compute. Q/K/V projections, the output projection, and any "
    "later FFN are separate. attentionScoreCellsCausal is the lower triangle "
    "P(P+1)/2; implementations may still materialize or skip the future "
    "differently, so this is a conceptual grid count, not hardware work. "
    "logicalKvBytes is tokens × d_model × 2 × 4. elapsedMs is a laptop timer "
    "on a 16-d toy. None of this proves a GPU bottleneck."
)


def prompt_of_length(n: int) -> str:
    if n < 1:
        raise ValueError("prompt length must be at least 1")
    return " ".join(WORD_CYCLE[i % len(WORD_CYCLE)] for i in range(n))


def logical_kv_bytes(n_tokens: int, d_model: int = D_MODEL) -> int:
    return n_tokens * d_model * 2 * BYTES_PER_FLOAT


def score_cell_counts(n_queries: int, n_keys: int, newest_query: bool) -> Dict[str, int]:
    """Conceptual attention-grid counts for one head.

    Prefill (n_queries == n_keys == P): a dense [P, P] board.
    Causal usable cells are the lower triangle including the diagonal.
    Decode with the newest query: every key is in the past or is self, so
    no future cells exist.
    """
    total = n_queries * n_keys
    if n_queries == n_keys:
        causal = n_queries * (n_queries + 1) // 2
        masked = n_queries * (n_queries - 1) // 2
    elif newest_query:
        causal = total
        masked = 0
    else:
        raise ValueError("unsupported score-grid shape")
    if causal + masked != total:
        raise RuntimeError("mask counts must partition the grid")
    return {
        "attentionScoreCellsPerHead": total,
        "attentionScoreCellsCausal": causal,
        "attentionScoreCellsMasked": masked,
        "attentionScoreCellsTotal": total * N_HEADS,
    }


def attention_math(kind: str, n_queries: int, n_keys: int) -> Dict[str, Any]:
    """Dominant attention multiplies per head. Not a production FLOP recipe."""
    if kind == "prefill":
        return {
            "countsWhat": "attention multiplies per head, not whole-model FLOPs",
            "dHead": D_HEAD,
            "scoreMultiply": {
                "formula": "Q[P, d_h] x K^T[d_h, P] -> [P, P]",
                "macScale": "P^2 x d_h",
                "p": n_queries,
            },
            "valueAggregate": {
                "formula": "softmax(scores)[P, P] x V[P, d_h]",
                "macScale": "P^2 x d_h",
            },
        }
    return {
        "countsWhat": "attention multiplies per head, not whole-model FLOPs",
        "dHead": D_HEAD,
        "scoreMultiply": {
            "formula": "Q_new[1, d_h] x K_cache^T[d_h, T] -> [1, T]",
            "macScale": "T x d_h",
            "t": n_keys,
        },
        "valueAggregate": {
            "formula": "softmax(scores)[1, T] x V[T, d_h]",
            "macScale": "T x d_h",
        },
    }


PREFILL_PIPELINE = (
    {"id": "x", "label": "Everyone already here", "tensor": "X [P, D]"},
    {"id": "proj", "label": "Ask, label, contribute", "tensor": "Q, K, V [P, D]"},
    {"id": "scores", "label": "Every question meets every label", "tensor": "QKᵀ → [H, P, P]"},
    {"id": "mask", "label": "No peeking ahead", "tensor": "causal mask on the square"},
    {"id": "mix", "label": "Gather what we may see", "tensor": "weighted V"},
    {"id": "cache", "label": "Keep labels and contents", "tensor": "K/V shelf [P, D]"},
)

DECODE_PIPELINE = (
    {"id": "x", "label": "Only the newest word", "tensor": "x_new [1, D]"},
    {"id": "proj", "label": "One question, one new label", "tensor": "q_new, k_new, v_new [1, D]"},
    {"id": "append", "label": "Add it to the shelf", "tensor": "K/V cache [T, D]"},
    {"id": "scores", "label": "One question, long history", "tensor": "q_new Kᵀ → [H, 1, T]"},
    {"id": "mix", "label": "Gather from the shelf", "tensor": "weighted V"},
    {"id": "logits", "label": "Guess the next word", "tensor": "next-token logits"},
)


def seed_model(vocab_size: int, seed: int) -> TinyCausalLM:
    torch.manual_seed(seed)
    # max_pos=256 so P=128 plus one decode position still fits.
    # WHY a larger table than Phase 0: we must not change Phase 0's default
    # Embedding(128), or its seeded weights would shift.
    model = TinyCausalLM(vocab_size, d_model=D_MODEL, n_heads=N_HEADS, max_pos=MAX_POS)
    model.eval()
    return model


def _token(token_id: int, text: str, position: int) -> Dict[str, Any]:
    return {"id": int(token_id), "text": text, "position": int(position)}


def _pick_next(model: TinyCausalLM, hidden: torch.Tensor) -> Tuple[int, torch.Tensor]:
    logits = model.logits_from_hidden(hidden[-1])
    masked = logits.clone()
    for banned in (0, 1):
        if banned < masked.numel():
            masked[banned] = -1e9
    return int(torch.argmax(masked).item()), logits


def _ready(prompt: str, seed: int) -> Tuple[TinyCausalLM, List[int], List[str], List[str]]:
    tokens = tokenize(prompt)
    itos, stoi = build_vocab(tokens)
    ids = encode(tokens, stoi)
    return seed_model(len(itos), seed), ids, itos, tokens


@torch.no_grad()
def run_prefill(
    model: TinyCausalLM, ids: List[int], itos: List[str]
) -> Tuple[Dict[str, Any], torch.Tensor, torch.Tensor, int, torch.Tensor]:
    """Process all prompt tokens together. Causal mask hides the future.

    WHY parallel is allowed: every prompt token already exists. Masking
    token i from seeing j > i is a *read restriction*, not a reason to
    wait for token i+1 to be generated.
    """
    p = len(ids)
    t0 = time.perf_counter()
    prefix = torch.tensor(ids, dtype=torch.long)
    hidden = model.embed(prefix, start_pos=0)
    q, k, v = model.project_qkv(hidden)
    pos = torch.arange(p)
    scores = model.attention_scores(q, k, pos, pos)
    attn = model.attend(q, k, v, pos, pos)
    next_id, logits = _pick_next(model, attn)
    elapsed = (time.perf_counter() - t0) * 1000.0

    per_head = [p, p]
    counts = score_cell_counts(p, p, newest_query=False)
    record = {
        "label": "Read what already exists.",
        "technicalName": "Prefill",
        "inputTokenCount": p,
        "qRowsProjected": p,
        "kRowsProjected": p,
        "vRowsProjected": p,
        "attentionScoreShapePerHead": per_head,
        **counts,
        "shapes": {
            "X": [p, model.d_model],
            "Q": [p, model.d_model],
            "K": [p, model.d_model],
            "V": [p, model.d_model],
            "scoresPerHead": per_head,
            "scoresAllHeads": [model.n_heads, p, p],
        },
        "attentionMath": attention_math("prefill", p, p),
        "pipeline": list(PREFILL_PIPELINE),
        "logicalKvBytesWritten": logical_kv_bytes(p, model.d_model),
        "logicalKvBytesAvailable": logical_kv_bytes(p, model.d_model),
        "elapsedMs": round(elapsed, 4),
        "generatedToken": _token(next_id, itos[next_id], p),
        "tokens": [_token(ids[i], itos[ids[i]], i) for i in range(p)],
        "scoreTensorShape": list(scores.shape),
    }
    return record, k, v, next_id, logits


@torch.no_grad()
def run_decode(
    model: TinyCausalLM,
    prompt_ids: List[int],
    itos: List[str],
    k_cache: torch.Tensor,
    v_cache: torch.Tensor,
    new_id: int,
    start_pos: int,
) -> Tuple[Dict[str, Any], torch.Tensor]:
    """One new query against the full stored history.

    WHY Q is length 1: only the newest token is asking a question.
    WHY K/V are long: every past position still has something to match and add.
    """
    t0 = time.perf_counter()
    hidden = model.embed(torch.tensor([new_id], dtype=torch.long), start_pos=start_pos)
    q_new, k_new, v_new = model.project_qkv(hidden)
    k_cache = torch.cat([k_cache, k_new], dim=0)
    v_cache = torch.cat([v_cache, v_new], dim=0)
    t = k_cache.shape[0]
    q_pos = torch.tensor([start_pos])
    k_pos = torch.arange(t)
    scores = model.attention_scores(q_new, k_cache, q_pos, k_pos)
    attn = model.attend(q_new, k_cache, v_cache, q_pos, k_pos)
    next_id, logits = _pick_next(model, attn)
    elapsed = (time.perf_counter() - t0) * 1000.0

    per_head = [1, t]
    counts = score_cell_counts(1, t, newest_query=True)
    record = {
        "label": "Write one new piece.",
        "technicalName": "Decode",
        "inputTokenCount": 1,
        "newTokenPosition": start_pos,
        "qRowsProjected": 1,
        "kRowsProjected": 1,
        "vRowsProjected": 1,
        "attentionScoreShapePerHead": per_head,
        **counts,
        "shapes": {
            "Q_new": [1, model.d_model],
            "K_new": [1, model.d_model],
            "V_new": [1, model.d_model],
            "K_cache": [t, model.d_model],
            "V_cache": [t, model.d_model],
            "scoresPerHead": per_head,
            "scoresAllHeads": [model.n_heads, 1, t],
        },
        "attentionMath": attention_math("decode", 1, t),
        "pipeline": list(DECODE_PIPELINE),
        "logicalKvBytesWritten": logical_kv_bytes(1, model.d_model),
        "logicalKvBytesAvailable": logical_kv_bytes(t, model.d_model),
        "elapsedMs": round(elapsed, 4),
        "generatedToken": _token(next_id, itos[next_id], start_pos + 1),
        "scoreTensorShape": list(scores.shape),
    }
    return record, logits


@torch.no_grad()
def full_recompute_last_logits(
    model: TinyCausalLM, token_ids: List[int]
) -> torch.Tensor:
    """Recompute Q/K/V for the whole prefix. Used only as an equivalence check."""
    prefix = torch.tensor(token_ids, dtype=torch.long)
    hidden = model.embed(prefix, start_pos=0)
    q, k, v = model.project_qkv(hidden)
    pos = torch.arange(len(token_ids))
    attn = model.attend(q, k, v, pos, pos)
    _, logits = _pick_next(model, attn)
    return logits


def _stage_summary(stage: Dict[str, Any]) -> Dict[str, Any]:
    keys = (
        "inputTokenCount",
        "qRowsProjected",
        "kRowsProjected",
        "vRowsProjected",
        "attentionScoreShapePerHead",
        "attentionScoreCellsPerHead",
        "attentionScoreCellsCausal",
        "attentionScoreCellsMasked",
        "attentionScoreCellsTotal",
        "shapes",
        "attentionMath",
        "pipeline",
        "scoreTensorShape",
        "logicalKvBytesWritten",
        "logicalKvBytesAvailable",
        "elapsedMs",
    )
    return {k: stage[k] for k in keys}


def run_pair(prompt_length: int, seed: int = 42) -> Dict[str, Any]:
    prompt = prompt_of_length(prompt_length)
    model, ids, itos, tokens = _ready(prompt, seed)
    if len(ids) != prompt_length:
        raise RuntimeError("tokenizer changed prompt length")

    prefill, k_cache, v_cache, new_id, _prefill_logits = run_prefill(model, ids, itos)
    decode, decode_logits = run_decode(
        model, ids, itos, k_cache, v_cache, new_id, start_pos=len(ids)
    )

    recomputed = full_recompute_last_logits(model, ids + [new_id])
    max_diff = float((decode_logits - recomputed).abs().max().item())

    return {
        "schemaVersion": SCHEMA_VERSION,
        "experimentId": EXPERIMENT_ID,
        "prompt": " ".join(tokens),
        "promptTokens": [_token(i, t, p) for p, (i, t) in enumerate(zip(ids, tokens))],
        "config": {
            "dModel": D_MODEL,
            "nHeads": N_HEADS,
            "nLayers": 1,
            "vocabSize": len(itos),
            "seed": seed,
            "device": "cpu",
            "maxPos": MAX_POS,
            "promptLength": prompt_length,
            "decodeSteps": 1,
            "dHead": D_HEAD,
        },
        "prefill": prefill,
        "decode": decode,
        "equivalence": {
            "cachedMatchesFullRecompute": max_diff <= TOLERANCE,
            "maxAbsLogitDiff": max_diff,
            "tolerance": TOLERANCE,
        },
        "measurementDisclaimer": MEASUREMENT_DISCLAIMER,
    }


def run_experiment(prompt_length: int = 6, seed: int = 42) -> Dict[str, Any]:
    """Detailed P=prompt_length walk plus a scaling table."""
    detail = run_pair(prompt_length, seed)
    scaling = []
    for p in SCALING_LENGTHS:
        pair = run_pair(p, seed)
        scaling.append(
            {
                "promptLength": p,
                "prefill": _stage_summary(pair["prefill"]),
                "decode": _stage_summary(pair["decode"]),
            }
        )
    detail["scaling"] = scaling
    return detail
