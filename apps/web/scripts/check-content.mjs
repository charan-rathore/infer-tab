import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");

const FORBIDDEN = [
  "prefill is always compute-bound",
  "decode is always memory-bound",
  "prefill is compute-bound",
  "decode is memory-bound",
  "p² is total model work",
  "logical bytes are actual gpu traffic",
  "same generated token alone proves numerical equivalence",
  "k/v depends only on token identity",
];

const FAKE_BENCH = [
  "tokens per second on a100",
  "measured hbm bandwidth",
  "this gpu is memory-bound",
];

const LEARN_ACRONYMS = ["HBM", "DRAM", "FFN", "FLOPs", "FLOP", "RSS"];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(full, acc);
    } else if (/\.(tsx|ts|md|py|css|mjs|json)$/.test(name) && name !== "check-content.mjs") {
      acc.push(full);
    }
  }
  return acc;
}

const files = [
  ...walk(path.join(webRoot, "components")),
  ...walk(path.join(webRoot, "app")),
  path.join(webRoot, "lib/copy.ts"),
];
let failed = false;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes("\u2014") || text.includes("\\u2014")) {
    console.error("em dash in", path.relative(repoRoot, file));
    failed = true;
  }
  const lower = text.toLowerCase();
  for (const phrase of [...FORBIDDEN, ...FAKE_BENCH]) {
    if (lower.includes(phrase)) {
      console.error("forbidden claim in", path.relative(repoRoot, file), phrase);
      failed = true;
    }
  }
}

const copyPath = path.join(webRoot, "lib/copy.ts");
const copy = readFileSync(copyPath, "utf8");
for (const acronym of LEARN_ACRONYMS) {
  if (copy.includes(acronym)) {
    console.error("unexplained acronym in Learn copy:", acronym);
    failed = true;
  }
}

const learnStrings = [...copy.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
for (const sentence of learnStrings) {
  const parts = sentence.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length > 3) {
    console.error("Learn paragraph too long:", sentence);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("content checks ok");
