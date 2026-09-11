import { objectId } from "@/lib/simulation/adapters";
import { LESSON_PATHS } from "@/lib/simulation/journey";
import {
  initialState,
  type Lesson,
  type MachineState,
  type Milestone,
  type TraceBundle,
} from "@/lib/simulation/model";
import type { ExplanationStrategyId } from "@/lib/teaching/concepts";

/** Long enough for a human to read the objects, then sit on the aha frame. */
export const BEAT_MS = 10000;
export const STEP_MS = 2000;
export const HOLD_MS = 5000;
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
export type CatalogPhase = "step" | "hold";

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
    label: "The loop",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "physical-shelf",
  },
  {
    id: "waste",
    label: "Waste",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "physical-shelf",
  },
  {
    id: "keep",
    label: "Keep",
    href: LESSON_PATHS["01"],
    lesson: "01",
    board: "machine",
    strategy: "synchronized-comparison",
  },
  {
    id: "mask",
    label: "Look back",
    href: LESSON_PATHS["02"],
    lesson: "02",
    board: "attention",
    strategy: "causal-edges",
  },
  {
    id: "jobs",
    label: "Two jobs",
    href: LESSON_PATHS["02"],
    lesson: "02",
    board: "attention",
    strategy: "triangle-transformation",
  },
  {
    id: "piles",
    label: "Two piles",
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
  phase: CatalogPhase;
  seeing: string;
  consequence: string;
  focusIds: readonly string[];
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

/** Stable token identity from the recorded prompt, never from a guessed string. */
function tokenFocus(traces: TraceBundle, position: number): string {
  return objectId(traces.kv.prompt, position);
}

/** Advance one recorded play forward; wrapping starts the next cycle. */
export function nextCatalogElapsed(elapsedMs: number): number {
  const beat = ((elapsedMs % BEAT_MS) + BEAT_MS) % BEAT_MS;
  return elapsedMs - beat + BEAT_MS;
}

/** Return to the first frame of the play currently on screen. */
export function replayCatalogElapsed(elapsedMs: number): number {
  const beat = ((elapsedMs % BEAT_MS) + BEAT_MS) % BEAT_MS;
  return elapsedMs - beat;
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
  const steppingWindow = BEAT_MS - HOLD_MS;
  const phase: CatalogPhase = beatElapsed >= steppingWindow ? "hold" : "step";
  const live = Math.min(beatElapsed, Math.max(0, steppingWindow - 1));
  const tick = Math.floor(live / STEP_MS);
  const last = Math.max(0, traces.kv.modes.naive.steps.length - 1);
  const promptLength = traces.prefill.config.promptLength;
  const base = initialState(traces);
  let patch: Partial<MachineState> = {};
  let revealed: Partial<Record<Lesson, Milestone>> = {};
  let seeing = "";
  let consequence = "";
  let focusIds: readonly string[] = [];

  switch (play.id) {
    case "loop": {
      const playhead = Math.min(tick, last);
      const emitted =
        traces.kv.modes.naive.steps[playhead]?.generatedToken.position ??
        traces.kv.promptTokens.length;
      patch = {
        playhead,
        policy: "naive",
        compare: false,
      };
      seeing = "A new word is being written.";
      consequence = "Each step uses the words already on the bench.";
      focusIds = [tokenFocus(traces, emitted), tokenFocus(traces, 0)];
      break;
    }
    case "waste": {
      const playhead = Math.min(Math.max(1, tick + 1), last);
      patch = {
        playhead,
        policy: "naive",
        compare: false,
      };
      seeing = "The finished words walk back through compute.";
      consequence = "The past is being built again.";
      focusIds = [tokenFocus(traces, 0), tokenFocus(traces, 1)];
      break;
    }
    case "keep": {
      const playhead = Math.min(Math.max(1, tick + 1), last);
      const newest =
        traces.kv.modes.cached.steps[playhead]?.newlyComputed[0]?.position ??
        playhead;
      revealed = { "01": "aha" };
      patch = {
        playhead,
        policy: "cached",
        compare: true,
      };
      seeing = "Those same words stay on the shelf.";
      consequence = "Only the newest word is built.";
      focusIds = [tokenFocus(traces, 0), tokenFocus(traces, newest)];
      break;
    }
    case "mask": {
      const query = Math.min(1, Math.max(0, promptLength - 2));
      revealed = { "02": "failure" };
      patch = {
        query,
        inspectedKey: query + 1,
        job: "prefill",
        representation: "connections",
      };
      seeing = "This word may only look backward.";
      consequence = "A later word is closed.";
      focusIds = [`query:${query}`, `edge:${query}:${query + 1}`];
      break;
    }
    case "jobs": {
      const reading = beatElapsed < BEAT_MS / 2;
      revealed = { "02": "aha" };
      patch = {
        job: reading ? "prefill" : "decode",
        representation: "connections",
        query: 0,
        inspectedKey: null,
      };
      if (reading) {
        seeing = "The whole prompt is one read.";
        consequence = "Every word already on the bench asks together.";
        focusIds = ["query:0", `query:${promptLength - 1}`];
      } else {
        seeing = "The next word is one row.";
        consequence = "Only the newest question is asked.";
        focusIds = [`query:${promptLength}`];
      }
      break;
    }
    case "piles": {
      const mathFirst = beatElapsed < BEAT_MS / 2;
      revealed = { "03": "aha" };
      patch = { job: "decode", bytes: 4 };
      if (mathFirst) {
        seeing = "A little new math.";
        consequence = "The new work is a short chain.";
        focusIds = ["pile:math"];
      } else {
        seeing = "A long shelf of stored data.";
        consequence = "The next word still needs that stored shelf.";
        focusIds = ["pile:data"];
      }
      break;
    }
  }

  return {
    play,
    playIndex,
    beatElapsed,
    phase,
    seeing,
    consequence,
    focusIds,
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
