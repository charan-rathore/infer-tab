import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(here, "../public/traces/sample-arithmetic-memory.json");
const trace = JSON.parse(readFileSync(samplePath, "utf8"));

if (trace.schemaVersion !== "0.4.0") {
  console.error("unexpected schemaVersion", trace.schemaVersion);
  process.exit(1);
}
if (trace.experimentId !== "03-arithmetic-vs-memory") {
  console.error("unexpected experimentId");
  process.exit(1);
}
if (trace.units?.arithmetic !== "FLOPs" || trace.units?.logicalPayload !== "bytes") {
  console.error("units must stay explicit");
  process.exit(1);
}
if (trace.prefill?.arithmetic?.attentionFlopsPerHead !== 2048) {
  console.error("P=8 prefill FLOPs wrong");
  process.exit(1);
}
if (!Array.isArray(trace.scaling) || trace.scaling.length !== 5) {
  console.error("expected 5 scaling rows");
  process.exit(1);
}
if (trace.prefill?.data?.notMeasuredTraffic !== true) {
  console.error("logical bytes must not be claimed as measured traffic");
  process.exit(1);
}

console.log("arithmetic/memory sample ok:", samplePath);
console.log("P", trace.config.promptLength);
console.log("prefill", trace.prefill.intensity.display);
console.log("decode", trace.decode.intensity.display);
