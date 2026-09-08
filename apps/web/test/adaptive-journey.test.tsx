import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JourneyMachine } from "@/components/JourneyMachine";
import { MachineProvider } from "@/components/MachineProvider";
import { traces } from "./simulation-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Mount Experiment 01 with the production provider so adaptive and simulation events share replay order. */
function view() {
  return (
    <MachineProvider traces={traces}>
      <JourneyMachine lesson="01" />
    </MachineProvider>
  );
}

describe("Adaptive Experiment 01", () => {
  it("moves a repeated wrong prediction to direct physical shelf manipulation", () => {
    const { container } = render(view());
    fireEvent.click(
      screen.getByRole("button", { name: "Build the first word" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Only the newest block" }),
    );
    expect(screen.getByText("Run both policies together")).toBeVisible();
    const reconsider = screen.getByRole("button", {
      name: "Test my one-block idea again",
    });
    reconsider.focus();
    fireEvent.click(reconsider);
    expect(
      screen.getByRole("button", { name: "One-block idea tested twice" }),
    ).toBe(reconsider);
    expect(reconsider).toBeDisabled();
    expect(container.querySelector(".adaptive-route")).toHaveFocus();
    expect(screen.getByText("Keep your eye on the shelf")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep finished work" }));
    expect(container.querySelector(".shelf-focus")).toHaveTextContent(
      "old finished pairs remain on the shelf",
    );
    expect(container.querySelector(".compare-lane")).not.toBeInTheDocument();
  });

  it("moves a correct proof-seeking learner to compact synchronized evidence", () => {
    const { container } = render(view());
    fireEvent.click(
      screen.getByRole("button", { name: "Build the first word" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Every block so far" }));
    fireEvent.click(screen.getByRole("button", { name: "Prove" }));
    expect(screen.getByText("Run both policies together")).toBeVisible();
    expect(screen.getByText("Fast path")).toBeVisible();
    expect(container.querySelector(".compare-lane")).toBeInTheDocument();
  });

  it("changes to a genuinely different representation on explicit request", () => {
    const { container } = render(view());
    fireEvent.click(
      screen.getByRole("button", { name: "Build the first word" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Every block so far" }));
    const before = container
      .querySelector(".adaptive-guide")
      ?.getAttribute("data-strategy");
    fireEvent.click(
      screen.getByRole("button", { name: "Show me another way" }),
    );
    const after = container
      .querySelector(".adaptive-guide")
      ?.getAttribute("data-strategy");
    expect(after).not.toBe(before);
    expect(screen.getByText("Run both policies together")).toBeVisible();
    expect(container.querySelector(".compare-lane")).toBeInTheDocument();
  });
});
