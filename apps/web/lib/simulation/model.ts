import type {
  InferTabTrace,
  PrefillDecodeTrace,
  ArithmeticMemoryTrace,
} from "@/lib/schema";

export type Lesson = "01" | "02" | "03";
export type Depth = "learn" | "inspect" | "prove";
export type Milestone =
  | "problem"
  | "prediction"
  | "failure"
  | "aha"
  | "derivation"
  | "term"
  | "bottleneck";
export type Prediction =
  "one" | "all" | "yes" | "no" | "math" | "bytes" | "both";
export interface TraceBundle {
  kv: InferTabTrace;
  prefill: PrefillDecodeTrace;
  arithmetic: ArithmeticMemoryTrace;
}
export interface Discovery {
  milestone: Milestone;
  prediction: Prediction | null;
}
export interface MachineState {
  lessons: Record<Lesson, Discovery>;
  playhead: number;
  policy: "naive" | "cached";
  selectedPosition: number | null;
  depth: Depth;
  job: "prefill" | "decode";
  bytes: 2 | 4;
  promptLength: number;
}
export type SimulationEvent =
  | { type: "interaction.started"; lesson: Lesson }
  | { type: "prediction.committed"; lesson: Lesson; answer: Prediction }
  | { type: "mechanism.changed"; lesson: Lesson }
  | {
      type:
        | "derivation.revealed"
        | "term.revealed"
        | "bottleneck.revealed"
        | "lesson.reset";
      lesson: Lesson;
    }
  | { type: "timeline.sought"; step: number }
  | { type: "policy.selected"; policy: "naive" | "cached" }
  | { type: "object.inspected"; position: number | null }
  | { type: "depth.selected"; depth: Depth }
  | { type: "job.selected"; job: "prefill" | "decode" }
  | { type: "width.selected"; bytes: 2 | 4 }
  | { type: "scenario.selected"; length: number };

export const ANSWERS: Record<Lesson, Prediction[]> = {
  "01": ["one", "all"],
  "02": ["yes", "no"],
  "03": ["math", "bytes", "both"],
};
export const MILESTONES: Milestone[] = [
  "problem",
  "prediction",
  "failure",
  "aha",
  "derivation",
  "term",
  "bottleneck",
];

/** Construct a fresh discovery record; no mutable records are shared across lessons. */
function discovery(): Discovery {
  return { milestone: "problem", prediction: null };
}

/** Initialize visual state using the recorded default prompt length, without computing inference. */
export function initialState(bundle: TraceBundle): MachineState {
  return {
    lessons: { "01": discovery(), "02": discovery(), "03": discovery() },
    playhead: -1,
    policy: "naive",
    selectedPosition: null,
    depth: "learn",
    job: "prefill",
    bytes: 4,
    promptLength: bundle.prefill.config.promptLength,
  };
}

/** Identify lengths supported by both later lenses; unsupported lengths must never use fallback math. */
export function sharedLengths(bundle: TraceBundle): number[] {
  const pre = [
    bundle.prefill.config.promptLength,
    ...bundle.prefill.scaling.map((row) => row.promptLength),
  ];
  const arithmetic = [
    bundle.arithmetic.config.promptLength,
    ...bundle.arithmetic.scaling.map((row) => row.P),
  ];
  return [...new Set(pre.filter((length) => arithmetic.includes(length)))].sort(
    (a, b) => a - b,
  );
}

/** Test ordered discovery progress without encoding instructional completion in rendering effects. */
export function reached(discovery: Discovery, milestone: Milestone): boolean {
  return (
    MILESTONES.indexOf(discovery.milestone) >= MILESTONES.indexOf(milestone)
  );
}

/** Apply a semantic learner action, guarding required predictions and clamping recorded timeline bounds. */
export function reduceMachine(
  state: MachineState,
  event: SimulationEvent,
  bundle: TraceBundle,
): MachineState {
  if ("lesson" in event) {
    const current = state.lessons[event.lesson];
    let next = current;
    let patch: Partial<MachineState> = {};
    if (event.type === "lesson.reset") {
      next = discovery();
      if (event.lesson === "01") patch = { playhead: -1, policy: "naive" };
      if (event.lesson === "02") patch = { job: "prefill" };
      if (event.lesson === "03") patch = { job: "decode", bytes: 4 };
    }
    if (
      event.type === "interaction.started" &&
      current.milestone === "problem"
    ) {
      next = { ...current, milestone: "prediction" };
      if (event.lesson === "01") patch = { playhead: 0 };
      if (event.lesson === "02")
        patch = { selectedPosition: 0, job: "prefill" };
      if (event.lesson === "03") patch = { job: "decode", bytes: 4 };
    }
    if (
      event.type === "prediction.committed" &&
      current.milestone === "prediction" &&
      ANSWERS[event.lesson].includes(event.answer)
    ) {
      next = { milestone: "failure", prediction: event.answer };
      if (event.lesson === "01")
        patch = {
          playhead: Math.min(1, bundle.kv.modes.naive.steps.length - 1),
        };
    }
    if (event.type === "mechanism.changed" && current.milestone === "failure") {
      // A single-step recording cannot demonstrate reuse. Keep the gate closed and explain it in the UI.
      if (
        event.lesson === "01" &&
        !bundle.kv.modes.cached.steps.some((step) => step.kvRowsReused > 0)
      )
        return state;
      next = { ...current, milestone: "aha" };
      if (event.lesson === "01") patch = { policy: "cached" };
      if (event.lesson === "03") patch = { bytes: 2 };
    }
    if (event.type === "derivation.revealed" && current.milestone === "aha")
      next = { ...current, milestone: "derivation" };
    if (event.type === "term.revealed" && current.milestone === "derivation")
      next = { ...current, milestone: "term" };
    if (event.type === "bottleneck.revealed" && current.milestone === "term")
      next = { ...current, milestone: "bottleneck" };
    return {
      ...state,
      ...patch,
      lessons: { ...state.lessons, [event.lesson]: next },
    };
  }
  switch (event.type) {
    case "timeline.sought":
      return reached(state.lessons["01"], "aha") && Number.isInteger(event.step)
        ? {
            ...state,
            playhead: Math.max(
              -1,
              Math.min(event.step, bundle.kv.modes.naive.steps.length - 1),
            ),
          }
        : state;
    case "policy.selected":
      return reached(state.lessons["01"], "aha")
        ? { ...state, policy: event.policy }
        : state;
    case "object.inspected":
      return { ...state, selectedPosition: event.position };
    case "depth.selected":
      return { ...state, depth: event.depth };
    case "job.selected":
      return reached(state.lessons["02"], "aha") ||
        reached(state.lessons["03"], "aha")
        ? { ...state, job: event.job }
        : state;
    case "width.selected":
      return reached(state.lessons["03"], "aha")
        ? { ...state, bytes: event.bytes }
        : state;
    case "scenario.selected":
      return sharedLengths(bundle).includes(event.length)
        ? { ...state, promptLength: event.length, selectedPosition: null }
        : state;
  }
}
