# InferTab web

A small Next.js app that **only visualizes traces**.

```
experiments/01-why-kv-cache            →  sample-why-kv-cache.json
experiments/02-prefill-vs-decode       →  sample-prefill-decode.json
experiments/03-arithmetic-vs-memory    →  sample-arithmetic-memory.json
                                       →  this UI
```

```bash
npm install
npm run dev
```

`POST /api/trace` runs the local Python experiment and returns JSON. If Python is missing, the committed sample in `public/traces/` is shown instead.

On Apple Silicon, the API forces `arch -arm64 python3` so a Rosetta-hosted Node process does not load the x86_64 slice of Python against an arm64 PyTorch wheel.

No Grafana charts. The point is to see blocks being rebuilt versus blocks sitting on a shelf.

The three routes now select lenses of one mounted machine in `app/layout.tsx`.
`MachineProvider` owns a deterministic event reducer; `JourneyMachine` supplies the
shared discovery flow; `MachineBoard` projects stable position objects. The small
modules under `lib/simulation/` own trace adapters, semantic events, derivation
references, and versioned replay validation. Every new function has a responsibility
comment. There are no playback timers or animation-completion dependencies.

The default third lens uses `journey-arithmetic-memory.json`, a six-token recording
from the unchanged Experiment 03 `run_experiment(6)`. The original eight-token
sample remains available and checked. Scaling views use recorded arithmetic;
2-byte scaling payloads are explicitly derived as recorded payload × 2/4. The
detailed scenario uses Python's recorded dtype comparison directly.

Open **Recording and replay** to run a custom sentence or save/open a portable JSON
replay. A replay carries the traces, prompt, and ordered learner actions. Navigation
preserves progress; a reload starts fresh unless a replay is opened. Custom 01
prompts do not relabel the independently recorded 02/03 scenarios.

Validation: `npm run typecheck`, `npm test`, `npm run check-trace`, `npm run build`.
See [the architecture and discovery contract](../../docs/inference/product-system.md).
