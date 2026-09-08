import type { ConceptId, MisconceptionId } from "./concepts";
import type {
  Lesson,
  MachineState,
  Prediction,
  SimulationEvent,
} from "@/lib/simulation/model";

export const MAX_LEARNER_EVIDENCE = 64;

export type MasterySignal = 0 | 1 | 2 | 3;
export type EvidenceOutcome = "correct" | "incorrect" | "explored";
export type LearnerEvidenceKind =
  | "prediction"
  | "prediction-revisited"
  | "proof-inspected"
  | "derivation-opened"
  | "invalid-causal-edge"
  | "valid-causal-edge"
  | "alternative-requested"
  | "prior-declared"
  | "transfer-answer";
export type TransferQuestionId =
  | "kv-purpose"
  | "causal-future"
  | "float16-flops"
  | "flop-rate"
  | "bits-byte"
  | "less-math-data";

export interface LearnerEvidence {
  id: string;
  sequence: number;
  lesson: Lesson;
  concept: ConceptId;
  kind: LearnerEvidenceKind;
  outcome: EvidenceOutcome;
  misconception: MisconceptionId | null;
}

export interface ConceptLearningState {
  mastery: MasterySignal;
  evidenceCount: number;
  misconceptions: MisconceptionId[];
  lastEvidence: string | null;
}

export interface LearnerModel {
  version: 1;
  sequence: number;
  concepts: Partial<Record<ConceptId, ConceptLearningState>>;
  history: LearnerEvidence[];
}

const FOCUS: Record<Lesson, ConceptId> = {
  "01": "kv-cache",
  "02": "causal-dependency",
  "03": "arithmetic-intensity",
};

const TRANSFER_MISCONCEPTION: Record<TransferQuestionId, MisconceptionId> = {
  "kv-purpose": "kv-cache-is-chat-memory",
  "causal-future": "future-token-changes-earlier-state",
  "float16-flops": "float16-reduces-symbolic-flops",
  "flop-rate": "flop-equals-flop-per-second",
  "bits-byte": "bits-equal-bytes",
  "less-math-data": "less-arithmetic-means-little-data",
};

const TRANSFER_LESSON: Record<TransferQuestionId, Lesson> = {
  "kv-purpose": "01",
  "causal-future": "02",
  "float16-flops": "03",
  "flop-rate": "03",
  "bits-byte": "03",
  "less-math-data": "03",
};

/** Create an empty, inspectable routing model. Mastery values are signals, not probabilities. */
export function initialLearnerModel(): LearnerModel {
  return { version: 1, sequence: 0, concepts: {}, history: [] };
}

/** Return a stable empty concept record when the learner has produced no evidence yet. */
export function conceptLearning(
  model: LearnerModel,
  concept: ConceptId,
): ConceptLearningState {
  return (
    model.concepts[concept] ?? {
      mastery: 0,
      evidenceCount: 0,
      misconceptions: [],
      lastEvidence: null,
    }
  );
}

/** Count bounded evidence by kind and optional outcome for deterministic policy rules. */
export function evidenceCount(
  model: LearnerModel,
  concept: ConceptId,
  kind: LearnerEvidenceKind,
  outcome?: EvidenceOutcome,
): number {
  return model.history.filter(
    (item) =>
      item.concept === concept &&
      item.kind === kind &&
      (!outcome || item.outcome === outcome),
  ).length;
}

/** Test an explicit misconception without treating a low mastery signal as a diagnosis. */
export function hasMisconception(
  model: LearnerModel,
  concept: ConceptId,
  misconception: MisconceptionId,
): boolean {
  return conceptLearning(model, concept).misconceptions.includes(misconception);
}

/** Append one evidence item and update only its concept-level routing signals. */
export function applyLearnerEvidence(
  model: LearnerModel,
  evidence: Omit<LearnerEvidence, "id" | "sequence">,
): LearnerModel {
  const sequence = model.sequence + 1;
  const item: LearnerEvidence = {
    ...evidence,
    sequence,
    id: `e:${sequence}`,
  };
  const current = conceptLearning(model, evidence.concept);
  const misconceptions = new Set(current.misconceptions);
  if (evidence.misconception) {
    if (evidence.outcome === "correct")
      misconceptions.delete(evidence.misconception);
    if (evidence.outcome === "incorrect")
      misconceptions.add(evidence.misconception);
  }
  const raisesMastery =
    evidence.outcome === "correct" &&
    [
      "prediction",
      "prediction-revisited",
      "valid-causal-edge",
      "prior-declared",
      "transfer-answer",
    ].includes(evidence.kind);
  const mastery = Math.min(
    3,
    current.mastery + (raisesMastery ? 1 : 0),
  ) as MasterySignal;
  return {
    version: 1,
    sequence,
    concepts: {
      ...model.concepts,
      [evidence.concept]: {
        mastery,
        evidenceCount: current.evidenceCount + 1,
        misconceptions: [...misconceptions],
        lastEvidence: item.id,
      },
    },
    history: [...model.history, item].slice(-MAX_LEARNER_EVIDENCE),
  };
}

