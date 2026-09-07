"use client";

import { useMemo, useState } from "react";
import { DepthSwitch, type Depth } from "@/components/DepthSwitch";
import { HoodDrawer } from "@/components/HoodDrawer";
import { WhyNumber } from "@/components/WhyNumber";
import { LEARN_03 } from "@/lib/copy";
import {
  D_HEAD,
  arithmeticIntensity,
  decodeAttentionFlopsPerHead,
  decodeLogicalBytes,
  formatIntensity,
  prefillAttentionFlopsPerHead,
  prefillLogicalBytes,
} from "@/lib/account";
import type { ArithmeticMemoryTrace } from "@/lib/schema";

type Job = "prefill" | "decode";
type DType = "float32" | "float16";
type Stage = "math" | "data" | "ratio";

export function ArithmeticPlayground({
  initialTrace,
}: {
  initialTrace: ArithmeticMemoryTrace;
}) {
  const [p, setP] = useState(initialTrace.config.promptLength);
  const [job, setJob] = useState<Job>("prefill");
  const [dtype, setDtype] = useState<DType>("float32");
  const [stage, setStage] = useState<Stage>("math");
  const [seenMath, setSeenMath] = useState(true);
  const [seenData, setSeenData] = useState(false);
  const [depth, setDepth] = useState<Depth>("learn");

  const t = p + 1;
  const bpe = dtype === "float16" ? 2 : 4;
  const account = useMemo(() => {
    const flops =
      job === "prefill"
        ? prefillAttentionFlopsPerHead(p, D_HEAD)
        : decodeAttentionFlopsPerHead(t, D_HEAD);
    const bytes =
      job === "prefill"
        ? prefillLogicalBytes(p, D_HEAD, bpe)
        : decodeLogicalBytes(t, D_HEAD, bpe);
    return {
      flops,
      bytes,
      intensity: arithmeticIntensity(flops, bytes.logicalBytesConsidered),
      display: formatIntensity(flops, bytes.logicalBytesConsidered),
    };
  }, [job, p, t, bpe]);

  function go(next: Stage) {
    setStage(next);
    if (next === "math") setSeenMath(true);
    if (next === "data") setSeenData(true);
  }

  const ready = seenMath && seenData;

  return (
    <section>
      <DepthSwitch depth={depth} onChange={setDepth} />

      <div className="p-picker" role="group" aria-label="Sequence length">
        {initialTrace.scaling.map((item) => (
          <button
            key={item.P}
            type="button"
            className={p === item.P ? "on" : ""}
            onClick={() => setP(item.P)}
          >
            {item.P} tokens
          </button>
        ))}
      </div>

      <div className="toggle" role="group" aria-label="Job">
        <button
          type="button"
          className={job === "prefill" ? "active-naive" : ""}
          onClick={() => setJob("prefill")}
        >
          <strong>Read the room</strong>
          <span>Many questions at once</span>
        </button>
        <button
          type="button"
          className={job === "decode" ? "active-cached" : ""}
          onClick={() => setJob("decode")}
        >
          <strong>One new word</strong>
          <span>One question, long shelf</span>
        </button>
      </div>

      <div className="p-picker" role="group" aria-label="Number size">
        <button
          type="button"
          className={dtype === "float32" ? "on" : ""}
          onClick={() => setDtype("float32")}
        >
          4-byte numbers
        </button>
        <button
          type="button"
          className={dtype === "float16" ? "on" : ""}
          onClick={() => setDtype("float16")}
        >
          2-byte numbers
        </button>
      </div>

      {depth === "learn" && (
        <article className="lesson" data-depth="learn">
          <h2>
            {stage === "math"
              ? LEARN_03.mathAsk
              : stage === "data"
                ? LEARN_03.dataAsk
                : LEARN_03.divideAsk}
          </h2>
        </article>
      )}

      {stage === "math" && (
        <MathPile job={job} flops={account.flops} p={p} />
      )}
      {stage === "data" && (
        <DataPile
          job={job}
          q={account.bytes.qBytes}
          k={account.bytes.kBytes}
          v={account.bytes.vBytes}
          count={job === "prefill" ? p : t}
        />
      )}
      {stage === "ratio" && ready && (
        <div className="panel intensity-panel">
          <p className="kicker">{LEARN_03.divideAsk}</p>
          <p className="intensity-eq" aria-live="polite">
            <span>
              {account.flops} <small>math units</small>
            </span>
            <span className="op">/</span>
            <span>
              {account.bytes.logicalBytesConsidered} <small>data units</small>
            </span>
            <span className="op">=</span>
            <span>
              {account.display.split(" = ")[1]}
            </span>
          </p>
          <aside className="reveal">
            <p>{LEARN_03.intensityName}</p>
          </aside>
        </div>
      )}
      {stage === "ratio" && !ready && (
        <p className="empty-note">Visit math work and data supply first.</p>
      )}

      <div className="controls">
        <button
          type="button"
          className="secondary"
          disabled={stage === "math"}
          onClick={() => go(stage === "ratio" ? "data" : "math")}
        >
          Back
        </button>
        <button
          type="button"
          disabled={stage === "ratio"}
          onClick={() => go(stage === "math" ? "data" : "ratio")}
        >
          Next
        </button>
      </div>

      {depth === "inspect" && (
        <div className="stats">
          <WhyNumber value={account.flops} unit="FLOPs" label="attention math per head">
            <p>
              {job === "prefill"
                ? `4 × ${p} × ${p} × ${D_HEAD}`
                : `4 × ${t} × ${D_HEAD}`}
            </p>
          </WhyNumber>
          <WhyNumber
            value={account.bytes.logicalBytesConsidered}
            unit="B"
            label="Q + K + V"
          >
            <p>
              Q {account.bytes.qBytes} + K {account.bytes.kBytes} + V{" "}
              {account.bytes.vBytes}
            </p>
          </WhyNumber>
          <WhyNumber
            value={Number(account.intensity.toFixed(3))}
            unit="FLOPs/byte"
            label="work per byte"
          >
            <p>{account.display}</p>
          </WhyNumber>
        </div>
      )}

      {depth === "prove" && (
        <>
          <article className="lesson">
            <h2>Assumptions</h2>
            <p>
              One multiply plus one add is about two math units. Halving the
              number size halves the logical payload and does not change the
              algebra.
            </p>
            <p>
              These payloads are not measured chip traffic. This ratio is not a
              speed measurement.
            </p>
          </article>
          <HoodDrawer>
            <p>{initialTrace.measurementDisclaimer}</p>
            <p>{initialTrace.flopConvention.warning}</p>
          </HoodDrawer>
        </>
      )}
    </section>
  );
}

