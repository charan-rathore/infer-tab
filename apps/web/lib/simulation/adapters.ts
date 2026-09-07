import type {
  InferTabTrace,
  PrefillDecodeTrace,
  TraceToken,
} from "@/lib/schema";
import type { MachineState, TraceBundle } from "./model";

export interface Quantity {
  value: number;
  unit: string;
  source: string;
  expression: string;
}
export interface ArithmeticAccount {
  flops: number;
  q: number;
  k: number;
  v: number;
  bytes: number;
  intensity: number;
  source: string;
}
export interface TraceEvent {
  id: string;
  type: "rows.projected" | "rows.reused" | "token.emitted";
  step: number;
  positions: number[];
  source: string;
}

/** Expose semantic simulation events as a projection of recorded steps, never of animation completion. */
export function traceEvents(
  trace: InferTabTrace,
  policy: "naive" | "cached",
  playhead: number,
): TraceEvent[] {
  const step = trace.modes[policy].steps[playhead];
  if (!step) return [];
  const source = `${trace.experimentId}.modes.${policy}.steps[${playhead}]`;
  return [
    {
      id: `${source}:project`,
      type: "rows.projected",
      step: playhead,
      positions: step.newlyComputed.map((block) => block.position),
      source: `${source}.newlyComputed`,
    },
    {
      id: `${source}:reuse`,
      type: "rows.reused",
      step: playhead,
      positions: step.reused.map((block) => block.position),
      source: `${source}.reused`,
    },
    {
      id: `${source}:emit`,
      type: "token.emitted",
      step: playhead,
      positions: [step.generatedToken.position],
      source: `${source}.generatedToken`,
    },
  ];
}

/** Use the full prompt sequence and position, never vocabulary ID alone, as semantic identity. */
export function objectId(prompt: string, position: number): string {
  return `sequence:${encodeURIComponent(prompt)}:position:${position}`;
}

/** Namespace tensor identity by recorded model configuration as well as the semantic token position. */
export function tensorId(
  trace: InferTabTrace | PrefillDecodeTrace,
  position: number,
): string {
  return `${trace.experimentId}:${JSON.stringify(trace.config)}:${objectId(trace.prompt, position)}:layer:0`;
}

/** Sum only the steps currently observed; each operand retains an explicit trace-field reference. */
export function projectedWork(
  trace: InferTabTrace,
  policy: "naive" | "cached",
  playhead: number,
): Quantity {
  const steps = trace.modes[policy].steps.slice(0, playhead + 1);
  const values = steps.map((step) => step.kvRowsProjected);
  return {
    value: values.reduce((sum, value) => sum + value, 0),
    unit: "rows",
    source: `modes.${policy}.steps[0..${playhead}].kvRowsProjected`,
    expression: values.join(" + ") || "0",
  };
}

/** Select one recorded stage pair; a missing scenario is an error rather than invented numbers. */
export function stagePair(bundle: TraceBundle, length: number) {
  if (length === bundle.prefill.config.promptLength)
    return {
      prefill: bundle.prefill.prefill,
      decode: bundle.prefill.decode,
      source: "prefill / decode",
    };
  const index = bundle.prefill.scaling.findIndex(
    (row) => row.promptLength === length,
  );
  if (index < 0)
    throw new Error("This prompt length has no recorded attention shapes.");
  return { ...bundle.prefill.scaling[index], source: `scaling[${index}]` };
}

/** Read the Python dtype comparison for the detailed run; do not emulate float16 inference. */
function dtypeAccount(value: unknown, source: string): ArithmeticAccount {
  const row = value as Record<string, unknown>;
  const fields = [
    "attentionFlopsPerHead",
    "qBytes",
    "kBytes",
    "vBytes",
    "logicalBytesConsidered",
    "arithmeticIntensity",
  ];
  if (
    !row ||
    fields.some(
      (key) =>
        typeof row[key] !== "number" ||
        !Number.isFinite(row[key]) ||
        Number(row[key]) <= 0,
    )
  )
    throw new Error("Invalid recorded dtype account.");
  return {
    flops: Number(row.attentionFlopsPerHead),
    q: Number(row.qBytes),
    k: Number(row.kBytes),
    v: Number(row.vBytes),
    bytes: Number(row.logicalBytesConsidered),
    intensity: Number(row.arithmeticIntensity),
    source,
  };
}

/** Adapt Python accounting. Scaling width is an explicit linear payload derivation, never a new FLOP formula. */
export function arithmeticAccount(
  bundle: TraceBundle,
  state: Pick<MachineState, "promptLength" | "job" | "bytes">,
): ArithmeticAccount {
  const trace = bundle.arithmetic;
  if (state.promptLength === trace.config.promptLength) {
    const dtype = state.bytes === 2 ? "float16" : "float32";
    return dtypeAccount(
      trace.dtypeComparison[dtype][state.job],
      `dtypeComparison.${dtype}.${state.job}`,
    );
  }
  const index = trace.scaling.findIndex((row) => row.P === state.promptLength);
  if (index < 0)
    throw new Error("This prompt length has no recorded arithmetic account.");
  const row = trace.scaling[index][state.job];
  const factor = state.bytes / trace.config.bytesPerElement;
  return {
    flops: row.attentionFlopsPerHead,
    q: row.qBytes * factor,
    k: row.kBytes * factor,
    v: row.vBytes * factor,
    bytes: row.logicalBytesConsidered * factor,
    intensity: row.arithmeticIntensity / factor,
    source: `scaling[${index}].${state.job}${factor === 1 ? "" : `; payload × ${state.bytes}/${trace.config.bytesPerElement}, ratio ÷ ${factor}`}`,
  };
}

