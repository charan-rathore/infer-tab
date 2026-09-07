"use client";

import { useMachine } from "./MachineProvider";
import {
  objectId,
  scenarioTokens,
  stagePair,
  arithmeticAccount,
  traceEvents,
  tensorId,
} from "@/lib/simulation/adapters";
import { reached, type Lesson } from "@/lib/simulation/model";
import type { TraceToken } from "@/lib/schema";

/** Project stable token-position objects into the workbench and shelf without remounting on policy changes. */
export function MachineBoard({ lesson }: { lesson: Lesson }) {
  const { state, traces, send } = useMachine();
  const step = traces.kv.modes[state.policy].steps[state.playhead];
  const events = traceEvents(traces.kv, state.policy, state.playhead);
  const prompt =
    lesson === "01"
      ? traces.kv.prompt
      : state.promptLength === traces.prefill.config.promptLength
        ? traces.prefill.prompt
        : `recorded-length:${state.promptLength}`;
  const tokens: TraceToken[] =
    lesson === "01"
      ? [
          ...traces.kv.promptTokens,
          ...traces.kv.modes[state.policy].generatedTokens.slice(
            0,
            state.playhead + 1,
          ),
        ]
      : scenarioTokens(traces, state.promptLength);
  const discovery = state.lessons[lesson];
  const introduced = reached(discovery, "aha");
  const showDecode =
    lesson === "03"
      ? !introduced || state.job === "decode"
      : introduced && state.job === "decode";
  if (lesson !== "01" && showDecode) {
    const token =
      state.promptLength === traces.prefill.config.promptLength
        ? traces.prefill.prefill.generatedToken
        : undefined;
    tokens.push(
      token ?? {
        id: -1,
        text: `#${state.promptLength}`,
        position: state.promptLength,
      },
    );
  }
  const selected = tokens.find(
    (token) => token.position === state.selectedPosition,
  );
  const block =
    step &&
    [...step.newlyComputed, ...step.reused].find(
      (item) => item.position === state.selectedPosition,
    );
  const maximum = 24;
  // Keep a selected offscreen position inspectable while bounding large scenario rendering.
  const visible = tokens.slice(0, maximum);
  if (selected && !visible.includes(selected)) visible.push(selected);

  return (
    <section className="machine" aria-label="Persistent inference machine">
      <div className="machine-header">
        <strong>The same three places</strong>
        <span>question → work → stored past</span>
      </div>
      <div className="machine-columns" aria-hidden="true">
        <span>Position / word</span>
        <span>Work this step</span>
        <span>Kept for later</span>
      </div>
      <div className="machine-objects">
        {visible.map((token) => {
          const built =
            lesson === "01" &&
            !!events
              .find((event) => event.type === "rows.projected")
              ?.positions.includes(token.position);
          const reused =
            lesson === "01" &&
            !!events
              .find((event) => event.type === "rows.reused")
              ?.positions.includes(token.position);
          const output =
            lesson === "01" &&
            !!events
              .find((event) => event.type === "token.emitted")
              ?.positions.includes(token.position);
          const kept =
            lesson === "01"
              ? state.policy === "cached" && (built || reused)
              : true;
          const status = built
            ? "built"
            : reused
              ? "reused"
              : output
                ? "output"
                : "idle";
          return (
            <button
              key={objectId(prompt, token.position)}
              type="button"
              data-object-id={objectId(prompt, token.position)}
              data-object-state={status}
              aria-pressed={state.selectedPosition === token.position}
              className={`machine-object ${status}`}
              onClick={() =>
                send({ type: "object.inspected", position: token.position })
              }
            >
              <span>
                <small>#{token.position}</small> {token.text}
              </span>
              <span>
                {lesson === "01"
                  ? built
                    ? token.position < step!.position - 1 && state.playhead > 0
                      ? "Built again"
                      : "Built now"
                    : reused
                      ? "Read existing"
                      : output
                        ? "New output"
                        : "Waiting"
                  : showDecode
                    ? token.position === state.promptLength
                      ? "One new question"
                      : "Read existing"
                    : introduced
                      ? "Question ready"
                      : token.position === 0
                        ? "Question 0"
                        : "Not selected"}
              </span>
              <span>
                {kept
                  ? "■ Stored"
                  : output
                    ? "Not fed back yet"
                    : built
                      ? "Cleared after use"
                      : "Empty"}
              </span>
            </button>
          );
        })}
      </div>
      {tokens.length > maximum && (
        <p>
          {tokens.length - maximum} additional positions summarized. Counts
          include every position.
        </p>
      )}
      <p className="machine-legend">
        Built = new projection · Read existing = reused numbers · New output =
        not yet stored
      </p>
      {selected && (
        <aside className="object-inspector" aria-label="Selected object">
          <strong>
            Position {selected.position}: {selected.text}
          </strong>
          <p>
            This position stays the same when you change the view. Repeated
            words at different positions are different objects.
          </p>
          {lesson === "01" && block && (
            <p>
              Recorded label norm {block.kNorm.toFixed(4)}; contents norm{" "}
              {block.vNorm.toFixed(4)}.{" "}
              {state.policy === "cached" && step?.reused.includes(block)
                ? "These rows were reused."
                : "These rows were projected this step."}
            </p>
          )}
          <details>
            <summary>Object provenance</summary>
            <code className="trace-path">
              {objectId(prompt, selected.position)}
            </code>
            {(lesson === "01" ||
              state.promptLength === traces.prefill.config.promptLength) && (
              <code className="trace-path">
                {tensorId(
                  lesson === "01" ? traces.kv : traces.prefill,
                  selected.position,
                )}
              </code>
            )}
            <p>
              Tensor source:{" "}
              {lesson === "01"
                ? `${traces.kv.experimentId} / ${state.policy} / step ${state.playhead + 1}`
                : `${traces.prefill.experimentId} / prompt length ${state.promptLength}`}
              . A shared position does not assert identical tensors across model
              runs.
            </p>
          </details>
          <button
            type="button"
            onClick={() => send({ type: "object.inspected", position: null })}
          >
            Close inspection
          </button>
        </aside>
      )}
    </section>
  );
}

