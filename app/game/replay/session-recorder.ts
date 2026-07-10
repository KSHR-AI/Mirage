import type { InputFrame, Tick } from "../core/contracts";
import { ReplayRecorder } from "./recorder";
import type { ReplayOutcomeV1, ReplayTapeV1 } from "./types";

type ReplaySessionOutcomeBase = Omit<
  ReplayOutcomeV1,
  "completionTick" | "status"
>;

export type ReplaySessionOutcome = ReplaySessionOutcomeBase &
  (
    | {
        readonly status: "completed";
        /** Absolute GameState.tick at completion. Stored relative to this session. */
        readonly completionStateTick: Tick;
      }
    | {
        readonly status: "failed" | "abandoned";
        readonly completionStateTick?: never;
      }
  );

function stateTick(value: number, label: string): Tick {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

/**
 * Records one playable session. Replay tape ticks always start at zero, even
 * when the deterministic state was restored from a later checkpoint.
 */
export class ReplaySessionRecorder {
  readonly originStateTick: Tick;
  readonly #recorder: ReplayRecorder;

  constructor(seed: number, originStateTick: Tick) {
    this.originStateTick = stateTick(originStateTick, "Session origin tick");
    this.#recorder = new ReplayRecorder(seed);
  }

  get tickCount(): number {
    return this.#recorder.tickCount;
  }

  get finished(): boolean {
    return this.#recorder.finished;
  }

  appendFrame(input: InputFrame): Tick {
    return this.#recorder.appendFrame(input);
  }

  replayTickAt(stateTickValue: Tick): Tick {
    const absoluteTick = stateTick(stateTickValue, "State tick");
    if (absoluteTick < this.originStateTick) {
      throw new RangeError(
        `State tick ${absoluteTick} precedes session origin ${this.originStateTick}`,
      );
    }
    return absoluteTick - this.originStateTick;
  }

  recordStateHash(stateTickValue: Tick, hash: string): void {
    this.#recorder.recordHash(this.replayTickAt(stateTickValue), hash);
  }

  snapshot(): ReplayTapeV1 {
    return this.#recorder.snapshot();
  }

  finish(outcome: ReplaySessionOutcome): ReplayTapeV1 {
    const { completionStateTick, ...metadata } = outcome;
    return this.#recorder.finish({
      ...metadata,
      ...(completionStateTick === undefined
        ? {}
        : { completionTick: this.replayTickAt(completionStateTick) }),
    });
  }
}
