import sample from "../../public/traces/sample-prefill-decode.json";
import { ExperimentNav } from "@/components/ExperimentNav";
import { PrefillPlayground } from "@/components/PrefillPlayground";
import { assertValidPrefillDecodeTrace } from "@/lib/schema";

const initialTrace = assertValidPrefillDecodeTrace(sample);

export default function PrefillDecodePage() {
  return (
    <main className="page">
      <ExperimentNav current="prefill" />
      <p className="eyebrow">InferTab · Phase 1</p>
      <h1>First read the room. Then say one new word.</h1>
      <p className="lede">
        The prompt is already there, so every word can be looked at together —
        as long as nobody peeks at the future. After that, each new word is a
        single question aimed at a growing shelf of what we already learned.
      </p>
      <PrefillPlayground initialTrace={initialTrace} />
    </main>
  );
}
