import sample from "../../public/traces/sample-prefill-decode.json";
import { JourneyNav } from "@/components/JourneyNav";
import { PrefillPlayground } from "@/components/PrefillPlayground";
import { assertValidPrefillDecodeTrace } from "@/lib/schema";

const initialTrace = assertValidPrefillDecodeTrace(sample);

export default function PrefillDecodePage() {
  return (
    <main className="page">
      <p className="eyebrow">InferTab · 02</p>
      <h1>Read the room. Then write one word.</h1>
      <p className="lede">
        Click a word and see which earlier words it may read. Later words stay
        covered. Then switch to the single new question.
      </p>
      <JourneyNav current="prefill" />
      <PrefillPlayground initialTrace={initialTrace} />
    </main>
  );
}
