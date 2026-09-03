# InferTab web

A small Next.js app that **only visualizes traces**.

```
experiments/01-why-kv-cache  →  trace.json  →  this UI
```

```bash
npm install
npm run dev
```

`POST /api/trace` runs the local Python experiment and returns JSON. If Python is missing, the committed sample in `public/traces/` is shown instead.

On Apple Silicon, the API forces `arch -arm64 python3` so a Rosetta-hosted Node process does not load the x86_64 slice of Python against an arm64 PyTorch wheel.

No Grafana charts. The point is to see blocks being rebuilt versus blocks sitting on a shelf.
