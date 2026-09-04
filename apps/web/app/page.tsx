import sample from "../public/traces/sample-why-kv-cache.json";
import { ExperimentNav } from "@/components/ExperimentNav";
import { Playground } from "@/components/Playground";
import { assertValidTrace } from "@/lib/schema";

const initialTrace = assertValidTrace(sample);

export default function HomePage() {
  return (
    <main className="page">
      <ExperimentNav current="kv" />
      <p className="eyebrow">InferTab · Phase 0</p>
      <h1>Watch a model think. Then watch it remember.</h1>
      <p className="lede">
        Each new word looks back at every word so far. Without a place to keep
        that work, the model rebuilds the past on every step. Type a short
        sentence and walk through one token at a time.
      </p>
      <Playground initialTrace={initialTrace} />
    </main>
  );
}
