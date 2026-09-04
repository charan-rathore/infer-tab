# Experiment 02 — Why are prefill and decode different?

Same tiny causal model as Phase 0. This time we do **not** compare “forget vs remember.” We split one generation into two jobs and look at their **shapes**.

| Stage | Everyday name | What happens |
| --- | --- | --- |
| Prefill | Read what already exists | All prompt tokens go through attention together. Causal mask hides the future. |
| Decode | Write one new piece | One new query reads the stored K/V shelf and adds one token. |

Technical names appear after the picture, not before.

## Why the cache is allowed (same rule as Phase 0)

A past K/V row may depend on its token, position, and causally preceding context at this layer. A later token cannot rewrite that already-computed state. So prefill can fill the shelf once, and decode can keep it.

## What we count

- `qRowsProjected` / `kRowsProjected` / `vRowsProjected` — rows, not FLOPs
- `attentionScoreElementsPerHead` — cells in one head’s score grid
- `logicalKvBytesWritten` / `logicalKvBytesAvailable` — float32 K/V payload, not RSS
- `elapsedMs` — laptop timer on a 16-d toy. **Not** production latency.

We do **not** claim prefill is compute-bound or decode is memory-bandwidth-bound. The shapes are the evidence that later makes those claims *possible* to discuss.

## Run

```bash
python3 run.py --prompt-length 6
python3 -m pytest -q
```

Writes `traces/sample-p6.json` (detailed P=6 plus a scaling table for 6 / 16 / 32 / 64 / 128).

## Learning questions

**Why can prefill process many tokens together even though attention is causal?**  
Because those tokens already exist. Causality is “do not read the future,” not “wait to be born.” A mask on a `[P, P]` grid is enough.

**Why does decode use one new Q but many old K/V values?**  
Only the newest token is asking a question. Every past position still has a key (to match) and a value (to add).

**Why does KV-cache size grow with sequence length?**  
Each new token writes one more K row and one more V row. The shelf is one pair of vectors per position.

**Why is prefill shaped like `[P × P]` attention while decode looks like `[1 × P]`?**  
Prefill has P queries and P keys. Decode has 1 new query and (after append) P+1 keys.

**What important production behavior can this experiment still NOT prove?**  
That prefill is compute-bound or decode is memory-bandwidth-bound on a GPU. No roofline, no HBM traffic, no kernel fusion. Just shapes.

## What this is not

Not vLLM, FlashAttention, batching, or a trained model. Generated words are junk. Watch the grid versus the single row.
