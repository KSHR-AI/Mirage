import type { InputFrame, Tick } from "../core/contracts";
import { validateReplayHash, validateReplayTape } from "./codec";
import type {
  ReplayHashDivergence,
  ReplayHashVerification,
  ReplayStep,
  ReplayTapeV1,
} from "./types";

function checkedTick(tick: Tick, maximum: number): Tick {
  if (!Number.isSafeInteger(tick) || tick < 0 || tick > maximum) {
    throw new RangeError(
      `Replay tick must be a safe integer from 0 to ${maximum}`,
    );
  }
  return tick;
}

export class ReplayPlayer implements IterableIterator<ReplayStep> {
  readonly tape: ReplayTapeV1;
  readonly #hashes: ReadonlyMap<Tick, string>;
  #cursor = 0;
  #runIndex = 0;
  #firstDivergence?: ReplayHashDivergence;

  constructor(tape: ReplayTapeV1) {
    this.tape = validateReplayTape(tape);
    this.#hashes = new Map(
      this.tape.hashes?.map(({ tick, hash }) => [tick, hash] as const) ?? [],
    );
  }

  get cursor(): Tick {
    return this.#cursor;
  }

  get done(): boolean {
    return this.#cursor >= this.tape.tickCount;
  }

  get firstDivergence(): ReplayHashDivergence | undefined {
    return this.#firstDivergence;
  }

  [Symbol.iterator](): IterableIterator<ReplayStep> {
    return this;
  }

  next(): IteratorResult<ReplayStep> {
    if (this.done) {
      return { done: true, value: undefined };
    }

    const tick = this.#cursor;
    const run = this.tape.runs[this.#runIndex];
    if (!run || tick < run.tick || tick >= run.tick + run.ticks) {
      throw new Error(`Replay run index is invalid at tick ${tick}`);
    }

    const resultingStateTick = tick + 1;
    const expectedStateHash = this.#hashes.get(resultingStateTick);
    const step: ReplayStep = Object.freeze({
      tick,
      input: run.input,
      resultingStateTick,
      ...(expectedStateHash === undefined ? {} : { expectedStateHash }),
    });

    this.#cursor = resultingStateTick;
    if (this.#cursor >= run.tick + run.ticks) {
      this.#runIndex += 1;
    }
    return { done: false, value: step };
  }

  reset(): void {
    this.#cursor = 0;
    this.#runIndex = 0;
    this.#firstDivergence = undefined;
  }

  frameAt(tick: Tick): InputFrame {
    checkedTick(tick, Math.max(0, this.tape.tickCount - 1));
    if (this.tape.tickCount === 0) {
      throw new RangeError("An empty replay has no input frames");
    }

    let low = 0;
    let high = this.tape.runs.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const run = this.tape.runs[middle];
      if (!run) break;
      if (tick < run.tick) {
        high = middle - 1;
      } else if (tick >= run.tick + run.ticks) {
        low = middle + 1;
      } else {
        return run.input;
      }
    }

    throw new Error(`Replay does not contain input for tick ${tick}`);
  }

  expectedHashAt(tick: Tick): string | undefined {
    checkedTick(tick, this.tape.tickCount);
    return this.#hashes.get(tick);
  }

  verifyHash(tick: Tick, actualHash: string): ReplayHashVerification {
    checkedTick(tick, this.tape.tickCount);
    const actual = validateReplayHash(actualHash, "actualHash");
    const expected = this.#hashes.get(tick);
    if (expected === undefined) {
      return Object.freeze({
        status: "not-recorded",
        tick,
        actualHash: actual,
      });
    }

    if (expected === actual) {
      return Object.freeze({
        status: "match",
        tick,
        expectedHash: expected,
        actualHash: actual,
      });
    }

    const divergence: ReplayHashDivergence = Object.freeze({
      status: "diverged",
      tick,
      expectedHash: expected,
      actualHash: actual,
    });
    this.#firstDivergence ??= divergence;
    return divergence;
  }
}

export function replaySteps(tape: ReplayTapeV1): Iterable<ReplayStep> {
  return new ReplayPlayer(tape);
}
