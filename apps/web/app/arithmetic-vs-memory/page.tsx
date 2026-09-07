import sample from "../../public/traces/sample-arithmetic-memory.json";
import { ArithmeticPlayground } from "@/components/ArithmeticPlayground";
import { JourneyNav } from "@/components/JourneyNav";
import { assertValidArithmeticMemoryTrace } from "@/lib/schema";

const initialTrace = assertValidArithmeticMemoryTrace(sample);

export default function ArithmeticMemoryPage() {
  return (
    <main className="page">
      <p className="eyebrow">InferTab · 03</p>
      <h1>Math is one pile. Data is another.</h1>
      <p className="lede">
        Change the length, the number size, and the job. Watch the math pile
        and the data pile move. Only then divide them.
      </p>
      <JourneyNav current="arithmetic" />
      <ArithmeticPlayground initialTrace={initialTrace} />
    </main>
  );
}
