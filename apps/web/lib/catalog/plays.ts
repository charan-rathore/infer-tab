import { LESSON_PATHS } from "@/lib/simulation/journey";
import {
  initialState,
  type Lesson,
  type MachineState,
  type Milestone,
  type TraceBundle,
} from "@/lib/simulation/model";
import type { ExplanationStrategyId } from "@/lib/teaching/concepts";

export const BEAT_MS = 5000;
export const STEP_MS = 1000;
export const PLAY_COUNT = 6;
export const CYCLE_MS = BEAT_MS * PLAY_COUNT;

export type CatalogBoard = "machine" | "attention" | "payload";
export type CatalogPlayId =
  | "loop"
  | "waste"
  | "keep"
  | "mask"
  | "jobs"
  | "piles";

export interface CatalogPlay {
  id: CatalogPlayId;
  label: string;
  href: string;
  lesson: Lesson;
  board: CatalogBoard;
  strategy: ExplanationStrategyId;
}

export interface LockedRoom {
  id: string;
  label: string;
}

export const CATALOG_PLAYS: readonly CatalogPlay[] = [
  {
    id: "loop",
    label: "A step that writes the next token",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "physical-shelf",
  },
  {
    id: "waste",
    label: "Finished work being built again",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "physical-shelf",
  },
  {
    id: "keep",
    label: "The same step, after we keep the past",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "synchronized-comparison",
  },
  {
    id: "mask",
    label: "A token may only read its past",
    href: LESSON_PATHS["02"],
    lesson: "02",
    board: "attention",
    strategy: "causal-edges",
  },
  {
    id: "jobs",
    label: "Reading the prompt vs writing one word",
    href: LESSON_PATHS["02"],
    lesson: "02",
    board: "attention",
    strategy: "triangle-transformation",
  },
  {
    id: "piles",
    label: "Little new math, a lot of stored data",
    href: LESSON_PATHS["03"],
    lesson: "03",
    board: "payload",
    strategy: "work-versus-data",
  },
] as const;

export const LOCKED_ROOMS: readonly LockedRoom[] = [
  { id: "roofline", label: "Roofline" },
  { id: "batching", label: "Batching" },
  { id: "paging", label: "Paging" },
  { id: "prefix", label: "Prefix" },
  { id: "speculation", label: "Speculation" },
] as const;

export interface CatalogObservation {
  play: CatalogPlay;
  playIndex: number;
  beatElapsed: number;
  state: MachineState;
}

/** Mark only the lenses the current play needs so existing boards reveal the right specimen. */
function lessons(
  revealed: Partial<Record<Lesson, Milestone>>,
): MachineState["lessons"] {
  return {
    "01": { milestone: revealed["01"] ?? "problem", prediction: null },
    "02": { milestone: revealed["02"] ?? "problem", prediction: null },
    "03": { milestone: revealed["03"] ?? "problem", prediction: null },
  };
}

/** Project one catalog frame from recorded traces. The clock only chooses a playhead and lens. */
export function catalogObservation(
  traces: TraceBundle,
  elapsedMs: number,
): CatalogObservation {
  const cycle = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const playIndex = Math.min(
    CATALOG_PLAYS.length - 1,
    Math.floor(cycle / BEAT_MS),
  );
  const play = CATALOG_PLAYS[playIndex];
  const beatElapsed = cycle - playIndex * BEAT_MS;
  const tick = Math.floor(beatElapsed / STEP_MS);
  const last = Math.max(0, traces.kv.modes.naive.steps.length - 1);
  const promptLength = traces.prefill.config.promptLength;
  const base = initialState(traces);
  let patch: Partial<MachineState> = {};
  let revealed: Partial<Record<Lesson, Milestone>> = {};

  switch (play.id) {
    case "loop":
      patch = {
        playhead: Math.min(tick, last),
        policy: "naive",
        compare: false,
      };
      break;
    case "waste":
      patch = {
        playhead: Math.min(Math.max(1, tick), last),
        policy: "naive",
        compare: false,
      };
      break;
    case "keep":
      revealed = { "01": "aha" };
      patch = {
        playhead: Math.min(Math.max(1, tick), last),
        policy: "cached",
        compare: true,
      };
      break;
    case "mask": {
      const query = Math.min(tick % Math.max(1, promptLength - 1), promptLength - 2);
      revealed = { "02": "failure" };
      patch = {
        query,
        inspectedKey: query + 1,
        job: "prefill",
        representation: "connections",
      };
      break;
    }
    case "jobs":
      revealed = { "02": "aha" };
      patch = {
        job: beatElapsed < BEAT_MS / 2 ? "prefill" : "decode",
        representation: "connections",
        query: 0,
        inspectedKey: null,
      };
      break;
    case "piles":
      revealed = { "03": "aha" };
      patch = { job: "decode", bytes: 4 };
      break;
  }

  return {
    play,
    playIndex,
    beatElapsed,
    state: {
      ...base,
      ...patch,
      lessons: lessons(revealed),
      playing: false,
    },
  };
}

/** Detect reduced motion without inventing a second animation clock. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
