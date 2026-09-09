import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JourneyMachine } from "@/components/JourneyMachine";
import { MachineProvider } from "@/components/MachineProvider";
import type { Lesson } from "@/lib/simulation/model";
import { traces } from "./simulation-fixture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Mount a real lesson with the immutable source recordings. */
function view(lesson: Lesson) {
  return (
    <MachineProvider traces={traces}>
      <JourneyMachine lesson={lesson} />
    </MachineProvider>
  );
}

/** Activate a named control using the same event path as the learner. */
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("Distinct adaptive visual routes", () => {
  it("changes receipts into comparison and then a recorded invariant while retaining the canonical object", () => {
    const { container } = render(view("01"));
    click("Build the first word");
    click("Every block so far");
    click("Keep finished work");
    const object = container.querySelector("[data-object-id]");
    const payload = object?.querySelector(".kv-glyph");
    expect(container.querySelector(".machine")).toHaveAttribute(
      "data-teaching-strategy",
      "work-receipts",
    );
    click("Show me another way");
    expect(container.querySelector(".compare-lane")).toBeVisible();
    click("Show me another way");
    expect(
      screen.getByRole("region", { name: "Same position across time" }),
    ).toBeVisible();
    expect(container.querySelector("[data-object-id]")).toBe(object);
    expect(object?.querySelector(".kv-glyph")).toBe(payload);
    const values = [
      ...container.querySelectorAll(".invariant-row[data-invariant-step]"),
    ].map((row) =>
      [...row.querySelectorAll("[data-value]")].map((value) =>
        value.getAttribute("data-value"),
      ),
    );
    expect(values).toHaveLength(2);
    expect(values[1]).toEqual(values[0]);
  });

  it("morphs the same ratio objects through familiar units, technical units, and trace evidence using the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(view("03"));
    click("Count this question’s math");
    click("Both quantities");
    click("Use 2-byte numbers");
    const numerator = container.querySelector(".ratio-numerator");
    const symbolic = container.querySelector(".operation-chain");
    const first = screen.getByRole("button", { name: "Distance / time" });
    first.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Work / bytes" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(container.querySelector(".division-machine")).toHaveAttribute(
      "data-unit-lens",
      "example",
    );
    expect(container.querySelector(".ratio-numerator")).toBe(numerator);
    await user.tab();
    await user.keyboard("{Enter}");
    expect(container.querySelector(".division-machine")).toHaveAttribute(
      "data-unit-lens",
      "recording",
    );
    expect(container.querySelector(".ratio-numerator")).toBe(numerator);
    expect(container.querySelector(".operation-chain")).toBe(symbolic);
    click("4-byte numbers");
    expect(container.querySelector(".operation-chain")).toBe(symbolic);
    expect(
      container.querySelectorAll('.byte-group[data-present="true"]'),
    ).toHaveLength(4);
  });

  it("updates one live caption from a blocked attempt without granting the forbidden read", () => {
    const { container } = render(view("02"));
    click("Inspect the first question");
    click("Yes, the prompt already exists");
    click("question 0 cannot read later position 2");
    const caption = container.querySelector(".semantic-caption");
    expect(caption).toHaveAttribute("data-caption-kind", "CAUSE");
    expect(caption).toHaveTextContent("future position 2");
    expect(caption?.querySelectorAll('[role="status"]')).toHaveLength(1);
    expect(container.querySelector('[data-edge="0:2"]')).toHaveAttribute(
      "data-allowed",
      "false",
    );
    expect(container.querySelector('[data-edge="0:2"]')).toHaveClass(
      "rejected",
    );
  });
});
