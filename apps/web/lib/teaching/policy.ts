import {
  strategiesForConcept,
  type ConceptId,
  type ExplanationStrategyId,
} from "./concepts";
import {
  conceptLearning,
  evidenceCount,
  hasMisconception,
  type LearnerModel,
} from "./learner";
import type { Lesson } from "@/lib/simulation/model";

export interface TeachingDecision {
  concept: ConceptId;
  strategy: ExplanationStrategyId;
  label: string;
  prompt: string;
  compressed: boolean;
  offerDerivation: boolean;
  requiresCounterexample: boolean;
  reason: string;
}

const LESSON_CONCEPT: Record<Lesson, ConceptId> = {
  "01": "kv-cache",
  "02": "causal-dependency",
  "03": "arithmetic-intensity",
};

const STRATEGY_COPY: Record<
  ExplanationStrategyId,
  { label: string; prompt: string }
> = {
  "physical-shelf": {
    label: "Keep your eye on the shelf",
    prompt:
      "Track one old finished pair. It should stay put while only the newest pair crosses compute.",
  },
  "work-receipts": {
    label: "Follow the work receipts",
    prompt:
      "Let each step add its own receipt. Compare the accumulated expressions before reading the totals.",
  },
  "synchronized-comparison": {
    label: "Run both policies together",
    prompt:
      "The prompt, generated token, and playhead are locked together. Watch which old objects cross compute again.",
  },
  "causal-invariant": {
    label: "Test what cannot change",
    prompt:
      "A finished position cannot depend on a future token. Reuse its stored state and verify that the recorded output stays equal.",
  },
  "causal-edges": {
    label: "Try the forbidden connection",
    prompt:
      "Select an early question and attempt to connect it to a later position. The machine will preserve the causal boundary.",
  },
  "timeline-viewpoint": {
    label: "Stand at one position in time",
    prompt:
      "Read the row from that position's point of view. Only information already present is available.",
  },
  "triangle-transformation": {
    label: "Compress the permitted edges",
    prompt:
      "The same legal connections become a lower triangle. No dependency is added or removed.",
  },
  "tensor-shape-derivation": {
    label: "Read the shapes",
    prompt:
      "Follow the recorded question and history axes, then derive [P,P] and [1,T] from them.",
  },
  "unit-analogy": {
    label: "Divide through the units",
    prompt:
      "Treat the ratio as work for one byte, just as distance divided by time is distance per hour.",
  },
  "dtype-payload": {
    label: "Hold the arithmetic still",
    prompt:
      "Keep q × k + sum unchanged while the byte groups shrink from float32 to float16.",
  },
  "work-versus-data": {
    label: "Compare the two quantities",
    prompt:
      "Count arithmetic work on one side and logical bytes on the other before combining them.",
  },
  "symbolic-derivation": {
    label: "Derive the ratio directly",
    prompt:
      "Use only the recorded FLOP and logical-byte factors, keeping measured hardware traffic outside the claim.",
  },
};

/** Return fixed presentation copy so an optional assistant can choose a route but cannot invent facts. */
export function strategyPresentation(strategy: ExplanationStrategyId) {
  return STRATEGY_COPY[strategy];
}

