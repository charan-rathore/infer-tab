import { describe, expect, it } from "vitest";
import {
  CONCEPT_EDGES,
  prerequisiteClosure,
  relatedConcepts,
  strategiesForConcept,
  strategiesForMisconception,
  validateConceptGraph,
} from "@/lib/teaching/concepts";
import {
  applyLearnerEvidence,
  conceptLearning,
  hasMisconception,
  initialLearnerModel,
  MAX_LEARNER_EVIDENCE,
  type LearnerModel,
} from "@/lib/teaching/learner";
import { teachingDecision } from "@/lib/teaching/policy";
import { resolveTeachingChoice } from "@/lib/teaching/assistant";
import {
  initialState,
  reduceMachine,
  type MachineState,
  type SimulationEvent,
} from "@/lib/simulation/model";
import {
  decodeReplay,
  encodeReplay,
  replayState,
  type Replay,
} from "@/lib/simulation/replay";
import { traces } from "./simulation-fixture";

/** Apply semantic actions through the production reducer to construct a learner history. */
function run(events: SimulationEvent[]): MachineState {
  return events.reduce(
    (state, event) => reduceMachine(state, event, traces),
    initialState(traces),
  );
}

/** Remove adaptive routing state so tests can prove a strategy switch left simulation truth untouched. */
function simulationOnly(state: MachineState) {
  const { learner: _learner, ...simulation } = state;
  return simulation;
}

describe("Typed inference concept graph", () => {
  it("traverses prerequisites, solutions, bottlenecks, and explicit provenance", () => {
    expect(() => validateConceptGraph()).not.toThrow();
    expect(prerequisiteClosure("arithmetic-intensity")).toEqual(
      expect.arrayContaining([
        "flop",
        "bit",
        "byte",
        "dtype",
        "logical-payload",
      ]),
    );
    expect(relatedConcepts("kv-cache", "solves")).toEqual(["recomputation"]);
    expect(relatedConcepts("kv-cache", "creates-bottleneck")).toEqual([
      "cache-growth",
    ]);
    expect(strategiesForConcept("kv-cache")).toHaveLength(4);
    expect(strategiesForMisconception("kv-cache-is-chat-memory")).toHaveLength(
      4,
    );
    expect(
      CONCEPT_EDGES.every((edge) => edge.provenance.source.length > 0),
    ).toBe(true);
  });
});

