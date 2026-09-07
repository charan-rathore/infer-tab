/** Formulas shared by the UI and tests. Must match the Python experiments. */

export const FLOPS_PER_MULTIPLY_ADD = 2;
export const D_MODEL = 16;
export const N_HEADS = 2;
export const D_HEAD = D_MODEL / N_HEADS;

export function matmulFlops(m: number, n: number, k: number): number {
  if (Math.min(m, n, k) < 0) throw new Error("matrix dimensions must be non-negative");
  return FLOPS_PER_MULTIPLY_ADD * m * n * k;
}

export function tensorBytes(elements: number, bytesPerElement: number): number {
  if (elements < 0 || bytesPerElement < 1) {
    throw new Error("elements must be >= 0 and bytesPerElement >= 1");
  }
  return elements * bytesPerElement;
}

export function logicalKvBytes(
  tokens: number,
  dModel: number = D_MODEL,
  bytesPerElement: number = 4,
): number {
  return tensorBytes(tokens * dModel * 2, bytesPerElement);
}

export function prefillAttentionFlopsPerHead(p: number, dHead: number = D_HEAD): number {
  return matmulFlops(p, p, dHead) + matmulFlops(p, dHead, p);
}

export function decodeAttentionFlopsPerHead(t: number, dHead: number = D_HEAD): number {
  return matmulFlops(1, t, dHead) + matmulFlops(1, dHead, t);
}

export function prefillLogicalBytes(p: number, dHead: number, bytesPerElement: number) {
  const q = tensorBytes(p * dHead, bytesPerElement);
  const k = q;
  const v = q;
  return {
    qBytes: q,
    kBytes: k,
    vBytes: v,
    scoreBytes: tensorBytes(p * p, bytesPerElement),
    outputBytes: q,
    logicalBytesConsidered: q + k + v,
  };
}

export function decodeLogicalBytes(t: number, dHead: number, bytesPerElement: number) {
  const q = tensorBytes(1 * dHead, bytesPerElement);
  const k = tensorBytes(t * dHead, bytesPerElement);
  const v = k;
  return {
    qBytes: q,
    kBytes: k,
    vBytes: v,
    scoreBytes: tensorBytes(1 * t, bytesPerElement),
    outputBytes: q,
    logicalBytesConsidered: q + k + v,
  };
}

export function arithmeticIntensity(flops: number, logicalBytes: number): number {
  if (logicalBytes <= 0) throw new Error("logical byte denominator must be positive");
  return flops / logicalBytes;
}

export function formatIntensity(flops: number, logicalBytes: number): string {
  const value = arithmeticIntensity(flops, logicalBytes);
  const rounded = Math.round(value * 1000) / 1000;
  const shown =
    Math.abs(rounded - Math.round(rounded)) < 1e-9 ? String(Math.round(rounded)) : String(rounded);
  return `${flops} FLOPs / ${logicalBytes} bytes = ${shown} FLOPs per byte`;
}

export function naiveProjectedSeries(promptLength: number, generated: number): number[] {
  return Array.from({ length: generated }, (_, i) => promptLength + i);
}

export function cachedProjectedSeries(promptLength: number, generated: number): number[] {
  if (generated < 1) return [];
  return [promptLength, ...Array.from({ length: generated - 1 }, () => 1)];
}

export function triangularSum(n: number): number {
  return (n * (n + 1)) / 2;
}

export function causalCells(p: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < p; i += 1) {
    for (let j = 0; j < p; j += 1) {
      if (j <= i) cells.push([i, j]);
    }
  }
  return cells;
}

export function maskedCells(p: number): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let i = 0; i < p; i += 1) {
    for (let j = 0; j < p; j += 1) {
      if (j > i) cells.push([i, j]);
    }
  }
  return cells;
}

export function joinSeries(values: number[]): string {
  return values.join(" + ");
}
