import { describe, expect, it, vi } from "vitest";
import { FixedStepClock } from "./browser-loop";

describe("FixedStepClock", () => {
  it("advances an exact number of fixed simulation steps", () => {
    const clock = new FixedStepClock({
      stepSeconds: 0.1,
      maxFrameDeltaSeconds: 1,
    });
    const simulate = vi.fn();

    const result = clock.advance(0.35, simulate);

    expect(simulate).toHaveBeenCalledTimes(3);
    expect(result.simulatedSteps).toBe(3);
    expect(result.accumulatorSeconds).toBeCloseTo(0.05);
    expect(result.alpha).toBeCloseTo(0.5);
  });

  it("retains substep time between render frames", () => {
    const clock = new FixedStepClock({ stepSeconds: 0.1 });
    const simulate = vi.fn();

    clock.advance(0.06, simulate);
    const result = clock.advance(0.06, simulate);

    expect(simulate).toHaveBeenCalledTimes(1);
    expect(result.accumulatorSeconds).toBeCloseTo(0.02);
  });

  it("drops excess catch-up time while retaining interpolation remainder", () => {
    const clock = new FixedStepClock({
      stepSeconds: 0.1,
      maxCatchUpSteps: 2,
      maxFrameDeltaSeconds: 1,
    });
    const simulate = vi.fn();

    const result = clock.advance(0.57, simulate);

    expect(simulate).toHaveBeenCalledTimes(2);
    expect(result.droppedSeconds).toBeCloseTo(0.3);
    expect(result.accumulatorSeconds).toBeCloseTo(0.07);
    expect(result.alpha).toBeCloseTo(0.7);
  });

  it("clamps pathological frame deltas", () => {
    const clock = new FixedStepClock({
      stepSeconds: 0.05,
      maxCatchUpSteps: 10,
      maxFrameDeltaSeconds: 0.12,
    });
    const simulate = vi.fn();

    clock.advance(12, simulate);
    clock.advance(Number.NaN, simulate);

    expect(simulate).toHaveBeenCalledTimes(2);
  });

  it("resets accumulated time", () => {
    const clock = new FixedStepClock({ stepSeconds: 0.1 });
    const simulate = vi.fn();
    clock.advance(0.08, simulate);

    clock.reset();
    const result = clock.advance(0.03, simulate);

    expect(result.accumulatorSeconds).toBeCloseTo(0.03);
    expect(simulate).not.toHaveBeenCalled();
  });
});
