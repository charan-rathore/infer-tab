# `@infertab/trace-schema`

The contract between experiments and the visualizer.

```
experiment  →  JSON that matches schema.json  →  apps/web
```

- `schema.json` — language-agnostic shape (version `0.1.0`)
- `src/index.ts` — TypeScript types plus a structural validator

A future experiment plugs in by writing the same JSON. The frontend should not grow a new data model for each optimization.
