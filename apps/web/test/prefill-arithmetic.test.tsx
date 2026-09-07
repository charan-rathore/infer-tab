import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JourneyMachine } from "@/components/JourneyMachine";
import { MachineProvider } from "@/components/MachineProvider";
import type { Lesson } from "@/lib/simulation/model";
import { traces } from "./simulation-fixture";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
/** Mount a lens using the application's shared trace bundle and provider. */
function view(lesson: Lesson) {
  return (
    <MachineProvider traces={traces}>
      <JourneyMachine lesson={lesson} />
    </MachineProvider>
  );
}
/** Reach the parallel-query consequence through the required causal prediction. */
function parallelQueries() {
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect the first question" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Yes, the prompt already exists" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Ask all existing questions together" }),
  );
}
describe("One journey through shapes and payloads", () => {
  it("retains the blocked future read after parallel processing", () => {
    render(view("02"));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect the first question" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Yes, the prompt already exists" }),
    );
    expect(screen.getByText(/Read blocked: question 0/)).toBeVisible();
    const blocked = screen.getByRole("button", {
      name: "question 0 cannot read later position 1",
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Ask all existing questions together",
      }),
    );
    expect(blocked).toHaveClass("blocked");
    expect(screen.getByText(/All 6 existing questions/)).toHaveTextContent(
      "21 square cells",
    );
    fireEvent.click(screen.getByRole("button", { name: "One new question" }));
    expect(
      screen.getByText(/1 question × 7 stored positions/),
    ).toBeInTheDocument();
  });
  it("retains selected position, object DOM, and discoveries across lenses", () => {
    const { rerender, container } = render(view("02"));
    parallelQueries();
    fireEvent.click(
      screen.getByRole("button", { name: "question 0 may read position 0" }),
    );
    const object = container.querySelector("[data-object-id]");
    rerender(view("03"));
    expect(container.querySelector("[data-object-id]")).toBe(object);
    expect(
      screen.getByRole("complementary", { name: "Selected object" }),
    ).toHaveTextContent("Position 0: the");
    rerender(view("02"));
    expect(screen.getByText(/Your prediction/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Derive it from what happened" }),
    ).toBeVisible();
  });
  it("halves recorded payload with unchanged arithmetic, then derives and names the ratio", () => {
    render(view("03"));
    fireEvent.click(
      screen.getByRole("button", { name: "Count this question’s math" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Both quantities" }));
    expect(
      screen.getByText(/Counting math alone missed the shelf/),
    ).toHaveTextContent("480 logical bytes");
    fireEvent.click(screen.getByRole("button", { name: "Use 2-byte numbers" }));
    expect(screen.getByText(/With 2-byte numbers/)).toHaveTextContent(
      "arithmetic stays 224",
    );
    expect(screen.getByText(/With 2-byte numbers/)).toHaveTextContent(
      "240 bytes",
    );
    expect(
      screen.queryByText(/Work per byte is arithmetic intensity/),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Derive it from what happened" }),
    );
    expect(
      screen.getByRole("region", { name: "Trace derivation" }),
    ).toHaveTextContent("224 math operations ÷ 240 bytes");
    fireEvent.click(
      screen.getByRole("button", { name: "What is this called?" }),
    );
    expect(
      screen.getByText(/Work per byte is arithmetic intensity/),
    ).toBeVisible();
  });
});
