# Arithmetic vs stored data

Two currencies, then their ratio.

**Arithmetic.** Attention scores and value aggregation, per head, under
the convention that one multiply + one add ≈ 2 FLOPs. Not total model
FLOPs.

**Data.** Logical tensor payloads: `elements × bytesPerElement`. Not
measured HBM or DRAM traffic. Caching, tiling, fusion, and SRAM reuse
decide what a real chip actually moves.

**Arithmetic intensity** is `FLOPs / logicalBytesConsidered`, written
with units (`2048 FLOPs / 768 bytes = 2.667 FLOPs per byte`). It asks:
how much math do we get to perform for each byte we need available?

Lots of math per fetched byte means the data is reused heavily. Little
math per fetched byte means we spend more effort feeding the computation.

This is an educational model of the trade-off. It is not measured
performance, not a GPU bottleneck claim, and not a roofline.
