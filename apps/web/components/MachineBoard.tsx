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
import { reached, sharedLengths, type Lesson } from "@/lib/simulation/model";
import type { TraceToken } from "@/lib/schema";
import { KvRoute, CompareLane, WorkLedger } from "./KvVisual";

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
        <strong>
          {lesson === "01"
            ? "A word goes in. Finished work comes out."
            : "Same positions. A different question."}
        </strong>
      </div>
      <div
        className={
          "execution-lanes " +
          (lesson === "01" && state.compare ? "comparing" : "")
        }
      >
        <div className="primary-lane" data-policy={state.policy}>
          {lesson === "01" && state.compare && (
            <h3>
              {state.policy === "cached"
                ? "Keep finished work"
                : "Rebuild everything"}
            </h3>
          )}
          <div className="machine-columns" aria-hidden="true">
            <span>word</span>
            <span>compute</span>
            <span>memory</span>
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
                  aria-pressed={
                    state.selectedPosition === token.position ||
                    (lesson === "02" &&
                      !showDecode &&
                      state.query === token.position)
                  }
                  className={`machine-object ${status} ${lesson === "02" && !showDecode && state.query === token.position ? "query-source" : ""}`}
                  onClick={() => {
                    send({
                      type: "object.inspected",
                      position: token.position,
                    });
                    if (lesson === "02" && !showDecode)
                      send({
                        type: "query.selected",
                        position: token.position,
                      });
                  }}
                >
                  <span>
                    <small>#{token.position}</small> {token.text}
                  </span>
                  <KvRoute
                    built={
                      built || (lesson !== "01" && introduced && !showDecode)
                    }
                    reused={
                      reused ||
                      (lesson !== "01" &&
                        showDecode &&
                        token.position < state.promptLength)
                    }
                    output={
                      output ||
                      (lesson !== "01" &&
                        showDecode &&
                        token.position === state.promptLength)
                    }
                    kept={kept}
                    beat={state.playhead}
                  />
                  <span className="sr-only">
                    {lesson === "01"
                      ? built
                        ? token.position < step!.position - 1 &&
                          state.playhead > 0
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
                  <span className="sr-only">
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
          {lesson === "01" && state.playhead >= 0 && (
            <WorkLedger
              trace={traces.kv}
              policy={state.policy}
              playhead={state.playhead}
            />
          )}
        </div>
        {lesson === "01" && state.compare && <CompareLane />}
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

/** Transform persistent dependency edges into a compact grid; inspection can never grant a forbidden read. */
export function AttentionBoard() {
  const { state, traces, send } = useMachine();
  const pair = stagePair(traces, state.promptLength);
  const introduced = reached(state.lessons["02"], "aha");
  const job = introduced ? state.job : "prefill";
  const stage = pair[job];
  const [rows, columns] = stage.attentionScoreShapePerHead;
  const n = Math.min(columns, 12);
  const query = job === "decode" ? columns - 1 : state.query;
  const compact = state.representation === "grid" || job === "decode";
  const large = columns > 12;
  const areaScale = Math.max(...sharedLengths(traces));
  const tokens = scenarioTokens(traces, state.promptLength);
  const inspected = state.inspectedKey;
  const forbidden = inspected !== null && inspected > query;
  const allQueries = introduced && job === "prefill";
  const queryRows =
    job === "decode"
      ? [query]
      : allQueries
        ? Array.from({ length: n }, (_, i) => i)
        : [query];
  const height = 230;
  const width = 440;
  /** Place a bounded set of key positions on a shared horizontal axis. */
  const keyX = (position: number) => 52 + (position * 350) / Math.max(1, n - 1);
  /** Keep query positions ordered vertically across both representations. */
  const rowY = (position: number) => 20 + (position * 170) / Math.max(1, n - 1);
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
      {introduced ? (
        <p>
          {rows} question{rows === 1 ? "" : "s"} × {columns} stored positions.{" "}
          {stage.attentionScoreCellsCausal} permitted reads.
        </p>
      ) : (
        <p>Choose a word, then try a position it might read.</p>
      )}
      <div
        className="dependency-stage"
        data-representation={compact ? "grid" : "connections"}
      >
        {large ? (
          <svg
            viewBox={`0 0 ${areaScale + 24} ${areaScale + 36}`}
            role="img"
            aria-label={`${rows} by ${columns} positions at a fixed ${areaScale}-position scale`}
          >
            <rect
              x="12"
              y="12"
              width={areaScale}
              height={areaScale}
              fill="none"
              stroke="var(--line)"
            />
            {job === "prefill" ? (
              <path
                d={`M12 12 L${12 + columns} ${12 + rows} H12 Z`}
                fill="var(--memory)"
              />
            ) : (
              <rect
                x="12"
                y="12"
                width={columns}
                height={rows}
                fill="var(--memory)"
                stroke="var(--memory)"
              />
            )}
            <text x="12" y={areaScale + 29}>
              Same scale: one square per potential read
            </text>
          </svg>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={
              compact
                ? "The same permitted edges compressed into rows and columns"
                : "Questions connect only to present and earlier positions"
            }
          >
            {queryRows.flatMap((i) =>
              Array.from({ length: n }, (_, j) => {
                if (j > i && !(i === query && j === inspected)) return null;
                const y = job === "decode" ? 80 : rowY(i);
                const allowed = j <= i;
                return (
                  <path
                    key={`${i}:${j}`}
                    data-edge={`${i}:${j}`}
                    data-allowed={allowed}
                    className={`dependency-edge ${allowed ? "" : "rejected"}`}
                    d={
                      compact
                        ? `M${keyX(j) - 6} ${y} L${keyX(j) + 6} ${y}`
                        : `M18 ${y} L${keyX(j)} 210`
                    }
                  />
                );
              }),
            )}
            {queryRows.map((i) => (
              <g key={i}>
                <circle
                  cx="18"
                  cy={job === "decode" ? 80 : rowY(i)}
                  r="8"
                  fill="var(--ink)"
                />
                <text x="3" y={(job === "decode" ? 80 : rowY(i)) - 11}>
                  q{i}
                </text>
              </g>
            ))}
            {Array.from({ length: n }, (_, j) => (
              <g key={j}>
                <rect
                  x={keyX(j) - 7}
                  y="204"
                  width="14"
                  height="12"
                  fill="var(--memory)"
                />
                <text x={keyX(j) - 5} y="228">
                  {j}
                </text>
              </g>
            ))}
          </svg>
        )}
        {introduced && job === "prefill" && !large && (
          <button
            type="button"
            onClick={() =>
              send({
                type: "representation.selected",
                representation: compact ? "connections" : "grid",
              })
            }
          >
            {compact
              ? "Expand the same connections"
              : "Compress connections into a grid"}
          </button>
        )}
      </div>
      <label className="query-control">
        Inspect question {query}
        <input
          type="range"
          aria-label="Question position"
          min={0}
          max={state.promptLength - 1}
          value={Math.min(query, state.promptLength - 1)}
          disabled={job === "decode"}
          onChange={(event) =>
            send({
              type: "query.selected",
              position: Number(event.target.value),
            })
          }
        />
      </label>
      <div className="dependency-keys" aria-label="Try a dependency">
        {Array.from({ length: n }, (_, j) => (
          <button
            type="button"
            key={j}
            className={`attention-cell ${j <= query ? "allowed lit" : "blocked"}`}
            aria-label={`question ${query} ${j <= query ? "may read" : "cannot read later"} position ${j}`}
            aria-pressed={inspected === j}
            onClick={() => {
              send({ type: "edge.inspected", key: j });
              if (j <= query) send({ type: "object.inspected", position: j });
            }}
          >
            <small>#{j}</small>
            {tokens[j]?.text ?? "new"}
            <span>{j <= query ? "↗" : "×"}</span>
          </button>
        ))}
      </div>
      {inspected !== null && (
        <p
          role="status"
          className={forbidden ? "dependency-rejection" : "dependency-accepted"}
        >
          {forbidden
            ? `× Read rejected. Position ${inspected} did not exist yet from question ${query}'s point of view.`
            : `Question ${query} can read position ${inspected}.`}
        </p>
      )}
      {large && (
        <p>
          Area includes every position. Buttons inspect the first {n}; the
          question slider spans the full recording.
        </p>
      )}
      <details>
        <summary>Why this many reads?</summary>
        <p>
          {job === "prefill"
            ? `${Array.from({ length: Math.min(rows, 8) }, (_, i) => i + 1).join(" + ")}${rows > 8 ? ` + … + ${rows}` : ""}`
            : `${rows} × ${columns}`}{" "}
          = {stage.attentionScoreCellsCausal} permitted reads.
        </p>
        <code className="trace-path">
          {state.promptLength === traces.prefill.config.promptLength
            ? job
            : `scaling[promptLength=${state.promptLength}].${job}`}
          .attentionScoreCellsCausal
        </code>
      </details>
    </section>
  );
}

