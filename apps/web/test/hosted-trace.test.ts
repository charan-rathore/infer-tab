import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as kvPost } from "@/app/api/trace/route";
import { POST as prefillPost } from "@/app/api/prefill-decode/route";
import { assertValidTrace, assertValidPrefillDecodeTrace } from "@/lib/schema";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("child_process", () => ({ spawn, default: { spawn } }));
afterEach(() => vi.unstubAllEnvs());

describe("Hosted recordings", () => {
  it("serves validated recorded truth and never attempts live Python on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    const request = new Request("https://infertab.example/api/trace", {
      method: "POST",
      body: JSON.stringify({ prompt: "a custom sentence", promptLength: 128 }),
    });
    const kv = await (await kvPost(request.clone())).json();
    const prefill = await (await prefillPost(request.clone())).json();
    for (const response of [kv, prefill]) {
      expect(response).toMatchObject({ source: "sample", fallback: true });
      expect(response.error).toContain("local-only");
    }
    expect(assertValidTrace(kv.trace).prompt).not.toBe("a custom sentence");
    expect(
      assertValidPrefillDecodeTrace(prefill.trace).config.promptLength,
    ).toBe(6);
    expect(spawn).not.toHaveBeenCalled();
  });
});
