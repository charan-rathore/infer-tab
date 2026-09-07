# Contributing to InferTab

Small, focused changes. One idea per merge request.

## How an experiment is allowed to exist

Inference code and visualization stay separate.

1. The experiment lives under `experiments/`.
2. It writes a JSON file that validates against `packages/trace-schema/schema.json`.
3. The web app consumes that JSON. It must not re-implement the experiment's math as a second source of truth.

```
experiment
    ↓
trace.json
    ↓
visualization
```

If you add a new experiment, add a fixture trace and a test that naive-vs-optimized outputs match (when they should) within a stated tolerance.

## Commit messages

Use conventional commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Reference a GitLab/GitHub issue as `#123` when there is one.

## Local checks before you push

```bash
python3 -m pytest tests experiments/01-why-kv-cache experiments/02-prefill-vs-decode experiments/03-arithmetic-vs-memory -q
python3 scripts/check_no_emdash.py
cd apps/web && npm run lint && npm run typecheck && npm run test && npm run check-trace && npm run build
```

Do not commit `.env`, API keys, or model weights.

## Comments

When you introduce an inference concept, write a short comment that says **why it exists**, not only what the line does.

## Phase rule

Do not start the next phase in the same change as a working one. Finish the mental model first.

## What stays off GitHub

This repository is public. Keep unreleased product architecture in a local `private/` folder (gitignored). Do not commit roadmaps, system diagrams, or “how InferTab will be a company” docs. The experiments, traces, and visualizer are the public work.
