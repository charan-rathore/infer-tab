# Prefill vs decode

Two jobs, one model. The square versus the row is an **attention-score** story.

**Read the existing context.** Every prompt token can be a query at once because those tokens already exist. Scores per head are `[P, P]`. A causal cover hides the future triangle `P(P-1)/2`. Implementations may still materialize that triangle; the count is conceptual.

**Write one new piece.** One new query. After the new K/V row is appended, scores are `[1, P+1]`. No future keys exist for that newest query.

Dominant attention multiplies per head scale like `P² × d_h` for the square and `T × d_h` for the row. That is not whole-model FLOPs and not a GPU bottleneck claim.
