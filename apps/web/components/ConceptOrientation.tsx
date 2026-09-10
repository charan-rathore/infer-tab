"use client";

import Link from "next/link";
import {
  conceptNode,
  relatedConcepts,
  prerequisiteClosure,
  type ConceptId,
} from "@/lib/teaching/concepts";
import { conceptLearning } from "@/lib/teaching/learner";
import { reached, type Lesson } from "@/lib/simulation/model";
import { LESSON_PATHS } from "@/lib/simulation/journey";
import { useMachine } from "./MachineProvider";

const LENSES: {
  lesson: Lesson;
  concept: ConceptId;
  label: string;
  href: string;
}[] = [
  {
    lesson: "01",
    concept: "kv-cache",
    label: "Keep the past",
    href: LESSON_PATHS["01"],
  },
  {
    lesson: "02",
    concept: "causal-dependency",
    label: "Read the past",
    href: "/prefill-vs-decode",
  },
  {
    lesson: "03",
    concept: "arithmetic-intensity",
    label: "Count what moves",
    href: "/arithmetic-vs-memory",
  },
];

/** Orient the learner within three stable conceptual depths without introducing a separate map editor. */
export function ConceptOrientation({ lesson }: { lesson: Lesson }) {
  const { state } = useMachine();
  const focus = LENSES.find((item) => item.lesson === lesson)!;
  const prerequisites = prerequisiteClosure(focus.concept);
  const next = relatedConcepts(
    focus.concept,
    lesson === "01" ? "creates-bottleneck" : "next-question",
  );
  return (
    <details className="concept-orientation">
      <summary>
        Where does this fit? <span>{focus.label}</span>
      </summary>
      <nav aria-label="Conceptual depth" className="concept-depth">
        {LENSES.map((item) => (
          <Link
            key={item.concept}
            href={item.href}
            aria-current={item.lesson === lesson ? "step" : undefined}
          >
            <span className="depth-point" aria-hidden="true" />
            <strong>{item.label}</strong>
            <small>
              {reached(state.lessons[item.lesson], "aha")
                ? "Observed"
                : "Explore"}
            </small>
            {conceptLearning(state.learner, item.concept).evidenceCount > 0 && (
              <span className="evidence-mark">Evidence recorded</span>
            )}
          </Link>
        ))}
      </nav>
      {reached(state.lessons[lesson], "term") && (
        <div className="concept-relations">
          <p>
            Builds on:{" "}
            {prerequisites.map((id) => conceptNode(id).label).join(" → ") ||
              "the previous observations"}
            .
          </p>
          {next.length > 0 && (
            <p>
              Opens the question:{" "}
              {next.map((id) => conceptNode(id).label).join(", ")}.
            </p>
          )}
          <small>
            Authored curriculum relationships; understanding signals come from
            your actions.
          </small>
        </div>
      )}
    </details>
  );
}
