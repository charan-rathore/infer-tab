import type { Metadata } from "next";
import { MachineProvider } from "@/components/MachineProvider";
import { MachineWorkspace } from "@/components/MachineWorkspace";
import {
  assertValidTrace,
  assertValidPrefillDecodeTrace,
  assertValidArithmeticMemoryTrace,
} from "@/lib/schema";
import kv from "../public/traces/sample-why-kv-cache.json";
import prefill from "../public/traces/sample-prefill-decode.json";
import arithmetic from "../public/traces/journey-arithmetic-memory.json";
import "./globals.css";
import "./visual.css";

export const metadata: Metadata = {
  title: "InferTab: one inference step",
  description:
    "Watch the visual languages of one inference step, then enter a room to change one mechanism.",
};
const traces = {
  kv: assertValidTrace(kv),
  prefill: assertValidPrefillDecodeTrace(prefill),
  arithmetic: assertValidArithmeticMemoryTrace(arithmetic),
};

/** Mount the machine once above all chapter routes; server-validated traces remain immutable inputs. */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#machine-main">
          Skip to the machine
        </a>
        <MachineProvider traces={traces}>
          <main className="page" id="machine-main">
            {children}
            <MachineWorkspace />
          </main>
        </MachineProvider>
      </body>
    </html>
  );
}