/** Retain real prompt tokens only where the selected scenario actually supplies their identities. */
export function scenarioTokens(
  bundle: TraceBundle,
  length: number,
): TraceToken[] {
  if (length === bundle.prefill.config.promptLength)
    return [...bundle.prefill.promptTokens];
  return Array.from({ length }, (_, position) => ({
    position,
    id: -1,
    text: `#${position}`,
  }));
}

/** Check accounting identities used by rendering, including imported traces whose structural schema is permissive. */
export function validateBundle(bundle: TraceBundle): void {
  if (
    bundle.prefill.config.promptLength !==
      bundle.arithmetic.config.promptLength ||
    bundle.prefill.prompt !== bundle.arithmetic.prompt
  ) {
    throw new Error(
      "Replay needs aligned prompt scenarios for the shape and arithmetic lenses.",
    );
  }
  for (const trace of [bundle.kv, bundle.prefill, bundle.arithmetic]) {
    if (
      !Array.isArray(trace.promptTokens) ||
      trace.promptTokens.length < 1 ||
      trace.promptTokens.length > 256 ||
      trace.promptTokens.some(
        (token, index) =>
          token.position !== index || typeof token.text !== "string",
      )
    ) {
      throw new Error("Invalid prompt position identities.");
    }
  }
  const naive = bundle.kv.modes.naive.steps;
  const cached = bundle.kv.modes.cached.steps;
  if (
    !naive.length ||
    naive.length !== cached.length ||
    naive.length > 128 ||
    !bundle.kv.promptTokens.length
  )
    throw new Error("Replay needs matching non-empty decode recordings.");
  for (const mode of [bundle.kv.modes.naive, bundle.kv.modes.cached]) {
    if (mode.generatedTokens.length !== mode.steps.length)
      throw new Error("Generated token list does not match recorded steps.");
    for (const step of mode.steps) {
      if (
        !Number.isFinite(step.logicalKvBytes) ||
        !Number.isFinite(step.cacheSizeTokens) ||
        [...step.newlyComputed, ...step.reused].some(
          (block) =>
            !Number.isFinite(block.kNorm) || !Number.isFinite(block.vNorm),
        )
      )
        throw new Error("Invalid recorded tensor quantities.");
      if (
        step.kvRowsProjected !== step.newlyComputed.length ||
        step.kvRowsReused !== step.reused.length
      )
        throw new Error("Recorded row counts disagree with their objects.");
    }
    if (
      mode.totals.kvRowsProjected !==
      mode.steps.reduce((sum, step) => sum + step.kvRowsProjected, 0)
    )
      throw new Error("Recorded projection total disagrees with its steps.");
  }
  const pairs = [bundle.prefill, ...bundle.prefill.scaling];
  for (const pair of pairs)
    for (const job of ["prefill", "decode"] as const) {
      const stage = pair[job];
      const [q, k] = stage.attentionScoreShapePerHead;
      if (
        !Number.isInteger(q) ||
        !Number.isInteger(k) ||
        q < 1 ||
        k < 1 ||
        q > 256 ||
        k > 257 ||
        q * k !== stage.attentionScoreCellsPerHead ||
        stage.attentionScoreCellsCausal + stage.attentionScoreCellsMasked !==
          q * k
      )
        throw new Error("Invalid recorded attention grid.");
    }
  for (const dtype of ["float32", "float16"] as const)
    for (const job of ["prefill", "decode"] as const) {
      const a = dtypeAccount(
        bundle.arithmetic.dtypeComparison[dtype][job],
        dtype,
      );
      if (
        a.q + a.k + a.v !== a.bytes ||
        Math.abs(a.flops / a.bytes - a.intensity) > 1e-8
      )
        throw new Error(
          "Recorded arithmetic denominator disagrees with its payloads.",
        );
    }
  for (const row of bundle.arithmetic.scaling) {
    if (!Number.isInteger(row.P) || row.P < 1 || row.P > 256)
      throw new Error("Invalid recorded scaling length.");
    for (const job of ["prefill", "decode"] as const) {
      const a = row[job];
      if (
        a.qBytes + a.kBytes + a.vBytes !== a.logicalBytesConsidered ||
        Math.abs(
          a.attentionFlopsPerHead / a.logicalBytesConsidered -
            a.arithmeticIntensity,
        ) > 1e-8
      )
        throw new Error("Invalid recorded scaling account.");
    }
  }
  for (const job of ["prefill", "decode"] as const) {
    const full = dtypeAccount(
      bundle.arithmetic.dtypeComparison.float32[job],
      job,
    );
    const half = dtypeAccount(
      bundle.arithmetic.dtypeComparison.float16[job],
      job,
    );
    if (
      full.flops !== half.flops ||
      full.bytes !== half.bytes * 2 ||
      full.q !== half.q * 2 ||
      full.k !== half.k * 2 ||
      full.v !== half.v * 2
    )
      throw new Error(
        "Dtype recording does not support the stated width comparison.",
      );
  }
}
