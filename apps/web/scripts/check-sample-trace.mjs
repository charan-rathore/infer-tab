import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplePath = path.resolve(here, "../public/traces/sample-why-kv-cache.json");
const trace = JSON.parse(readFileSync(samplePath, "utf8"));

const required = [
  "schemaVersion",
  "experimentId",
  "prompt",
  "promptTokens",
  "config",
  "modes",
  "equivalence",
  "measurementDisclaimer",
];

const missing = required.filter((key) => !(key in trace));
if (missing.length) {
  console.error("missing keys:", missing.join(", "));
  process.exit(1);
}
if (trace.schemaVersion !== "0.2.0") {
  console.error("unexpected schemaVersion", trace.schemaVersion);
  process.exit(1);
}
if (!trace.modes?.naive?.steps?.length || !trace.modes?.cached?.steps?.length) {
  console.error("both modes must contain steps");
  process.exit(1);
}
if (trace.equivalence.outputsMatch !== true) {
  console.error("sample trace reports outputsMatch=false");
  process.exit(1);
}

console.log("sample trace ok:", samplePath);
console.log("prompt:", trace.prompt);
console.log("naive K/V rows projected:", trace.modes.naive.totals.kvRowsProjected);
console.log("cached K/V rows projected:", trace.modes.cached.totals.kvRowsProjected);
