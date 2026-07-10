import { describe, expect, it } from "vitest";

import { hashVfxId, mixVfxSeed, vfxRandom01, vfxSigned } from "./seed";

describe("VFX deterministic seeds", () => {
  it("repeats the same stream and separates ids, ordinals, and lanes", () => {
    expect(mixVfxSeed(2407, "impact-4", 3, 2)).toBe(
      mixVfxSeed(2407, "impact-4", 3, 2),
    );
    expect(
      new Set([
        mixVfxSeed(2407, "impact-4", 3, 2),
        mixVfxSeed(2408, "impact-4", 3, 2),
        mixVfxSeed(2407, "impact-5", 3, 2),
        mixVfxSeed(2407, "impact-4", 4, 2),
        mixVfxSeed(2407, "impact-4", 3, 3),
      ]).size,
    ).toBe(5);
  });

  it("hashes numeric and string ids without accepting non-finite entropy", () => {
    expect(hashVfxId("courier:110")).toBe(hashVfxId("courier:110"));
    expect(hashVfxId(110)).not.toBe(hashVfxId("110"));
    expect(hashVfxId(Number.NaN)).toBe(hashVfxId(0));
  });

  it("produces bounded unsigned and signed samples", () => {
    for (let lane = 0; lane < 64; lane += 1) {
      const unsigned = vfxRandom01(0xdeadbeef, lane);
      const signed = vfxSigned(0xdeadbeef, lane);
      expect(unsigned).toBeGreaterThanOrEqual(0);
      expect(unsigned).toBeLessThan(1);
      expect(signed).toBeGreaterThanOrEqual(-1);
      expect(signed).toBeLessThan(1);
    }
  });
});
