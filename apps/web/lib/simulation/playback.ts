import type { MachineState, SimulationEvent } from "./model";

/** Clock scheduling is replaceable in tests. It requests a trace step, never calculates inference. */
export interface PlaybackClock {
  schedule: (callback: () => void, delay: number) => unknown;
  cancel: (handle: unknown) => void;
}

/** Schedule one guarded timeline intent. Cleanup and reducer epoch checks reject obsolete or duplicate ticks. */
export function schedulePlayback(
  state: MachineState,
  send: (event: SimulationEvent) => void,
  clock: PlaybackClock,
): () => void {
  if (!state.playing) return () => {};
  const handle = clock.schedule(
    () =>
      send({
        type: "timeline.tick",
        epoch: state.playbackEpoch,
        fromStep: state.playhead,
      }),
    1800,
  );
  return () => clock.cancel(handle);
}
