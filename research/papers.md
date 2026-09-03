# Papers and directions (not implemented)

Each entry is a reminder, not a result. InferTab has not reproduced any of these.

## PagedAttention

Problem: A serving batch needs a KV cache per request. If each cache is one contiguous allocation sized for the maximum length, most of that memory sits empty (internal fragmentation) and finished requests leave holes (external fragmentation). That wasted memory caps batch size.

Core idea: Store K/V in fixed-size pages, like an operating-system virtual memory. A block table maps a sequence's logical token positions to physical pages that need not be contiguous. Pages are allocated as the sequence grows and freed when it ends. Prefixes can share pages.

Why InferTab may care: After someone understands "a cache is a growing list of K/V rows," the next shock is that the list is also a memory allocator problem.

Experiment we could eventually run: A toy allocator that gives each sequence a max-length buffer vs. paged blocks, then visualize wasted slots as tokens stream in and requests finish. No vLLM required.

## LMCache

Problem: GPU HBM cannot hold every useful KV cache. The same prefix (a long document, a system prompt) is often recomputed on the next request, or on another engine, because the cache died with the first process.

Core idea: A KV cache layer beside the engine: offload pages to CPU / disk / remote storage, look them up by token-chunk hash, and move them back for prefix reuse or prefill–decode disaggregation.

Why InferTab may care: It turns "the shelf" into a memory hierarchy. Hits and misses become visible.

Experiment we could eventually run: Three shelves (GPU / CPU / disk) with fake latencies. Replay two requests that share a prefix and count how many K/V rows were rebuilt vs. fetched.

## TRIM-KV

Problem: Long-horizon inference wants a bounded cache. Heuristic eviction (attention scores, sliding windows) is cheap but can drop the tokens that later reasoning still needs.

Core idea: At token creation, a small learned retention gate predicts how long that token will stay useful, per layer/head. When the budget is exceeded, low-retention tokens are evicted. ("Cache What Lasts," ICLR 2026.)

Why InferTab may care: It is a clean story: not every stored K/V row deserves to stay.

Experiment we could eventually run: After Phase 0, add a budget of N rows and a visible retention score. Compare "drop the oldest" vs. "drop the lowest score" on a synthetic task where one early token is the answer.

## LookaheadKV

Problem: Eviction quality improves if you know which past tokens the *future* response will attend to. Drafting that future to score the cache is accurate and expensive (prefill / TTFT gets worse).

Core idea: Train tiny modules and special lookahead tokens that estimate future importance without generating a draft. Eviction cost drops; quality aims to stay close to draft-based scoring.

Why InferTab may care: It makes "importance" a prediction about the future, not only a look at the past.

Experiment we could eventually run: A two-pass viz — score tokens from the prompt alone vs. after peeking at later queries — and show which rows would have been wrongly dropped.

## xKV

Problem: KV memory grows with layers as well as with tokens. Adjacent layers often spend capacity storing similar principal directions.

Core idea: Dominant singular vectors of K/V align across layers. Jointly factorize grouped layers into one shared low-rank basis plus small per-layer coefficients (training-free). Optional selective reconstruction at decode time.

Why InferTab may care: Compression is a different lever from eviction: you keep the tokens, but store them in fewer numbers.

Experiment we could eventually run: Show two layers' K matrices, their shared basis, and the reconstruction error as rank shrinks. Still a toy, still honest about not being Llama-3.1.

## DropKV

Problem: Choosing which subset of cache rows to drop, if you want the attention output to stay close to the full cache, is a combinatorial (NP-hard) problem. Heavy heuristics are hard to kernelize.

Core idea: Decouple the joint decision into a per-token score (attention weight plus a value residual). Under a stated cone condition this is a constant-factor approximation. Fused kernels avoid materializing the full attention matrix.

Why InferTab may care: It asks a precise question: "which row, if removed, changes the output the least?"

Experiment we could eventually run: For a tiny sequence, compute the true output-with-row-removed error for every token, then compare that ranking to DropKV's score. Visualize the mismatch.

## Speculative decoding

Problem: Autoregressive decode is serial: you cannot ask the big model for token t+1 until token t exists. That under-uses a GPU.

Core idea: A cheap draft model proposes several future tokens. The target model checks them in one parallel forward. Accept the prefix that matches; reject from the first mismatch. Output distribution stays that of the target model.

Why InferTab may care: It is the first optimization that is about *latency of serial steps*, not about storing K/V.

Experiment we could eventually run: Two tiny networks, a draft that is often right on easy tokens, and a verifier. Animate proposed tokens turning green or snapping back.

## Hierarchical KV caching

Problem: The working set of K/V is larger than GPU memory but has locality: the newest tokens and the shared prefix are hotter than the middle of a long document.

Core idea: Place cache pages on a ladder — on-device HBM, host RAM, local NVMe, remote store — and migrate them with prefetch / eviction, the way CPUs use L1/L2/L3. LMCache is one systems incarnation; others appear as "offloading" papers.

Why InferTab may care: Once the shelf exists, *where* the shelf lives becomes the story.

Experiment we could eventually run: Color pages by tier and charge a visible stall when a row is read from "disk." Still synthetic latencies; still labeled as such.
