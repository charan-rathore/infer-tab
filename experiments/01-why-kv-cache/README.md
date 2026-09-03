# Experiment 01 — Why does a KV cache exist?

Two implementations of the same tiny causal attention layer:

| Path | What it does at each new token |
| --- | --- |
| Naive | Projects Key and Value for **every** past token again |
| Cached | Projects Key and Value for **only** the new token and reuses the rest |

They must emit the same next tokens. The cache is a store of numbers, not a different model.

## Why the cache is allowed

`K_i = W_k(x_i)` and `V_i = W_v(x_i)` depend only on token `i`. Later tokens change the **query** ("what am I looking for now?") but not past keys and values ("what did those tokens contain?").

If you recompute them, you get the same floats. The naive path does that work anyway.

## Run

```bash
python3 run.py --prompt "the cat sat on the mat" --max-new-tokens 6
python3 -m pytest -q
```

Writes `traces/sample.json`. The web app reads that file (or a freshly generated one).

## What the numbers mean

- `recomputedOps` — how many K/V rows were projected this step
- `reusedOps` — how many stored K/V rows were read instead
- `cacheBytes` — `tokens × d_model × 2 × 4` (K and V, float32)

`elapsedMs` is a laptop stopwatch on a 16-dimensional toy. See [docs/inference/educational-measurements.md](../../docs/inference/educational-measurements.md).

## What this is not

This is not vLLM, not ChatGPT, and not a trained model. Generated words will look like junk. That is expected. Watch which blocks get rebuilt.
