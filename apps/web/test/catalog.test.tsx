import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogLanding } from "@/components/CatalogLanding";
import { MachineWorkspace } from "@/components/MachineWorkspace";
import { MachineProvider } from "@/components/MachineProvider";
import {
  CATALOG_PLAYS,
  BEAT_MS,
  HOLD_MS,
  catalogObservation,
} from "@/lib/catalog/plays";
import { LESSON_PATHS } from "@/lib/simulation/journey";
import { traces } from "./simulation-fixture";

let pathname = "/";
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname,
}));

/** Mount the production catalog over the committed recordings. */
function viewCatalog() {
  return render(
    <MachineProvider traces={traces}>
      <CatalogLanding />
    </MachineProvider>,
  );
}

/** Mount the shared workspace at an explicit route. */
function viewWorkspace() {
  return render(
    <MachineProvider traces={traces}>
      <MachineWorkspace />
    </MachineProvider>,
  );
}

describe("Landing catalog", () => {
  beforeEach(() => {
    pathname = "/";
    push.mockReset();
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("auto-starts the first play without a click", () => {
    viewCatalog();
    expect(screen.getByLabelText("InferTab visual catalog")).toHaveAttribute(
      "data-playing",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "A new word is being written.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Each step uses the words already on the bench.",
    );
    expect(screen.getByLabelText("Persistent inference machine")).toBeVisible();
  });

  it("does not open with a prediction quiz or lesson chrome", () => {
    viewCatalog();
    expect(
      screen.queryByRole("button", { name: "Build the first word" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Observation \d+ of/)).not.toBeInTheDocument();
    expect(screen.queryByText(/what is the next word/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/how many blocks/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/You made a KV cache/)).not.toBeInTheDocument();
    expect(screen.queryByText(/prefill/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/arithmetic intensity/i)).not.toBeInTheDocument();
  });

  it("shows the six play labels and the first-principle entrance", () => {
    viewCatalog();
    for (const play of CATALOG_PLAYS) {
      expect(
        screen.getByRole("link", { name: play.label }),
      ).toHaveAttribute("href", play.href);
    }
    expect(
      screen.getByRole("link", { name: "Start from the first principle" }),
    ).toHaveAttribute("href", LESSON_PATHS["01"]);
  });

  it("keeps pause, replay, and next-play on the stage", () => {
    viewCatalog();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Replay" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Next play" })).toBeVisible();
  });

  it("advances into the next recorded play on its own", async () => {
    viewCatalog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The finished words walk back through compute.",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "The past is being built again.",
    );
  });

  it("lets the visitor pause and stay on a beat", async () => {
    viewCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByLabelText("InferTab visual catalog")).toHaveAttribute(
      "data-playing",
      "false",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "A new word is being written.",
    );
  });

  it("jumps to the next play from the transport", () => {
    viewCatalog();
    fireEvent.click(screen.getByRole("button", { name: "Next play" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "The finished words walk back through compute.",
    );
  });

  it("still advances under reduced motion as discrete frames", async () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    viewCatalog();
    expect(screen.getByLabelText("InferTab visual catalog")).toHaveAttribute(
      "data-reduced-motion",
      "true",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "The finished words walk back through compute.",
    );
  });

  it("does not mount the gated discovery machine on /", () => {
    viewWorkspace();
    expect(
      screen.queryByRole("button", { name: "Build the first word" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Observation \d+ of/)).not.toBeInTheDocument();
  });

  it("enters lesson 01 from the first-principle deep link", () => {
    pathname = LESSON_PATHS["01"];
    viewWorkspace();
    expect(
      screen.getByRole("button", { name: "Build the first word" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("InferTab visual catalog"),
    ).not.toBeInTheDocument();
  });

  it("lets /prefill-vs-decode skip the catalog", () => {
    pathname = "/prefill-vs-decode";
    viewWorkspace();
    expect(
      screen.getByRole("button", { name: "Inspect the first question" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("InferTab visual catalog"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("A new word is being written."),
    ).not.toBeInTheDocument();
  });

  it("lets /arithmetic-vs-memory skip the catalog", () => {
    pathname = "/arithmetic-vs-memory";
    viewWorkspace();
    expect(
      screen.getByRole("button", { name: "Count this question’s math" }),
    ).toBeVisible();
    expect(
      screen.queryByLabelText("InferTab visual catalog"),
    ).not.toBeInTheDocument();
  });

  it("projects keep and mask frames from the recordings, not invented math", () => {
    const keep = catalogObservation(traces, BEAT_MS * 2);
    expect(keep.play.id).toBe("keep");
    expect(keep.state.policy).toBe("cached");
    expect(keep.state.compare).toBe(true);
    expect(keep.state.playhead).toBeGreaterThanOrEqual(1);
    const mask = catalogObservation(traces, BEAT_MS * 3);
    expect(mask.play.id).toBe("mask");
    expect(mask.state.inspectedKey).toBeGreaterThan(mask.state.query);
  });

  it("holds an aha frame and names a specimen on every play", () => {
    for (let index = 0; index < CATALOG_PLAYS.length; index += 1) {
      const frame = catalogObservation(traces, BEAT_MS * index + HOLD_MS);
      expect(frame.play.id).toBe(CATALOG_PLAYS[index].id);
      expect(frame.phase).toBe("hold");
      expect(frame.seeing.length).toBeGreaterThan(8);
      expect(frame.consequence.length).toBeGreaterThan(8);
      expect(frame.focusIds.length).toBeGreaterThan(0);
      expect(`${frame.seeing} ${frame.consequence}`).not.toMatch(
        /kv cache|prefill|arithmetic intensity/i,
      );
    }
  });
});
