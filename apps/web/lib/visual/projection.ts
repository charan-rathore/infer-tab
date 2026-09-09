import {
  objectId,
  projectedWork,
  stagePair,
  arithmeticAccount,
} from "@/lib/simulation/adapters";
import {
  reached,
  type Lesson,
  type MachineState,
  type TraceBundle,
} from "@/lib/simulation/model";
import { teachingDecision } from "@/lib/teaching/policy";
import type { ExplanationStrategyId } from "@/lib/teaching/concepts";

export type VisualAction =
  "wait" | "project" | "recompute" | "retain-and-read" | "emit";
export type CaptionKind =
  | "OBSERVATION"
  | "PREDICTION"
  | "CAUSE"
  | "CONSEQUENCE"
  | "DERIVATION"
  | "TERM_REVEAL"
  | "PROOF"
  | "CAVEAT"
  | "NEXT_QUESTION";
export interface SemanticCaption {
  id: string;
  kind: CaptionKind;
  lead: string;
  emphasis: string;
  after: string;
  source: string;
}
export interface VisualEvent {
  id: string;
  objectId: string;
  action: VisualAction;
  from: "token" | "memory" | "previous-result";
  via: "compute" | "read" | null;
  to: "memory" | "compute" | "output" | "token";
  source: string;
}
export interface VisualFrame {
  version: 1;
  lesson: Lesson;
  strategy: ExplanationStrategyId;
  events: VisualEvent[];
  caption: SemanticCaption;
  observation: {
    playhead: number;
    policy: MachineState["policy"];
    selectedPosition: number | null;
    representation: MachineState["representation"];
    query: number;
    inspectedKey: number | null;
    promptLength: number;
    job: MachineState["job"];
    bytes: MachineState["bytes"];
    unitLens: MachineState["unitLens"];
    compare: boolean;
    depth: MachineState["depth"];
  };
}

/** Identify the visual action from accepted row membership; no animation event can change these inputs. */
export function projectionAction(
  built: boolean,
  reused: boolean,
  output: boolean,
  repeated: boolean,
): VisualAction {
  return reused
    ? "retain-and-read"
    : built
      ? repeated
        ? "recompute"
        : "project"
      : output
        ? "emit"
        : "wait";
}

/** Resolve a canonical object's complete before/cause/after path, shared by motion and reduced motion. */
export function visualEvent(
  id: string,
  action: VisualAction,
  kept: boolean,
  source: string,
): VisualEvent {
  return {
    id: `${source}:${id}:${action}`,
    objectId: id,
    action,
    from:
      action === "recompute"
        ? "previous-result"
        : action === "retain-and-read"
          ? "memory"
          : "token",
    via:
      action === "retain-and-read"
        ? "read"
        : action === "project" || action === "recompute"
          ? "compute"
          : null,
    to:
      action === "emit"
        ? "output"
        : action === "wait"
          ? "token"
          : kept
            ? "memory"
            : "compute",
    source,
  };
}

