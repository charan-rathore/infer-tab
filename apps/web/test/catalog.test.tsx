import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogLanding } from "@/components/CatalogLanding";
import { MachineWorkspace } from "@/components/MachineWorkspace";
import { MachineProvider } from "@/components/MachineProvider";
import {
  CATALOG_PLAYS,
  BEAT_MS,
  catalogObservation,
} from "@/lib/catalog/plays";
import { LESSON_PATHS } from "@/lib/simulation/journey";
import { traces } from "./simulation-fixture";

let pathname = "/";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
      "A step that writes the next token",
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

  it("advances into the next recorded play on its own", async () => {
    viewCatalog();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(BEAT_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Finished work being built again",
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
      "Finished work being built again",
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
      screen.queryByText("A step that writes the next token"),
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
});
