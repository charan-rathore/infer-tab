import { readFileSync } from "fs";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
for (const [file, length, expectedFlops] of [
  ["sample-arithmetic-memory.json", 8, 2048],
  ["journey-arithmetic-memory.json", 6, 1152],
]) {
  const samplePath = path.resolve(here, "../public/traces", file);
  const trace = JSON.parse(readFileSync(samplePath, "utf8"));
  assert.equal(trace.schemaVersion, "0.4.0");
  assert.equal(trace.experimentId, "03-arithmetic-vs-memory");
  assert.equal(trace.config.promptLength, length);
  assert.equal(trace.prefill.arithmetic.attentionFlopsPerHead, expectedFlops);
  assert.equal(trace.units.arithmetic, "FLOPs");
  assert.equal(trace.units.logicalPayload, "bytes");
  assert.equal(trace.scaling.length, 5);
  assert.equal(trace.prefill.data.notMeasuredTraffic, true);
  assert.deepEqual(trace.prefill.shapes, trace.sourcePair.prefillShapes);
  assert.deepEqual(trace.decode.shapes, trace.sourcePair.decodeShapes);
  for (const job of ["prefill", "decode"]) {
    const full = trace.dtypeComparison.float32[job];
    const half = trace.dtypeComparison.float16[job];
    assert.equal(full.attentionFlopsPerHead, half.attentionFlopsPerHead);
    assert.equal(full.logicalBytesConsidered, half.logicalBytesConsidered * 2);
    assert.equal(
      full.logicalBytesConsidered,
      full.qBytes + full.kBytes + full.vBytes,
    );
  }
  console.log("arithmetic/memory trace ok:", file);
}
