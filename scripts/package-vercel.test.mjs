import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deploymentFiles } from "./package-vercel.mjs";

test("deployment relocation preserves exact trace and schema sources", () => {
  const files = new Map(
    deploymentFiles().map((item) => [item.file, item.data]),
  );
  for (const file of [
    "schema.json",
    "schema-prefill-decode.json",
    "schema-arithmetic-memory.json",
    "src/index.ts",
  ]) {
    assert.equal(
      files.get(`trace-schema/${file}`),
      readFileSync(
        new URL(`../packages/trace-schema/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  for (const file of [
    "sample-why-kv-cache.json",
    "sample-prefill-decode.json",
    "journey-arithmetic-memory.json",
  ]) {
    assert.equal(
      files.get(`public/traces/${file}`),
      readFileSync(
        new URL(`../apps/web/public/traces/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  const config = JSON.parse(files.get("tsconfig.json"));
  assert.deepEqual(config.compilerOptions.paths["@infertab/trace-schema"], [
    "./trace-schema/src/index.ts",
  ]);
  assert.ok(
    [...files.keys()].every(
      (file) =>
        !file.includes("..") &&
        !file.includes("node_modules") &&
        !file.includes(".env"),
    ),
  );
});
