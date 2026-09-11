"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MachineBoard, AttentionBoard, PayloadBoard } from "./MachineBoard";
import { MachinePresentation, useMachine } from "./MachineProvider";
import {
  BEAT_MS,
  CATALOG_PLAYS,
  LOCKED_ROOMS,
  STEP_MS,
  catalogObservation,
  nextCatalogElapsed,
  prefersReducedMotion,
  replayCatalogElapsed,
  type CatalogPlayId,
} from "@/lib/catalog/plays";
import { LESSON_PATHS } from "@/lib/simulation/journey";

/** Mark only the named specimen so the rest of the board stays readable. */
function lightCatalogFocus(root: HTMLElement, ids: readonly string[]) {
  root.querySelectorAll("[data-catalog-lit]").forEach((node) => {
    node.removeAttribute("data-catalog-lit");
  });
  for (const id of ids) {
    root
      .querySelectorAll(`[data-object-id="${CSS.escape(id)}"]`)
      .forEach((node) => node.setAttribute("data-catalog-lit", "true"));
  }
}

/** Ignore keys that already belong to a focused control. */
function isKeyedControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest("button, a, input, textarea, select") !== null
  );
}

/** Auto-run the six visual languages from recorded traces; the map is the first required choice. */
export function CatalogLanding() {
  const { traces } = useMachine();
  const router = useRouter();
  const sceneRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const frame = catalogObservation(traces, elapsedMs);
  const interval = reducedMotion ? BEAT_MS / 2 : STEP_MS;

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

  useEffect(() => {
    const root = sceneRef.current;
    if (root) lightCatalogFocus(root, frame.focusIds);
  }, [frame.focusIds, frame.play.id, frame.phase, frame.state]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const keyed = isKeyedControl(event.target);
      if (
        event.key === " " ||
        event.key === "p" ||
        event.key === "P" ||
        event.key === "k" ||
        event.key === "K"
      ) {
        if (keyed && event.key === " ") return;
        event.preventDefault();
        setPlaying((current) => !current);
        return;
      }
      if (event.key === "n" || event.key === "N" || event.key === "ArrowRight") {
        if (keyed && event.key === "ArrowRight") return;
        event.preventDefault();
        setElapsedMs((current) => nextCatalogElapsed(current));
        return;
      }
      if (event.key === "r" || event.key === "R") {
        if (keyed) return;
        event.preventDefault();
        setElapsedMs((current) => replayCatalogElapsed(current));
        setPlaying(true);
        return;
      }
      if (event.key === "Enter" && !keyed) {
        event.preventDefault();
        router.push(frame.play.href);
        return;
      }
      const index = Number(event.key) - 1;
      if (event.key >= "1" && event.key <= "6" && CATALOG_PLAYS[index]) {
        event.preventDefault();
        router.push(CATALOG_PLAYS[index].href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [frame.play.href, router]);

  return (
    <section
      className="catalog"
      aria-label="InferTab visual catalog"
      data-playing={playing}
      data-catalog-play={frame.play.id}
      data-catalog-phase={frame.phase}
      data-reduced-motion={reducedMotion}
    >
      <header className="catalog-hero">
        <p className="eyebrow">A machine you can reason about</p>
        <h1>InferTab</h1>
        <p className="catalog-lede">
          Watch one inference step. Then open a room and change what it keeps,
          what it may read, or what it must fetch.
        </p>
      </header>
      <div className="catalog-stage">
        <p className="catalog-now" aria-hidden="true">
          {playing
            ? frame.phase === "hold"
              ? "Holding"
              : "Playing"
            : "Paused"}
          {" · "}
          {frame.play.label}
        </p>
        <div className="catalog-caption" role="status">
          <p data-caption="seeing">{frame.seeing}</p>
          <p data-caption="consequence">{frame.consequence}</p>
        </div>
        <MachinePresentation traces={traces} state={frame.state}>
          <div
            ref={sceneRef}
            className="catalog-scene"
            data-catalog-board={frame.play.board}
            data-catalog-focus={frame.focusIds.join(" ")}
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
            className={playing ? undefined : "secondary"}
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setElapsedMs((current) => replayCatalogElapsed(current));
              setPlaying(true);
            }}
          >
            Replay
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              setElapsedMs((current) => nextCatalogElapsed(current))
            }
          >
            Next play
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
      <p className="catalog-map-label">Open rooms</p>
      <ol className="catalog-plays">
        {CATALOG_PLAYS.map((play) => (
          <li key={play.id}>
            <Link
              href={play.href}
              data-play={play.id}
              data-current={play.id === current}
              aria-current={play.id === current ? "true" : undefined}
            >
              {play.label}
            </Link>
          </li>
        ))}
      </ol>
      <p className="catalog-map-label">Later</p>
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
