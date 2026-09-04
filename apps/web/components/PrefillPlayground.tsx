"use client";

import { useMemo, useState } from "react";
import { TokenChip } from "@/components/TokenChip";
import type { PrefillDecodeTrace } from "@/lib/schema";

function shape(value: number[] | undefined): string {
  if (!value) return "—";
  return `[${value.join(" × ")}]`;
}

export function PrefillPlayground({
  initialTrace,
}: {
  initialTrace: PrefillDecodeTrace;
}) {
  const [stage, setStage] = useState<"prefill" | "decode">("prefill");
  const [seenPrefill, setSeenPrefill] = useState(false);
  const [seenDecode, setSeenDecode] = useState(false);
  const [p, setP] = useState(initialTrace.config.promptLength);

  const row = useMemo(
    () => initialTrace.scaling.find((item) => item.promptLength === p),
    [initialTrace.scaling, p],
  );

  const detail = p === initialTrace.config.promptLength;
  const prefill = row?.prefill ?? initialTrace.prefill;
  const decode = row?.decode ?? initialTrace.decode;
  const tokens = detail ? initialTrace.promptTokens : [];
  const showGrid = p <= 16;

  return (
    <section>
      <div className="p-picker" role="group" aria-label="Prompt length">
        {initialTrace.scaling.map((item) => (
          <button
            key={item.promptLength}
            type="button"
            className={p === item.promptLength ? "on" : ""}
            onClick={() => {
              setP(item.promptLength);
              setStage("prefill");
            }}
          >
            {item.promptLength} tokens
          </button>
        ))}
      </div>

      {detail && (
        <div className="prompt-row">
          <div className="kicker">Existing words</div>
          {tokens.map((tok) => (
            <TokenChip key={`p-${tok.position}`} token={tok} />
          ))}
        </div>
      )}

      <div className="toggle" role="tablist" aria-label="Stage">
        <button
          type="button"
          className={stage === "prefill" ? "active-naive" : ""}
          onClick={() => {
            setStage("prefill");
            setSeenPrefill(true);
          }}
        >
          <strong>Read what already exists</strong>
          <span>Many tokens enter attention together.</span>
        </button>
        <button
          type="button"
          className={stage === "decode" ? "active-cached" : ""}
          onClick={() => {
            setStage("decode");
            setSeenDecode(true);
          }}
        >
          <strong>Write one new piece</strong>
          <span>One new question reads a long memory shelf.</span>
        </button>
      </div>

      {stage === "prefill" ? (
        <div className="panel workshop">
          <h2>
            {seenPrefill
              ? "This pass is prefill — a P × P attention grid"
              : "Everyone who is already here can be read at once"}
          </h2>
          <p className="empty-note">
            Queries: {prefill.qRowsProjected} · Keys: {prefill.kRowsProjected} ·
            Score cells per head: {prefill.attentionScoreElementsPerHead}
          </p>
          <div className="shape-line">
            X {shape(prefill.shapes.X)} · Q {shape(prefill.shapes.Q)} · K{" "}
            {shape(prefill.shapes.K)} · V {shape(prefill.shapes.V)}
          </div>
          {showGrid ? (
            <CausalGrid size={p} />
          ) : (
            <div className="big-square" aria-hidden="true">
              <span>
                {p} × {p}
              </span>
              <small>many queries, many keys</small>
            </div>
          )}
        </div>
      ) : (
        <div className="stage cached">
          <div className="panel workshop">
            <h2>
              {seenDecode
                ? "This pass is decode — one query, long history"
                : "Only the newest token is asking"}
            </h2>
            <p className="empty-note">
              Q_new {shape(decode.shapes.Q_new)} against K_cache{" "}
              {shape(decode.shapes.K_cache)}
            </p>
            <div className="chip-row">
              <span className="chip reconstructing">Q new</span>
            </div>
          </div>
          <div className="panel shelf">
            <h2>Remembered K/V shelf · {p + 1} rows</h2>
            <div className="shelf-bar" style={{ ["--n" as string]: p + 1 }}>
              {Array.from({ length: Math.min(p + 1, 24) }, (_, i) => (
                <span key={i} className="shelf-tick reused" />
              ))}
              {p + 1 > 24 && <span className="empty-note">+ {p + 1 - 24}</span>}
            </div>
            <p className="empty-note">
              Score cells per head: {decode.attentionScoreElementsPerHead} (a
              single row, not a square)
            </p>
          </div>
        </div>
      )}

      <div className="controls">
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setStage("prefill");
            setSeenPrefill(true);
          }}
        >
          Show reading
        </button>
        <button
          type="button"
          onClick={() => {
            setStage("decode");
            setSeenDecode(true);
          }}
        >
          Then write one
        </button>
      </div>

      {(seenPrefill || seenDecode) && (
        <aside className="reveal">
          <p>
            {seenPrefill && (
              <>
                Reading the whole existing context is <em>prefill</em>.{" "}
              </>
            )}
            {seenDecode && (
              <>
                Using that remembered context to create the next token is{" "}
                <em>decode</em>.
              </>
            )}
          </p>
        </aside>
      )}

      <div className="stats">
        <div className="stat">
          <b>{stage === "prefill" ? shape(prefill.shapes.scoresPerHead) : shape(decode.shapes.scoresPerHead)}</b>
          <span>Attention scores per head</span>
        </div>
        <div className="stat">
          <b>
            {stage === "prefill"
              ? prefill.logicalKvBytesWritten
              : decode.logicalKvBytesWritten}
          </b>
          <span>Logical K/V bytes written</span>
        </div>
        <div className="stat">
          <b>
            {stage === "prefill"
              ? prefill.logicalKvBytesAvailable
              : decode.logicalKvBytesAvailable}
          </b>
          <span>Logical K/V bytes on the shelf</span>
        </div>
      </div>

      <p className="kicker">How the grid grows (still not a speed claim)</p>
      <div className="scale-list">
        {initialTrace.scaling.map((item) => (
          <div key={item.promptLength} className={item.promptLength === p ? "on" : ""}>
            <b>P={item.promptLength}</b>
            <span>
              read {item.prefill.attentionScoreElementsPerHead} cells · write{" "}
              {item.decode.attentionScoreElementsPerHead} cells
            </span>
          </div>
        ))}
      </div>

      <p className="disclaimer">{initialTrace.measurementDisclaimer}</p>
    </section>
  );
}

function CausalGrid({ size }: { size: number }) {
  const n = Math.min(size, 16);
  return (
    <div
      className="causal-grid"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      aria-label={`Causal attention grid ${n} by ${n}`}
    >
      {Array.from({ length: n * n }, (_, idx) => {
        const i = Math.floor(idx / n);
        const j = idx % n;
        const future = j > i;
        return (
          <span
            key={idx}
            className={future ? "cell future" : "cell past"}
            title={future ? "masked future" : `query ${i} · key ${j}`}
          />
        );
      })}
    </div>
  );
}
