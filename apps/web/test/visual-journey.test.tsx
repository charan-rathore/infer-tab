import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JourneyMachine } from "@/components/JourneyMachine";
import { MachineProvider } from "@/components/MachineProvider";
import { sharedLengths, type Lesson } from "@/lib/simulation/model";
import { traces } from "./simulation-fixture";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** Mount a lens with the real immutable recordings and persistent provider. */
function view(lesson: Lesson) {
  return (
    <MachineProvider traces={traces}>
      <JourneyMachine lesson={lesson} />
    </MachineProvider>
  );
}
/** Follow native tab order to a visible control and activate it using only the keyboard. */
async function keyboardActivate(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const target = screen.getByRole("button", { name });
  for (let i = 0; i < 100 && document.activeElement !== target; i++)
    await user.tab();
  expect(document.activeElement).toBe(target);
  await user.keyboard("{Enter}");
}

describe("Visual discovery and accessible control", () => {
  it.each([
    [
      "01",
      "Build the first word",
      "Only the newest block",
      "Keep finished work",
    ],
    [
      "02",
      "Inspect the first question",
      "Yes, the prompt already exists",
      "Ask all existing questions together",
    ],
    [
      "03",
      "Count this question’s math",
      "Both quantities",
      "Use 2-byte numbers",
    ],
  ] as const)(
    "completes %s through keyboard discovery and terminology",
    async (lesson, start, prediction, mechanism) => {
      const user = userEvent.setup();
      const { container } = render(view(lesson));
      for (const name of [
        start,
        prediction,
        mechanism,
        "Derive it from what happened",
        "What is this called?",
        "What still costs work?",
      ])
        await keyboardActivate(user, name);
      expect(container.querySelector("[data-milestone]")).toHaveAttribute(
        "data-milestone",
        "bottleneck",
      );
    },
    20000,
  );

  it("keeps the actual payload element mounted and moves only new rows through compute", () => {
    const { container, rerender } = render(view("01"));
    fireEvent.click(
      screen.getByRole("button", { name: "Build the first word" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Only the newest block" }),
    );
    const token = container.querySelector("[data-object-id]");
    const payload = token?.querySelector(".kv-glyph");
    fireEvent.click(screen.getByRole("button", { name: "Keep finished work" }));
    fireEvent.click(screen.getByRole("button", { name: "Next token" }));
    expect(token?.querySelector(".kv-glyph")).toBe(payload);
    expect(token?.querySelector(".kv-route")).toHaveAttribute(
      "data-reused",
      "true",
    );
    expect(token?.querySelector(".kv-route")).toHaveAttribute(
      "data-built",
      "false",
    );
    expect(
      container.querySelectorAll(".primary-lane [data-built=true]"),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll(".compare-lane [data-built=true]"),
    ).toHaveLength(8);
    rerender(view("02"));
    expect(container.querySelector("[data-object-id]")).toBe(token);
    expect(token?.querySelector(".kv-glyph")).toBe(payload);
  });

  it("rejects a future edge and compresses the same legal edge elements", () => {
    const { container } = render(view("02"));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect the first question" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, the prompt already exists" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "question 0 cannot read later position 1",
      }),
    );
    expect(screen.getByText(/Read rejected/)).toBeVisible();
    expect(container.querySelector('[data-edge="0:1"]')).toHaveAttribute(
      "data-allowed",
      "false",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ask all existing questions together",
      }),
    );
    const edge = container.querySelector('[data-edge="0:0"]');
    fireEvent.click(
      screen.getByRole("button", { name: "Expand the same connections" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Compress connections into a grid" }),
    );
    expect(container.querySelector('[data-edge="0:0"]')).toBe(edge);
    expect(
      container.querySelectorAll('[data-edge][data-allowed="true"]'),
    ).toHaveLength(21);
  });

  it("uses a bounded area representation at the largest recorded length", () => {
    const { container } = render(view("02"));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect the first question" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, the prompt already exists" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ask all existing questions together",
      }),
    );
    fireEvent.click(screen.getByText("What if the prompt were longer?"));
    fireEvent.click(
      screen.getByRole("button", {
        name: `${Math.max(...sharedLengths(traces))} tokens`,
      }),
    );
    expect(
      container.querySelectorAll(".attention-cell").length,
    ).toBeLessThanOrEqual(12);
    expect(container.querySelectorAll("*").length).toBeLessThan(1000);
    expect(
      screen.getByRole("img", {
        name: new RegExp(
          `fixed ${Math.max(...sharedLengths(traces))}-position scale`,
        ),
      }),
    ).toBeInTheDocument();
  });

  it("preserves arithmetic symbols and byte identities when precision changes", () => {
    const { container } = render(view("03"));
    fireEvent.click(
      screen.getByRole("button", { name: "Count this question’s math" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Both quantities" }));
    const arithmetic = container.querySelector(".operation-chain");
    const byte = container.querySelector(".byte-group");
    fireEvent.click(screen.getByRole("button", { name: "Use 2-byte numbers" }));
    expect(container.querySelector(".operation-chain")).toBe(arithmetic);
    expect(container.querySelector(".byte-group")).toBe(byte);
    expect(
      container.querySelectorAll('.byte-group[data-present="true"]'),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll('.byte-group[data-present="true"] i'),
    ).toHaveLength(16);
  });
});
