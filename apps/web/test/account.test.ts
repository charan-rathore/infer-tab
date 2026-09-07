import { describe, expect, it } from "vitest";
import {
  D_HEAD,
  arithmeticIntensity,
  cachedProjectedSeries,
  causalCells,
  decodeAttentionFlopsPerHead,
  formatIntensity,
  logicalKvBytes,
  maskedCells,
  matmulFlops,
  naiveProjectedSeries,
  prefillAttentionFlopsPerHead,
  prefillLogicalBytes,
  tensorBytes,
  triangularSum,
} from "@/lib/account";
import { FORBIDDEN_PRIMARY_CLAIMS, LEARN_BANNED_ACRONYMS } from "@/lib/terminology";
import { LEARN_01, LEARN_02, LEARN_03 } from "@/lib/copy";

describe("formulas", () => {
  it("uses multiply plus add as 2 for tiny shapes", () => {
    expect(matmulFlops(2, 4, 3)).toBe(48);
    expect(prefillAttentionFlopsPerHead(8, 8)).toBe(2048);
    expect(decodeAttentionFlopsPerHead(9, 8)).toBe(288);
  });

  it("bytes are elements times dtype", () => {
    expect(tensorBytes(8 * 8, 4)).toBe(256);
    expect(tensorBytes(8 * 8, 2)).toBe(128);
    expect(logicalKvBytes(6, 16, 4)).toBe(6 * 16 * 2 * 4);
  });

  it("dtype halves bytes not flops", () => {
    const f32 = prefillLogicalBytes(8, D_HEAD, 4);
    const f16 = prefillLogicalBytes(8, D_HEAD, 2);
    expect(f16.logicalBytesConsidered).toBe(f32.logicalBytesConsidered / 2);
    expect(prefillAttentionFlopsPerHead(8)).toBe(prefillAttentionFlopsPerHead(8));
  });

  it("intensity keeps FLOPs/byte units", () => {
    const flops = 2048;
    const bytes = 768;
    expect(arithmeticIntensity(flops, bytes)).toBeCloseTo(flops / bytes);
    expect(formatIntensity(flops, bytes)).toBe("2048 FLOPs / 768 bytes = 2.667 FLOPs per byte");
  });

  it("series follow generation length", () => {
    expect(naiveProjectedSeries(6, 6)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(cachedProjectedSeries(6, 6)).toEqual([6, 1, 1, 1, 1, 1]);
    expect(naiveProjectedSeries(6, 1)).toEqual([6]);
    expect(cachedProjectedSeries(6, 1)).toEqual([6]);
  });

  it("causal cells match triangles", () => {
    expect(causalCells(6)).toHaveLength(triangularSum(6));
    expect(maskedCells(6)).toHaveLength(15);
    expect(causalCells(6).every(([i, j]) => j <= i)).toBe(true);
    expect(maskedCells(6).every(([i, j]) => j > i)).toBe(true);
  });
});

describe("learn copy", () => {
  const blob = `${JSON.stringify(LEARN_01)} ${JSON.stringify(LEARN_02)} ${JSON.stringify(LEARN_03)}`.toLowerCase();
  it("avoids forbidden bottleneck claims", () => {
    for (const claim of FORBIDDEN_PRIMARY_CLAIMS) {
      expect(blob.includes(claim)).toBe(false);
    }
  });
  it("avoids unexplained acronyms before reveal", () => {
    const beforeReveal = `${LEARN_01.question} ${LEARN_01.rebuild} ${LEARN_01.keep} ${LEARN_02.ask} ${LEARN_03.mathAsk}`;
    for (const acronym of LEARN_BANNED_ACRONYMS) {
      expect(beforeReveal.includes(acronym)).toBe(false);
    }
  });
});
