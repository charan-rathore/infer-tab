import sample from "../public/traces/sample-why-kv-cache.json";
import { JourneyNav } from "@/components/JourneyNav";
import { Playground } from "@/components/Playground";
import { assertValidTrace } from "@/lib/schema";

const initialTrace = assertValidTrace(sample);

export default function HomePage() {
  return (
    <main className="page">
      <p className="eyebrow">InferTab · 01</p>
      <h1>What should the model do with the past?</h1>
      <p className="lede">
        Each new word looks back. Try rebuilding that past. Then try keeping
        finished work. The name comes after you see the difference.
      </p>
      <JourneyNav current="kv" />
      <Playground initialTrace={initialTrace} />
    </main>
  );
}
