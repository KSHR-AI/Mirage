import { SIMULATION_DT } from "./contracts";
import type {
  GameEvent,
  GameRuntime,
  InputFrame,
  RenderSnapshot,
} from "./contracts";

export interface BrowserLoopFrame {
  readonly snapshot: RenderSnapshot;
  readonly events: readonly GameEvent[];
  readonly simulatedSteps: number;
  readonly droppedSeconds: number;
  readonly elapsedSeconds: number;
}

export interface BrowserLoopOptions {
  readonly runtime: GameRuntime;
  readonly readInput: () => InputFrame;
  readonly render: (frame: BrowserLoopFrame) => void;
  readonly maxCatchUpSteps?: number;
  readonly maxFrameDeltaSeconds?: number;
  readonly scheduler?: FrameScheduler;
}

export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
}

export interface FixedStepAdvanceResult {
  readonly alpha: number;
  readonly simulatedSteps: number;
  readonly droppedSeconds: number;
  readonly accumulatorSeconds: number;
}

export interface FixedStepClockOptions {
  readonly stepSeconds?: number;
  readonly maxCatchUpSteps?: number;
  readonly maxFrameDeltaSeconds?: number;
}

const DEFAULT_MAX_CATCH_UP_STEPS = 5;
const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.25;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maxCatchUpSteps: number;
  readonly maxFrameDeltaSeconds: number;

  private accumulatorSeconds = 0;

  constructor(options: FixedStepClockOptions = {}) {
    this.stepSeconds = finitePositive(options.stepSeconds, SIMULATION_DT);
    this.maxCatchUpSteps = Math.max(
      1,
      Math.floor(
        finitePositive(options.maxCatchUpSteps, DEFAULT_MAX_CATCH_UP_STEPS),
      ),
    );
    this.maxFrameDeltaSeconds = finitePositive(
      options.maxFrameDeltaSeconds,
      DEFAULT_MAX_FRAME_DELTA_SECONDS,
    );
  }

  reset(): void {
    this.accumulatorSeconds = 0;
  }

  advance(
    elapsedSeconds: number,
    simulate: () => void,
  ): FixedStepAdvanceResult {
    const safeElapsed = Number.isFinite(elapsedSeconds)
      ? clamp(elapsedSeconds, 0, this.maxFrameDeltaSeconds)
      : 0;
    this.accumulatorSeconds += safeElapsed;

    let simulatedSteps = 0;
    while (
      this.accumulatorSeconds >= this.stepSeconds &&
      simulatedSteps < this.maxCatchUpSteps
    ) {
      simulate();
      this.accumulatorSeconds -= this.stepSeconds;
      simulatedSteps += 1;
    }

    let droppedSeconds = 0;
    if (this.accumulatorSeconds >= this.stepSeconds) {
      const retained = this.accumulatorSeconds % this.stepSeconds;
      droppedSeconds = this.accumulatorSeconds - retained;
      this.accumulatorSeconds = retained;
    }

    return {
      alpha: clamp(this.accumulatorSeconds / this.stepSeconds, 0, 1),
      simulatedSteps,
      droppedSeconds,
      accumulatorSeconds: this.accumulatorSeconds,
    };
  }
}

export function createAnimationFrameScheduler(): FrameScheduler {
  return {
    request(callback) {
      return window.requestAnimationFrame(callback);
    },
    cancel(handle) {
      window.cancelAnimationFrame(handle);
    },
  };
}

export class BrowserGameLoop {
  private readonly runtime: GameRuntime;
  private readonly readInput: () => InputFrame;
  private readonly render: (frame: BrowserLoopFrame) => void;
  private readonly scheduler: FrameScheduler;
  private readonly clock: FixedStepClock;

  private animationHandle: number | null = null;
  private lastTimestampMs: number | null = null;
  private running = false;
  private suspended = false;

  constructor(options: BrowserLoopOptions) {
    this.runtime = options.runtime;
    this.readInput = options.readInput;
    this.render = options.render;
    this.scheduler = options.scheduler ?? createAnimationFrameScheduler();
    this.clock = new FixedStepClock({
      maxCatchUpSteps: options.maxCatchUpSteps,
      maxFrameDeltaSeconds: options.maxFrameDeltaSeconds,
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestampMs = null;
    this.clock.reset();
    this.animationHandle = this.scheduler.request(this.onFrame);
  }

  stop(): void {
    this.running = false;
    this.lastTimestampMs = null;
    this.clock.reset();
    if (this.animationHandle !== null) {
      this.scheduler.cancel(this.animationHandle);
      this.animationHandle = null;
    }
  }

  setSuspended(suspended: boolean): void {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    this.lastTimestampMs = null;
    this.clock.reset();
  }

  private readonly onFrame: FrameRequestCallback = (timestampMs) => {
    if (!this.running) return;

    const previousTimestamp = this.lastTimestampMs;
    this.lastTimestampMs = timestampMs;
    const elapsedSeconds =
      previousTimestamp === null
        ? 0
        : Math.max(0, (timestampMs - previousTimestamp) / 1000);
    const events: GameEvent[] = [];

    const result = this.suspended
      ? {
          alpha: 0,
          simulatedSteps: 0,
          droppedSeconds: 0,
          accumulatorSeconds: 0,
        }
      : this.clock.advance(elapsedSeconds, () => {
          this.runtime.command(this.readInput());
          events.push(...this.runtime.advance());
        });

    this.render({
      snapshot: this.runtime.snapshot(result.alpha),
      events: Object.freeze(events),
      simulatedSteps: result.simulatedSteps,
      droppedSeconds: result.droppedSeconds,
      elapsedSeconds,
    });

    this.animationHandle = this.running
      ? this.scheduler.request(this.onFrame)
      : null;
  };
}
