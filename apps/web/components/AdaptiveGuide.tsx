"use client";

import { useEffect, useRef } from "react";
import { reached, type Lesson } from "@/lib/simulation/model";
import { evidenceCount, type TransferQuestionId } from "@/lib/teaching/learner";
import type { TeachingDecision } from "@/lib/teaching/policy";
import { useMachine } from "./MachineProvider";

interface TransferPrompt {
  id: TransferQuestionId;
  question: string;
  correct: string;
  misconception: string;
}

const TRANSFER_PROMPTS: Record<Lesson, readonly TransferPrompt[]> = {
  "01": [
    {
      id: "kv-purpose",
      question: "What did the machine keep?",
      correct: "Finished K/V for exact positions",
      misconception: "A general memory of the conversation",
    },
  ],
  "02": [
    {
      id: "causal-future",
      question: "Can a later token revise an earlier causal dependency?",
      correct: "No, that information was not present",
      misconception: "Yes, because the prompt is processed together",
    },
  ],
  "03": [
    {
      id: "float16-flops",
      question: "What changed when each value became float16?",
      correct: "The logical payload size",
      misconception: "The symbolic operation count",
    },
    {
      id: "flop-rate",
      question: "What does FLOP/s add to FLOP?",
      correct: "A rate per second",
      misconception: "Nothing, they are the same unit",
    },
    {
      id: "bits-byte",
      question: "How many bits make one byte here?",
      correct: "8 bits",
      misconception: "1 bit",
    },
    {
      id: "less-math-data",
      question: "Does less arithmetic guarantee little data?",
      correct: "No, the quantities are independent",
      misconception: "Yes, they always fall together",
    },
  ],
};

/** Expose the deterministic teaching route and collect only evidence that can improve the next explanation. */
export function AdaptiveGuide({
  lesson,
  decision,
}: {
  lesson: Lesson;
  decision: TeachingDecision;
}) {
  const { state, send } = useMachine();
  const discovery = state.lessons[lesson];
  const revisitCount = evidenceCount(
    state.learner,
    "kv-cache",
    "prediction-revisited",
    "incorrect",
  );
  const route = useRef<HTMLDivElement>(null);
  const previousRevisitCount = useRef(revisitCount);
  // When a one-use evidence control becomes disabled, focus moves to the new teaching route it caused.
  useEffect(() => {
    if (revisitCount > previousRevisitCount.current)
      route.current?.focus({ preventScroll: true });
    previousRevisitCount.current = revisitCount;
  }, [revisitCount]);
  return (
    <aside
      className="adaptive-guide"
      data-strategy={decision.strategy}
      aria-label="Adaptive teaching route"
    >
      <div
        ref={route}
        className="adaptive-route"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
      >
        <span aria-hidden="true">Tutor route</span>
        <strong>{decision.label}</strong>
        {decision.compressed && <small>Fast path</small>}
      </div>
      <p>{decision.prompt}</p>
      <div className="adaptive-actions">
        {discovery.milestone === "problem" && (
          <button
            type="button"
            onClick={() => {
              send({
                type: "learner.prior.declared",
                lesson,
                concept: decision.concept,
              });
              send({ type: "interaction.started", lesson });
            }}
          >
            I know the basics. Test me.
          </button>
        )}
        {lesson === "01" &&
          discovery.milestone === "failure" &&
          discovery.prediction === "one" && (
            <button
              type="button"
              disabled={revisitCount > 0}
              onClick={() => {
                if (revisitCount === 0)
                  send({
                    type: "prediction.revisited",
                    lesson: "01",
                    answer: "one",
                  });
                if (revisitCount === 0)
                  send({ type: "timeline.sought", step: state.playhead + 1 });
              }}
            >
              {revisitCount > 0
                ? "One-block idea tested twice"
                : "Test my one-block idea again"}
            </button>
          )}
        {reached(discovery, "failure") && (
          <button
            type="button"
            onClick={() =>
              send({
                type: "teaching.alternative.requested",
                lesson,
                concept: decision.concept,
              })
            }
          >
            Show me another way
          </button>
        )}
      </div>
      {reached(discovery, "term") && (
        <details className="model-check">
          <summary>Check my mental model</summary>
          {TRANSFER_PROMPTS[lesson].map((prompt) => (
            <fieldset key={prompt.id}>
              <legend>{prompt.question}</legend>
              <button
                type="button"
                onClick={() =>
                  send({
                    type: "transfer.answered",
                    lesson,
                    question: prompt.id,
                    correct: true,
                  })
                }
              >
                {prompt.correct}
              </button>
              <button
                type="button"
                onClick={() =>
                  send({
                    type: "transfer.answered",
                    lesson,
                    question: prompt.id,
                    correct: false,
                  })
                }
              >
                {prompt.misconception}
              </button>
            </fieldset>
          ))}
        </details>
      )}
    </aside>
  );
}
