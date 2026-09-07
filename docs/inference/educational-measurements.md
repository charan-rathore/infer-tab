# Educational measurements vs production inference

The Phase 0 experiment records:

- `kvRowsProjected` - how many K/V rows were projected
- `kvRowsReused` - how many stored K/V rows were read instead
- `logicalKvBytes` - `tokens × d_model × 2 × 4` (float32 K and V payload)
- how many milliseconds a laptop spent in Python

The row counts answer "is K/V work being repeated?" They are **not** a FLOP comparison. Naive decoding also rebuilds Q for the whole prefix; cached decoding after prefill builds Q only for the newest token. We count K/V rows because that is the reusable state.

`logicalKvBytes` is the logical payload, not process peak memory. Growing the cache with `torch.cat` can allocate and copy extra buffers. We leave that allocator naive on purpose.

The millisecond number is **not** a production claim. On this machine the model is 16 dimensions wide, runs on CPU, and is dominated by Python overhead. A real LLM is limited by GPU memory bandwidth, kernel launch, batching, and caches measured in gigabytes - not by `time.perf_counter()` on a toy tensor.

Phase 1 counts `attentionScoreCellsPerHead`, plus the causal and masked triangles. Those are attention-grid cells, not whole-model FLOPs and not a GPU bottleneck. `elapsedMs` is optional educational timing only.

Phase 2 counts **symbolic attention FLOPs** (score + value mix per head, multiply+add = 2) and **logical tensor bytes** (`elements × bytesPerElement`). Their ratio is arithmetic intensity. That is an educational model of the trade-off. It is not measured HBM traffic, not total model cost, and not a roofline.

If a later experiment wants to talk about serving speed, it must say so explicitly and use a measurement that matches that claim.

The Mapping of these experiments onto Scaling Book ideas lives in [scaling-book.md](scaling-book.md). That note is a reference, not a set of claims for the Learn view.
