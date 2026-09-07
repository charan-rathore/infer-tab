# Experiment 02 - Why are prefill and decode different?

Same tiny causal model as Phase 0. We split one generation into two jobs and look at **attention-score shapes**, not total model cost.

| Everyday name | After you see it | What happens |
| --- | --- | --- |
| Read what already exists | Prefill | All prompt tokens ask questions together. A cover hides the future. |
| Write one new piece | Decode | One new question reads the stored K/V shelf. |

## What P² versus ~P actually is

Per head, prefill scores are `[P, P]` - that is `P²` **score cells**.

One decode step, after appending the new K/V row, is `[1, P+1]` - about `P` **score cells**.

That is **not** “prefill = O(P²) of the whole Transformer.” Q/K/V projections, the output mix, and any later FFN are separate. This experiment does not name a hardware bottleneck.

On the square, implementations may still touch the future cells differently. We count them conceptually:

- materialized: `P²`
- causally usable: `P(P+1)/2`
- masked future: `P(P-1)/2`

For P=6: 36, 21, 15.

## Symbolic attention math (per head, not GPU FLOPs)

Prefill scores: `Q[P, d_h] x K^T[d_h, P] -> [P, P]`, multiplies scale like `P^2 x d_h`.

Prefill mix: `softmax(scores)[P, P] x V[P, d_h]`.

Decode scores: `Q_new[1, d_h] x K_cache^T[d_h, T] -> [1, T]`, multiplies scale like `T x d_h`.

Decode mix: `softmax(scores)[1, T] x V[T, d_h]`.

## Why the cache is allowed (same rule as Phase 0)

A past K/V row may depend on its token, position, and causally preceding context at this layer. A later token cannot rewrite that already-computed state.

## Run

```bash
python3 run.py --prompt-length 6
python3 -m pytest -q
```

## Learning questions

**Why can prefill process many tokens together even though attention is causal?**  
Those tokens already exist. Causality is “do not read the future,” not “wait to be born.”

**Why does decode use one new Q but many old K/V values?**  
Only the newest token is asking. Every past position still has a label and a contribution.

**Why does KV-cache size grow with sequence length?**  
Each new token writes one more K and one more V.

**Why is prefill a `[P × P]` score board while decode is `[1 × T]`?**  
Prefill has P queries and P keys. Decode has 1 new query and T = P+1 keys after append.

**What can this still NOT prove?**  
That prefill is compute-bound or decode is memory-bandwidth-bound. No roofline, no HBM traffic.
