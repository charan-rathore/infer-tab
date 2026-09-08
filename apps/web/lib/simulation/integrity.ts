import type { KvBlock, TraceToken } from "@/lib/schema";
import type { TraceBundle } from "./model";

/** Fail closed when recorded facts disagree; these checks verify Python's contract, not supply UI results. */
function requireFact(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error("Invalid recording: " + message);
}

/** Compare token occurrences by position and vocabulary value, including repeated words. */
function sameToken(a: TraceToken, b: TraceToken): boolean {
  return (
    !!a &&
    !!b &&
    a.position === b.position &&
    a.id === b.id &&
    a.text === b.text
  );
}

/** Compare recorded tensor previews with the rounding tolerance used by Python's five-decimal serialization. */
function sameBlock(a: KvBlock, b: KvBlock, tolerance: number): boolean {
  return (
    sameToken(a, b) &&
    Math.abs(a.kNorm - b.kNorm) <= tolerance &&
    Math.abs(a.vNorm - b.vNorm) <= tolerance &&
    ["kPreview", "vPreview"].every((field) => {
      const key = field as "kPreview" | "vPreview";
      return (
        a[key].length === b[key].length &&
        a[key].every(
          (value, i) =>
            Number.isFinite(value) && Math.abs(value - b[key][i]) <= tolerance,
        )
      );
    })
  );
}

/** Validate rows, absolute positions, stored bytes, tensor reuse, and equivalence against independent trace fields. */
function validateKv(bundle: TraceBundle): void {
  const trace = bundle.kv;
  const p = trace.promptTokens.length;
  requireFact(
    trace.schemaVersion === "0.2.0" && trace.experimentId === "01-why-kv-cache",
    "stale KV schema",
  );
  requireFact(
    Number.isInteger(trace.config.dModel) &&
      trace.config.dModel > 0 &&
      trace.config.nLayers === 1,
    "unsupported KV architecture",
  );
  const saved = new Map<number, KvBlock>();
  for (const policy of ["naive", "cached"] as const) {
    const mode = trace.modes[policy];
    requireFact(
      mode.steps.length === trace.config.maxNewTokens,
      "generation length",
    );
    let reusedTotal = 0;
    for (const [index, step] of mode.steps.entries()) {
      const prefix = [
        ...trace.promptTokens,
        ...mode.generatedTokens.slice(0, index),
      ];
      requireFact(
        step.step === index &&
          step.position === p + index &&
          step.generatedToken.position === step.position,
        "decode absolute position",
      );
      requireFact(
        sameToken(step.generatedToken, mode.generatedTokens[index]),
        "emitted token list",
      );
      requireFact(
        step.inputTokens.length === prefix.length &&
          step.inputTokens.every((token, i) => sameToken(token, prefix[i])),
        "input prefix identities",
      );
      const rows = [...step.newlyComputed, ...step.reused].sort(
        (a, b) => a.position - b.position,
      );
      requireFact(
        rows.length === prefix.length &&
          rows.every((block, i) => sameToken(block, prefix[i])),
        "missing or duplicated KV positions",
      );
      for (const block of rows) {
        requireFact(
          block.kPreview.length === Math.min(4, trace.config.dModel) &&
            block.vPreview.length === Math.min(4, trace.config.dModel),
          "KV preview dimensions",
        );
        requireFact(
          block.kNorm >= 0 &&
            block.vNorm >= 0 &&
            [...block.kPreview, ...block.vPreview].every(Number.isFinite),
          "KV tensor values",
        );
      }
      const projected = policy === "naive" || index === 0 ? prefix.length : 1;
      const reused = policy === "cached" && index > 0 ? prefix.length - 1 : 0;
      requireFact(
        step.kvRowsProjected === projected && step.kvRowsReused === reused,
        "projection/reuse partition",
      );
      const cached = policy === "cached" ? prefix.length : 0;
      requireFact(
        step.cacheSizeTokens === cached &&
          step.logicalKvBytes === cached * trace.config.dModel * 2 * 4,
        "KV byte calculation",
      );
      reusedTotal += reused;
      if (policy === "cached") {
        for (const block of step.reused)
          requireFact(
            !!saved.get(block.position) &&
              sameBlock(block, saved.get(block.position)!, 0),
            "cached K or V changed during reuse",
          );
        for (const block of step.newlyComputed) {
          requireFact(!saved.has(block.position), "cached position rebuilt");
          saved.set(block.position, block);
        }
        for (const block of rows)
          requireFact(
            sameBlock(
              block,
              trace.modes.naive.steps[index].newlyComputed[block.position],
              0.000021,
            ),
            "cached K or V differs from recomputation",
          );
      }
    }
    requireFact(mode.totals.kvRowsReused === reusedTotal, "reuse total");
    requireFact(
      mode.totals.peakCacheTokens ===
        Math.max(...mode.steps.map((step) => step.cacheSizeTokens)) &&
        mode.totals.peakLogicalKvBytes ===
          Math.max(...mode.steps.map((step) => step.logicalKvBytes)),
      "peak stored payload",
    );
  }
  const matches = trace.modes.naive.generatedTokens.every((token, i) =>
    sameToken(token, trace.modes.cached.generatedTokens[i]),
  );
  requireFact(
    matches === trace.equivalence.outputsMatch,
    "output equivalence claim",
  );
  for (const policy of ["naive", "cached"] as const)
    requireFact(
      trace.equivalence.generatedTokenIds[policy].length ===
        trace.config.maxNewTokens &&
        trace.equivalence.generatedTokenIds[policy].every(
          (id, i) => id === trace.modes[policy].generatedTokens[i].id,
        ),
      "equivalence token IDs",
    );
  requireFact(
    Number.isFinite(trace.equivalence.maxAbsLogitDiff) &&
      trace.equivalence.maxAbsLogitDiff >= 0 &&
      Number.isFinite(trace.equivalence.tolerance) &&
      trace.equivalence.tolerance > 0,
    "numerical equivalence evidence",
  );
}

