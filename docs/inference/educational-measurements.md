# Educational measurements vs production inference

The Phase 0 experiment records:

- how many K/V rows were projected
- how many stored rows were reused
- how many bytes the toy cache occupies
- how many milliseconds a laptop spent in Python

The first three are **mechanically true** for this model. They answer "is work being repeated?"

The millisecond number is **not** a production claim. On this machine the model is 16 dimensions wide, runs on CPU, and is dominated by Python overhead. A real LLM is limited by GPU memory bandwidth, kernel launch, batching, and caches measured in gigabytes — not by `time.perf_counter()` on a toy tensor.

If a later experiment wants to talk about serving speed, it must say so explicitly and use a measurement that matches that claim.
