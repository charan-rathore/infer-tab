"use client";

import { useMachine } from "./MachineProvider";
import { objectId } from "@/lib/simulation/adapters";

/** Align the same position's recorded K/V previews over time so invariance is visible as identical rows. */
export function CausalInvariant() {
  const { state, traces, send } = useMachine();
  const steps = traces.kv.modes.cached.steps.slice(0, state.playhead + 1);
  const position = Math.min(
    state.selectedPosition ?? 0,
    traces.kv.promptTokens.length - 1,
  );
  return (
    <section
      className="causal-invariant"
      aria-label="Same position across time"
    >
      <header>
        <h3>Follow one finished position</h3>
        <span>New words arrive ↓</span>
      </header>
      <div
        className="invariant-positions"
        role="group"
        aria-label="Track a prompt position"
      >
        {traces.kv.promptTokens.slice(0, 12).map((token) => (
          <button
            key={token.position}
            type="button"
            aria-pressed={position === token.position}
            onClick={() =>
              send({ type: "object.inspected", position: token.position })
            }
          >
            #{token.position} {token.text}
          </button>
        ))}
      </div>
      <div
        className="invariant-table"
        data-concept-id={objectId(traces.kv.prompt, position)}
      >
        <div className="invariant-row invariant-labels">
          <span>step</span>
          <span>K preview</span>
          <span>V preview</span>
        </div>
        {steps.map((step) => {
          const block = [...step.newlyComputed, ...step.reused].find(
            (item) => item.position === position,
          )!;
          return (
            <div
              key={step.step}
              className="invariant-row"
              data-invariant-step={step.step}
            >
              <span>{step.step + 1}</span>
              {(["kPreview", "vPreview"] as const).map((field) => (
                <div
                  key={field}
                  className="tensor-preview"
                  role="img"
                  aria-label={`${field}: ${block[field].join(", ")}`}
                >
                  {block[field].map((value, index) => (
                    <span
                      key={index}
                      title={String(value)}
                      style={{
                        opacity: 0.3 + Math.min(1, Math.abs(value)) * 0.7,
                      }}
                      data-value={value}
                    />
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <details>
        <summary>Inspect exact values</summary>
        <p>
          Each vertical column retains the same serialized values while new
          words arrive. This shows recorded previews; the Python tests establish
          full raw-logit equivalence.
        </p>
        <code className="trace-path">
          modes.cached.steps[*].newlyComputed / reused; position {position}
        </code>
      </details>
    </section>
  );
}
