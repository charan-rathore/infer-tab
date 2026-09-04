# Experiment 01 — Why does a KV cache exist?

Two implementations of the same tiny causal attention layer:

| Path | What it does at each new token |
| --- | --- |
| Naive | Re-projects **Q, K, and V** for every prefix token |
| Cached | After prefill, projects **Q/K/V only for the newest token** and reuses stored K/V |

They must emit the same next tokens **and** the same raw logits. The cache is a store of already-computed states, not a different model.

## Why the cache is allowed

A past token's K/V may depend on its token, its position, and all causally preceding context represented at that layer.

In this one-layer toy, that context is just token + positional embeddings. The wording still holds when we later add more layers: a later token cannot rewrite an already-computed past hidden state in a causal Transformer. The new token changes **Q** (what we ask now). It does not invalidate past K/V.

## What we count

`kvRowsProjected` / `kvRowsReused` are **K/V row counts**, not FLOPs.

- Naive still rebuilds Q for the whole prefix. We do not add those Q projections into the comparison.
- Cached decode after prefill computes Q only for the newest token.
- The educational comparison is: how many K/V rows did we project again that we did not need to?

`logicalKvBytes` is `tokens × d_model × 2 × 4` (float32 K and V payload). It is not process peak memory. The cache grows with `torch.cat`, which can copy the whole table each step. That waste is left visible on purpose.

## Sample accounting (P = 6, N = 6)

Prompt `the cat sat on the mat`, then 6 generated tokens:

| | Projected K/V rows | Reused K/V rows |
| --- | --- | --- |
| Naive | 6+7+8+9+10+11 = 51 | 0 |
| Cached | 6+1+1+1+1+1 = 11 | 0+6+7+8+9+10 = 40 |

Cached projected rows are **11, not 12**, because the last generated token is never fed back through the model. Generation stops.

## Run

```bash
python3 run.py --prompt "the cat sat on the mat" --max-new-tokens 6
python3 -m pytest -q
```

Writes `traces/sample.json`. The web app reads that file (or a freshly generated one).

`elapsedMs` is a laptop stopwatch on a 16-dimensional toy. See [docs/inference/educational-measurements.md](../../docs/inference/educational-measurements.md).

## What this is not

This is not vLLM, not ChatGPT, and not a trained model. Generated words will look like junk. That is expected. Watch which K/V rows get rebuilt.