function MathPile({ job, flops, p }: { job: Job; flops: number; p: number }) {
  const shown = Math.min(job === "prefill" ? 12 : 8, Math.max(4, Math.round(flops / 400)));
  return (
    <div className="factory-box" role="img" aria-label={`${flops} math units`}>
      <p className="kicker">Each tile is a multiply then an add</p>
      <div className="factory-ops">
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="mac" style={{ animationDelay: `${i * 60}ms` }}>
            × +
          </span>
        ))}
      </div>
      <p className="factory-count">
        {flops} <span>math units</span>
      </p>
      <p className="empty-note">
        {job === "prefill" ? `${p} questions share the same stored labels.` : "One question reads a long shelf."}
      </p>
    </div>
  );
}

function DataPile({
  job,
  q,
  k,
  v,
  count,
}: {
  job: Job;
  q: number;
  k: number;
  v: number;
  count: number;
}) {
  const blocks = Math.min(count, 16);
  return (
    <div className="conveyor-stage">
      <div className="panel shelf">
        <h2>Stored values</h2>
        <div className="conveyor-track">
          {Array.from({ length: blocks }, (_, i) => (
            <span
              key={i}
              className="conveyor-block"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              {i % 2 === 0 ? "K" : "V"}
            </span>
          ))}
        </div>
      </div>
      <div className="panel workshop">
        <ul className="byte-list">
          <li>
            <b>{q}</b>
            <span>question</span>
          </li>
          <li>
            <b>{k}</b>
            <span>labels</span>
          </li>
          <li>
            <b>{v}</b>
            <span>contents</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
