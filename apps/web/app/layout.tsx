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

export const metadata: Metadata = {
  title: "InferTab: one machine, three discoveries",
  description:
    "Predict, change one mechanism, and derive inference behavior from recorded experiments.",
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
            <p className="eyebrow">InferTab / A machine you can reason about</p>
            {children}
            <MachineWorkspace />
          </main>
        </MachineProvider>
      </body>
    </html>
  );
}
