import { initialState, reduceMachine } from "@/lib/simulation/model";
import {
  decodeReplay,
  encodeReplay,
  type Replay,
} from "@/lib/simulation/replay";
import { projectVisualFrame, type VisualFrame } from "./projection";

/** Yield reproducible semantic frames on demand; normal learning never loads an encoder or stores frame history. */
export function* explanationFrames(
  recording: Replay,
): Generator<{ eventIndex: number; frame: VisualFrame }> {
  const replay = decodeReplay(encodeReplay(recording));
  let state = initialState(replay.traces);
  const initialFrame = projectVisualFrame(
    state,
    replay.traces,
    state.activeLesson,
  );
  let lastFrame = JSON.stringify(initialFrame);
  yield { eventIndex: -1, frame: initialFrame };
  for (const [eventIndex, event] of replay.events.entries()) {
    state = reduceMachine(state, event, replay.traces);
    const frame = projectVisualFrame(state, replay.traces, state.activeLesson);
    const signature = JSON.stringify(frame);
    if (signature === lastFrame) continue;
    lastFrame = signature;
    yield { eventIndex, frame };
  }
}
