/**
 * Shared InferTab trace types.
 * Python writes this shape. The web app only reads it.
 */

export const TRACE_SCHEMA_VERSION = "0.2.0" as const;

export type ModeId = "naive" | "cached";

export interface TraceToken {
  id: number;
  text: string;
  position: number;
}

export interface KvBlock {
  id: number;
  text: string;
  position: number;
  kNorm: number;
  vNorm: number;
  kPreview: number[];
  vPreview: number[];
}

export interface TraceStep {
  step: number;
  /** Position of the token this step is about to generate. */
  position: number;
  inputTokens: TraceToken[];
  newlyComputed: KvBlock[];
  reused: KvBlock[];
  /** K/V rows projected this step. Not a FLOP count. */
  kvRowsProjected: number;
  /** Stored K/V rows read this step. Not a FLOP count. */
  kvRowsReused: number;
  cacheSizeTokens: number;
  /** Float32 K/V payload. Not process peak memory. */
  logicalKvBytes: number;
  elapsedMs: number;
  generatedToken: TraceToken;
}

export interface TraceMode {
  id: ModeId;
  title: string;
  generatedTokens: TraceToken[];
  steps: TraceStep[];
  totals: {
    kvRowsProjected: number;
    kvRowsReused: number;
    peakCacheTokens: number;
    peakLogicalKvBytes: number;
    elapsedMs: number;
  };
}

export interface InferTabTrace {
  schemaVersion: typeof TRACE_SCHEMA_VERSION;
  experimentId: string;
  prompt: string;
  promptTokens: TraceToken[];
  config: {
    dModel: number;
    nHeads: number;
    nLayers: number;
    vocabSize: number;
    maxNewTokens: number;
    seed: number;
    device: string;
  };
  modes: {
    naive: TraceMode;
    cached: TraceMode;
  };
  equivalence: {
    outputsMatch: boolean;
    maxAbsLogitDiff: number;
    tolerance: number;
    generatedTokenIds: {
      naive: number[];
      cached: number[];
    };
  };
  measurementDisclaimer: string;
}

export interface TraceValidationError {
  path: string;
  message: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToken(value: unknown): value is TraceToken {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.text === "string" &&
    typeof value.position === "number"
  );
}

function isKvBlock(value: unknown): value is KvBlock {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.text === "string" &&
    typeof value.position === "number" &&
    typeof value.kNorm === "number" &&
    typeof value.vNorm === "number" &&
    Array.isArray(value.kPreview) &&
    Array.isArray(value.vPreview)
  );
}

function isStep(value: unknown): value is TraceStep {
  if (!isObject(value)) return false;
  return (
    typeof value.step === "number" &&
    typeof value.position === "number" &&
    Array.isArray(value.inputTokens) &&
    value.inputTokens.every(isToken) &&
    Array.isArray(value.newlyComputed) &&
    value.newlyComputed.every(isKvBlock) &&
    Array.isArray(value.reused) &&
    value.reused.every(isKvBlock) &&
    typeof value.kvRowsProjected === "number" &&
    typeof value.kvRowsReused === "number" &&
    typeof value.cacheSizeTokens === "number" &&
    typeof value.logicalKvBytes === "number" &&
    typeof value.elapsedMs === "number" &&
    isToken(value.generatedToken)
  );
}

function isMode(value: unknown): value is TraceMode {
  if (!isObject(value)) return false;
  if (value.id !== "naive" && value.id !== "cached") return false;
  if (!isObject(value.totals)) return false;
  return (
    typeof value.title === "string" &&
    Array.isArray(value.generatedTokens) &&
    value.generatedTokens.every(isToken) &&
    Array.isArray(value.steps) &&
    value.steps.every(isStep) &&
    typeof value.totals.kvRowsProjected === "number" &&
    typeof value.totals.kvRowsReused === "number"
  );
}