/** Select the first representation from learner evidence using ordered, deterministic rules. */
function baseStrategy(
  lesson: Lesson,
  model: LearnerModel,
): Omit<TeachingDecision, "label" | "prompt"> {
  const concept = LESSON_CONCEPT[lesson];
  const learning = conceptLearning(model, concept);
  const prior = evidenceCount(model, concept, "prior-declared") > 0;
  const proof = evidenceCount(model, concept, "proof-inspected") > 0;
  if (lesson === "01") {
    const wrong =
      evidenceCount(model, concept, "prediction", "incorrect") +
      evidenceCount(model, concept, "prediction-revisited", "incorrect");
    const correct = evidenceCount(model, concept, "prediction", "correct") > 0;
    if (
      wrong >= 2 ||
      hasMisconception(model, concept, "kv-cache-is-chat-memory")
    )
      return {
        concept,
        strategy: "physical-shelf",
        compressed: false,
        offerDerivation: false,
        requiresCounterexample: false,
        reason:
          "Repeated rebuild misconception calls for direct object manipulation.",
      };
    if (prior || learning.mastery >= 3)
      return {
        concept,
        strategy: "causal-invariant",
        compressed: true,
        offerDerivation: true,
        requiresCounterexample: false,
        reason: "Prior evidence supports skipping the introductory analogy.",
      };
    if (correct && proof)
      return {
        concept,
        strategy: "synchronized-comparison",
        compressed: true,
        offerDerivation: true,
        requiresCounterexample: false,
        reason:
          "Correct prediction and proof seeking support a compact comparison.",
      };
    if (wrong > 0)
      return {
        concept,
        strategy: "synchronized-comparison",
        compressed: false,
        offerDerivation: false,
        requiresCounterexample: false,
        reason:
          "The first incorrect prediction benefits from aligned executions.",
      };
    return {
      concept,
      strategy: "work-receipts",
      compressed: false,
      offerDerivation: correct,
      requiresCounterexample: false,
      reason:
        "Accounting reveals repeated work without assuming a misconception.",
    };
  }
  if (lesson === "02") {
    if (hasMisconception(model, concept, "future-token-changes-earlier-state"))
      return {
        concept,
        strategy: "causal-edges",
        compressed: false,
        offerDerivation: false,
        requiresCounterexample: true,
        reason: "A future-dependency belief requires a concrete rejected edge.",
      };
    if (prior || proof || learning.mastery >= 2)
      return {
        concept,
        strategy: "tensor-shape-derivation",
        compressed: true,
        offerDerivation: true,
        requiresCounterexample: false,
        reason:
          "Strong evidence supports moving directly from dependencies to shape.",
      };
    return {
      concept,
      strategy: "triangle-transformation",
      compressed: false,
      offerDerivation: false,
      requiresCounterexample: false,
      reason: "Spatial compression preserves each observed causal edge.",
    };
  }
  if (hasMisconception(model, concept, "float16-reduces-symbolic-flops"))
    return {
      concept,
      strategy: "dtype-payload",
      compressed: false,
      offerDerivation: false,
      requiresCounterexample: true,
      reason: "The symbolic operation must stay mounted while payload changes.",
    };
  if (
    hasMisconception(model, concept, "flop-equals-flop-per-second") ||
    hasMisconception(model, concept, "bits-equal-bytes")
  )
    return {
      concept,
      strategy: "unit-analogy",
      compressed: false,
      offerDerivation: false,
      requiresCounterexample: false,
      reason: "A unit misconception benefits from a familiar per-unit ratio.",
    };
  if (prior || proof || learning.mastery >= 2)
    return {
      concept,
      strategy: "symbolic-derivation",
      compressed: true,
      offerDerivation: true,
      requiresCounterexample: false,
      reason: "Strong evidence supports the trace-backed symbolic account.",
    };
  return {
    concept,
    strategy: "work-versus-data",
    compressed: false,
    offerDerivation: false,
    requiresCounterexample: false,
    reason: "Separate quantities reduce premature bottleneck conclusions.",
  };
}

/** Route to a validated representation, cycling deterministically when another way is requested. */
export function teachingDecision(
  lesson: Lesson,
  model: LearnerModel,
): TeachingDecision {
  const base = baseStrategy(lesson, model);
  const available = strategiesForConcept(base.concept);
  const requests = evidenceCount(model, base.concept, "alternative-requested");
  const start = Math.max(
    0,
    available.findIndex((strategy) => strategy.id === base.strategy),
  );
  const strategy = available[(start + requests) % available.length].id;
  const copy = STRATEGY_COPY[strategy];
  return { ...base, strategy, ...copy };
}
