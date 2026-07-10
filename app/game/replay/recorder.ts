import {
  CONTRACT_VERSION,
  type InputFrame,
  type Tick,
} from "../core/contracts";
import {
  hasReplayInputEdge,
  inputFramesEqual,
  validateInputFrame,
  validateReplayHash,
  validateReplayTape,
} from "./codec";
import {
  REPLAY_LIMITS,
  REPLAY_TAPE_VERSION,
  type ReplayHashCheckpointV1,
  type ReplayInputRunV1,
  type ReplayOutcomeV1,
  type ReplayTapeV1,
} from "./types";

function replaySeed(seed: number): number {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("Replay seed must be an unsigned 32-bit integer");
  }
  return seed;
}

function replayTick(tick: number, maximum: number, label: string): Tick {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > maximum) {
    throw new RangeError(
      `${label} must be a safe integer from 0 to ${maximum}`,
    );
  }
  return tick;
}

export class ReplayRecorder {
  readonly seed: number;
  readonly #runs: ReplayInputRunV1[] = [];
  readonly #hashes: ReplayHashCheckpointV1[] = [];
  #tickCount = 0;
  #finished = false;

  constructor(seed: number) {
    this.seed = replaySeed(seed);
  }

  get tickCount(): number {
    return this.#tickCount;
  }

  get finished(): boolean {
    return this.#finished;
  }

  appendFrame(input: InputFrame): Tick {
    return this.recordFrame(this.#tickCount, input);
  }

  recordFrame(tick: Tick, input: InputFrame): Tick {
    this.#assertOpen();
    replayTick(tick, REPLAY_LIMITS.maxTicks - 1, "Input tick");
    if (tick !== this.#tickCount) {
      throw new RangeError(
        `Replay frames must be contiguous; expected tick ${this.#tickCount}, received ${tick}`,
      );
    }

    const safeInput = validateInputFrame(input);
    const previous = this.#runs.at(-1);
    if (
      previous &&
      !hasReplayInputEdge(previous.input) &&
      !hasReplayInputEdge(safeInput) &&
      inputFramesEqual(previous.input, safeInput)
    ) {
      this.#runs[this.#runs.length - 1] = Object.freeze({
        ...previous,
        ticks: previous.ticks + 1,
      });
    } else {
      if (this.#runs.length >= REPLAY_LIMITS.maxRuns) {
        throw new RangeError("Replay input run limit reached");
      }
      this.#runs.push(Object.freeze({ tick, ticks: 1, input: safeInput }));
    }

    this.#tickCount += 1;
    return tick;
  }

  /** Records a hash at a session-relative tape state tick. */
  recordHash(tick: Tick, hash: string): void {
    this.#assertOpen();
    replayTick(tick, this.#tickCount, "Hash checkpoint tick");
    if (this.#hashes.length >= REPLAY_LIMITS.maxHashCheckpoints) {
      throw new RangeError("Replay hash checkpoint limit reached");
    }

    const previous = this.#hashes.at(-1);
    if (previous && tick <= previous.tick) {
      throw new RangeError("Hash checkpoint ticks must be strictly increasing");
    }

    this.#hashes.push(Object.freeze({ tick, hash: validateReplayHash(hash) }));
  }

  snapshot(outcome?: ReplayOutcomeV1): ReplayTapeV1 {
    const candidate: ReplayTapeV1 = {
      version: REPLAY_TAPE_VERSION,
      contractVersion: CONTRACT_VERSION,
      seed: this.seed,
      tickCount: this.#tickCount,
      runs: this.#runs,
      ...(this.#hashes.length === 0 ? {} : { hashes: this.#hashes }),
      ...(outcome === undefined ? {} : { outcome }),
    };
    return validateReplayTape(candidate);
  }

  finish(outcome?: ReplayOutcomeV1): ReplayTapeV1 {
    this.#assertOpen();
    const replay = this.snapshot(outcome);
    this.#finished = true;
    return replay;
  }

  #assertOpen(): void {
    if (this.#finished) {
      throw new Error("Replay recorder is already finished");
    }
  }
}
