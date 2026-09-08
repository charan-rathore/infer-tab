"use client";

import {
  useState,
  useEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Timeline } from "./KvVisual";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMachine } from "./MachineProvider";
import { MachineBoard, AttentionBoard, PayloadBoard } from "./MachineBoard";
import { AdaptiveGuide } from "./AdaptiveGuide";
import { JOURNEY } from "@/lib/simulation/journey";
import {
  projectedWork,
  arithmeticAccount,
  stagePair,
  validateBundle,
} from "@/lib/simulation/adapters";
import {
  MILESTONES,
  reached,
  sharedLengths,
  type Lesson,
} from "@/lib/simulation/model";
import {
  decodeReplay,
  encodeReplay,
  MAX_REPLAY_BYTES,
  MAX_EVENTS,
} from "@/lib/simulation/replay";
import { assertValidTrace } from "@/lib/schema";
import { teachingDecision } from "@/lib/teaching/policy";

const PATHS: Record<Lesson, string> = {
  "01": "/",
  "02": "/prefill-vs-decode",
  "03": "/arithmetic-vs-memory",
};

/** Compose every lens from the same discovery controls, persistent objects, and trace-derived evidence. */
export function JourneyMachine({ lesson }: { lesson: Lesson }) {
  const machine = useMachine();
  const { state, traces, send } = machine;
  const discovery = state.lessons[lesson];
  const copy = JOURNEY[lesson];
  const stage = discovery.milestone;
  const hasAha = reached(discovery, "aha");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStage = useRef(stage);
  // Route entry preserves only selections meaningful in the destination's recorded sequence.
  useEffect(() => {
    send({ type: "lesson.entered", lesson });
  }, [lesson, send]);
  // Focus follows a removed action button to its consequence. This effect never changes simulation facts.
  useEffect(() => {
    if (previousStage.current !== stage)
      heading.current?.focus({ preventScroll: true });
    previousStage.current = stage;
  }, [stage]);
  const [notice, setNotice] = useState("");
  const router = useRouter();
  const rebuild = projectedWork(traces.kv, "naive", state.playhead);
  const keep = projectedWork(traces.kv, "cached", state.playhead);
  const pair = stagePair(traces, state.promptLength);
  const account = arithmeticAccount(traces, {
    ...state,
    job: lesson === "03" && !hasAha ? "decode" : state.job,
  });
  const baseline = arithmeticAccount(traces, {
    ...state,
    job: lesson === "03" && !hasAha ? "decode" : state.job,
    bytes: 4,
  });
  const step = traces.kv.modes[state.policy].steps[state.playhead];
  const naiveStep = traces.kv.modes.naive.steps[state.playhead];
  const cachedStep = traces.kv.modes.cached.steps[state.playhead];
  const canReuse = traces.kv.modes.cached.steps.some(
    (item) => item.kvRowsReused > 0,
  );
  const teaching = teachingDecision(lesson, state.learner);
  const adaptiveCompare =
    state.compare || teaching.strategy === "synchronized-comparison";

  /** Download an explicit, portable replay; the file includes the prompt and recordings the user chose. */
  function downloadReplay() {
    const content = encodeReplay({
      version: 1,
      lesson,
      traces,
      events: machine.events,
    });
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "infertab-replay.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice(
      "Replay saved with its prompt, recordings, predictions, and playhead.",
    );
  }

  /** Validate a selected replay completely before atomically restoring it and navigating to its saved lens. */
  async function importReplay(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_REPLAY_BYTES)
        throw new Error("Replay exceeds the 2 MB limit.");
      const replay = decodeReplay(await file.text());
      machine.restore(replay);
      router.push(PATHS[replay.lesson]);
      setNotice("Replay restored. Continue from the saved observation.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not read this replay.",
      );
    }
    event.target.value = "";
  }

  /** Emit a named discovery transition with the current lens attached for later analytics instrumentation. */
  function advance(
    type:
      | "interaction.started"
      | "mechanism.changed"
      | "derivation.revealed"
      | "term.revealed"
      | "bottleneck.revealed",
  ) {
    send({ type, lesson });
  }

  return (
    <section
      className="journey-machine"
      data-lesson={lesson}
      data-milestone={stage}
    >
      <details className="curiosity-depth">
        <summary>Explore the evidence</summary>
        <div className="depth" role="group" aria-label="Learning depth">
          {(["learn", "inspect", "prove"] as const).map((depth) => (
            <button
              type="button"
              key={depth}
              aria-pressed={state.depth === depth}
              className={state.depth === depth ? "on" : ""}
              onClick={() => send({ type: "depth.selected", depth })}
            >
              {depth === "learn"
                ? "Learn"
                : depth === "inspect"
                  ? "Inspect"
                  : "Prove"}
            </button>
          ))}
        </div>
      </details>
      <article className="lesson discovery" aria-label="Current discovery">
        <p className="eyebrow">
          Observation {MILESTONES.indexOf(stage) + 1} of {MILESTONES.length}
        </p>
        <h2 ref={heading} tabIndex={-1}>
          {copy.title}
        </h2>
        {stage === "problem" && (
          <>
            <p>{copy.problem}</p>
            <div className="controls">
              <button
                type="button"
                onClick={() => advance("interaction.started")}
              >
                {copy.start}
              </button>
            </div>
          </>
        )}
        {stage === "prediction" && (
          <fieldset className="prediction">
            <legend>{copy.question}</legend>
            {copy.answers.map((answer) => (
              <button
                type="button"
                key={answer.id}
                onClick={() =>
                  send({
                    type: "prediction.committed",
                    lesson,
                    answer: answer.id,
                  })
                }
              >
                {answer.label}
              </button>
            ))}
          </fieldset>
        )}
        {discovery.prediction && (
          <p className="prediction-record">
            Your prediction:{" "}
            {
              copy.answers.find((answer) => answer.id === discovery.prediction)
                ?.label
            }
          </p>
        )}
        <div aria-live="polite" aria-atomic="true">
          {stage === "failure" && (
            <div className="failure" data-discovery="failure">
              {lesson === "01" && (
                <p>
                  The next step built <b>{naiveStep?.kvRowsProjected} rows</b>.
                </p>
              )}
              {lesson === "02" && (
                <p>
                  Read blocked: question 0 cannot read position 1. That is a
                  later position. Processing together must preserve this
                  restriction.
                </p>
              )}
              {lesson === "03" && (
                <p>
                  Only <b>{baseline.flops} math operations</b>, but{" "}
                  <b>{baseline.bytes} logical bytes</b> must be available.
                  Counting math alone missed the shelf.
                </p>
              )}
            </div>
          )}
          {hasAha && (
            <div className="aha" data-discovery="aha">
              {lesson === "01" && (
                <>
                  <p>
                    At this same step: rebuild makes{" "}
                    <b>{naiveStep?.kvRowsProjected ?? 0}</b> rows; keep makes{" "}
                    <b>{cachedStep?.kvRowsProjected ?? 0}</b> and reuses{" "}
                    <b>{cachedStep?.kvRowsReused ?? 0}</b>.
                  </p>
                  <details>
                    <summary>How do we know the output is unchanged?</summary>
                    <p>
                      {traces.kv.equivalence.outputsMatch &&
                      traces.kv.equivalence.maxAbsLogitDiff <=
                        traces.kv.equivalence.tolerance
                        ? "The recorded output tokens match, and the raw score difference is within tolerance."
                        : "The recording does not establish equivalent outputs. Inspect the numerical evidence before drawing a conclusion."}
                    </p>
                  </details>
                </>
              )}
              {lesson === "02" && (
                <p>
                  All {pair.prefill.qRowsProjected} existing questions can be
                  processed together. Only{" "}
                  {pair.prefill.attentionScoreCellsCausal} square cells are
                  permitted reads. The next token needs{" "}
                  {pair.decode.qRowsProjected} new question against{" "}
                  {pair.decode.attentionScoreShapePerHead[1]} stored positions.
                </p>
              )}
              {lesson === "03" && (
                <p>
                  With {state.bytes}-byte numbers, arithmetic stays{" "}
                  <b>{account.flops}</b>. The logical payload is{" "}
                  <b>{account.bytes} bytes</b>, compared with {baseline.bytes}{" "}
                  at 4 bytes per number. This changes symbolic storage, not a
                  measured numerical inference run.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="controls">
          {stage === "failure" && (
            <button
              type="button"
              disabled={lesson === "01" && !canReuse}
              onClick={() => advance("mechanism.changed")}
            >
              {copy.mechanism}
            </button>
          )}
          {stage === "aha" && (
            <button
              type="button"
              onClick={() => advance("derivation.revealed")}
            >
              Derive it from what happened
            </button>
          )}
          {stage === "derivation" && (
            <button type="button" onClick={() => advance("term.revealed")}>
              What is this called?
            </button>
          )}
          {stage === "term" && (
            <button
              type="button"
              onClick={() => advance("bottleneck.revealed")}
            >
              What still costs work?
            </button>
          )}
        </div>
        {lesson === "01" && !canReuse && (
          <p role="status">
            This recording has only an initial pass. Use a new sentence to
            record enough steps to observe reuse.
          </p>
        )}
      </article>

      <AdaptiveGuide lesson={lesson} decision={teaching} />

      {lesson !== "01" && (
        <p className="source-note">
          {state.promptLength === traces.prefill.config.promptLength
            ? `Following the ${state.promptLength} prompt positions: “${traces.prefill.prompt}”.`
            : `Recorded ${state.promptLength}-token scenario; position labels summarize this separate run.`}{" "}
          {lesson === "02"
            ? "This lens uses a separate recorded model run; it preserves positions, not Experiment 01 tensor values."
            : "This arithmetic account uses Experiment 02’s model and shapes."}
          {traces.kv.prompt !== traces.prefill.prompt &&
            " Your custom sentence remains saved in 01; this lens uses the recorded scenario shown here."}
        </p>
      )}

      <MachineBoard lesson={lesson} strategy={teaching.strategy} />
      {lesson === "01" && reached(discovery, "failure") && <Timeline />}
      {lesson === "02" && <AttentionBoard strategy={teaching.strategy} />}
      {lesson === "03" && <PayloadBoard strategy={teaching.strategy} />}
      {lesson === "01" && step && (
        <p className="live-count" role="status">
          Step {state.playhead + 1} of {traces.kv.modes.naive.steps.length}.
          Built this step: <b>{step.kvRowsProjected}</b>. Built across observed
          steps: <b>{state.policy === "naive" ? rebuild.value : keep.value}</b>.
        </p>
      )}

      {hasAha && (
        <div
          className="explore-controls"
          aria-label="Change the observed state"
        >
          {lesson === "01" ? (
            <>
              <div
                className="policy-bar"
                role="group"
                aria-label="Storage policy"
              >
                {(["naive", "cached"] as const).map((policy) => (
                  <button
                    type="button"
                    key={policy}
                    aria-pressed={state.policy === policy}
                    className={state.policy === policy ? "on" : ""}
                    onClick={() => send({ type: "policy.selected", policy })}
                  >
                    {policy === "naive"
                      ? "Rebuild the past"
                      : "Keep finished work"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={adaptiveCompare}
                onClick={() => {
                  if (adaptiveCompare && !state.compare)
                    send({
                      type: "teaching.alternative.requested",
                      lesson: "01",
                      concept: "kv-cache",
                    });
                  else
                    send({
                      type: "compare.selected",
                      enabled: !state.compare,
                    });
                }}
              >
                {adaptiveCompare
                  ? "Show one execution"
                  : "Compare both executions"}
              </button>
              <details>
                <summary>Same experiment?</summary>
                <p>
                  Both lanes use this recording&apos;s prompt, seed, weights,
                  generated output, and playhead. Changing policy compares full
                  executions; it does not fill a cache halfway through a run.
                </p>
              </details>
            </>
          ) : (
            <div
              className="policy-bar"
              role="group"
              aria-label="Question shape"
            >
              <button
                type="button"
                aria-pressed={state.job === "prefill"}
                onClick={() => send({ type: "job.selected", job: "prefill" })}
              >
                All prompt questions
              </button>
              <button
                type="button"
                aria-pressed={state.job === "decode"}
                onClick={() => send({ type: "job.selected", job: "decode" })}
              >
                One new question
              </button>
            </div>
          )}
          {lesson === "03" && (
            <div className="policy-bar" role="group" aria-label="Element width">
              {([4, 2] as const).map((bytes) => (
                <button
                  type="button"
                  key={bytes}
                  aria-pressed={state.bytes === bytes}
                  onClick={() => send({ type: "width.selected", bytes })}
                >
                  {bytes}-byte numbers
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(reached(discovery, "derivation") || state.depth !== "learn") && (
        <section
          className="derivation panel"
          aria-label="Trace derivation"
          data-discovery="derivation"
        >
          <h3>Derive it from the recording</h3>
          {lesson === "01" && (
            <>
              <p>
                Rebuild: {rebuild.expression} = <b>{rebuild.value} rows</b>.
              </p>
              <p>
                Keep: {keep.expression} = <b>{keep.value} rows</b>.
              </p>
              <p>
                Difference over these observed steps: {rebuild.value} −{" "}
                {keep.value} = {rebuild.value - keep.value} fewer projections.
                The first pass is included, so “built” is not all repeated work.
              </p>
              <p>
                The last emitted word is not fed back until the next step; it is
                not yet a stored block.
              </p>
              <code className="trace-path">
                {rebuild.source}
                <br />
                {keep.source}
              </code>
            </>
          )}
          {lesson === "02" && (
            <>
              <p>
                Square: {pair.prefill.attentionScoreShapePerHead.join(" × ")} ={" "}
                {pair.prefill.attentionScoreCellsPerHead} cells per head.
              </p>
              <p>
                Permitted: 1 + 2 + … + {state.promptLength} ={" "}
                {pair.prefill.attentionScoreCellsCausal}. Blocked:{" "}
                {pair.prefill.attentionScoreCellsMasked}.
              </p>
              <p>
                Next row: {pair.decode.attentionScoreShapePerHead.join(" × ")} ={" "}
                {pair.decode.attentionScoreCellsPerHead} cells.
              </p>
              <p>
                These are score cells, not total model arithmetic or a
                serial-versus-parallel timing measurement.
              </p>
              <code className="trace-path">
                {pair.source}.attentionScoreCellsPerHead /
                attentionScoreCellsCausal
              </code>
            </>
          )}
          {lesson === "03" && (
            <>
              <p>
                Question + labels + contents = {account.q} + {account.k} +{" "}
                {account.v} = {account.bytes} logical bytes.
              </p>
              <p>
                {account.flops} math operations ÷ {account.bytes} bytes ={" "}
                <b>
                  {Number(account.intensity.toFixed(3))} operations per byte
                </b>
                .
              </p>
              <p>
                One head, attention score and value aggregation only. The
                denominator excludes score/output buffers and model weights.
                Logical bytes are not measured memory traffic.
              </p>
              <code className="trace-path">{account.source}</code>
            </>
          )}
        </section>
      )}
      {reached(discovery, "term") && (
        <aside className="reveal" data-discovery="term">
          <p>{copy.term}</p>
        </aside>
      )}
      {stage === "bottleneck" && (
        <aside className="next-q" data-discovery="bottleneck">
          <p>{copy.bottleneck}</p>
          {copy.next && <Link href={copy.next.href}>{copy.next.label} →</Link>}
        </aside>
      )}

      {hasAha && lesson !== "01" && (
        <details className="scenario-picker">
          <summary>What if the prompt were longer?</summary>
          <fieldset>
            <legend>Explore another recorded prompt length</legend>
            {sharedLengths(traces).map((length) => (
              <button
                type="button"
                key={length}
                aria-pressed={state.promptLength === length}
                onClick={() => send({ type: "scenario.selected", length })}
              >
                {length} tokens
              </button>
            ))}
          </fieldset>
        </details>
      )}
      {state.depth === "prove" && (
        <section className="panel proof">
          <h3>What the recording establishes</h3>
          {lesson === "01" ? (
            <>
              <p>
                Maximum raw-score difference:{" "}
                {traces.kv.equivalence.maxAbsLogitDiff}. Tolerance:{" "}
                {traces.kv.equivalence.tolerance}. Outputs match:{" "}
                {String(traces.kv.equivalence.outputsMatch)}.
              </p>
              <p>{traces.kv.measurementDisclaimer}</p>
            </>
          ) : lesson === "02" ? (
            <>
              <p>
                Cached/full-recompute score difference:{" "}
                {traces.prefill.equivalence.maxAbsLogitDiff}; tolerance{" "}
                {traces.prefill.equivalence.tolerance}. This check belongs to
                the detailed {traces.prefill.config.promptLength}-token run.
              </p>
              <p>{traces.prefill.measurementDisclaimer}</p>
            </>
          ) : (
            <>
              <p>{traces.arithmetic.flopConvention.statement}.</p>
              <p>{traces.arithmetic.measurementDisclaimer}</p>
            </>
          )}
          <p>
            Tensor identity includes model initialization and source recording.
            Experiment 01 and 02 use different position-table sizes, so matching
            position labels do not promise matching tensors.
          </p>
        </section>
      )}

      <details className="hood">
        <summary>Recording and replay</summary>
        <p>{machine.source}</p>
        {lesson === "01" && <PromptComposer />}
        <p>
          A replay includes the sentence and recorded trace data. Share the file
          to reopen the same observations on another machine.
        </p>
        <div className="controls">
          <button type="button" onClick={downloadReplay}>
            Save replay
          </button>
          <label className="import-label">
            Open replay
            <input
              type="file"
              accept=".json,application/json"
              onChange={importReplay}
            />
          </label>
        </div>
        <p role="status">{notice}</p>
        <button
          type="button"
          onClick={() => send({ type: "lesson.reset", lesson })}
        >
          Restart this discovery
        </button>
        {machine.events.length >= MAX_EVENTS && (
          <p role="alert">
            This replay reached its action limit. Open a saved replay with fewer
            actions or reload to start a new session.
          </p>
        )}
      </details>
    </section>
  );
}

/** Request the existing Python experiment, label fallback honestly, and replace the trace as one atomic action. */
function PromptComposer() {
  const { traces, replaceTrace } = useMachine();
  const [prompt, setPrompt] = useState(traces.kv.prompt);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  /** Submit a custom sentence without deriving any inference results in the browser. */
  async function runPrompt(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxNewTokens: 6 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Experiment failed.");
      const trace = assertValidTrace(data.trace ?? data);
      validateBundle({ ...traces, kv: trace });
      const source = data.fallback
        ? "Local Python did not run. This is the committed sample trace, not a live run."
        : data.source === "live"
          ? "Live run from the local Python experiment."
          : "Committed sample trace.";
      replaceTrace(trace, source);
      setPrompt(trace.prompt);
      setStatus(source);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Experiment failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form className="composer" onSubmit={runPrompt}>
        <input
          aria-label="Short sentence"
          value={prompt}
          maxLength={80}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? "Running" : "Use this sentence"}
        </button>
      </form>
      <p role="status">{status}</p>
    </>
  );
}
