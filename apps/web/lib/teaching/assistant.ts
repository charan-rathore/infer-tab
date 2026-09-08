import {
  CONCEPT_EDGES,
  CONCEPT_NODES,
  strategiesForConcept,
  type ConceptId,
  type ExplanationStrategyId,
  type MisconceptionId,
} from "./concepts";
import { strategyPresentation, type TeachingDecision } from "./policy";

export interface TeachingAssistantChoice {
  version: 1;
  concept: ConceptId;
  strategy: ExplanationStrategyId;
  move: "ask" | "explain" | "challenge";
  misconception: MisconceptionId | null;
}

/** Validate a future model's routing choice against the authored strategy catalog. */
export function isTeachingAssistantChoice(
  value: unknown,
): value is TeachingAssistantChoice {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    typeof candidate.concept !== "string" ||
    typeof candidate.strategy !== "string" ||
    !["ask", "explain", "challenge"].includes(String(candidate.move))
  )
    return false;
  const misconceptionValid =
    candidate.misconception === null ||
    (typeof candidate.misconception === "string" &&
      CONCEPT_NODES.some(
        (node) =>
          node.id === `misconception:${candidate.misconception}` &&
          node.kind === "misconception",
      ) &&
      CONCEPT_EDGES.some(
        (edge) =>
          edge.from === `misconception:${candidate.misconception}` &&
          edge.to === candidate.concept &&
          edge.relation === "misconception-about",
      ));
  return (
    misconceptionValid &&
    strategiesForConcept(candidate.concept as ConceptId).some(
      (strategy) => strategy.id === candidate.strategy,
    )
  );
}

/** Apply only a validated representation choice; unavailable or invalid AI uses deterministic policy unchanged. */
export function resolveTeachingChoice(
  value: unknown,
  fallback: TeachingDecision,
): TeachingDecision {
  if (!isTeachingAssistantChoice(value) || value.concept !== fallback.concept)
    return fallback;
  return {
    ...fallback,
    strategy: value.strategy,
    ...strategyPresentation(value.strategy),
    reason: `Validated assistant route: ${value.move}.`,
  };
}
