import { readFile } from "fs/promises";
import path from "path";
import { assertValidArithmeticMemoryTrace } from "@/lib/schema";

export const runtime = "nodejs";

const SAMPLE = path.resolve(
  process.cwd(),
  "public/traces/sample-arithmetic-memory.json",
);

async function readSample() {
  return assertValidArithmeticMemoryTrace(JSON.parse(await readFile(SAMPLE, "utf8")));
}

export async function GET() {
  try {
    return Response.json({ source: "sample", trace: await readSample() });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "sample missing" },
      { status: 500 },
    );
  }
}
