# InferTab and the Scaling Book

InferTab is a sequence of tiny, visual experiments. The [DeepMind / JAX Scaling Book](https://jax-ml.github.io/scaling-book/) is a first-principles reference for the same ideas at production scale. We use it to check reasoning, not as a UI or a source of measured numbers.

Primary chapter: [All About Transformer Inference](https://jax-ml.github.io/scaling-book/inference/).

Related: [Transformer math](https://jax-ml.github.io/scaling-book/transformers/) and [rooflines](https://jax-ml.github.io/scaling-book/roofline/).

| Experiment | Scaling Book idea | What InferTab shows | What InferTab does not claim |
| --- | --- | --- | --- |
| 01 Repeating work | KV caching avoids recomputing past keys and values | Rebuilding the past versus keeping finished work | That a laptop timer is GPU bandwidth |
| 02 Read vs write | Prefill processes the prompt together; generation writes one new token | A score square versus one new row | That the square is total model cost |
| 03 Math vs data | Arithmetic intensity is math work over bytes that must be available | Two piles, then their ratio | A production roofline or measured traffic |

Memory capacity (how large the stored shelf is) is not the same as memory bandwidth (how fast those bytes can arrive) and not the same as arithmetic (how much math those bytes enable). Experiment 03 names the ratio only after both piles are visible. A later experiment can ask which of those limits a real machine is hitting.

Do not paste Scaling Book conclusions such as "prefill is compute-bound" into the Learn view. Those statements depend on hardware, batch size, and implementation.