/** Remove one lesson's evidence and deterministically rebuild the remaining learner model. */
export function resetLearnerLesson(
  model: LearnerModel,
  lesson: Lesson,
): LearnerModel {
  return model.history
    .filter((item) => item.lesson !== lesson)
    .reduce<LearnerModel>(
      (next, item) =>
        applyLearnerEvidence(next, {
          lesson: item.lesson,
          concept: item.concept,
          kind: item.kind,
          outcome: item.outcome,
          misconception: item.misconception,
        }),
      initialLearnerModel(),
    );
}

/** Translate a prediction into authored pedagogical evidence without deriving any simulation fact. */
function predictionEvidence(
  lesson: Lesson,
  answer: Prediction,
  kind: "prediction" | "prediction-revisited",
): Omit<LearnerEvidence, "id" | "sequence"> {
  const correct =
    (lesson === "01" && answer === "all") ||
    (lesson === "02" && answer === "no") ||
    (lesson === "03" && answer === "bytes");
  const misconception =
    lesson === "01"
      ? null
      : lesson === "02"
        ? "future-token-changes-earlier-state"
        : answer === "bytes"
          ? null
          : "float16-reduces-symbolic-flops";
  return {
    lesson,
    concept: FOCUS[lesson],
    kind,
    outcome: correct ? "correct" : "incorrect",
    misconception,
  };
}

/** Derive learner evidence from an accepted semantic action while leaving mathematical state untouched. */
export function evidenceFromSimulationEvent(
  before: MachineState,
  after: MachineState,
  event: SimulationEvent,
): Omit<LearnerEvidence, "id" | "sequence"> | null {
  if (event.type === "prediction.committed") {
    if (
      before.lessons[event.lesson].milestone === "prediction" &&
      after.lessons[event.lesson].milestone === "failure"
    )
      return predictionEvidence(event.lesson, event.answer, "prediction");
    return null;
  }
  if (event.type === "prediction.revisited") {
    if (before.lessons["01"].milestone !== "failure") return null;
    return predictionEvidence("01", event.answer, "prediction-revisited");
  }
  if (
    event.type === "depth.selected" &&
    event.depth === "prove" &&
    before.depth !== "prove"
  )
    return {
      lesson: before.activeLesson,
      concept: FOCUS[before.activeLesson],
      kind: "proof-inspected",
      outcome: "explored",
      misconception: null,
    };
  if (
    event.type === "derivation.revealed" &&
    after.lessons[event.lesson].milestone === "derivation"
  )
    return {
      lesson: event.lesson,
      concept: FOCUS[event.lesson],
      kind: "derivation-opened",
      outcome: "explored",
      misconception: null,
    };
  if (event.type === "edge.inspected" && after.inspectedKey === event.key) {
    const decodeIntroduced = [
      "aha",
      "derivation",
      "term",
      "bottleneck",
    ].includes(before.lessons["02"].milestone);
    const query =
      before.job === "decode" && decodeIntroduced
        ? before.promptLength
        : before.query;
    const invalid = event.key > query;
    return {
      lesson: "02",
      concept: "causal-dependency",
      kind: invalid ? "invalid-causal-edge" : "valid-causal-edge",
      outcome: invalid ? "explored" : "correct",
      misconception: null,
    };
  }
  if (
    event.type === "teaching.alternative.requested" &&
    event.concept === FOCUS[event.lesson] &&
    before.lessons[event.lesson].milestone !== "problem" &&
    before.lessons[event.lesson].milestone !== "prediction"
  )
    return {
      lesson: event.lesson,
      concept: event.concept,
      kind: "alternative-requested",
      outcome: "explored",
      misconception: null,
    };
  if (
    event.type === "learner.prior.declared" &&
    event.concept === FOCUS[event.lesson] &&
    before.lessons[event.lesson].milestone === "problem"
  )
    return {
      lesson: event.lesson,
      concept: event.concept,
      kind: "prior-declared",
      outcome: "correct",
      misconception: null,
    };
  if (
    event.type === "transfer.answered" &&
    TRANSFER_LESSON[event.question] === event.lesson &&
    ["aha", "derivation", "term", "bottleneck"].includes(
      before.lessons[event.lesson].milestone,
    )
  )
    return {
      lesson: event.lesson,
      concept: FOCUS[event.lesson],
      kind: "transfer-answer",
      outcome: event.correct ? "correct" : "incorrect",
      misconception: TRANSFER_MISCONCEPTION[event.question],
    };
  return null;
}
