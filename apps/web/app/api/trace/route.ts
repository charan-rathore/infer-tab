import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { assertValidTrace } from "@/lib/schema";

export const runtime = "nodejs";

const EXPERIMENT_DIR = path.resolve(
  process.cwd(),
  "../../experiments/01-why-kv-cache",
);
const SAMPLE = path.resolve(process.cwd(), "public/traces/sample-why-kv-cache.json");

async function readSample() {
  return assertValidTrace(JSON.parse(await readFile(SAMPLE, "utf8")));
}

function pythonInvocation(): { cmd: string; prefix: string[] } {
  // WHY arch -arm64: on some Macs Node itself is running under Rosetta
  // (x86_64). A child python3 then inherits that arch and cannot load an
  // arm64-only PyTorch wheel. Forcing arm64 keeps the laptop experiment
  // on the CPU wheel we actually installed.
  if (process.platform === "darwin") {
    return { cmd: "arch", prefix: ["-arm64", "python3"] };
  }
  return { cmd: "python3", prefix: [] };
}

function runPython(prompt: string, maxNewTokens: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const { cmd, prefix } = pythonInvocation();
    const child = spawn(
      cmd,
      [
        ...prefix,
        "-c",
        "from decode import run_experiment; import json, sys; print(json.dumps(run_experiment(sys.argv[1], int(sys.argv[2]))))",
        prompt,
        String(maxNewTokens),
      ],
      { cwd: EXPERIMENT_DIR },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `python exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("Python did not return JSON"));
      }
    });
  });
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

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    maxNewTokens?: number;
  };
  const prompt = String(body.prompt ?? "the cat sat on the mat").slice(0, 80);
  const maxNewTokens = Math.min(8, Math.max(1, Number(body.maxNewTokens) || 6));

  try {
    const raw = await runPython(prompt, maxNewTokens);
    const trace = assertValidTrace(raw);
    return Response.json({ source: "live", trace });
  } catch (err) {
    try {
      const trace = await readSample();
      return Response.json({
        source: "sample",
        fallback: true,
        error: err instanceof Error ? err.message : "python failed",
        trace,
      });
    } catch {
      return Response.json(
        { error: err instanceof Error ? err.message : "experiment failed" },
        { status: 500 },
      );
    }
  }
}
