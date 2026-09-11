"use client";

import { useMachine } from "./MachineProvider";
import { objectId, projectedWork } from "@/lib/simulation/adapters";
import type { InferTabTrace, ModeId } from "@/lib/schema";
import { projectionAction, visualEvent } from "@/lib/visual/projection";

/** Keep one payload element mounted as it passes through compute or rests on the shelf. Motion is CSS projection only. */
export function KvRoute({
  built,
  reused,
  output,
  kept,
  beat,
  repeated = false,
}: {
  built: boolean;
  reused: boolean;
  output: boolean;
  kept: boolean;
  beat: number;
  repeated?: boolean;
}) {
  const event = visualEvent(
    "route",
    projectionAction(built, reused, output, repeated),
    kept,
    "accepted row membership",
  );
  return (
    <span
      className="kv-route"
      data-built={built}
      data-kept={kept}
      data-reused={reused}
      data-beat={beat % 2}
      data-action={event.action}
      data-from={event.from}
      data-via={event.via}
      data-to={event.to}
      aria-hidden="true"
    >
      <span className="route-wire" />
      <span className="compute-station">×</span>
      <span className="shelf-station" />
      <span className="read-wire" />
      <span className="read-copy">←</span>
      {(built || reused) && (
        <span className="origin-mark">
          ○<small>before</small>
        </span>
      )}
      <span className="kv-glyph" data-present={built || reused}>
        <i />
        <i />
        <small>{reused ? "kept" : repeated && !kept ? "rebuilt" : "new"}</small>
      </span>
      {output && <span className="next-glyph">next →</span>}
      <span className="after-mark">{built || reused ? "after" : ""}</span>
    </span>
  );
}

/** Show one receipt per recorded projection, stacked by step; totals emerge only from visible receipts. */
export function WorkLedger({
  trace,
  policy,
  playhead,
}: {
  trace: InferTabTrace;
  policy: ModeId;
  playhead: number;
}) {
  const work = projectedWork(trace, policy, playhead);
  const steps = trace.modes[policy].steps.slice(0, playhead + 1);
  const maximum = Math.max(
    ...trace.modes.naive.steps.map((step) => step.kvRowsProjected),
  );
  return (
    <details className={"work-ledger " + policy} open>
      <summary>
        {policy === "naive" ? "Rebuilt work" : "New work"}: {work.value} rows{" "}
        <span className="why-hint">why?</span>
      </summary>
      <div
        className="work-columns"
        aria-label={policy + " observed projection receipts"}
      >
        {steps.map((step) => (
          <div
            className="work-column"
            key={step.step}
            data-receipt-step={step.step}
          >
            <div
              className="receipt-stack"
              style={{ height: (84 * step.kvRowsProjected) / maximum + "px" }}
            >
              {step.newlyComputed.length <= 24 ? (
                step.newlyComputed.map((block) => (
                  <span
                    key={block.position}
                    data-receipt-position={block.position}
                    title={"Position " + block.position}
                  />
                ))
              ) : (
                <span title={step.kvRowsProjected + " projected rows"} />
              )}
            </div>
            <b>{step.kvRowsProjected}</b>
            <small>step {step.step + 1}</small>
          </div>
        ))}
      </div>
      <p className="ledger-sum">
        {work.expression} = {work.value}
      </p>
      <details>
        <summary>How do we know?</summary>
        <code className="trace-path">{work.source}</code>
        <p>
          Each receipt represents one recorded K/V row projection. This is an
          amount of work, not a duration or a whole-model operation count.
        </p>
      </details>
    </details>
  );
}

/** Render the other policy from the exact same trace and playhead, with separately scoped visual instances of the same positions. */
export function CompareLane() {
  const { state, traces, send } = useMachine();
  const policy = state.policy === "cached" ? "naive" : "cached";
  const step = traces.kv.modes[policy].steps[state.playhead];
  if (!step) return null;
  return (
    <div
      className="compare-lane"
      data-policy={policy}
      data-source={traces.kv.experimentId}
      data-playhead={state.playhead}
    >
      <h3>
        {policy === "naive" ? "Rebuild everything" : "Keep finished work"}
      </h3>
      <div className="lane-labels">
        <span>word</span>
        <span>compute</span>
        <span>memory</span>
      </div>
      {step.inputTokens.slice(0, 24).map((token) => {
        const built = step.newlyComputed.some(
          (block) => block.position === token.position,
        );
        const reused = step.reused.some(
          (block) => block.position === token.position,
        );
        return (
          <button
            type="button"
            className="mirror-object"
            key={objectId(traces.kv.prompt, token.position)}
            data-object-id={objectId(traces.kv.prompt, token.position)}
            data-concept-id={objectId(traces.kv.prompt, token.position)}
            aria-label={
              "Inspect " +
              policy +
              " position " +
              token.position +
              ": " +
              token.text
            }
            onClick={() =>
              send({ type: "object.inspected", position: token.position })
            }
          >
            <span className="object-word">
              <small>#{token.position}</small>
              {token.text}
            </span>
            <KvRoute
              built={built}
              reused={reused}
              output={false}
              kept={policy === "cached"}
              beat={state.playhead}
              repeated={
                state.playhead > 0 && token.position < step.position - 1
              }
            />
          </button>
        );
      })}
      <div className="mirror-output">
        <span>
          #{step.generatedToken.position} {step.generatedToken.text}
        </span>
        <small>same new output</small>
      </div>
      <WorkLedger trace={traces.kv} policy={policy} playhead={state.playhead} />
    </div>
  );
}

/** Expose shared, bounded timeline controls after the learner has made the required prediction. */
export function Timeline() {
  const { state, traces, send } = useMachine();
  const last = traces.kv.modes.naive.steps.length - 1;
  return (
    <div className="timeline-dock" aria-label="Recorded timeline">
      <div className="controls">
        <button
          type="button"
          className="secondary"
          disabled={state.playhead <= 0}
          onClick={() =>
            send({ type: "timeline.sought", step: state.playhead - 1 })
          }
        >
          Previous token
        </button>
        <button
          type="button"
          disabled={!state.playing && state.playhead >= last}
          onClick={() =>
            send({ type: state.playing ? "timeline.pause" : "timeline.play" })
          }
        >
          {state.playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          disabled={state.playhead >= last}
          onClick={() =>
            send({ type: "timeline.sought", step: state.playhead + 1 })
          }
        >
          Next token
        </button>
      </div>
      <label className="timeline">
        Observed step{" "}
        <input
          type="range"
          min={0}
          max={last}
          value={Math.max(0, state.playhead)}
          aria-valuetext={"Step " + (state.playhead + 1) + " of " + (last + 1)}
          onChange={(event) =>
            send({ type: "timeline.sought", step: Number(event.target.value) })
          }
        />
      </label>
      <div className="timeline-utilities">
        <button type="button" onClick={() => send({ type: "timeline.replay" })}>
          Replay from first token
        </button>
        <button
          type="button"
          onClick={() => send({ type: "lesson.reset", lesson: "01" })}
        >
          Reset experiment
        </button>
      </div>
      <span className="motion-alternative">
        Dashed origin → compute → solid result. Kept blocks stay in place.
      </span>
    </div>
  );
}
