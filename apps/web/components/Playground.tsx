"use client";

import { useEffect, useMemo, useState } from "react";
import { TokenChip } from "@/components/TokenChip";
import { DepthSwitch, type Depth } from "@/components/DepthSwitch";
import { HoodDrawer } from "@/components/HoodDrawer";
import { WhyNumber } from "@/components/WhyNumber";
import { LEARN_01 } from "@/lib/copy";
import { cachedProjectedSeries, joinSeries, logicalKvBytes, naiveProjectedSeries } from "@/lib/account";
import { assertValidTrace, type InferTabTrace, type ModeId } from "@/lib/schema";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; source: "sample" | "live" }
  | { kind: "fallback"; message: string }
  | { kind: "error"; message: string };

type Policy = "rebuild" | "keep";

export function Playground({ initialTrace }: { initialTrace: InferTabTrace }) {
  const [prompt, setPrompt] = useState(initialTrace.prompt);
  const [trace, setTrace] = useState<InferTabTrace>(initialTrace);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [showBoth, setShowBoth] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [load, setLoad] = useState<LoadState>({ kind: "ready", source: "sample" });
  const [busy, setBusy] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [depth, setDepth] = useState<Depth>("learn");
  const [seenKeepReuse, setSeenKeepReuse] = useState(false);

  const mode: ModeId = policy === "keep" ? "cached" : "naive";
  const modeTrace = trace.modes[mode];
  const maxStep = modeTrace.steps.length - 1;
  const step = stepIndex >= 0 ? modeTrace.steps[stepIndex] : undefined;

  useEffect(() => {
    if (policy === "keep" && step && step.kvRowsReused > 0) {
      setSeenKeepReuse(true);
    }
  }, [policy, step]);

  const generatedSoFar = useMemo(() => {
    if (stepIndex < 0) return [];
    return modeTrace.generatedTokens.slice(0, stepIndex + 1);
  }, [modeTrace, stepIndex]);

  const workRepeated = useMemo(() => {
    if (stepIndex < 0) return 0;
    return modeTrace.steps
      .slice(0, stepIndex + 1)
      .reduce((sum, item) => sum + item.kvRowsProjected, 0);
  }, [modeTrace, stepIndex]);

  const naiveSeries = naiveProjectedSeries(
    trace.promptTokens.length,
    trace.config.maxNewTokens,
  );
  const cachedSeries = cachedProjectedSeries(
    trace.promptTokens.length,
    trace.config.maxNewTokens,
  );

  function resetDependentState() {
    setStepIndex(-1);
    setShowMath(false);
    setSeenKeepReuse(false);
  }

  function choose(next: Policy) {
    setPolicy(next);
    setShowBoth(false);
    resetDependentState();
  }

  function resetWalk() {
    setStepIndex(-1);
    setShowMath(false);
  }

  function hardReset() {
    setPolicy(null);
    setShowBoth(false);
    resetDependentState();
    setPrompt(trace.prompt);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key === "ArrowRight" || event.key === "n") {
        event.preventDefault();
        setStepIndex((i) => Math.min(maxStep, i + 1));
      }
      if (event.key === "r") {
        event.preventDefault();
        setStepIndex(-1);
        setShowMath(false);
      }
      if (event.key === "1") {
        setPolicy("rebuild");
        setShowBoth(false);
        setStepIndex(-1);
      }
      if (event.key === "2") {
        setPolicy("keep");
        setShowBoth(false);
        setStepIndex(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maxStep]);

  async function runPrompt(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLoad({ kind: "loading" });
    try {
      const res = await fetch("/api/trace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, maxNewTokens: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Experiment failed");
      const valid = assertValidTrace(data.trace ?? data);
      setTrace(valid);
      resetDependentState();
      if (data.fallback) {
        setLoad({
          kind: "fallback",
          message:
            "Local Python did not run. This is the committed sample trace, not a live run.",
        });
      } else {
        setLoad({
          kind: "ready",
          source: data.source === "live" ? "live" : "sample",
        });
      }
    } catch (err: unknown) {
      setLoad({
        kind: "error",
        message: err instanceof Error ? err.message : "Experiment failed",
      });
    } finally {
      setBusy(false);
    }
  }

  const finished = stepIndex >= maxStep && stepIndex >= 0;

  return (
    <section>
      <DepthSwitch depth={depth} onChange={setDepth} />

      <form className="composer" onSubmit={runPrompt}>
        <input
          value={prompt}
          maxLength={80}
          onChange={(e) => setPrompt(e.target.value)}
          aria-label="Short sentence"
          placeholder="Type a short sentence"
        />
        <button type="submit" disabled={busy}>
          {busy ? "Running" : "Use this sentence"}
        </button>
      </form>
      <p className="status" role={load.kind === "fallback" || load.kind === "error" ? "alert" : undefined}>
        {load.kind === "ready" && load.source === "live"
          ? "Live run from the local Python experiment."
          : load.kind === "ready"
            ? "Committed sample trace. Type a sentence to run your own."
            : load.kind === "fallback"
              ? load.message
              : load.kind === "error"
                ? load.message
                : "Running the local experiment."}
      </p>

      <div className="prompt-row">
        <div className="kicker">The words that already exist</div>
        {trace.promptTokens.map((tok) => (
          <TokenChip key={`p-${tok.position}`} token={tok} />
        ))}
      </div>

      {policy === null && !showBoth && (
        <article className="lesson" data-depth="learn">
          <h2>{LEARN_01.question}</h2>
          <div className="choice-row">
            <button type="button" className="choice rebuild" onClick={() => choose("rebuild")}>
              <strong>{LEARN_01.rebuild}</strong>
              <span>{LEARN_01.rebuildHint}</span>
            </button>
            <button type="button" className="choice keep" onClick={() => choose("keep")}>
              <strong>{LEARN_01.keep}</strong>
              <span>{LEARN_01.keepHint}</span>
            </button>
          </div>
          <div className="controls">
            <button
              type="button"
              onClick={() => {
                setShowBoth(true);
                setPolicy("rebuild");
                resetDependentState();
              }}
            >
              Run both
            </button>
          </div>
        </article>
      )}

      {(policy !== null || showBoth) && (
        <>
          <div className="policy-bar">
            <button
              type="button"
              className={policy === "rebuild" && !showBoth ? "on" : ""}
              onClick={() => choose("rebuild")}
            >
              {LEARN_01.rebuild}
            </button>
            <button
              type="button"
              className={policy === "keep" && !showBoth ? "on" : ""}
              onClick={() => choose("keep")}
            >
              {LEARN_01.keep}
            </button>
            <button
              type="button"
              className={showBoth ? "on" : ""}
              onClick={() => {
                setShowBoth(true);
                setPolicy("rebuild");
                resetDependentState();
              }}
            >
              Run both
            </button>
          </div>

          {showBoth ? (
            <BothView trace={trace} stepIndex={stepIndex} />
          ) : (
            <OneView
              policy={policy ?? "rebuild"}
              step={step}
              promptLen={trace.promptTokens.length}
            />
          )}

          {step && (
            <div className="generated">
              <span className="kicker" style={{ width: "auto" }}>
                New token
              </span>
              <TokenChip token={step.generatedToken} state="fresh" />
            </div>
          )}

          {generatedSoFar.length > 0 && (
            <div className="output-row">
              <div className="kicker">Spoken so far</div>
              {generatedSoFar.map((tok) => (
                <TokenChip key={`g-${tok.position}`} token={tok} />
              ))}
            </div>
          )}

          {depth === "learn" && (
            <p className="live-count" data-depth="learn">
              Work done again this walk: <b>{workRepeated}</b>
            </p>
          )}

          {seenKeepReuse && policy === "keep" && !showBoth && (
            <aside className="reveal" data-depth="learn">
              <p>{LEARN_01.reveal}</p>
            </aside>
          )}

          <div className="controls">
            <button type="button" className="secondary" onClick={resetWalk}>
              Reset walk
            </button>
            <button type="button" className="secondary" onClick={hardReset}>
              Start over
            </button>
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(maxStep, i + 1))}
              disabled={stepIndex >= maxStep}
            >
              Next token
            </button>
            <span className="step-label">
              {stepIndex < 0 ? "Ready" : `Step ${stepIndex + 1} of ${maxStep + 1}`}
            </span>
          </div>
        </>
      )}

      {finished && showBoth && (
        <div className="compare-end">
          <WhyNumber
            value={trace.modes.naive.totals.kvRowsProjected}
            label="rows rebuilt"
          >
            <p>{joinSeries(naiveSeries)}</p>
          </WhyNumber>
          <span>vs</span>
          <WhyNumber
            value={trace.modes.cached.totals.kvRowsProjected}
            label="rows built"
          >
            <p>{joinSeries(cachedSeries)}</p>
          </WhyNumber>
          <button type="button" onClick={() => setShowMath((v) => !v)}>
            {showMath ? "Hide the math" : "Show the math"}
          </button>
        </div>
      )}

      {showMath && (
        <article className="lesson">
          <h2>{LEARN_01.mathLead}</h2>
          <p>
            Rebuild: {joinSeries(naiveSeries)} = {trace.modes.naive.totals.kvRowsProjected}
          </p>
          <p>
            Keep: {joinSeries(cachedSeries)} = {trace.modes.cached.totals.kvRowsProjected}
          </p>
          <p>
            The last spoken token is never fed back, so it is not counted as stored
            work.
          </p>
        </article>
      )}

      {depth === "inspect" && (
        <div className="stats">
          <WhyNumber
            value={step ? step.kvRowsProjected : modeTrace.totals.kvRowsProjected}
            label={step ? "rows built this step" : "rows built in total"}
          >
            <p>
              {step
                ? `${step.newlyComputed.length} blocks entered the bench.`
                : joinSeries(policy === "keep" ? cachedSeries : naiveSeries)}
            </p>
          </WhyNumber>
          <WhyNumber
            value={step ? step.kvRowsReused : modeTrace.totals.kvRowsReused}
            label={step ? "rows reused this step" : "rows reused in total"}
          >
            <p>Counted from the trace steps, not from a page constant.</p>
          </WhyNumber>
          <WhyNumber
            value={step ? step.logicalKvBytes : modeTrace.totals.peakLogicalKvBytes}
            unit="B"
            label="logical stored payload"
          >
            <p>
              {step
                ? `${step.cacheSizeTokens} tokens × ${trace.config.dModel} values × K+V × 4 bytes = ${logicalKvBytes(step.cacheSizeTokens, trace.config.dModel)}`
                : `${modeTrace.totals.peakCacheTokens} tokens × ${trace.config.dModel} × 2 × 4`}
            </p>
          </WhyNumber>
        </div>
      )}

      {depth === "prove" && (
        <>
          <article className="lesson">
            <h2>What must stay true</h2>
            <p>
              Both policies must emit the same next tokens and the same raw scores.
              A matching word alone is not enough.
            </p>
            <p>
              Stored work may depend on the token, its place, and earlier context.
              It does not depend on token identity alone.
            </p>
          </article>
          <HoodDrawer>
            <p>{trace.measurementDisclaimer}</p>
            <p>
              Counts are rows of stored work, not total model math. The toy is{" "}
              {trace.config.dModel} wide with {trace.config.nHeads} heads.
            </p>
          </HoodDrawer>
        </>
      )}
    </section>
  );
}

