"use client";

import { usePathname } from "next/navigation";
import { JourneyMachine } from "./JourneyMachine";
import { JourneyNav } from "./JourneyNav";
import { lessonFromPath } from "@/lib/simulation/journey";

/** Mount the gated discovery machine only on deep rooms; `/` keeps the catalog. */
export function MachineWorkspace() {
  const pathname = usePathname();
  const lesson = lessonFromPath(pathname);
  if (!lesson) return null;
  return (
    <>
      <p className="eyebrow">InferTab / A machine you can reason about</p>
      <JourneyNav
        current={
          lesson === "01" ? "kv" : lesson === "02" ? "prefill" : "arithmetic"
        }
      />
      <JourneyMachine lesson={lesson} />
    </>
  );
}
