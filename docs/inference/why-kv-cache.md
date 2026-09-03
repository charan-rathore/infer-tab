# Why a KV cache exists

When a transformer writes the next token, attention looks at every token so far.

For each of those past tokens the model has already computed two vectors:

- **Key (K)** — a label for "what is in this token"
- **Value (V)** — the content it will add if you attend to it

Those two vectors are functions of **that token alone**. Generating a new word does not change "the cat" from two tokens ago.

Without memory, the only way to attend to the past is to build every K and V again. With memory, you keep them on a shelf and only build the new one.

That shelf is the KV cache.

Phase 0 stops here. Later experiments ask what to do when the shelf no longer fits.
