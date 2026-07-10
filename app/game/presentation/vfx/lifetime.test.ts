import { describe, expect, it } from "vitest";

import {
  effectAgeTicks,
  fadeEnvelope,
  isEffectActive,
  normalizedLifetime,
  pulseEnvelope,
  renderTick,
  wrapPositive,
} from "./lifetime";

describe("VFX lifetime helpers", () => {
  it("derives presentation time from fixed simulation time", () => {
    expect(renderTick(120, 0.25)).toBe(120.25);
    expect(effectAgeTicks(120, 0.25, 100)).toBe(20.25);
    expect(renderTick(Number.NaN, 4)).toBe(1);
  });

  it("treats future and expired events as inactive", () => {
    expect(isEffectActive(9, 0.9, 10, 20)).toBe(false);
    expect(isEffectActive(10, 0, 10, 20)).toBe(true);
    expect(isEffectActive(29, 0.99, 10, 20)).toBe(true);
    expect(isEffectActive(30, 0, 10, 20)).toBe(false);
    expect(normalizedLifetime(20, 0, 10, 20)).toBe(0.5);
  });

  it("provides bounded envelopes and positive wrapping", () => {
    for (const progress of [-1, 0, 0.1, 0.5, 0.9, 1, 2]) {
      expect(fadeEnvelope(progress)).toBeGreaterThanOrEqual(0);
      expect(fadeEnvelope(progress)).toBeLessThanOrEqual(1);
      expect(pulseEnvelope(progress)).toBeGreaterThanOrEqual(0);
      expect(pulseEnvelope(progress)).toBeLessThanOrEqual(1);
    }
    expect(wrapPositive(-1, 8)).toBe(7);
    expect(wrapPositive(17, 8)).toBe(1);
    expect(wrapPositive(3, 0)).toBe(0);
  });
});
