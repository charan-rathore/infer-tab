"use client";

import { useMachine } from "./MachineProvider";
import { arithmeticAccount } from "@/lib/simulation/adapters";

/** Reuse the same numerator, denominator and quotient shapes when the learner changes the unit lens. */
export function UnitDivision() {
  const { state, traces, send } = useMachine();
  const lens = state.unitLens;
  const account = arithmeticAccount(traces, state);
  const values =
    lens === "distance"
      ? {
          numerator: 100,
          denominator: 2,
          quotient: 50,
          work: "km",
          data: "hours",
          per: "km/hour",
        }
      : lens === "example"
        ? {
            numerator: 100,
            denominator: 50,
            quotient: 2,
            work: "FLOPs",
            data: "bytes",
            per: "FLOPs/byte",
          }
        : {
            numerator: account.flops,
            denominator: account.bytes,
            quotient: Number(account.intensity.toFixed(3)),
            work: "FLOPs",
            data: "bytes",
            per: "FLOPs/byte",
          };
  const approximate =
    lens === "recording" && values.quotient !== account.intensity;
  return (
    <div className="division-machine" data-unit-lens={lens}>
      <div role="group" aria-label="Division lens" className="division-lenses">
        {(["distance", "example", "recording"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={lens === item}
            onClick={() => send({ type: "unit-lens.selected", lens: item })}
          >
            {item === "distance"
              ? "Distance / time"
              : item === "example"
                ? "Work / bytes"
                : "This recording"}
          </button>
        ))}
      </div>
      <div
        className="ratio-equation"
        aria-label={`${values.numerator} ${values.work} divided by ${values.denominator} ${values.data} ${approximate ? "approximately equals" : "equals"} ${values.quotient} ${values.per}`}
      >
        <span className="ratio-numerator">
          <b>{values.numerator}</b>
          <small>{values.work}</small>
        </span>
        <span className="ratio-divisor">÷</span>
        <span className="ratio-denominator">
          <b>{values.denominator}</b>
          <small>{values.data}</small>
        </span>
        <span>{approximate ? "≈" : "="}</span>
        <span className="ratio-result">
          <b>{values.quotient}</b>
          <small>{values.per}</small>
        </span>
      </div>
      <div className="ratio-unit" aria-hidden="true">
        <span>A</span>
        <span>for</span>
        <b>one B</b>
      </div>
      <small>
        {lens === "recording"
          ? account.source
          : "Authored unit example, not a measurement of this run."}
      </small>
    </div>
  );
}
