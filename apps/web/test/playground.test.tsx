import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JourneyMachine } from "@/components/JourneyMachine";
import { MachineProvider } from "@/components/MachineProvider";
import { traces } from "./simulation-fixture";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
/** Render the first lens in the real shared provider used by navigation. */
function renderOne() {
  return render(
    <MachineProvider traces={traces}>
      <JourneyMachine lesson="01" />
    </MachineProvider>,
  );
}
/** Reach the observed rebuild failure through a committed prediction. */
function causeFailure() {
  fireEvent.click(screen.getByRole("button", { name: "Build the first word" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Only the newest block" }),
  );
}
/** Apply the one mechanism change after encountering repeated work. */
function keepWork() {
  causeFailure();
  fireEvent.click(screen.getByRole("button", { name: "Keep finished work" }));
}

describe("Experiment 01 discovery", () => {
  it("offers a concrete first action without exposing the term or mechanism", () => {
    renderOne();
    expect(
      screen.getByRole("button", { name: "Build the first word" }),
    ).toBeVisible();
    expect(screen.queryByText(/You made a KV cache/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Keep finished work" }),
    ).not.toBeInTheDocument();
  });
  it("records a prediction before exposing repeated work", () => {
    renderOne();
    causeFailure();
    expect(screen.getByText(/Your prediction/)).toHaveTextContent(
      "Only the newest block",
    );
    expect(screen.getByText(/The next step built/)).toHaveTextContent("7 rows");
    expect(screen.getByText(/Built across observed steps/)).toHaveTextContent(
      "13",
    );
  });
  it("preserves object DOM and playhead when comparing storage policies", () => {
    const { container } = renderOne();
    causeFailure();
    const object = container.querySelector("[data-object-id]");
    fireEvent.click(screen.getByRole("button", { name: "Keep finished work" }));
    expect(container.querySelector("[data-object-id]")).toBe(object);
    expect(object).toHaveAttribute("data-object-state", "reused");
    fireEvent.click(screen.getByRole("button", { name: "Rebuild the past" }));
    expect(container.querySelector("[data-object-id]")).toBe(object);
    expect(object).toHaveAttribute("data-object-state", "built");
    expect(screen.getByText(/Built across observed steps/)).toHaveTextContent(
      "Step 2 of 6",
    );
  });
  it("reveals observed sums before naming the cache and exposing the next bottleneck", () => {
    renderOne();
    keepWork();
    expect(screen.queryByText(/You made a KV cache/)).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Derive it from what happened" }),
    );
    const derivation = screen.getByRole("region", { name: "Trace derivation" });
    expect(derivation).toHaveTextContent("6 + 7 = 13 rows");
    expect(derivation).toHaveTextContent("6 + 1 = 7 rows");
    fireEvent.click(
      screen.getByRole("button", { name: "What is this called?" }),
    );
    expect(screen.getByText(/You made a KV cache/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "What still costs work?" }),
    );
    expect(
      screen.getByRole("link", { name: /Follow the shelf into 02/ }),
    ).toHaveAttribute("href", "/prefill-vs-decode");
  });
  it("clamps rapid stepping and scrubs without losing the prediction", () => {
    renderOne();
    keepWork();
    const next = screen.getByRole("button", { name: "Next token" });
    for (let i = 0; i < 15; i++) fireEvent.click(next);
    expect(next).toBeDisabled();
    expect(screen.getByText(/Built across observed steps/)).toHaveTextContent(
      "Step 6 of 6",
    );
    fireEvent.change(screen.getByRole("slider", { name: "Observed step" }), {
      target: { value: "1" },
    });
    expect(screen.getByText(/Built across observed steps/)).toHaveTextContent(
      "Step 2 of 6",
    );
    expect(screen.getByText(/Your prediction/)).toHaveTextContent(
      "Only the newest block",
    );
  });
  it("does not count emitted output as stored work", () => {
    const { container } = renderOne();
    keepWork();
    expect(
      container.querySelector('[data-object-state="output"]'),
    ).toHaveTextContent("Not fed back yet");
  });
  it("labels Python fallback and resets discoveries against the new recording", async () => {
    renderOne();
    keepWork();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ trace: traces.kv, fallback: true }),
        }),
    );
    fireEvent.click(screen.getByText("Recording and replay"));
    fireEvent.change(screen.getByLabelText("Short sentence"), {
      target: { value: "a different prompt" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Use this sentence" }));
    await screen.findAllByText(/committed sample trace, not a live run/);
    expect(
      screen.getByRole("button", { name: "Build the first word" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Short sentence")).toHaveValue(
      traces.kv.prompt,
    );
    vi.unstubAllGlobals();
  });
});
