# `@infertab/trace-schema`

The contract between experiments and the visualizer.

```
experiment  →  JSON that matches schema.json  →  apps/web
```

- `schema.json` — Phase 0 KV-cache comparison (version `0.2.0`)
- `schema-prefill-decode.json` — Phase 1 prefill vs decode (version `0.3.0`)
- `src/index.ts` — TypeScript types plus structural validators

A future experiment plugs in by writing the same JSON. The frontend should not grow a new data model for each optimization.
