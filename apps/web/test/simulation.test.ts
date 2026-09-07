import { describe, expect, it } from "vitest";
import { traces } from "./simulation-fixture";
import {
  initialState,
  reduceMachine,
  type SimulationEvent,
} from "@/lib/simulation/model";
import {
  projectedWork,
  arithmeticAccount,
  objectId,
  validateBundle,
} from "@/lib/simulation/adapters";
import {
  decodeReplay,
  encodeReplay,
  replayState,
  type Replay,
} from "@/lib/simulation/replay";
const events: SimulationEvent[] = [
  { type: "interaction.started", lesson: "01" },
  { type: "prediction.committed", lesson: "01", answer: "all" },
  { type: "mechanism.changed", lesson: "01" },
  { type: "timeline.sought", step: 5 },
  { type: "object.inspected", position: 4 },
];
const recording: Replay = { version: 1, lesson: "01", traces, events };
describe("Deterministic simulation projection", () => {
  it("requires prediction and observed failure before mechanism or terminology", () => {
    const state = initialState(traces);
    expect(
      reduceMachine(state, { type: "mechanism.changed", lesson: "01" }, traces)
        .lessons["01"].milestone,
    ).toBe("problem");
    expect(
      reduceMachine(state, { type: "term.revealed", lesson: "01" }, traces)
        .lessons["01"].milestone,
    ).toBe("problem");
    expect(
      reduceMachine(state, { type: "timeline.sought", step: 5 }, traces)
        .playhead,
    ).toBe(-1);
  });
  it("ignores a prediction belonging to another lesson", () => {
    const state = reduceMachine(
      initialState(traces),
      { type: "interaction.started", lesson: "01" },
      traces,
    );
    expect(
      reduceMachine(
        state,
        { type: "prediction.committed", lesson: "01", answer: "bytes" },
        traces,
      ).lessons["01"].milestone,
    ).toBe("prediction");
  });
  it("replays the same state from a portable file", () => {
    const restored = decodeReplay(encodeReplay(recording));
    expect(replayState(restored)).toEqual(replayState(recording));
    expect(replayState(restored).selectedPosition).toBe(4);
    expect(replayState(restored).playhead).toBe(5);
  });
  it("distinguishes repeated words and different prompts", () => {
    expect(objectId(traces.kv.prompt, 0)).not.toBe(
      objectId(traces.kv.prompt, 4),
    );
    expect(objectId("different prompt", 0)).not.toBe(
      objectId(traces.kv.prompt, 0),
    );
  });
  it("sums recorded counts over just the observed prefix", () => {
    expect(projectedWork(traces.kv, "naive", 1)).toMatchObject({
      value: 13,
      expression: "6 + 7",
    });
    expect(projectedWork(traces.kv, "cached", 1)).toMatchObject({
      value: 7,
      expression: "6 + 1",
    });
    expect(projectedWork(traces.kv, "naive", 5).value).toBe(
      traces.kv.modes.naive.totals.kvRowsProjected,
    );
  });
  it("reads dtype accounting instead of using a fixed head-width formula", () => {
    const modified = structuredClone(traces);
    const account = modified.arithmetic.dtypeComparison.float16
      .decode as Record<string, number>;
    account.attentionFlopsPerHead = 448;
    account.arithmeticIntensity = 448 / account.logicalBytesConsidered;
    expect(
      arithmeticAccount(modified, { promptLength: 6, job: "decode", bytes: 2 })
        .flops,
    ).toBe(448);
  });
  it("derives scaling width from recorded payloads", () => {
    const full = arithmeticAccount(traces, {
      promptLength: 16,
      job: "decode",
      bytes: 4,
    });
    const half = arithmeticAccount(traces, {
      promptLength: 16,
      job: "decode",
      bytes: 2,
    });
    expect(half.bytes).toBe(full.bytes / 2);
    expect(half.flops).toBe(full.flops);
    expect(half.intensity).toBe(full.intensity * 2);
    expect(half.source).toContain("payload × 2/4");
  });
  it("rejects unsupported scenarios instead of inventing a fallback account", () => {
    expect(() =>
      arithmeticAccount(traces, { promptLength: 99, job: "decode", bytes: 4 }),
    ).toThrow();
    expect(
      reduceMachine(
        initialState(traces),
        { type: "scenario.selected", length: 99 },
        traces,
      ).promptLength,
    ).toBe(6);
  });
  it.each([
    { ...recording, version: 2 },
    { ...recording, events: [{ type: "timeline.sought", step: "NaN" }] },
    { ...recording, events: [{ type: "animation.finished" }] },
  ])("refuses invalid replay contracts", (value) => {
    expect(() => decodeReplay(JSON.stringify(value))).toThrow();
  });
  it("rejects row counts that disagree with their objects", () => {
    const broken = structuredClone(traces);
    broken.kv.modes.cached.steps[1].kvRowsProjected = 99;
    expect(() => validateBundle(broken)).toThrow(/row counts/);
  });
  it("rejects an arithmetic denominator that excludes a declared payload", () => {
    const broken = structuredClone(traces);
    const account = broken.arithmetic.dtypeComparison.float16.decode as Record<
      string,
      number
    >;
    account.logicalBytesConsidered -= account.qBytes;
    expect(() => validateBundle(broken)).toThrow(/denominator/);
  });
});