/** Structural check so the UI can refuse a malformed experiment file. */
export function validateTrace(value: unknown): TraceValidationError[] {
  const errors: TraceValidationError[] = [];
  if (!isObject(value)) {
    return [{ path: "", message: "trace must be an object" }];
  }
  if (value.schemaVersion !== TRACE_SCHEMA_VERSION) {
    errors.push({
      path: "schemaVersion",
      message: `expected ${TRACE_SCHEMA_VERSION}`,
    });
  }
  for (const key of [
    "experimentId",
    "prompt",
    "measurementDisclaimer",
  ] as const) {
    if (typeof value[key] !== "string" || !value[key]) {
      errors.push({ path: key, message: "required string" });
    }
  }
  if (!Array.isArray(value.promptTokens) || !value.promptTokens.every(isToken)) {
    errors.push({ path: "promptTokens", message: "invalid token list" });
  }
  if (!isObject(value.config)) {
    errors.push({ path: "config", message: "required object" });
  }
  if (!isObject(value.modes) || !isMode(value.modes.naive) || !isMode(value.modes.cached)) {
    errors.push({ path: "modes", message: "naive and cached modes are required" });
  }
  if (!isObject(value.equivalence) || typeof value.equivalence.outputsMatch !== "boolean") {
    errors.push({ path: "equivalence", message: "invalid equivalence block" });
  }
  return errors;
}

