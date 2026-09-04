# Why a KV cache exists

When a transformer writes the next token, attention looks at every token so far.

For each past position the model has already computed two vectors:

- **Key (K)** — a label for "what is at this position"
- **Value (V)** — the content it will add if you attend to it

Those vectors may depend on the token, its position, and all causally preceding context at that layer. In InferTab's one-layer toy, that is token + positional embeddings. With more layers the same rule holds: a later token cannot change a hidden state that was already computed for a past position.

Without memory, the only way to attend to the past is to build every K and V again. With memory, you keep them on a shelf and only build the new one.

That shelf is the KV cache.

Phase 0 stops here. Later experiments ask what to do when the shelf no longer fits.
