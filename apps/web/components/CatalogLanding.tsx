"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MachineBoard, AttentionBoard, PayloadBoard } from "./MachineBoard";
import { MachinePresentation, useMachine } from "./MachineProvider";
import {
  BEAT_MS,
  CATALOG_PLAYS,
  LOCKED_ROOMS,
  STEP_MS,
  catalogObservation,
  prefersReducedMotion,
  type CatalogPlayId,
} from "@/lib/catalog/plays";
import { LESSON_PATHS } from "@/lib/simulation/journey";

/** Auto-run the six visual languages from recorded traces; the map is the first required choice. */
export function CatalogLanding() {
  const { traces } = useMachine();
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const frame = catalogObservation(traces, elapsedMs);
  const interval = reducedMotion ? BEAT_MS : STEP_MS;

  useEffect(() => {
    setReducedMotion(prefersReducedMotion());
    const media =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    const sync = () => setReducedMotion(prefersReducedMotion());
    media?.addEventListener("change", sync);
    return () => media?.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const handle = window.setInterval(
      () => setElapsedMs((current) => current + interval),
      interval,
    );
    return () => window.clearInterval(handle);
  }, [playing, interval]);

  return (
    <section
      className="catalog"
      aria-label="InferTab visual catalog"
      data-playing={playing}
      data-catalog-play={frame.play.id}
      data-reduced-motion={reducedMotion}
    >
      <h1>One inference step</h1>
      <div className="catalog-stage">
        <p className="catalog-label" role="status">
          {frame.play.label}
        </p>
        <MachinePresentation traces={traces} state={frame.state}>
          <div
            className="catalog-scene"
            data-catalog-board={frame.play.board}
          >
            {frame.play.board === "machine" && (
              <MachineBoard
                lesson={frame.play.lesson}
                strategy={frame.play.strategy}
              />
            )}
            {frame.play.board === "attention" && (
              <AttentionBoard strategy={frame.play.strategy} />
            )}
            {frame.play.board === "payload" && (
              <PayloadBoard strategy={frame.play.strategy} />
            )}
          </div>
        </MachinePresentation>
        <div className="catalog-transport">
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setElapsedMs(0);
              setPlaying(true);
            }}
          >
            Replay
          </button>
        </div>
      </div>
      <CatalogMap current={frame.play.id} />
      <p className="catalog-start">
        <Link href={LESSON_PATHS["01"]}>Start from the first principle</Link>
      </p>
    </section>
  );
}

/** Always-visible map of the six open plays and later locked rooms. */
function CatalogMap({ current }: { current: CatalogPlayId }) {
  return (
    <nav className="catalog-map" aria-label="Visual plays">
      <ol className="catalog-plays">
        {CATALOG_PLAYS.map((play) => (
          <li key={play.id}>
            <Link
              href={play.href}
              data-play={play.id}
              data-current={play.id === current}
            >
              {play.label}
            </Link>
          </li>
        ))}
      </ol>
      <ol className="catalog-locked">
        {LOCKED_ROOMS.map((room) => (
          <li key={room.id}>
            <span aria-disabled="true">
              {room.label}
              <small>Later</small>
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
