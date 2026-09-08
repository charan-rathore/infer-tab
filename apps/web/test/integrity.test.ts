import { describe, expect, it } from "vitest";
import { traces } from "./simulation-fixture";
import {
  validateBundle,
  arithmeticAccount,
  stagePair,
} from "@/lib/simulation/adapters";
import {
  initialState,
  reduceMachine,
  sharedLengths,
  type SimulationEvent,
  type TraceBundle,
} from "@/lib/simulation/model";
import {
  decodeReplay,
  encodeReplay,
  replayState,
  type Replay,
} from "@/lib/simulation/replay";
import { schedulePlayback } from "@/lib/simulation/playback";

/** Apply a recorded sequence using the same reducer as the running product. */
function run(events: SimulationEvent[]) {
  return events.reduce(
    (state, event) => reduceMachine(state, event, traces),
    initialState(traces),
  );
}
const failure: SimulationEvent[] = [
  { type: "interaction.started", lesson: "01" },
  { type: "prediction.committed", lesson: "01", answer: "all" },
];
describe("Timeline integrity", () => {
  it("rejects duplicate ticks and callbacks from a cancelled play session", () => {
    let state = run([...failure, { type: "timeline.play" }]);
    const tick: SimulationEvent = {
      type: "timeline.tick",
      epoch: state.playbackEpoch,
      fromStep: state.playhead,
    };
    state = reduceMachine(state, tick, traces);
    expect(reduceMachine(state, tick, traces)).toEqual(state);
    state = reduceMachine(state, { type: "timeline.pause" }, traces);
    state = reduceMachine(state, { type: "timeline.play" }, traces);
    expect(reduceMachine(state, tick, traces)).toEqual(state);
    expect(state.playhead).toBe(2);
  });
  it("cancels the only scheduled intent without touching mathematical facts", () => {
    const state = run([...failure, { type: "timeline.play" }]);
    const sent: SimulationEvent[] = [];
    let callback = () => {};
    let cancelled: unknown;
    const dispose = schedulePlayback(state, (event) => sent.push(event), {
      schedule: (fn) => {
        callback = fn;
        return 17;
      },
      cancel: (handle) => {
        cancelled = handle;
      },
    });
    dispose();
    expect(cancelled).toBe(17);
    callback();
    const paused = reduceMachine(state, { type: "timeline.pause" }, traces);
    expect(reduceMachine(paused, sent[0], traces)).toEqual(paused);
  });
  it("reconstructs backward seeks and reset independently of playback history", () => {
    const state = run([
      ...failure,
      { type: "timeline.sought", step: 5 },
      { type: "timeline.sought", step: 1 },
    ]);
    expect(state).toEqual({ ...run(failure), playbackEpoch: 2 });
    const reset = reduceMachine(
      state,
      { type: "lesson.reset", lesson: "01" },
      traces,
    );
    expect(reset).toEqual({ ...initialState(traces), playbackEpoch: 3 });
  });
  it("keeps a reused row visible when the mechanism changes after rewinding", () => {
    const state = run([
      ...failure,
      { type: "timeline.replay" },
      { type: "mechanism.changed", lesson: "01" },
    ]);
    expect(
      traces.kv.modes.cached.steps[state.playhead].kvRowsReused,
    ).toBeGreaterThan(0);
  });
  it("roundtrips playback, comparison, inspection and causal representation losslessly", () => {
    const events: SimulationEvent[] = [
      ...failure,
      { type: "mechanism.changed", lesson: "01" },
      { type: "timeline.play" },
      { type: "timeline.pause" },
      { type: "lesson.entered", lesson: "02" },
      { type: "interaction.started", lesson: "02" },
      { type: "prediction.committed", lesson: "02", answer: "yes" },
      { type: "mechanism.changed", lesson: "02" },
      { type: "query.selected", position: 3 },
      { type: "edge.inspected", key: 5 },
      { type: "representation.selected", representation: "grid" },
    ];
    const replay: Replay = { version: 1, lesson: "02", traces, events };
    expect(replayState(decodeReplay(encodeReplay(replay)))).toEqual(
      run(events),
    );
  });
  it("cannot manufacture progress from out-of-order replay actions", () => {
    const state = run([
      { type: "term.revealed", lesson: "01" },
      { type: "mechanism.changed", lesson: "01" },
      { type: "timeline.tick", epoch: 0, fromStep: -1 },
      { type: "compare.selected", enabled: true },
    ]);
    expect(state).toEqual(initialState(traces));
    expect(() =>
      decodeReplay(
        JSON.stringify({
          version: 1,
          lesson: "01",
          traces,
          events: [{ type: "depth.selected", depth: ["prove"] }],
        }),
      ),
    ).toThrow();
  });
  it("drops custom prompt selections and stops playback when entering a different source", () => {
    const custom = structuredClone(traces);
    custom.kv.prompt = "a different recorded sentence";
    const state = run([
      ...failure,
      { type: "object.inspected", position: 2 },
      { type: "timeline.play" },
    ]);
    const next = reduceMachine(
      state,
      { type: "lesson.entered", lesson: "02" },
      custom,
    );
    expect(next.selectedPosition).toBeNull();
    expect(next.playing).toBe(false);
    expect(custom.prefill).toEqual(traces.prefill);
  });
});

