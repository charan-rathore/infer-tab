import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import sample from "../public/traces/sample-why-kv-cache.json";
import { Playground } from "@/components/Playground";
import { assertValidTrace } from "@/lib/schema";

const trace = assertValidTrace(sample);

function renderOne() {
  const view = render(<Playground initialTrace={trace} />);
  return view;
}

describe("experiment 01 playground", () => {
  it("starts by asking what to do with the past", () => {
    renderOne();
    expect(
      screen.getByText("The model needs one more token. What should it do with the past?"),
    ).toBeInTheDocument();
  });

  it("rebuild walk accumulates work from the trace", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: /Every old block walks back/i }));
    fireEvent.click(within(container).getByRole("button", { name: "Next token" }));
    expect(within(container).getByText(/Work done again this walk/)).toHaveTextContent("6");
    fireEvent.click(within(container).getByRole("button", { name: "Next token" }));
    expect(within(container).getByText(/Work done again this walk/)).toHaveTextContent("13");
  });

  it("rapid next clicks do not skip past the last step", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: /Every old block walks back/i }));
    const next = within(container).getByRole("button", { name: "Next token" });
    for (let i = 0; i < 20; i += 1) fireEvent.click(next);
    expect(within(container).getByText("Step 6 of 6")).toBeInTheDocument();
    expect(next).toBeDisabled();
  });

  it("reset returns the walk to ready", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: /Every old block walks back/i }));
    fireEvent.click(within(container).getByRole("button", { name: "Next token" }));
    fireEvent.click(within(container).getByRole("button", { name: "Reset walk" }));
    expect(within(container).getByText("Ready")).toBeInTheDocument();
  });

  it("Run both uses the same prompt on both sides", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: "Run both" }));
    expect(within(container).getByText("Same prompt. Same weights. Two policies.")).toBeInTheDocument();
  });

  it("switching policy clears the walk", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: /Every old block walks back/i }));
    fireEvent.click(within(container).getByRole("button", { name: "Next token" }));
    fireEvent.click(within(container).getByRole("button", { name: "Keep finished work" }));
    expect(within(container).getByText("Ready")).toBeInTheDocument();
  });

  it("sample source is not presented as a live run", () => {
    const { container } = renderOne();
    expect(within(container).getByText(/Committed sample trace/)).toBeInTheDocument();
    expect(within(container).queryByText(/Live run from the local Python experiment/)).not.toBeInTheDocument();
  });

  it("failed Python is labelled as sample fallback", async () => {
    const { container } = renderOne();
    global.fetch = async () =>
      ({
        ok: true,
        json: async () => ({ fallback: true, trace }),
      }) as Response;
    fireEvent.change(within(container).getByLabelText("Short sentence"), {
      target: { value: "the cat sat" },
    });
    fireEvent.click(within(container).getByRole("button", { name: "Use this sentence" }));
    expect(
      await within(container).findByRole("alert"),
    ).toHaveTextContent(/committed sample trace, not a live run/i);
  });

  it("Inspect Why numbers derive 51 from the series", () => {
    const { container } = renderOne();
    fireEvent.click(within(container).getByRole("button", { name: /Every old block walks back/i }));
    fireEvent.click(within(container).getByRole("tab", { name: /Inspect/i }));
    fireEvent.click(within(container).getByRole("button", { name: /rows built in total/i }));
    expect(within(container).getByText("6 + 7 + 8 + 9 + 10 + 11")).toBeInTheDocument();
  });
});
