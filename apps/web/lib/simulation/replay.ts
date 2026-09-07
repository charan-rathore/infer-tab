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
  const lesson = ["01", "02", "03"].includes(String(event.lesson));
  switch (event.type) {
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
        ["one", "all", "yes", "no", "math", "bytes", "both"].includes(
          String(event.answer),
        )
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
      return ["learn", "inspect", "prove"].includes(String(event.depth));
    case "policy.selected":
      return event.policy === "naive" || event.policy === "cached";
    case "job.selected":
      return event.job === "prefill" || event.job === "decode";
    case "width.selected":
      return event.bytes === 2 || event.bytes === 4;
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
