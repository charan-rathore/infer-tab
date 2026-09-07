import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(here, "../public/traces/sample-prefill-decode.json");
const trace = JSON.parse(readFileSync(samplePath, "utf8"));

if (trace.schemaVersion !== "0.3.1") {
  console.error("unexpected schemaVersion", trace.schemaVersion);
  process.exit(1);
}
if (trace.experimentId !== "02-prefill-vs-decode") {
  console.error("unexpected experimentId");
  process.exit(1);
}
if (!trace.prefill?.shapes?.scoresPerHead || !trace.decode?.shapes?.K_cache) {
  console.error("missing prefill/decode shapes");
  process.exit(1);
}
if (!Array.isArray(trace.scaling) || trace.scaling.length !== 5) {
  console.error("expected 5 scaling rows");
  process.exit(1);
}

console.log("prefill/decode sample ok:", samplePath);
console.log("P", trace.config.promptLength);
if (trace.prefill.attentionScoreCellsPerHead !== 36 || trace.prefill.attentionScoreCellsCausal !== 21) {
  console.error("P=6 mask counts wrong");
  process.exit(1);
}
console.log("prefill scores", trace.prefill.shapes.scoresPerHead);
console.log("decode scores", trace.decode.shapes.scoresPerHead);
console.log("P=6 cells/causal/masked", trace.prefill.attentionScoreCellsPerHead, trace.prefill.attentionScoreCellsCausal, trace.prefill.attentionScoreCellsMasked);
