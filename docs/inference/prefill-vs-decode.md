# Prefill vs decode

Two jobs, one model.

**Prefill** reads a prompt that already exists. Every token can be a query at once. A causal mask stops token i from seeing token j > i. The score grid is `[P, P]` per head.

**Decode** writes the next token. There is one new query. It reads the K/V shelf, which is now longer. The score row is `[1, P+1]` per head after the new K/V row is appended.

This is why the two stages *look* different. It is not yet a proof that one is compute-bound and the other is memory-bandwidth-bound.
