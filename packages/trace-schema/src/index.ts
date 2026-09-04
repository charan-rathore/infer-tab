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