export function assertValidTrace(value: unknown): InferTabTrace {
  const errors = validateTrace(value);
  if (errors.length > 0) {
    throw new Error(
      `Invalid InferTab trace: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  return value as InferTabTrace;
}

export const PREFILL_DECODE_SCHEMA_VERSION = "0.3.1" as const;

export interface TensorShapeMap {
  [name: string]: [number, number] | number[];
}

export interface PrefillDecodeStage {
  label?: string;
  technicalName?: string;
  inputTokenCount: number;
  qRowsProjected: number;
  kRowsProjected: number;
  vRowsProjected: number;
  attentionScoreShapePerHead: number[];
  attentionScoreCellsPerHead: number;
  attentionScoreCellsCausal: number;
  attentionScoreCellsMasked: number;
  attentionScoreCellsTotal: number;
  attentionMath?: {
    countsWhat: string;
    dHead: number;
    scoreMultiply: { formula: string; macScale: string; p?: number; t?: number };
    valueAggregate: { formula: string; macScale: string };
  };
  pipeline?: Array<{ id: string; label: string; tensor: string }>;
  shapes: TensorShapeMap;
  logicalKvBytesWritten: number;
  logicalKvBytesAvailable: number;
  elapsedMs: number;
  generatedToken?: TraceToken;
  tokens?: TraceToken[];
  newTokenPosition?: number;
  scoreTensorShape?: number[];
}

export interface PrefillDecodeScalingRow {
  promptLength: number;
  prefill: PrefillDecodeStage;
  decode: PrefillDecodeStage;
}

export interface PrefillDecodeTrace {
  schemaVersion: typeof PREFILL_DECODE_SCHEMA_VERSION;
  experimentId: "02-prefill-vs-decode";
  prompt: string;
  promptTokens: TraceToken[];
  config: {
    dModel: number;
    nHeads: number;
    nLayers: number;
    vocabSize: number;
    seed: number;
    device: string;
    maxPos: number;
    promptLength: number;
    decodeSteps: number;
    dHead: number;
  };
  prefill: PrefillDecodeStage;
  decode: PrefillDecodeStage;
  scaling: PrefillDecodeScalingRow[];
  equivalence: {
    cachedMatchesFullRecompute: boolean;
    maxAbsLogitDiff: number;
    tolerance: number;
  };
  measurementDisclaimer: string;
}

function isStage(value: unknown): value is PrefillDecodeStage {
  if (!isObject(value) || !isObject(value.shapes)) return false;
  return (
    typeof value.qRowsProjected === "number" &&
    typeof value.kRowsProjected === "number" &&
    typeof value.vRowsProjected === "number" &&
    typeof value.attentionScoreCellsPerHead === "number" &&
    typeof value.attentionScoreCellsCausal === "number" &&
    typeof value.attentionScoreCellsMasked === "number" &&
    typeof value.logicalKvBytesWritten === "number" &&
    typeof value.logicalKvBytesAvailable === "number" &&
    Array.isArray(value.attentionScoreShapePerHead)
  );
}

export function validatePrefillDecodeTrace(value: unknown): TraceValidationError[] {
  const errors: TraceValidationError[] = [];
  if (!isObject(value)) {
    return [{ path: "", message: "trace must be an object" }];
  }
  if (value.schemaVersion !== PREFILL_DECODE_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `expected ${PREFILL_DECODE_SCHEMA_VERSION}` });
  }
  if (value.experimentId !== "02-prefill-vs-decode") {
    errors.push({ path: "experimentId", message: "expected 02-prefill-vs-decode" });
  }
  if (!isStage(value.prefill)) errors.push({ path: "prefill", message: "invalid stage" });
  if (!isStage(value.decode)) errors.push({ path: "decode", message: "invalid stage" });
  if (!Array.isArray(value.scaling) || value.scaling.length < 1) {
    errors.push({ path: "scaling", message: "required non-empty list" });
  }
  if (!isObject(value.equivalence) || typeof value.equivalence.cachedMatchesFullRecompute !== "boolean") {
    errors.push({ path: "equivalence", message: "invalid equivalence block" });
  }
  return errors;
}

export function assertValidPrefillDecodeTrace(value: unknown): PrefillDecodeTrace {
  const errors = validatePrefillDecodeTrace(value);
  if (errors.length > 0) {
    throw new Error(
      `Invalid prefill/decode trace: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  return value as PrefillDecodeTrace;
}

export const ARITHMETIC_MEMORY_SCHEMA_VERSION = "0.4.0" as const;

export interface ArithmeticBlock {
  score: { shape: string; formula: string; flops: number };
  value: { shape: string; formula: string; flops: number };
  attentionFlopsPerHead: number;
  symbolicFormula: string;
  unit: "FLOPs";
  countsWhat: string;
}

export interface LogicalDataBlock {
  qBytes: number;
  kBytes: number;
  vBytes: number;
  scoreBytes: number;
  outputBytes: number;
  logicalBytesConsidered: number;
  logicalCachedKvBytesPerHead: number;
  logicalCachedKvBytes: number;
  bytesPerElement: number;
  dtype: string;
  unit: "bytes";
  kind: string;
  denominator: string;
  denominatorDetail: string;
  notMeasuredTraffic: true;
}

export interface IntensityBlock {
  flops: number;
  logicalBytesConsidered: number;
  arithmeticIntensity: number;
  unit: "FLOPs per byte";
  display: string;
  formula: string;
  meaning: string;
  educationalModel: boolean;
  notAProductionBenchmark: true;
}

export interface ArithmeticMemoryJob {
  job: "prefill" | "decode";
  P: number | null;
  T: number | null;
  dHead: number;
  arithmetic: ArithmeticBlock;
  data: LogicalDataBlock;
  intensity: IntensityBlock;
  shapes?: TensorShapeMap;
}

export interface ArithmeticMemoryScalingSide {
  attentionFlopsPerHead: number;
  qBytes: number;
  kBytes: number;
  vBytes: number;
  scoreBytes: number;
  outputBytes: number;
  logicalBytesConsidered: number;
  logicalCachedKvBytes: number;
  arithmeticIntensity: number;
  intensityDisplay: string;
  symbolicFormula: string;
  unitFlops: "FLOPs";
  unitBytes: "bytes";
  unitIntensity: "FLOPs per byte";
}

export interface ArithmeticMemoryScalingRow {
  P: number;
  T: number;
  dHead: number;
  prefill: ArithmeticMemoryScalingSide;
  decode: ArithmeticMemoryScalingSide;
}

export interface ArithmeticMemoryTrace {
  schemaVersion: typeof ARITHMETIC_MEMORY_SCHEMA_VERSION;
  experimentId: "03-arithmetic-vs-memory";
  prompt: string;
  promptTokens: TraceToken[];
  config: {
    dModel: number;
    nHeads: number;
    dHead: number;
    nLayers: number;
    vocabSize: number;
    seed: number;
    device: string;
    maxPos: number;
    promptLength: number;
    decodeSteps: number;
    bytesPerElement: number;
    dtype: string;
    flopConvention: string;
    logicalBytesDenominator: string;
  };
  flopConvention: {
    statement: string;
    warning: string;
    countsWhat: string;
    notTotalTransformerFlops: boolean;
  };
  units: {
    arithmetic: "FLOPs";
    logicalPayload: "bytes";
    arithmeticIntensity: "FLOPs per byte";
  };
  prefill: ArithmeticMemoryJob;
  decode: ArithmeticMemoryJob;
  dtypeComparison: {
    symbolicAttentionOutputUnchanged: boolean;
    flopsUnchanged: boolean;
    note: string;
    float32: Record<string, unknown>;
    float16: Record<string, unknown>;
  };
  scaling: ArithmeticMemoryScalingRow[];
  sourcePair: {
    experimentId: "02-prefill-vs-decode";
    prefillShapes: TensorShapeMap;
    decodeShapes: TensorShapeMap;
    equivalence: {
      cachedMatchesFullRecompute: boolean;
      maxAbsLogitDiff: number;
      tolerance: number;
    };
  };
  caveats: {
    attentionFlopsAreNotTotalModelFlops: true;
    logicalBytesAreNotPhysicalMemoryTraffic: true;
    arithmeticIntensityIsNotMeasuredPerformance: true;
    cpuToyTimingsCannotEstablishGpuBottlenecks: true;
    ffnProjectionAndWeightMovementDeferred: true;
    rooflineNotImplemented: true;
  };
  measurementDisclaimer: string;
  nextQuestion: string;
}

function isArithmeticJob(value: unknown): value is ArithmeticMemoryJob {
  if (!isObject(value) || !isObject(value.arithmetic) || !isObject(value.data) || !isObject(value.intensity)) {
    return false;
  }
  return (
    typeof value.arithmetic.attentionFlopsPerHead === "number" &&
    value.arithmetic.unit === "FLOPs" &&
    typeof value.data.qBytes === "number" &&
    typeof value.data.kBytes === "number" &&
    typeof value.data.vBytes === "number" &&
    typeof value.data.logicalBytesConsidered === "number" &&
    value.data.unit === "bytes" &&
    value.data.notMeasuredTraffic === true &&
    typeof value.intensity.arithmeticIntensity === "number" &&
    value.intensity.unit === "FLOPs per byte" &&
    typeof value.intensity.display === "string" &&
    value.intensity.notAProductionBenchmark === true
  );
}

export function validateArithmeticMemoryTrace(value: unknown): TraceValidationError[] {
  const errors: TraceValidationError[] = [];
  if (!isObject(value)) {
    return [{ path: "", message: "trace must be an object" }];
  }
  if (value.schemaVersion !== ARITHMETIC_MEMORY_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `expected ${ARITHMETIC_MEMORY_SCHEMA_VERSION}` });
  }
  if (value.experimentId !== "03-arithmetic-vs-memory") {
    errors.push({ path: "experimentId", message: "expected 03-arithmetic-vs-memory" });
  }
  if (!isArithmeticJob(value.prefill)) errors.push({ path: "prefill", message: "invalid job" });
  if (!isArithmeticJob(value.decode)) errors.push({ path: "decode", message: "invalid job" });
  if (!Array.isArray(value.scaling) || value.scaling.length < 1) {
    errors.push({ path: "scaling", message: "required non-empty list" });
  }
  if (!isObject(value.units) || value.units.arithmetic !== "FLOPs" || value.units.logicalPayload !== "bytes") {
    errors.push({ path: "units", message: "FLOPs and bytes must stay explicit" });
  }
  if (
    !isObject(value.flopConvention) ||
    typeof value.flopConvention.warning !== "string" ||
    !value.flopConvention.warning.includes("Different FLOP-counting conventions")
  ) {
    errors.push({ path: "flopConvention", message: "convention warning required" });
  }
  if (!isObject(value.caveats) || value.caveats.logicalBytesAreNotPhysicalMemoryTraffic !== true) {
    errors.push({ path: "caveats", message: "logical bytes must not be claimed as physical traffic" });
  }
  return errors;
}

export function assertValidArithmeticMemoryTrace(value: unknown): ArithmeticMemoryTrace {
  const errors = validateArithmeticMemoryTrace(value);
  if (errors.length > 0) {
    throw new Error(
      `Invalid arithmetic/memory trace: ${errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  }
  return value as ArithmeticMemoryTrace;
}