/** Project one caption from the current semantic observation, including seeking, policy, and dtype changes. */
export function semanticCaption(
  state: MachineState,
  bundle: TraceBundle,
  lesson: Lesson,
): SemanticCaption {
  const discovery = state.lessons[lesson];
  const milestone = discovery.milestone;
  const strategy = teachingDecision(lesson, state.learner).strategy;
  const id = [
    lesson,
    milestone,
    state.playhead,
    state.policy,
    state.job,
    state.bytes,
    state.promptLength,
    state.query,
    state.inspectedKey,
    state.representation,
    state.unitLens,
    strategy,
  ].join(":");
  const base = {
    id,
    kind: "OBSERVATION" as CaptionKind,
    lead: "",
    emphasis: "",
    after: "",
    source: "AUTHORED: discovery contract",
  };
  if (milestone === "problem")
    return {
      ...base,
      lead: "Start with",
      emphasis:
        lesson === "01"
          ? "one new word"
          : lesson === "02"
            ? "one question"
            : "one calculation",
      after: ". Follow what it needs.",
    };
  if (milestone === "prediction")
    return {
      ...base,
      kind: "PREDICTION",
      lead: "Before the next change,",
      emphasis: "make a prediction",
      after: ". The machine will test it.",
    };
  if (milestone === "term")
    return {
      ...base,
      kind: "TERM_REVEAL",
      lead: "You have seen",
      emphasis:
        lesson === "01"
          ? "KV cache"
          : lesson === "02"
            ? "prefill and decode"
            : "arithmetic intensity",
      after: ". Now it has a name.",
    };
  if (milestone === "bottleneck")
    return {
      ...base,
      kind: "NEXT_QUESTION",
      lead:
        lesson === "01"
          ? "Less rebuilding."
          : lesson === "02"
            ? "One new question."
            : "A ratio is not a speed.",
      emphasis:
        lesson === "01"
          ? " A growing shelf."
          : lesson === "02"
            ? " The whole history."
            : " What can the hardware deliver?",
      after: "",
    };
  if (lesson === "01") {
    const step = bundle.kv.modes[state.policy].steps[state.playhead];
    if (!step)
      return {
        ...base,
        lead: "The prompt is here.",
        emphasis: " Nothing is stored yet.",
        after: "",
      };
    const source = `modes.${state.policy}.steps[${state.playhead}]`;
    if (milestone === "derivation" || strategy === "work-receipts") {
      const work = projectedWork(bundle.kv, state.policy, state.playhead);
      return {
        ...base,
        kind: "DERIVATION",
        lead: "Each column is a step: ",
        emphasis: work.expression,
        after: " projections.",
        source: work.source,
      };
    }
    return state.policy === "cached"
      ? {
          ...base,
          kind: "CONSEQUENCE",
          lead: `${step.kvRowsReused} pairs stay. `,
          emphasis: `${step.kvRowsProjected} ${step.kvRowsProjected === 1 ? "pair is" : "pairs are"} new.`,
          after: " Read the shelf without rebuilding it.",
          source,
        }
      : {
          ...base,
          kind: "CAUSE",
          lead: "Without stored state, ",
          emphasis: `all ${step.kvRowsProjected} positions cross compute`,
          after: " again.",
          source,
        };
  }
  if (lesson === "02") {
    const job = reached(discovery, "aha") ? state.job : "prefill";
    const pair = stagePair(bundle, state.promptLength);
    const stage = pair[job];
    const query =
      job === "decode" ? stage.attentionScoreShapePerHead[1] - 1 : state.query;
    if (state.inspectedKey !== null && state.inspectedKey > query)
      return {
        ...base,
        kind: "CAUSE",
        lead: `Question ${query} cannot read `,
        emphasis: `future position ${state.inspectedKey}`,
        after: ". The boundary stays closed.",
        source: `${pair.source}.attentionScoreShapePerHead; causal key <= query`,
      };
    const [rows, columns] = stage.attentionScoreShapePerHead;
    if (!reached(discovery, "aha"))
      return {
        ...base,
        kind: "OBSERVATION",
        lead: `Question ${query} can read `,
        emphasis: `positions 0 through ${query}`,
        after: ". Move the question to move its boundary.",
        source: `${pair.source}.prefill; causal key <= query`,
      };
    return {
      ...base,
      kind: "CONSEQUENCE",
      lead: `${rows} ${rows === 1 ? "question reaches" : "questions reach"} across `,
      emphasis: `${columns} positions`,
      after:
        job === "decode"
          ? ". One row, growing history."
          : ". The permitted connections form a triangle.",
      source: `${pair.source}.${job}`,
    };
  }
  const account = arithmeticAccount(bundle, {
    ...state,
    job: reached(discovery, "aha") ? state.job : "decode",
  });
  return {
    ...base,
    kind: reached(discovery, "aha") ? "CONSEQUENCE" : "OBSERVATION",
    lead: `${account.flops} operations. `,
    emphasis: `${account.bytes} logical bytes.`,
    after: " Changing width changes payload, not the symbolic calculation.",
    source: account.source,
  };
}

/** Resolve a bounded render frame by references. This is a pure projection, never another state machine. */
export function projectVisualFrame(
  state: MachineState,
  bundle: TraceBundle,
  lesson: Lesson,
): VisualFrame {
  const strategy = teachingDecision(lesson, state.learner).strategy;
  const step = bundle.kv.modes[state.policy].steps[state.playhead];
  const source = `modes.${state.policy}.steps[${state.playhead}]`;
  const events =
    lesson === "01" && step
      ? [...step.inputTokens, step.generatedToken].slice(0, 25).map((token) => {
          const built = step.newlyComputed.some(
            (block) => block.position === token.position,
          );
          const reused = step.reused.some(
            (block) => block.position === token.position,
          );
          const repeated =
            state.playhead > 0 && token.position < step.position - 1;
          return visualEvent(
            objectId(bundle.kv.prompt, token.position),
            projectionAction(
              built,
              reused,
              token.position === step.generatedToken.position,
              repeated,
            ),
            state.policy === "cached",
            source,
          );
        })
      : [];
  const {
    playhead,
    policy,
    selectedPosition,
    representation,
    query,
    inspectedKey,
    promptLength,
    job,
    bytes,
    unitLens,
    compare,
    depth,
  } = state;
  return {
    version: 1,
    lesson,
    strategy,
    events,
    caption: semanticCaption(state, bundle, lesson),
    observation: {
      playhead,
      policy,
      selectedPosition,
      representation,
      query,
      inspectedKey,
      promptLength,
      job,
      bytes,
      unitLens,
      compare,
      depth,
    },
  };
}
