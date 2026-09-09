import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webPrefix = "apps/web/";
const schemaPrefix = "packages/trace-schema/";
const extensions = new Set([".ts", ".tsx", ".json", ".css", ".mjs"]);

/** Package public application sources for file-upload deployments that omit directories outside the detected app root. */
export function deploymentFiles() {
  const candidates = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "apps/web",
      "packages/trace-schema",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n");
  return [...new Set(candidates)]
    .sort()
    .filter(
      (file) =>
        extensions.has(path.extname(file)) &&
        !file.includes("/test/") &&
        !file.includes("/scripts/"),
    )
    .map((file) => {
      // Relocation preserves every schema byte. Only the compile-time alias changes.
      const destination = file.startsWith(webPrefix)
        ? file.slice(webPrefix.length)
        : `trace-schema/${file.slice(schemaPrefix.length)}`;
      let data = readFileSync(path.join(root, file), "utf8");
      if (destination === "tsconfig.json") {
        const config = JSON.parse(data);
        config.compilerOptions.paths["@infertab/trace-schema"] = [
          "./trace-schema/src/index.ts",
        ];
        data = JSON.stringify(config, null, 2) + "\n";
      }
      return { file: destination, data };
    });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(JSON.stringify(deploymentFiles()));
}
