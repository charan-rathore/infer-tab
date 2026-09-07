import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import prefillSample from "../public/traces/sample-prefill-decode.json";
import arithSample from "../public/traces/sample-arithmetic-memory.json";
import { PrefillPlayground } from "@/components/PrefillPlayground";
import { ArithmeticPlayground } from "@/components/ArithmeticPlayground";
import { assertValidArithmeticMemoryTrace, assertValidPrefillDecodeTrace } from "@/lib/schema";

const prefill = assertValidPrefillDecodeTrace(prefillSample);
const arith = assertValidArithmeticMemoryTrace(arithSample);

describe("experiment 02 playground", () => {
  it("explains a masked future cell after a click", () => {
    const { container } = render(<PrefillPlayground initialTrace={prefill} />);
    fireEvent.click(within(container).getByRole("gridcell", { name: "question 0 cannot read later word 1" }));
    expect(
      within(container).getByText("That later word does not exist yet for this question."),
    ).toBeInTheDocument();
  });

  it("changing length resets the selected cell", () => {
    const { container } = render(<PrefillPlayground initialTrace={prefill} />);
    fireEvent.click(within(container).getByRole("gridcell", { name: "question 0 cannot read later word 1" }));
    fireEvent.click(within(container).getByRole("button", { name: "16 tokens" }));
    expect(
      within(container).queryByText("That later word does not exist yet for this question."),
    ).not.toBeInTheDocument();
  });
});

describe("experiment 03 playground", () => {
  it("updates math when dtype and job change", () => {
    const { container } = render(<ArithmeticPlayground initialTrace={arith} />);
    expect(within(container).getByText("2048")).toBeInTheDocument();
    fireEvent.click(within(container).getByRole("button", { name: /One new word/i }));
    expect(within(container).getByText("288")).toBeInTheDocument();
    fireEvent.click(within(container).getByRole("button", { name: "2-byte numbers" }));
    fireEvent.click(within(container).getByRole("button", { name: "Next" }));
    expect(within(container).getAllByText("144")).toHaveLength(2);
  });

  it("names intensity only after both piles are seen", () => {
    const { container } = render(<ArithmeticPlayground initialTrace={arith} />);
    fireEvent.click(within(container).getByRole("button", { name: "Next" }));
    fireEvent.click(within(container).getByRole("button", { name: "Next" }));
    expect(
      within(container).getByText(/Arithmetic intensity = math work \/ data supplied/),
    ).toBeInTheDocument();
  });
});
