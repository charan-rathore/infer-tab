# Experiment 03 - Why can little new arithmetic still be slow?

Same tiny causal model as Experiments 01 and 02. Same prefill, then one
decode step. We do **not** change those mechanisms.

This experiment keeps two currencies separate before naming anything fancy:

| Currency | What we count | Unit |
| --- | --- | --- |
| Arithmetic | multiply + add work in attention | FLOPs |
| Data | tensors the step needs available | bytes |

Only after both are visible do we divide them.

**How much math do we get to perform for each byte of data we need available?**

That ratio is later called **arithmetic intensity**. It is an educational
lower-level model of the trade-off, not a production benchmark.

## Convention

One multiply + one add = approximately **2 FLOPs**.

Different FLOP-counting conventions exist. Some references treat a
multiply-accumulate as 1. InferTab uses 2. The choice is a convention,
not a measurement.

These numbers are **attention only** (score calculation + value
aggregation, per head). They are not total Transformer FLOPs.

## Attention work (per head)

Prefill scores: `Q[P, d_h] × Kᵀ[d_h, P] → [P, P]` ≈ `2 × P × P × d_h` FLOPs.

Prefill values: `A[P, P] × V[P, d_h] → [P, d_h]` ≈ `2 × P × P × d_h` FLOPs.

Decode scores: `Q_new[1, d_h] × K_cacheᵀ[d_h, T] → [1, T]` ≈ `2 × T × d_h` FLOPs.

Decode values: `A[1, T] × V_cache[T, d_h] → [1, d_h]` ≈ `2 × T × d_h` FLOPs.

After Experiment 02's one-token decode, `T = P + 1`.

## Data side

For a tensor: `elements × bytesPerElement`. Float32 uses 4 bytes.

We expose Q, K, V, score, and output payloads, plus the logical cached
K/V payload (`tokens × d_model × 2 × bytesPerElement`).

These are **logical** sizes. They are not HBM traffic. Real hardware
movement depends on caching, tiling, kernel fusion, SRAM/register reuse,
and the implementation.

Arithmetic intensity uses the denominator **Q + K + V bytes** (per head):
the tensors attention needs available.

## Worked example (P = 8, d_h = 8, float32)

Prefill, per head:

- score FLOPs = `2 × 8 × 8 × 8` = 1024
- value FLOPs = 1024
- attention FLOPs = 2048
- Q = K = V = `8 × 8 × 4` = 256 bytes each
- logical bytes considered = 768
- `2048 FLOPs / 768 bytes = 2.667 FLOPs per byte`

Decode, T = 9, per head:

- score FLOPs = `2 × 9 × 8` = 144
- value FLOPs = 144
- attention FLOPs = 288
- Q = 32 bytes · K = 288 bytes · V = 288 bytes
- logical bytes considered = 608
- `288 FLOPs / 608 bytes = 0.474 FLOPs per byte`

Decode does **less new math** and still needs a **large stored K/V shelf**.
Lots of math per fetched byte means the data is reused heavily. Little
math per fetched byte means we spend more effort feeding the computation.

## What this does not prove

- attention FLOPs ≠ total model FLOPs
- logical bytes ≠ physical memory traffic
- arithmetic intensity ≠ measured performance
- CPU toy timings cannot establish GPU bottlenecks
- FFN / projection / model-weight movement are deferred
- no roofline yet

## Run

```bash
python3 run.py --prompt-length 8
python3 -m pytest -q
```

## Learning questions

**What does a FLOP represent?**  
One floating-point operation. InferTab treats a multiply plus an add as
about two FLOPs.

**Why is matrix multiplication expensive?**  
A product `A[m, k] × B[k, n]` does a length-`k` dot product for each of
`m × n` outputs. Under our convention that is `2 × m × n × k` FLOPs.

**What does “bytes moved” mean conceptually?**  
Here it means the logical size of the tensors the step needs available  - 
not a probe of HBM or DRAM.

**When dividing FLOPs by bytes, what does the answer mean?**  
How much arithmetic we get to perform for each byte we must have on hand.

**Why can two computations with similar FLOPs have different speed?**  
They can require very different amounts of data to be available. Feeding
the computation is a second cost beside doing the math.

**Why might cached decode still need to access a large amount of state?**  
Only one new query is asking, but every stored K and V in the history is
still something to match and mix.

## Next question

Once math and data are visible as two currencies, how would we tell
whether a real machine is waiting on arithmetic or waiting to fetch the
bytes the arithmetic needs?
