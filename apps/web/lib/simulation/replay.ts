import {
  assertValidTrace,
  assertValidPrefillDecodeTrace,
  assertValidArithmeticMemoryTrace,
} from "@/lib/schema";
import { validateBundle } from "./adapters";
import {
  initialState,
  reduceMachine,
  type Lesson,
  type SimulationEvent,
  type TraceBundle,
} from "./model";
import { CONCEPT_NODES } from "@/lib/teaching/concepts";

const TRANSFER_QUESTIONS = [
  "kv-purpose",
  "causal-future",
  "float16-flops",
  "flop-rate",
  "bits-byte",
  "less-math-data",
] as const;
const LESSON_CONCEPT = {
  "01": "kv-cache",
  "02": "causal-dependency",
  "03": "arithmetic-intensity",
} as const;
const TRANSFER_LESSON = {
  "kv-purpose": "01",
  "causal-future": "02",
  "float16-flops": "03",
  "flop-rate": "03",
  "bits-byte": "03",
  "less-math-data": "03",
} as const;

/** Validate a public concept ID without accepting misconception or unknown graph nodes. */
function isConcept(value: unknown): boolean {
  return (
    typeof value === "string" &&
    CONCEPT_NODES.some((node) => node.kind === "concept" && node.id === value)
  );
}

export const MAX_REPLAY_BYTES = 2_000_000;
export const MAX_EVENTS = 4096;
export interface Replay {
  version: 1;
  lesson: Lesson;
  traces: TraceBundle;
  events: SimulationEvent[];
}

/** Recognize the small public event contract before feeding untrusted replay data into the reducer. */
function isEvent(value: unknown): value is SimulationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const lesson =
    typeof event.lesson === "string" &&
    ["01", "02", "03"].includes(event.lesson);
  switch (event.type) {
    case "lesson.entered":
    case "interaction.started":
    case "mechanism.changed":
    case "derivation.revealed":
    case "term.revealed":
    case "bottleneck.revealed":
    case "lesson.reset":
      return lesson;
    case "prediction.committed":
      return (
        lesson &&
        typeof event.answer === "string" &&
        ["one", "all", "yes", "no", "math", "bytes", "both"].includes(
          event.answer,
        )
      );
    case "prediction.revisited":
      return (
        lesson &&
        event.lesson === "01" &&
        ["one", "all"].includes(String(event.answer))
      );
    case "teaching.alternative.requested":
    case "learner.prior.declared":
      return (
        lesson &&
        isConcept(event.concept) &&
        LESSON_CONCEPT[event.lesson as Lesson] === event.concept
      );
    case "transfer.answered":
      return (
        lesson &&
        TRANSFER_QUESTIONS.includes(
          event.question as (typeof TRANSFER_QUESTIONS)[number],
        ) &&
        TRANSFER_LESSON[
          event.question as (typeof TRANSFER_QUESTIONS)[number]
        ] === event.lesson &&
        typeof event.correct === "boolean"
      );
    case "timeline.sought":
      return (
        Number.isInteger(event.step) && Math.abs(Number(event.step)) <= 128
      );
    case "object.inspected":
      return (
        event.position === null ||
        (Number.isInteger(event.position) &&
          Number(event.position) >= 0 &&
          Number(event.position) <= 512)
      );
    case "depth.selected":
      return (
        typeof event.depth === "string" &&
        ["learn", "inspect", "prove"].includes(event.depth)
      );
    case "timeline.play":
    case "timeline.pause":
    case "timeline.replay":
      return true;
    case "timeline.tick":
      return (
        Number.isInteger(event.epoch) &&
        Number(event.epoch) >= 0 &&
        Number.isInteger(event.fromStep) &&
        Number(event.fromStep) >= 0 &&
        Number(event.fromStep) < 128
      );
    case "compare.selected":
      return typeof event.enabled === "boolean";
    case "query.selected":
      return (
        Number.isInteger(event.position) &&
        Number(event.position) >= 0 &&
        Number(event.position) < 256
      );
    case "edge.inspected":
      return (
        Number.isInteger(event.key) &&
        Number(event.key) >= 0 &&
        Number(event.key) < 257
      );
    case "representation.selected":
      return (
        event.representation === "connections" ||
        event.representation === "grid"
      );
    case "policy.selected":
      return event.policy === "naive" || event.policy === "cached";
    case "job.selected":
      return event.job === "prefill" || event.job === "decode";
    case "width.selected":
      return event.bytes === 2 || event.bytes === 4;
    case "unit-lens.selected":
      return ["distance", "example", "recording"].includes(String(event.lens));
    case "scenario.selected":
      return (
        Number.isInteger(event.length) &&
        Number(event.length) > 0 &&
        Number(event.length) <= 256
      );
    default:
      return false;
  }
}

/** Serialize portable recordings and actions, including custom prompts; no server persistence is required. */
export function encodeReplay(replay: Replay): string {
  return JSON.stringify(replay);
}

/** Refuse unknown versions, oversized inputs, malformed traces, and invalid events before replacing a session. */
export function decodeReplay(text: string): Replay {
  if (text.length > MAX_REPLAY_BYTES)
    throw new Error("Replay exceeds the 2 MB limit.");
  const value = JSON.parse(text);
  if (
    value?.version !== 1 ||
    !["01", "02", "03"].includes(value.lesson) ||
    !Array.isArray(value.events) ||
    value.events.length > MAX_EVENTS ||
    !value.events.every(isEvent)
  )
    throw new Error("Unsupported or invalid replay.");
  const traces: TraceBundle = {
    kv: assertValidTrace(value.traces?.kv),
    prefill: assertValidPrefillDecodeTrace(value.traces?.prefill),
    arithmetic: assertValidArithmeticMemoryTrace(value.traces?.arithmetic),
  };
  validateBundle(traces);
  return { version: 1, lesson: value.lesson, traces, events: value.events };
}

/** Reconstruct exactly the learner's visual state from immutable recordings and ordered semantic events. */
export function replayState(replay: Replay) {
  return replay.events.reduce(
    (state, event) => reduceMachine(state, event, replay.traces),
    initialState(replay.traces),
  );
}
