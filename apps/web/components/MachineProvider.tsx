"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { schedulePlayback } from "@/lib/simulation/playback";
import {
  initialState,
  reduceMachine,
  type SimulationEvent,
  type TraceBundle,
  type MachineState,
} from "@/lib/simulation/model";
import { MAX_EVENTS, replayState, type Replay } from "@/lib/simulation/replay";
import { validateBundle } from "@/lib/simulation/adapters";
import type { InferTabTrace } from "@/lib/schema";
import { validateConceptGraph } from "@/lib/teaching/concepts";

interface Session {
  traces: TraceBundle;
  state: MachineState;
  events: SimulationEvent[];
  source: string;
}
type Action =
  | { type: "event"; event: SimulationEvent }
  | { type: "load"; replay: Replay }
  | { type: "trace"; trace: InferTabTrace; source: string };
interface MachineContextValue extends Session {
  send: (event: SimulationEvent) => void;
  restore: (replay: Replay) => void;
  replaceTrace: (trace: InferTabTrace, source: string) => void;
}
const MachineContext = createContext<MachineContextValue | null>(null);

/** Keep recording replacement atomic: observations from an old run cannot survive as evidence for a new run. */
function sessionReducer(session: Session, action: Action): Session {
  if (action.type === "load")
    return {
      traces: action.replay.traces,
      state: replayState(action.replay),
      events: action.replay.events,
      source: "Imported recording. Replay includes its original traces.",
    };
  if (action.type === "trace") {
    const traces = { ...session.traces, kv: action.trace };
    validateBundle(traces);
    return {
      traces,
      state: initialState(traces),
      events: [],
      source: action.source,
    };
  }
  if (session.events.length >= MAX_EVENTS) return session;
  return {
    ...session,
    state: reduceMachine(session.state, action.event, session.traces),
    events: [...session.events, action.event],
  };
}

/** Own the single machine above route pages, so navigation preserves objects, playhead, and discoveries. */
export function MachineProvider({
  traces,
  children,
}: {
  traces: TraceBundle;
  children: ReactNode;
}) {
  const [session, dispatch] = useReducer(sessionReducer, traces, createSession);
  /** Record a user action; rendering and animation never dispatch mathematical results. */
  const send = useCallback(function send(event: SimulationEvent) {
    dispatch({ type: "event", event });
  }, []);
  // Only this shared controller requests timed steps. Renderers have no playback clocks.
  useEffect(
    () =>
      schedulePlayback(session.state, send, {
        schedule: (callback, delay) => window.setTimeout(callback, delay),
        cancel: (handle) => window.clearTimeout(handle as number),
      }),
    [session.state, send],
  );
  /** Replace the machine with a replay that has already passed version and trace validation. */
  function restore(replay: Replay) {
    dispatch({ type: "load", replay });
  }
  /** Install a validated local Python run and reset discoveries whose evidence has changed. */
  function replaceTrace(trace: InferTabTrace, source: string) {
    dispatch({ type: "trace", trace, source });
  }
  return (
    <MachineContext.Provider
      value={{ ...session, send, restore, replaceTrace }}
    >
      {children}
    </MachineContext.Provider>
  );
}

/** Build and validate the initial session once, keeping all React initialization deterministic. */
function createSession(traces: TraceBundle): Session {
  validateBundle(traces);
  validateConceptGraph();
  return {
    traces,
    state: initialState(traces),
    events: [],
    source: "Committed sample trace. No local run is needed to begin.",
  };
}

const ignoreSend = () => {};
const ignoreRestore = () => {};
const ignoreReplace = () => {};

/** Present a constructed observation. Catalog playback never records learner events. */
export function MachinePresentation({
  traces,
  state,
  children,
}: {
  traces: TraceBundle;
  state: MachineState;
  children: ReactNode;
}) {
  return (
    <MachineContext.Provider
      value={{
        traces,
        state,
        events: [],
        source: "Catalog presentation of recorded traces.",
        send: ignoreSend,
        restore: ignoreRestore,
        replaceTrace: ignoreReplace,
      }}
    >
      {children}
    </MachineContext.Provider>
  );
}

/** Require the shared provider so a lens cannot silently create its own simulation state. */
export function useMachine(): MachineContextValue {
  const machine = useContext(MachineContext);
  if (!machine)
    throw new Error("The machine must be rendered inside MachineProvider.");
  return machine;
}
