"use client";

import { useEffect, useMemo, useState } from "react";
import { TokenChip } from "@/components/TokenChip";
import {
  assertValidTrace,
  type InferTabTrace,
  type ModeId,
} from "@/lib/schema";

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; source: "sample" | "live" }
  | { kind: "error"; message: string };

export function Playground({ initialTrace }: { initialTrace: InferTabTrace }) {
  const [prompt, setPrompt] = useState(initialTrace.prompt);
  const [trace, setTrace] = useState<InferTabTrace>(initialTrace);
  const [mode, setMode] = useState<ModeId>("naive");
  const [stepIndex, setStepIndex] = useState(-1);
  const [load, setLoad] = useState<LoadState>({ kind: "ready", source: "sample" });
  const [busy, setBusy] = useState(false);
  const [seenMemory, setSeenMemory] = useState(false);

  const modeTrace = trace?.modes[mode];
  const step = stepIndex >= 0 ? modeTrace?.steps[stepIndex] : undefined;
  const maxStep = (modeTrace?.steps.length ?? 1) - 1;

  useEffect(() => {
    if (mode === "cached" && stepIndex >= 0) setSeenMemory(true);
  }, [mode, stepIndex]);

  const generatedSoFar = useMemo(() => {
    if (!modeTrace || stepIndex < 0) return [];
    return modeTrace.generatedTokens.slice(0, stepIndex + 1);
  }, [modeTrace, stepIndex]);

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
      setStepIndex(-1);
      setSeenMemory(false);
      if (data.fallback) {
        setLoad({
          kind: "error",
          message:
            "Could not run the local Python experiment. Showing the sample trace instead.",
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

  function resetWalk() {
    setStepIndex(-1);
  }

  if (!modeTrace) {
    return <p className="status">Trace is missing a mode.</p>;
  }

  const totals = modeTrace.totals;
  const showReveal = seenMemory && mode === "cached" && stepIndex >= 0;

  return (
    <section>
      <form className="composer" onSubmit={runPrompt}>
        <input
          value={prompt}
          maxLength={80}
          onChange={(e) => setPrompt(e.target.value)}
          aria-label="Short sentence"
          placeholder="Type a short sentence"
        />
        <button type="submit" disabled={busy}>
          {busy ? "Thinking…" : "Watch it think"}
        </button>
      </form>
      <p className="status">
        {load.kind === "ready" && load.source === "live"
          ? "Fresh run from the local Python experiment."
          : load.kind === "ready"
            ? "Showing the committed sample trace. Type a sentence to run your own."
            : load.kind === "error"
              ? load.message
              : ""}
      </p>

      <div className="toggle" role="tablist" aria-label="Memory switch">
        <button
          type="button"
          className={mode === "naive" ? "active-naive" : ""}
          onClick={() => {
            setMode("naive");
            setStepIndex(-1);
          }}
        >
          <strong>Forget everything each time</strong>
          <span>Past tokens flow back through attention and get rebuilt.</span>
        </button>
        <button
          type="button"
          className={mode === "cached" ? "active-cached" : ""}
          onClick={() => {
            setMode("cached");
            setStepIndex(-1);
          }}
        >
          <strong>Keep what we already learned</strong>
          <span>Finished blocks sit on a shelf and get reused.</span>
        </button>
      </div>

      <div className="prompt-row">
        <div className="kicker">Your words</div>
        {trace.promptTokens.map((tok) => (
          <TokenChip key={`p-${tok.position}`} token={tok} />
        ))}
      </div>

      <div className={`stage ${mode}`}>
        <div className="panel workshop">
          <h2>
            {mode === "naive"
              ? "Rebuild bench — every past block is reconstructed"
              : "Rebuild bench — only the new block is built"}
          </h2>
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
            <p className="empty-note">
              Press next token. Orange dashed blocks are work happening now.
            </p>
          )}
        </div>

        <div className="panel shelf">
          <h2>
            {showReveal
              ? "Memory shelf — this is the KV cache"
              : mode === "cached"
                ? "Memory shelf — things we already learned"
                : "Memory shelf — empty, nothing is kept"}
          </h2>
          {mode === "cached" && step ? (
            <div className="chip-row">
              {step.reused.map((block) => (
                <TokenChip
                  key={`r-${block.position}`}
                  token={block}
                  state="reused"
                />
              ))}
              {step.newlyComputed.map((block) => (
                <TokenChip
                  key={`s-${block.position}`}
                  token={block}
                  state="fresh"
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">
              {mode === "naive"
                ? "Without memory, last step’s work is thrown away. The next token starts from zero."
                : "The first step fills the shelf. Later steps reuse it."}
            </p>
          )}
        </div>
      </div>

      {step && (
        <div className="generated">
          <span className="kicker" style={{ width: "auto" }}>
            New token
          </span>
          <TokenChip token={step.generatedToken} state="fresh" />
          <span>at position {step.position}</span>
        </div>
      )}

      {generatedSoFar.length > 0 && (
        <div className="output-row">
          <div className="kicker">Spoken so far (toy words — watch the memory)</div>
          {generatedSoFar.map((tok) => (
            <TokenChip key={`g-${tok.position}`} token={tok} />
          ))}
        </div>
      )}

      <div className="controls">
        <button type="button" className="secondary" onClick={resetWalk}>
          Reset walk
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

      <div className="stats">
        <div className="stat">
          <b>{step ? step.kvRowsProjected : totals.kvRowsProjected}</b>
          <span>
            {step
              ? "K/V rows projected this step"
              : "K/V rows projected in total"}
          </span>
        </div>
        <div className="stat">
          <b>{step ? step.kvRowsReused : totals.kvRowsReused}</b>
          <span>
            {step ? "K/V rows reused this step" : "K/V rows reused in total"}
          </span>
        </div>
        <div className="stat">
          <b>{step ? step.cacheSizeTokens : totals.peakCacheTokens}</b>
          <span>Tokens on the shelf</span>
        </div>
        <div className="stat">
          <b>{step ? step.logicalKvBytes : totals.peakLogicalKvBytes}</b>
          <span>Logical K/V payload (float32), not process memory</span>
        </div>
      </div>

      {showReveal && (
        <aside className="reveal">
          <p>
            Those teal blocks were not rebuilt. The model read numbers it had
            already stored. <em>That store is the KV cache.</em>
          </p>
        </aside>
      )}

      <p className="disclaimer">{trace.measurementDisclaimer}</p>
      <p className="footnote">
        Counts are K/V rows, not FLOPs. Without memory the model also rebuilds
        Q for the whole prefix; with memory, after the first step, Q is only
        for the new token. This toy has {trace.config.dModel} numbers per
        token, {trace.config.nHeads} attention heads, and 1 layer. The
        generated words are random — watch which K/V rows get reconstructed.
      </p>
    </section>
  );
}
