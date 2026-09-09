import { describe, expect, it } from "vitest";
import {
  initialState,
  reduceMachine,
  type SimulationEvent,
  type MachineState,
} from "@/lib/simulation/model";
import { arithmeticAccount, projectedWork } from "@/lib/simulation/adapters";
import { projectVisualFrame } from "@/lib/visual/projection";
import { explanationFrames } from "@/lib/visual/clip";
import {
  decodeReplay,
  encodeReplay,
  type Replay,
} from "@/lib/simulation/replay";
import { causalAreaPath } from "@/lib/visual/geometry";
import { traces } from "./simulation-fixture";

const firstSteps: SimulationEvent[] = [
  { type: "interaction.started", lesson: "01" },
  { type: "prediction.committed", lesson: "01", answer: "all" },
];

/** Apply actual learner actions through the production reducer, never fabricate a milestone. */
function observe(
  events: SimulationEvent[],
  state = initialState(traces),
): MachineState {
  return events.reduce(
    (current, event) => reduceMachine(current, event, traces),
    state,
  );
}

describe("Semantic visual projection", () => {
  it("reconstructs the exact objects and caption when seeking backward", () => {
    const state = observe(firstSteps);
    const before = projectVisualFrame(state, traces, "01");
    const later = observe([{ type: "timeline.sought", step: 5 }], state);
    const back = observe([{ type: "timeline.sought", step: 1 }], later);
    expect(projectVisualFrame(back, traces, "01")).toEqual(before);
    expect(projectVisualFrame(state, traces, "01")).toEqual(before);
    expect(before.caption.emphasis).toBe("6 + 7");
    expect(before.caption.emphasis).not.toContain("51");
  });

  it("returns every previously projected naive identity through compute, then keeps those same cached identities stationary", () => {
    const state = observe(firstSteps);
    const naive = projectVisualFrame(state, traces, "01");
    const kept = observe([{ type: "mechanism.changed", lesson: "01" }], state);
    const cached = projectVisualFrame(kept, traces, "01");
    const repeated = naive.events.filter(
      (event) => event.action === "recompute",
    );
    expect(repeated).toHaveLength(traces.kv.promptTokens.length);
    for (const event of repeated) {
      expect(event).toMatchObject({
        from: "previous-result",
        via: "compute",
        to: "compute",
      });
      expect(
        cached.events.find((item) => item.objectId === event.objectId),
      ).toMatchObject({
        action: "retain-and-read",
        from: "memory",
        via: "read",
        to: "memory",
      });
    }
    expect(
      cached.events.filter((event) => event.action === "project"),
    ).toHaveLength(1);
    expect(naive.events.map((event) => event.objectId)).toEqual(
      cached.events.map((event) => event.objectId),
    );
  });

  it("changes spatial strategy without changing a single mathematical action or its source", () => {
    const state = observe([
      ...firstSteps,
      { type: "mechanism.changed", lesson: "01" },
    ]);
    const before = projectVisualFrame(state, traces, "01");
    const after = observe(
      [
        {
          type: "teaching.alternative.requested",
          lesson: "01",
          concept: "kv-cache",
        },
      ],
      state,
    );
    const frame = projectVisualFrame(after, traces, "01");
    expect(frame.strategy).not.toBe(before.strategy);
    expect(frame.events).toEqual(before.events);
    expect(frame.observation).toEqual(before.observation);
    expect(projectedWork(traces.kv, after.policy, after.playhead)).toEqual(
      projectedWork(traces.kv, state.policy, state.playhead),
    );
  });

  it("retains cause and consequence in discrete visual events without requiring animation progress", () => {
    const state = observe([
      ...firstSteps,
      { type: "prediction.revisited", lesson: "01", answer: "one" },
      { type: "mechanism.changed", lesson: "01" },
    ]);
    const frame = projectVisualFrame(state, traces, "01");
    for (const event of frame.events.filter(
      (item) => item.action === "retain-and-read",
    )) {
      expect(event.from).toBe(event.to);
      expect(event.via).toBe("read");
    }
    expect(JSON.stringify(frame)).not.toMatch(
      /animationProgress|elapsedTime|durationMs/,
    );
  });

  it("describes an invalid causal attempt as a blocked edge, including after replay", () => {
    const events: SimulationEvent[] = [
      { type: "lesson.entered", lesson: "02" },
      { type: "interaction.started", lesson: "02" },
      { type: "prediction.committed", lesson: "02", answer: "yes" },
      { type: "edge.inspected", key: 3 },
    ];
    const frame = projectVisualFrame(observe(events), traces, "02");
    expect(frame.caption).toMatchObject({
      kind: "CAUSE",
      emphasis: "future position 3",
    });
    expect(frame.caption.after).toContain("boundary stays closed");
    const recording: Replay = { version: 1, lesson: "02", traces, events };
    expect([...explanationFrames(recording)].at(-1)?.frame).toEqual(frame);
  });

  it("keeps the recorded arithmetic invariant through payload and unit-lens changes", () => {
    const events: SimulationEvent[] = [
      { type: "lesson.entered", lesson: "03" },
      { type: "interaction.started", lesson: "03" },
      { type: "prediction.committed", lesson: "03", answer: "math" },
    ];
    const before = observe(events);
    const after = observe(
      [
        { type: "mechanism.changed", lesson: "03" },
        { type: "unit-lens.selected", lens: "recording" },
      ],
      before,
    );
    expect(arithmeticAccount(traces, after).flops).toBe(
      arithmeticAccount(traces, before).flops,
    );
    expect(arithmeticAccount(traces, after).bytes).toBe(
      arithmeticAccount(traces, before).bytes / 2,
    );
    expect(projectVisualFrame(after, traces, "03").observation.unitLens).toBe(
      "recording",
    );
    expect(
      reduceMachine(
        initialState(traces),
        { type: "unit-lens.selected", lens: "recording" },
        traces,
      ).unitLens,
    ).toBe("distance");
  });

  it("replays identical captions and visual frames, without duplicate consequences from stale playback", () => {
    const state = observe([...firstSteps, { type: "timeline.play" }]);
    const tick: SimulationEvent = {
      type: "timeline.tick",
      fromStep: state.playhead,
      epoch: state.playbackEpoch,
    };
    const recording: Replay = {
      version: 1,
      lesson: "01",
      traces,
      events: [...firstSteps, { type: "timeline.play" }, tick, tick],
    };
    const frames = [...explanationFrames(recording)];
    expect(
      frames.filter((item) => item.frame.observation.playhead === 2),
    ).toHaveLength(1);
    expect([
      ...explanationFrames(decodeReplay(encodeReplay(recording))),
    ]).toEqual(frames);
    const tampered = structuredClone(recording);
    tampered.traces.kv.modes.naive.totals.kvRowsProjected = 50;
    expect(() => [...explanationFrames(tampered)]).toThrow();
    expect(() =>
      decodeReplay(
        encodeReplay({
          ...recording,
          events: [{ type: "unit-lens.selected", lens: "invented" }],
        } as unknown as Replay),
      ),
    ).toThrow();
  });
});

/** Measure a rectilinear SVG outline with the shoelace formula, independently of the renderer's construction. */
function outlineArea(path: string): number {
  let x = 0,
    y = 0;
  const vertices: number[][] = [];
  for (const command of path.matchAll(/([MHV])([\d ]+)/g)) {
    const values = command[2].trim().split(/\s+/).map(Number);
    if (command[1] === "M") [x, y] = values;
    if (command[1] === "H") x = values[0];
    if (command[1] === "V") y = values[0];
    vertices.push([x, y]);
  }
  return (
    Math.abs(
      vertices.reduce((sum, [vx, vy], index) => {
        const [nx, ny] = vertices[(index + 1) % vertices.length];
        return sum + vx * ny - vy * nx;
      }, 0),
    ) / 2
  );
}

it("preserves the exact recorded causal cell area, including the diagonal, at every large scenario", () => {
  for (const row of traces.prefill.scaling) {
    expect(outlineArea(causalAreaPath(row.promptLength))).toBe(
      row.prefill.attentionScoreCellsCausal,
    );
    expect(causalAreaPath(row.promptLength).length).toBeLessThan(
      row.promptLength * 20 + 30,
    );
  }
});