function OneView({
  policy,
  step,
  promptLen,
}: {
  policy: Policy;
  step: InferTabTrace["modes"]["naive"]["steps"][number] | undefined;
  promptLen: number;
}) {
  return (
    <div className={`stage ${policy === "keep" ? "cached" : "naive"}`}>
      <div className="panel workshop">
        <h2>{policy === "rebuild" ? "Every past block comes back" : "Only the newest block is built"}</h2>
        {step ? (
          <div className="chip-row">
            {step.newlyComputed.map((block) => (
              <TokenChip
                key={`c-${block.position}`}
                token={block}
                state="reconstructing"
              />
            ))}
          </div>
        ) : (
          <p className="empty-note">{LEARN_01.waste}</p>
        )}
      </div>
      <div className="panel shelf">
        <h2>
          {policy === "keep"
            ? step
              ? "Stored, new, and reused"
              : "Empty shelf, waiting"
            : "Nothing is kept"}
        </h2>
        {policy === "keep" && step ? (
          <div className="chip-row">
            {step.reused.map((block) => (
              <TokenChip key={`r-${block.position}`} token={block} state="reused" />
            ))}
            {step.newlyComputed.map((block) => (
              <TokenChip key={`s-${block.position}`} token={block} state="fresh" />
            ))}
          </div>
        ) : (
          <p className="empty-note">
            {policy === "rebuild"
              ? "The bench is cleared after each word."
              : `The first pass will store ${promptLen} blocks.`}
          </p>
        )}
      </div>
    </div>
  );
}

function BothView({
  trace,
  stepIndex,
}: {
  trace: InferTabTrace;
  stepIndex: number;
}) {
  return (
    <div className="both">
      <p className="empty-note">{LEARN_01.bothLead}</p>
      {(["naive", "cached"] as const).map((id) => {
        const mode = trace.modes[id];
        const step = stepIndex >= 0 ? mode.steps[stepIndex] : undefined;
        return (
          <div key={id} className={`stage ${id === "cached" ? "cached" : "naive"}`}>
            <h3>{id === "naive" ? LEARN_01.rebuild : LEARN_01.keep}</h3>
            <div className="panel workshop">
              <div className="chip-row">
                {step?.newlyComputed.map((block) => (
                  <TokenChip
                    key={`${id}-c-${block.position}`}
                    token={block}
                    state="reconstructing"
                  />
                ))}
              </div>
            </div>
            <div className="panel shelf">
              <div className="chip-row">
                {step?.reused.map((block) => (
                  <TokenChip
                    key={`${id}-r-${block.position}`}
                    token={block}
                    state="reused"
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
