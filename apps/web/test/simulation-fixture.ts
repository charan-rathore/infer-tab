import kv from "../public/traces/sample-why-kv-cache.json";
import prefill from "../public/traces/sample-prefill-decode.json";
import arithmetic from "../public/traces/journey-arithmetic-memory.json";
import {
  assertValidTrace,
  assertValidPrefillDecodeTrace,
  assertValidArithmeticMemoryTrace,
} from "@/lib/schema";
import type { TraceBundle } from "@/lib/simulation/model";
export const traces: TraceBundle = {
  kv: assertValidTrace(kv),
  prefill: assertValidPrefillDecodeTrace(prefill),
  arithmetic: assertValidArithmeticMemoryTrace(arithmetic),
};

/** Freeze the actual recording recursively so accidental rendering mutations fail immediately in tests. */
function freezeRecording(value: unknown): void {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeRecording);
    Object.freeze(value);
  }
}
freezeRecording(traces);
