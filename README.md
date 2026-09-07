# InferTab

Watch what happens **inside** language-model inference - then change one mechanism and see the difference.

InferTab is not a chat UI, not a metrics dashboard, and not a wrapper around vLLM. It is a sequence of small, from-scratch experiments:

**build a mechanism → let it fail → measure the bottleneck → visualize the reason → add the optimization → compare.**

Phase 0 answers: **why does a KV cache exist?**  
Phase 1 answers: **why are prefill and decode different jobs?**  
Phase 2 answers: **why can an inference step do relatively little new arithmetic and still be slow?**

## What you can do today

1. Run a tiny autoregressive attention experiment in Python (no GPU, no downloads).
2. Compare **naive decoding** (recompute every past key/value) with **cached decoding** (store and reuse them).
3. Then split one generation into **prefill** (read the prompt together) and **decode** (one new query, long shelf).
4. Then count **attention arithmetic** and **logical tensor bytes** as two currencies, and only afterwards form their ratio.
5. Open a playful web view that replays the recorded trace.

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

Then open [http://localhost:3000](http://localhost:3000). The journey is 01 Repeating work, 02 Read vs write, 03 Math vs data. The routes are lenses of one persistent machine with Learn, Inspect, and Prove. Each discovery begins with a prediction, changes one mechanism, and derives the consequence from a recorded trace. Recording and replay contains custom prompts and portable replay files.

See [docs/inference/scaling-book.md](docs/inference/scaling-book.md) for how these map to the Scaling Book.

Typing a custom sentence calls a local Python process (no cloud). If Python is unavailable, the UI falls back to the committed sample trace.

## Repository map

| Path | Role |
| --- | --- |
| `experiments/01-why-kv-cache/` | Why a KV cache exists. |
| `experiments/02-prefill-vs-decode/` | Why prefill and decode have different shapes. |
| `experiments/03-arithmetic-vs-memory/` | Why little new arithmetic can still be slow. |
| `packages/trace-schema/` | Shared JSON shape for every future experiment. |
| `apps/web/` | Next.js visualizer. Consumes traces only. |
| `docs/git/` | How Git actually moves state (working tree → index → objects → remote). |
| `docs/inference/` | What this experiment teaches, and what it does **not** prove. |
| `research/` | Papers we may explore later. Nothing here is implemented yet. |

## Educational measurements vs production inference

This repo records wall-clock time and **K/V row counts** on a **16-dimensional toy model**, and later **symbolic attention FLOPs** plus **logical tensor bytes**. That is enough to see *which K/V work is repeated* and *how much math we get per byte we need available*. It is **not** a claim about production LLM speed.

Production KV caches matter because real models have thousands of dimensions, thousands of tokens, and are limited by GPU memory bandwidth - not because a laptop timer said so. See [docs/inference/educational-measurements.md](docs/inference/educational-measurements.md).

## What is deliberately not here yet

Roofline plots, KV eviction, compression, PagedAttention, prefix caching, quantization, speculative decoding, batching, scheduling, and distributed inference. Those are later phases. The research log in `research/papers.md` only records directions.

## License

MIT. See [CONTRIBUTING.md](CONTRIBUTING.md).

See [the product-system architecture](docs/inference/product-system.md) for the shared event model, object identity, source-of-truth boundaries, and exact discovery journeys.
