import { spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";
import { assertValidPrefillDecodeTrace } from "@/lib/schema";

export const runtime = "nodejs";

const EXPERIMENT_DIR = path.resolve(
  process.cwd(),
  "../../experiments/02-prefill-vs-decode",
);
const SAMPLE = path.resolve(
  process.cwd(),
  "public/traces/sample-prefill-decode.json",
);

/** Read and validate the committed recording before exposing it to any client. */
async function readSample() {
  return assertValidPrefillDecodeTrace(
    JSON.parse(await readFile(SAMPLE, "utf8")),
  );
}

/** Select the local interpreter architecture without changing the experiment. */
function pythonInvocation(): { cmd: string; prefix: string[] } {
  if (process.platform === "darwin") {
    return { cmd: "arch", prefix: ["-arm64", "python3"] };
  }
  return { cmd: "python3", prefix: [] };
}

/** Execute the local Python source and return its recorded result for validation. */
function runPython(promptLength: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const { cmd, prefix } = pythonInvocation();
    const child = spawn(
      cmd,
      [
        ...prefix,
        "-c",
        "from experiment import run_experiment; import json, sys; print(json.dumps(run_experiment(int(sys.argv[1]))))",
        String(promptLength),
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

/** Serve a validated recording without requiring Python at runtime. */
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

/** Run locally, or explicitly serve the recorded scenario on the hosted application. */
export async function POST(req: Request) {
  if (process.env.VERCEL) {
    return Response.json({
      source: "sample",
      fallback: true,
      error:
        "Live Python is local-only. This deployment uses validated recorded traces.",
      trace: await readSample(),
    });
  }
  const body = (await req.json().catch(() => ({}))) as {
    promptLength?: number;
  };
  const allowed = [6, 16, 32, 64, 128];
  const promptLength = allowed.includes(Number(body.promptLength))
    ? Number(body.promptLength)
    : 6;
  try {
    const trace = assertValidPrefillDecodeTrace(await runPython(promptLength));
    return Response.json({ source: "live", trace });
  } catch (err) {
    try {
      return Response.json({
        source: "sample",
        fallback: true,
        error: err instanceof Error ? err.message : "python failed",
        trace: await readSample(),
      });
    } catch {
      return Response.json(
        { error: err instanceof Error ? err.message : "experiment failed" },
        { status: 500 },
      );
    }
  }
}