const mutations: [string, (bundle: TraceBundle) => void][] = [
  [
    "51 becomes 50",
    (b) => {
      b.kv.modes.naive.totals.kvRowsProjected = 50;
    },
  ],
  [
    "cached key changes",
    (b) => {
      b.kv.modes.cached.steps[1].reused[0].kPreview[0] += 1;
    },
  ],
  [
    "cached value changes",
    (b) => {
      b.kv.modes.cached.steps[1].reused[0].vPreview[0] += 1;
    },
  ],
  [
    "KV byte product",
    (b) => {
      b.kv.modes.cached.steps[0].logicalKvBytes += 4;
    },
  ],
  [
    "causal and forbidden counts exchanged",
    (b) => {
      b.prefill.prefill.attentionScoreCellsCausal -= 1;
      b.prefill.prefill.attentionScoreCellsMasked += 1;
    },
  ],
  [
    "decode absolute position",
    (b) => {
      b.prefill.decode.newTokenPosition = b.prefill.config.promptLength - 1;
    },
  ],
  [
    "FLOP calculation",
    (b) => {
      b.arithmetic.decode.arithmetic.attentionFlopsPerHead -= 1;
    },
  ],
  [
    "arithmetic intensity",
    (b) => {
      b.arithmetic.decode.intensity.arithmeticIntensity += 1;
    },
  ],
  [
    "dtype byte factors",
    (b) => {
      (
        b.arithmetic.dtypeComparison.float16.decode as Record<string, number>
      ).qBytes += 2;
    },
  ],
  [
    "stale schema",
    (b) => {
      (b.kv as { schemaVersion: string }).schemaVersion = "0.1.0";
    },
  ],
];
describe("Adversarial recorded facts", () => {
  it.each(mutations)("rejects %s before rendering or replay", (_, mutate) => {
    const broken = structuredClone(traces);
    mutate(broken);
    expect(() => validateBundle(broken)).toThrow();
    expect(() =>
      decodeReplay(
        encodeReplay({ version: 1, lesson: "01", traces: broken, events: [] }),
      ),
    ).toThrow();
  });
  it("preserves triangular and dtype scaling identities over every supported recording", () => {
    for (const p of sharedLengths(traces)) {
      const pair = stagePair(traces, p);
      expect(
        pair.prefill.attentionScoreCellsCausal +
          pair.prefill.attentionScoreCellsMasked,
      ).toBe(p * p);
      expect(pair.prefill.attentionScoreCellsCausal).toBe((p * (p + 1)) / 2);
      const full = arithmeticAccount(traces, {
        promptLength: p,
        job: "decode",
        bytes: 4,
      });
      const half = arithmeticAccount(traces, {
        promptLength: p,
        job: "decode",
        bytes: 2,
      });
      expect(half.flops).toBe(full.flops);
      expect(half.bytes * 2).toBe(full.bytes);
      expect(full.flops / (p + 1)).toBe(4 * traces.arithmetic.config.dHead);
      expect(pair.prefill.logicalKvBytesAvailable / p).toBe(
        traces.prefill.config.dModel * 2 * 4,
      );
    }
  });
});