/** Render the recorded score grid using native buttons; query selection highlights legal reads without changing the mask. */
export function AttentionBoard() {
  const { state, traces, send } = useMachine();
  const pair = stagePair(traces, state.promptLength);
  const introduced = reached(state.lessons["02"], "aha");
  const job = introduced ? state.job : "prefill";
  const stage = pair[job];
  const [rows, columns] = stage.attentionScoreShapePerHead;
  const n = Math.min(columns, 16);
  const shownRows = Math.min(rows, 16);
  return (
    <section
      className="attention-view"
      aria-label="Questions and permitted reads"
    >
      <h3>
        {job === "prefill"
          ? introduced
            ? "All existing questions, same read restriction"
            : "Inspect one question at a time"
          : "One new question, the whole shelf"}
      </h3>
      <p>
        {rows} question{rows === 1 ? "" : "s"} × {columns} stored positions.{" "}
        {stage.attentionScoreCellsCausal} permitted reads.
      </p>
      <div
        className="attention-grid"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: shownRows * n }, (_, index) => {
          const i = Math.floor(index / n);
          const j = index % n;
          const allowed = job === "decode" || j <= i;
          const lit = allowed && (introduced || i === 0);
          return (
            <button
              type="button"
              key={`${i}:${j}`}
              className={`attention-cell ${allowed ? "allowed" : "blocked"} ${lit ? "lit" : ""}`}
              aria-label={`question ${job === "decode" ? columns - 1 : i} ${allowed ? "may read" : "cannot read later"} position ${j}`}
              onClick={() => send({ type: "object.inspected", position: j })}
            >
              {allowed ? "·" : "×"}
            </button>
          );
        })}
      </div>
      {columns > n && (
        <p>
          Top-left {shownRows} × {n} excerpt; all counts above use the full
          recorded grid.
        </p>
      )}
      <p>
        × = later position, read blocked. A mask restricts reads even when all
        prompt words exist.
      </p>
    </section>
  );
}

/** Compare both recorded accounts on a fixed scale, so byte width changes cannot masquerade as less arithmetic. */
export function PayloadBoard() {
  const { state, traces } = useMachine();
  const discovery = state.lessons["03"];
  const active = arithmeticAccount(traces, {
    ...state,
    job: reached(discovery, "aha") ? state.job : "decode",
  });
  const baseline = arithmeticAccount(traces, {
    ...state,
    job: reached(discovery, "aha") ? state.job : "decode",
    bytes: 4,
  });
  const showData = reached(discovery, "failure");
  return (
    <section
      className="payload-view"
      aria-label="Arithmetic and logical payload"
    >
      <div>
        <h3>Arithmetic for one head</h3>
        <p className="quantity">
          {active.flops} <small>math operations</small>
        </p>
        <p>
          Two attention multiplies. One multiply plus one add counts as two
          operations.
        </p>
      </div>
      {showData && (
        <div>
          <h3>Data those operations need</h3>
          <p className="quantity">
            {active.bytes} <small>logical bytes</small>
          </p>
          <div className="payload-meter" aria-hidden="true">
            <span
              style={{ width: `${(active.bytes / baseline.bytes) * 100}%` }}
            />
          </div>
          <p>
            Question {active.q} + labels {active.k} + contents {active.v} ={" "}
            {active.bytes} bytes.
          </p>
          <p>The meter uses the original 4-byte payload as its full width.</p>
        </div>
      )}
    </section>
  );
}
