"use client";

import { useMemo, useState } from "react";
import { TokenChip } from "@/components/TokenChip";
import { DepthSwitch, type Depth } from "@/components/DepthSwitch";
import { HoodDrawer } from "@/components/HoodDrawer";
import { WhyNumber } from "@/components/WhyNumber";
import { LEARN_02 } from "@/lib/copy";
import { causalCells, maskedCells, triangularSum } from "@/lib/account";
import type { PrefillDecodeStage, PrefillDecodeTrace } from "@/lib/schema";

type Job = "prefill" | "decode";

export function PrefillPlayground({
  initialTrace,
}: {
  initialTrace: PrefillDecodeTrace;
}) {
  const [p, setP] = useState(initialTrace.config.promptLength);
  const [job, setJob] = useState<Job>("prefill");
  const [query, setQuery] = useState<number | null>(null);
  const [cell, setCell] = useState<{ i: number; j: number } | null>(null);
  const [depth, setDepth] = useState<Depth>("learn");

  const row = useMemo(
    () => initialTrace.scaling.find((item) => item.promptLength === p),
    [initialTrace.scaling, p],
  );
  const detail = p === initialTrace.config.promptLength;
  const prefill = (row?.prefill ?? initialTrace.prefill) as PrefillDecodeStage;
  const decode = (row?.decode ?? initialTrace.decode) as PrefillDecodeStage;
  const tokens = detail ? initialTrace.promptTokens : [];
  const t = p + 1;

  function selectLength(next: number) {
    setP(next);
    setQuery(null);
    setCell(null);
    setJob("prefill");
  }

  return (
    <section>
      <DepthSwitch depth={depth} onChange={setDepth} />

      <div className="p-picker" role="group" aria-label="Prompt length">
        {initialTrace.scaling.map((item) => (
          <button
            key={item.promptLength}
            type="button"
            className={p === item.promptLength ? "on" : ""}
            onClick={() => selectLength(item.promptLength)}
          >
            {item.promptLength} tokens
          </button>
        ))}
      </div>

      <div className="toggle" role="group" aria-label="Which job">
        <button
          type="button"
          className={job === "prefill" ? "active-naive" : ""}
          onClick={() => {
            setJob("prefill");
            setCell(null);
          }}
        >
          <strong>Read the room</strong>
          <span>Every existing word can ask at once</span>
        </button>
        <button
          type="button"
          className={job === "decode" ? "active-cached" : ""}
          onClick={() => {
            setJob("decode");
            setQuery(null);
            setCell(null);
          }}
        >
          <strong>Write one word</strong>
          <span>One new question, a longer shelf</span>
        </button>
      </div>

      {detail && (
        <div className="prompt-row">
          {tokens.map((tok) => (
            <button
              key={`p-${tok.position}`}
              type="button"
              className={`token-pick ${query === tok.position ? "on" : ""}`}
              onClick={() => {
                setJob("prefill");
                setQuery(tok.position);
                setCell(null);
              }}
            >
              <TokenChip token={tok} />
            </button>
          ))}
        </div>
      )}

      {depth === "learn" && (
        <article className="lesson" data-depth="learn">
          <h2>{job === "prefill" ? LEARN_02.ask : LEARN_02.decodeAsk}</h2>
          <p>{LEARN_02.grow}</p>
        </article>
      )}

      {job === "prefill" ? (
        <PrefillBoard
          size={p}
          query={query}
          cell={cell}
          onQuery={setQuery}
          onCell={setCell}
        />
      ) : (
        <DecodeRow length={t} />
      )}

      {cell && cell.j > cell.i && (
        <aside className="reveal warn" data-depth="learn">
          <p>{LEARN_02.future}</p>
        </aside>
      )}

      <div className="shelf-grow panel shelf">
        <h2>{job === "prefill" ? `${p} stored rows` : `${t} stored rows`}</h2>
        <div className="shelf-bar" aria-hidden="true">
          {Array.from({ length: Math.min(job === "prefill" ? p : t, 28) }, (_, i) => (
            <span key={i} className="shelf-tick reused" />
          ))}
        </div>
      </div>

      {depth === "inspect" && (
        <div className="stats">
          <WhyNumber
            value={prefill.attentionScoreCellsPerHead}
            label="score cells on the square"
          >
            <p>
              {p} questions × {p} labels = {p * p}
            </p>
          </WhyNumber>
          <WhyNumber value={prefill.attentionScoreCellsCausal} label="usable cells">
            <p>
              1 + 2 + … + {p} = {triangularSum(p)}
            </p>
            <p>Each cell has key place ≤ question place.</p>
          </WhyNumber>
          <WhyNumber value={decode.attentionScoreCellsPerHead} label="cells on the decode row">
            <p>1 new question × {t} stored labels = {t}</p>
          </WhyNumber>
        </div>
      )}

      {depth === "prove" && (
        <>
          <article className="lesson">
            <h2>Mask rules</h2>
            <p>
              Usable cells: {causalCells(p).length}. Forbidden cells: {maskedCells(p).length}.
              Together they are {p * p}.
            </p>
            <p>
              Changing an earlier word may change later answers. Changing a later
              word cannot rewrite an earlier answer.
            </p>
          </article>
          <HoodDrawer>
            <p>{initialTrace.measurementDisclaimer}</p>
            <p>
              The square counts attention-score cells per head, not the cost of
              the whole model.
            </p>
          </HoodDrawer>
        </>
      )}
    </section>
  );
}

function PrefillBoard({
  size,
  query,
  cell,
  onQuery,
  onCell,
}: {
  size: number;
  query: number | null;
  cell: { i: number; j: number } | null;
  onQuery: (i: number) => void;
  onCell: (next: { i: number; j: number }) => void;
}) {
  const n = Math.min(size, 16);
  if (size > 16) {
    return (
      <div className="big-square" aria-label={`Score board ${size} by ${size}`}>
        <span>
          {size} × {size}
        </span>
        <small>score cells per head</small>
      </div>
    );
  }
  return (
    <div className="board-wrap">
      <div
        className="causal-grid interactive"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
        role="grid"
        aria-label={`Score board ${n} by ${n}`}
      >
        {Array.from({ length: n * n }, (_, idx) => {
          const i = Math.floor(idx / n);
          const j = idx % n;
          const future = j > i;
          const allowed = query === null ? !future : !future && i === query && j <= query;
          const dim = query !== null && i !== query;
          const selected = cell?.i === i && cell?.j === j;
          return (
            <button
              key={idx}
              type="button"
              role="gridcell"
              className={`cell ${future ? "future" : "past"} ${allowed ? "lit" : ""} ${dim ? "dim" : ""} ${selected ? "picked" : ""}`}
              aria-label={
                future
                  ? `question ${i} cannot read later word ${j}`
                  : `question ${i} may read word ${j}`
              }
              onClick={() => {
                onQuery(i);
                onCell({ i, j });
              }}
            />
          );
        })}
      </div>
      <div className="mask-legend">
        <span className="swatch past" /> allowed
        {" · "}
        <span className="swatch future" /> not yet
      </div>
    </div>
  );
}

function DecodeRow({ length }: { length: number }) {
  const n = Math.min(length, 24);
  return (
    <div className="decode-row-board">
      <p className="kicker">One question, {length} stored labels</p>
      <div className="decode-cells">
        {Array.from({ length: n }, (_, j) => (
          <span key={j} className="cell past lit" />
        ))}
        {length > n && <span className="empty-note">+ {length - n}</span>}
      </div>
    </div>
  );
}
