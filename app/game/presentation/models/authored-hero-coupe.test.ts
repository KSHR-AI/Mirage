import { describe, expect, it } from "vitest";

import {
  AUTHORED_HERO_COUPE_SCALE,
  advanceAuthoredWheelSpin,
} from "./authored-hero-coupe";

describe("authored hero coupe", () => {
  it("advances wheel spin deterministically and wraps full rotations", () => {
    const first = advanceAuthoredWheelSpin(6.2, 12, 1 / 60);
    const second = advanceAuthoredWheelSpin(6.2, 12, 1 / 60);

    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(Math.PI * 2);
  });

  it("clamps suspended-frame time and rejects non-finite signals", () => {
    expect(advanceAuthoredWheelSpin(1, Number.NaN, 1)).toBe(1);
    expect(advanceAuthoredWheelSpin(0, 10, 10)).toBeCloseTo(4.8);
    expect(AUTHORED_HERO_COUPE_SCALE).toBeGreaterThan(0.7);
  });
});
