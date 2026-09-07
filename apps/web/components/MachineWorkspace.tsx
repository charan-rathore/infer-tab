"use client";

import { usePathname } from "next/navigation";
import { JourneyMachine } from "./JourneyMachine";
import { JourneyNav } from "./JourneyNav";

/** Change the lens of a mounted machine; the shared layout retains its DOM and provider across navigation. */
export function MachineWorkspace() {
  const pathname = usePathname();
  const lesson =
    pathname === "/prefill-vs-decode"
      ? "02"
      : pathname === "/arithmetic-vs-memory"
        ? "03"
        : "01";
  return (
    <>
      <JourneyNav
        current={
          lesson === "01" ? "kv" : lesson === "02" ? "prefill" : "arithmetic"
        }
      />
      <JourneyMachine lesson={lesson} />
    </>
  );
}
