# InferTab

Watch what happens **inside** language-model inference — then change one mechanism and see the difference.

InferTab is not a chat UI, not a metrics dashboard, and not a wrapper around vLLM. It is a sequence of small, from-scratch experiments:

**build a mechanism → let it fail → measure the bottleneck → visualize the reason → add the optimization → compare.**

Phase 0 answers one question: **why does a KV cache exist?**

## What you can do today

1. Run a tiny autoregressive attention experiment in Python (no GPU, no downloads).
2. Compare **naive decoding** (recompute every past key/value) with **cached decoding** (store and reuse them).
3. Open a playful web view that replays the recorded trace.

```
experiment  →  trace.json  →  visualization
```

The web app never owns the inference math. Python writes a JSON trace. The UI only reads it.

## Quick start

You need Python 3.9+, PyTorch (CPU), Node 18+, and about 8 GB of RAM. Nothing is downloaded at runtime.

```bash
# 1. Run the experiment and write a fresh trace
cd experiments/01-why-kv-cache
python3 run.py --prompt "the cat sat on the mat" --max-new-tokens 6

# 2. Check that naive and cached paths agree, and that the trace is valid
python3 -m pytest -q

# 3. Open the visual comparison
cd ../../apps/web
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000). Type a short sentence, step through tokens, and toggle memory on/off.

Typing a custom sentence calls a local Python process (no cloud). If Python is unavailable, the UI falls back to the committed sample trace.

## Repository map

| Path | Role |
| --- | --- |
| `experiments/01-why-kv-cache/` | Tiny from-scratch attention. Produces `trace.json`. |
| `packages/trace-schema/` | Shared JSON shape for every future experiment. |
| `apps/web/` | Next.js visualizer. Consumes traces only. |
| `docs/git/` | How Git actually moves state (working tree → index → objects → remote). |
| `docs/inference/` | What this experiment teaches, and what it does **not** prove. |
| `research/` | Papers we may explore later. Nothing here is implemented yet. |

## Educational measurements vs production inference

This repo records wall-clock time and operation counts on a **16-dimensional toy model**. That is enough to see *which work is repeated*. It is **not** a claim about production LLM speed.

Production KV caches matter because real models have thousands of dimensions, thousands of tokens, and are limited by GPU memory bandwidth — not because a laptop timer said so. See [docs/inference/educational-measurements.md](docs/inference/educational-measurements.md).

## What is deliberately not here yet

KV eviction, compression, PagedAttention, prefix caching, quantization, speculative decoding, batching, scheduling, and distributed inference. Those are later phases. The research log in `research/papers.md` only records directions.

## License

MIT. See [CONTRIBUTING.md](CONTRIBUTING.md).
