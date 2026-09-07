/** Canonical wording. Pedagogy tests fail if the primary Learn view contradicts these. */

export const FORBIDDEN_PRIMARY_CLAIMS = [
  "prefill is always compute-bound",
  "decode is always memory-bound",
  "prefill is compute-bound",
  "decode is memory-bound",
  "p² is total model work",
  "p^2 is total model work",
  "logical bytes are actual gpu traffic",
  "logical bytes are hbm traffic",
  "same generated token alone proves numerical equivalence",
  "k/v depends only on token identity",
] as const;

export const LEARN_BANNED_ACRONYMS = [
  "HBM",
  "DRAM",
  "FFN",
  "FLOPs",
  "FLOP",
  "RSS",
] as const;

export const FAKE_BENCHMARK_PHRASES = [
  "tokens per second on a100",
  "production throughput",
  "measured hbm bandwidth",
  "this gpu is memory-bound",
] as const;