/** Verify causal counts and absolute query positions before any grid or dependency may render them. */
function validateAttention(bundle: TraceBundle): void {
  const trace = bundle.prefill;
  requireFact(trace.schemaVersion === "0.3.1", "stale attention schema");
  for (const pair of [
    { ...trace, promptLength: trace.config.promptLength },
    ...trace.scaling,
  ]) {
    const p = pair.promptLength;
    requireFact(
      pair.prefill.attentionScoreShapePerHead[0] === p &&
        pair.prefill.attentionScoreShapePerHead[1] === p &&
        pair.decode.attentionScoreShapePerHead[0] === 1 &&
        pair.decode.attentionScoreShapePerHead[1] === p + 1,
      "attention dimensions",
    );
    requireFact(
      pair.prefill.attentionScoreCellsCausal === (p * (p + 1)) / 2 &&
        pair.prefill.attentionScoreCellsMasked === (p * (p - 1)) / 2,
      "causal/forbidden cells",
    );
    requireFact(
      pair.decode.attentionScoreCellsCausal === p + 1 &&
        pair.decode.attentionScoreCellsMasked === 0,
      "decode causal edges",
    );
    for (const job of ["prefill", "decode"] as const) {
      const stage = pair[job];
      const q = job === "prefill" ? p : 1;
      const keys = job === "prefill" ? p : p + 1;
      requireFact(
        stage.qRowsProjected === q &&
          stage.kRowsProjected === q &&
          stage.vRowsProjected === q,
        "projected query/key/value rows",
      );
      requireFact(
        stage.logicalKvBytesAvailable === keys * trace.config.dModel * 2 * 4 &&
          stage.logicalKvBytesWritten === q * trace.config.dModel * 2 * 4,
        "attention KV bytes",
      );
    }
  }
  requireFact(
    trace.decode.newTokenPosition === trace.config.promptLength &&
      trace.prefill.generatedToken?.position === trace.config.promptLength &&
      trace.decode.generatedToken?.position === trace.config.promptLength + 1,
    "decode absolute position",
  );
}

/** Check FLOPs and payloads independently of the reported ratio, catching coordinated arithmetic mutations too. */
function validateArithmetic(bundle: TraceBundle): void {
  const trace = bundle.arithmetic;
  requireFact(
    trace.schemaVersion === "0.4.0" && trace.config.bytesPerElement === 4,
    "arithmetic schema or dtype convention",
  );
  const d = trace.config.dHead;
  requireFact(
    d === trace.config.dModel / trace.config.nHeads &&
      d === bundle.prefill.config.dHead,
    "head width",
  );
  requireFact(
    trace.config.seed === bundle.prefill.config.seed &&
      trace.config.maxPos === bundle.prefill.config.maxPos,
    "source model configuration",
  );
  for (const job of ["prefill", "decode"] as const) {
    const detail = trace[job];
    const p = trace.config.promptLength;
    const q = job === "prefill" ? p : 1;
    const keys = job === "prefill" ? p : p + 1;
    requireFact(
      detail.dHead === d &&
        (job === "prefill" ? detail.P === p : detail.T === p + 1),
      "account absolute positions",
    );
    const flop = 4 * q * keys * d;
    requireFact(
      detail.arithmetic.score.flops === flop / 2 &&
        detail.arithmetic.value.flops === flop / 2 &&
        detail.arithmetic.attentionFlopsPerHead === flop,
      "FLOP calculation",
    );
    requireFact(
      detail.data.qBytes === q * d * 4 &&
        detail.data.kBytes === keys * d * 4 &&
        detail.data.vBytes === keys * d * 4 &&
        detail.data.logicalBytesConsidered === (q + 2 * keys) * d * 4,
      "logical byte calculation",
    );
    requireFact(
      detail.intensity.flops === flop &&
        detail.intensity.logicalBytesConsidered ===
          detail.data.logicalBytesConsidered &&
        Math.abs(
          detail.intensity.arithmeticIntensity -
            flop / detail.data.logicalBytesConsidered,
        ) < 1e-10,
      "arithmetic intensity",
    );
    for (const [dtype, bytes] of [
      ["float32", 4],
      ["float16", 2],
    ] as const) {
      const row = trace.dtypeComparison[dtype][job] as Record<string, number>;
      requireFact(
        trace.dtypeComparison[dtype].bytesPerElement === bytes &&
          row.attentionFlopsPerHead === flop &&
          row.qBytes === q * d * bytes &&
          row.kBytes === keys * d * bytes &&
          row.vBytes === keys * d * bytes,
        "dtype FLOPs or bytes",
      );
    }
    for (const row of trace.scaling) {
      const side = row[job];
      const queries = job === "prefill" ? row.P : 1;
      const t = job === "prefill" ? row.P : row.T;
      requireFact(
        row.T === row.P + 1 && row.dHead === d,
        "scaling absolute position",
      );
      requireFact(
        side.attentionFlopsPerHead === 4 * queries * t * d,
        "scaling FLOP calculation",
      );
      requireFact(
        side.qBytes === queries * d * 4 &&
          side.kBytes === t * d * 4 &&
          side.vBytes === t * d * 4,
        "scaling logical payload",
      );
    }
  }
}

/** Enforce the supported experiment's mathematical identities without changing any recorded numerical value. */
export function validateTraceFacts(bundle: TraceBundle): void {
  validateKv(bundle);
  validateAttention(bundle);
  validateArithmetic(bundle);
}
