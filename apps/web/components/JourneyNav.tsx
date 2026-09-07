"use client";

import Link from "next/link";
import { useMachine } from "./MachineProvider";
import type { Lesson } from "@/lib/simulation/model";

const LINKS: Array<{
  id: string;
  lesson: Lesson;
  href: string;
  label: string;
}> = [
  { id: "kv", lesson: "01", href: "/", label: "Repeating work" },
  {
    id: "prefill",
    lesson: "02",
    href: "/prefill-vs-decode",
    label: "Read vs write",
  },
  {
    id: "arithmetic",
    lesson: "03",
    href: "/arithmetic-vs-memory",
    label: "Math vs data",
  },
];

/** Navigate lenses without giving away their discoveries; progress comes from the shared event reducer. */
export function JourneyNav({
  current,
}: {
  current: "kv" | "prefill" | "arithmetic";
}) {
  const { state } = useMachine();
  return (
    <nav className="journey" aria-label="Learning journey">
      <ol>
        {LINKS.map((link) => (
          <li key={link.id}>
            <Link
              href={link.href}
              aria-current={current === link.id ? "page" : undefined}
              className={current === link.id ? "on" : ""}
            >
              <span className="journey-num">{link.lesson}</span>
              <strong>{link.label}</strong>
              <span className="journey-progress">
                {state.lessons[link.lesson].milestone === "bottleneck"
                  ? "Discovered"
                  : state.lessons[link.lesson].milestone === "problem"
                    ? "Ready to explore"
                    : "In progress"}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Preserve the existing navigation export for callers outside the main journey. */
export function ExperimentNav({
  current,
}: {
  current: "kv" | "prefill" | "arithmetic";
}) {
  return <JourneyNav current={current} />;
}