/** Keep symbolic arithmetic mounted while recorded dtype size changes the physical payload beneath it. */
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
  const started = reached(discovery, "prediction");
  const dtype = state.bytes === 4 ? "float32" : "float16";
  const elementBytes = Number(
    traces.arithmetic.dtypeComparison[dtype].bytesPerElement,
  );
  return (
    <section
      className="payload-view"
      aria-label="Arithmetic and logical payload"
    >
      <div className="symbolic-work">
        <h3>One piece of the calculation</h3>
        <div
          className="operation-chain"
          aria-label="Multiply a question value by a key value, then add to the running sum"
        >
          <span>q</span>
          <b>×</b>
          <span>k</span>
          <b>+</b>
          <span>sum</span>
        </div>
        <div className="operation-units">
          <span>
            one multiplication
            <br />
            <b>1 FLOP</b>
          </span>
          <span>
            one addition
            <br />
            <b>1 FLOP</b>
          </span>
        </div>
        <details>
          <summary>Work or speed?</summary>
          <div className="rate-lesson">
            <span>
              × × ×<br />
              FLOPs: arithmetic work
            </span>
            <span>
              × × × / second
              <br />
              FLOP/s: work each second
            </span>
          </div>
          <p>
            No elapsed time is measured here. The same arithmetic can take
            different amounts of time on different machines.
          </p>
        </details>
        {started && (
          <details open>
            <summary>Repeat over this question&apos;s recorded shapes</summary>
            <p className="quantity">
              {active.flops} <small>math operations</small>
            </p>
            <code className="trace-path">
              {active.source}.attentionFlopsPerHead
            </code>
          </details>
        )}
      </div>
      {showData && (
        <div className="information-payload">
          <h3>What one value occupies</h3>
          <div
            className="dtype-value"
            data-dtype={dtype}
            data-before={Number(
              traces.arithmetic.dtypeComparison.float32.bytesPerElement,
            )}
            data-after={elementBytes}
            aria-label={`${dtype}: ${elementBytes} bytes per value`}
          >
            {Array.from(
              {
                length: Number(
                  traces.arithmetic.dtypeComparison.float32.bytesPerElement,
                ),
              },
              (_, byte) => (
                <span
                  key={byte}
                  className="byte-group"
                  data-present={byte < elementBytes}
                  aria-hidden={byte >= elementBytes}
                >
                  {Array.from({ length: 8 }, (_, bit) => (
                    <i key={bit} />
                  ))}
                  <small>1 byte</small>
                </span>
              ),
            )}
          </div>
          <p className="unit-caption">
            8 bits = 1 byte · {dtype} = {elementBytes} bytes
          </p>
          <div
            className="payload-meter"
            aria-label={`${active.bytes} logical bytes compared with ${baseline.bytes} at float32`}
          >
            <span style={{ width: `${(active.q / baseline.bytes) * 100}%` }}>
              Q
            </span>
            <span style={{ width: `${(active.k / baseline.bytes) * 100}%` }}>
              K
            </span>
            <span style={{ width: `${(active.v / baseline.bytes) * 100}%` }}>
              V
            </span>
          </div>
          <details>
            <summary>{active.bytes} logical bytes. Why?</summary>
            <p>
              Question {active.q} + keys {active.k} + values {active.v} ={" "}
              {active.bytes} bytes.
            </p>
            <code className="trace-path">{active.source}</code>
            <p>
              Bits and bytes are unit definitions. Dtype widths and tensor
              payloads come from the recorded dtype comparison. These bars
              represent logical storage, not measured hardware traffic.
            </p>
          </details>
          {reached(discovery, "aha") && (
            <details className="division-lesson" open>
              <summary>How much work for one byte?</summary>
              <p className="unit-example">100 km / 2 hours = 50 km per hour</p>
              <p className="unit-example">
                100 FLOPs / 50 bytes = 2 FLOPs per byte
              </p>
              <small>Unit examples, not measurements of this run.</small>
              <div className="unit-ratio">
                <span>{active.flops} FLOPs</span>
                <b>÷</b>
                <span>{active.bytes} bytes</span>
                <b>=</b>
                <span>
                  {active.intensity.toFixed(3)}
                  <br />
                  FLOPs per byte
                </span>
              </div>
              <p>A / B asks: how much A for one B?</p>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