describe("Evidence-driven teaching policy", () => {
  it("routes Learner A from two wrong KV predictions to physical reuse", () => {
    const state = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "one" },
      { type: "prediction.revisited", lesson: "01", answer: "one" },
    ]);
    expect(teachingDecision("01", state.learner).strategy).toBe(
      "physical-shelf",
    );
    expect(
      hasMisconception(state.learner, "kv-cache", "kv-cache-is-chat-memory"),
    ).toBe(false);
  });

  it("routes Learner B from a correct prediction and proof seeking to compact comparison", () => {
    const state = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "all" },
      { type: "depth.selected", depth: "prove" },
    ]);
    expect(teachingDecision("01", state.learner)).toMatchObject({
      strategy: "synchronized-comparison",
      compressed: true,
      offerDerivation: true,
    });
  });

  it("detects a generic-chat-memory answer without conflating it with a work-count error", () => {
    const state = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "all" },
      { type: "mechanism.changed", lesson: "01" },
      { type: "derivation.revealed", lesson: "01" },
      { type: "term.revealed", lesson: "01" },
      {
        type: "transfer.answered",
        lesson: "01",
        question: "kv-purpose",
        correct: false,
      },
    ]);
    expect(
      hasMisconception(state.learner, "kv-cache", "kv-cache-is-chat-memory"),
    ).toBe(true);
    expect(teachingDecision("01", state.learner).strategy).toBe(
      "physical-shelf",
    );
  });

  it("keeps symbolic work fixed for Learner C's float16 misconception", () => {
    const state = run([
      { type: "lesson.entered", lesson: "03" },
      { type: "interaction.started", lesson: "03" },
      { type: "prediction.committed", lesson: "03", answer: "math" },
    ]);
    expect(teachingDecision("03", state.learner).strategy).toBe(
      "dtype-payload",
    );
    expect(
      hasMisconception(
        state.learner,
        "arithmetic-intensity",
        "float16-reduces-symbolic-flops",
      ),
    ).toBe(true);
  });

  it("forces a causal counterexample for Learner D's future-token belief", () => {
    const state = run([
      { type: "lesson.entered", lesson: "02" },
      { type: "interaction.started", lesson: "02" },
      { type: "prediction.committed", lesson: "02", answer: "yes" },
    ]);
    expect(teachingDecision("02", state.learner)).toMatchObject({
      strategy: "causal-edges",
      requiresCounterexample: true,
    });
  });

  it("does not repeat the beginner analogy for Learner E with strong prior evidence", () => {
    const state = run([
      { type: "learner.prior.declared", lesson: "01", concept: "kv-cache" },
    ]);
    expect(teachingDecision("01", state.learner)).toMatchObject({
      strategy: "causal-invariant",
      compressed: true,
    });
  });

  it("is deterministic for identical evidence and varies for different evidence", () => {
    const correct = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "all" },
    ]);
    const wrong = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "one" },
      { type: "prediction.revisited", lesson: "01", answer: "one" },
    ]);
    expect(teachingDecision("01", correct.learner)).toEqual(
      teachingDecision("01", structuredClone(correct.learner)),
    );
    expect(teachingDecision("01", correct.learner).strategy).not.toBe(
      teachingDecision("01", wrong.learner).strategy,
    );
  });

  it("changes representation on request without changing simulation state or trace truth", () => {
    const before = run([
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "all" },
    ]);
    const after = reduceMachine(
      before,
      {
        type: "teaching.alternative.requested",
        lesson: "01",
        concept: "kv-cache",
      },
      traces,
    );
    expect(teachingDecision("01", after.learner).strategy).not.toBe(
      teachingDecision("01", before.learner).strategy,
    );
    expect(simulationOnly(after)).toEqual(simulationOnly(before));
    expect(traces.kv.modes.naive.totals.kvRowsProjected).toBe(51);
    expect(traces.kv.modes.cached.totals.kvRowsProjected).toBe(11);
  });

  it("roundtrips learner evidence losslessly through replay", () => {
    const events: SimulationEvent[] = [
      { type: "interaction.started", lesson: "01" },
      { type: "prediction.committed", lesson: "01", answer: "one" },
      { type: "prediction.revisited", lesson: "01", answer: "one" },
      {
        type: "teaching.alternative.requested",
        lesson: "01",
        concept: "kv-cache",
      },
    ];
    const replay: Replay = { version: 1, lesson: "01", traces, events };
    const restored = decodeReplay(encodeReplay(replay));
    expect(replayState(restored).learner).toEqual(replayState(replay).learner);
  });

  it("never increases mastery without accepted evidence", () => {
    const initial = initialState(traces);
    const ignored = reduceMachine(
      initial,
      { type: "timeline.sought", step: 5 },
      traces,
    );
    expect(ignored.learner).toEqual(initial.learner);
    expect(conceptLearning(ignored.learner, "kv-cache").mastery).toBe(0);
    const curious = reduceMachine(
      ignored,
      { type: "depth.selected", depth: "prove" },
      traces,
    );
    expect(conceptLearning(curious.learner, "kv-cache").mastery).toBe(0);
  });

  it("preserves concept knowledge across routes and rejects invalid adaptive replay state", () => {
    const learned = run([
      { type: "learner.prior.declared", lesson: "01", concept: "kv-cache" },
    ]);
    const routed = reduceMachine(
      learned,
      { type: "lesson.entered", lesson: "02" },
      traces,
    );
    expect(routed.learner).toEqual(learned.learner);
    const invalid = {
      version: 1,
      lesson: "01",
      traces,
      events: [
        {
          type: "learner.prior.declared",
          lesson: "01",
          concept: "invented-fact",
        },
      ],
    };
    expect(() => decodeReplay(JSON.stringify(invalid))).toThrow();
    expect(() =>
      decodeReplay(
        JSON.stringify({
          version: 1,
          lesson: "01",
          traces,
          events: [
            {
              type: "transfer.answered",
              lesson: "01",
              question: "float16-flops",
              correct: true,
            },
          ],
        }),
      ),
    ).toThrow();
  });

  it("falls back exactly when a future assistant is unavailable or invalid", () => {
    const fallback = teachingDecision("01", initialLearnerModel());
    expect(resolveTeachingChoice(null, fallback)).toEqual(fallback);
    expect(
      resolveTeachingChoice(
        {
          version: 1,
          concept: "kv-cache",
          strategy: "tensor-shape-derivation",
          move: "explain",
          misconception: null,
        },
        fallback,
      ),
    ).toEqual(fallback);
    expect(
      resolveTeachingChoice(
        {
          version: 1,
          concept: "kv-cache",
          strategy: "physical-shelf",
          move: "explain",
          misconception: "float16-reduces-symbolic-flops",
        },
        fallback,
      ),
    ).toEqual(fallback);
  });

  it("represents all required misconceptions as bounded evidence signals", () => {
    const misconceptions = [
      "kv-cache-is-chat-memory",
      "future-token-changes-earlier-state",
      "float16-reduces-symbolic-flops",
      "flop-equals-flop-per-second",
      "bits-equal-bytes",
      "less-arithmetic-means-little-data",
    ] as const;
    const model = misconceptions.reduce(
      (next, misconception, index) =>
        applyLearnerEvidence(next, {
          lesson: index < 1 ? "01" : index < 2 ? "02" : "03",
          concept:
            index < 1
              ? "kv-cache"
              : index < 2
                ? "causal-dependency"
                : "arithmetic-intensity",
          kind: "transfer-answer",
          outcome: "incorrect",
          misconception,
        }),
      initialLearnerModel(),
    );
    expect(model.history).toHaveLength(6);
    expect(model.history.map((item) => item.misconception)).toEqual(
      misconceptions,
    );
  });

  it("bounds learner history without copying immutable traces", () => {
    const model = Array.from({ length: 80 }).reduce<LearnerModel>(
      (next) =>
        applyLearnerEvidence(next, {
          lesson: "01",
          concept: "kv-cache",
          kind: "alternative-requested",
          outcome: "explored",
          misconception: null,
        }),
      initialLearnerModel(),
    );
    expect(model.history).toHaveLength(MAX_LEARNER_EVIDENCE);
    expect(model.history[0].sequence).toBe(17);
    expect("traces" in model).toBe(false);
  });
});
