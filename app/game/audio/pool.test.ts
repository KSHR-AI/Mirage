import { describe, expect, it } from "vitest";
import { DeterministicCuePool } from "./pool";

describe("DeterministicCuePool", () => {
  it("keeps overlapping cues within the voice budget", () => {
    const pool = new DeterministicCuePool(4);

    for (let index = 0; index < 9; index += 1) {
      pool.allocate({
        duration: 0.4,
        now: 1,
        priority: index % 3,
        token: `cue-${index}`,
      });
    }

    const active = pool.snapshot(1.1);
    expect(active).toHaveLength(4);
    expect(new Set(active.map((voice) => voice.voiceIndex))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });

  it("deduplicates tokenized cues until their reservation expires", () => {
    const pool = new DeterministicCuePool(2);

    const first = pool.allocate({
      duration: 0.2,
      now: 4,
      priority: 2,
      token: "impact:10",
    });
    const duplicate = pool.allocate({
      duration: 0.2,
      now: 4.05,
      priority: 2,
      token: "impact:10",
    });
    const afterExpiry = pool.allocate({
      duration: 0.2,
      now: 4.6,
      priority: 2,
      token: "impact:10",
    });

    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(afterExpiry).not.toBeNull();
  });

  it("reuses freed voices deterministically", () => {
    const pool = new DeterministicCuePool(2);

    const first = pool.allocate({
      duration: 0.08,
      now: 0,
      priority: 1,
      token: "first",
    });
    pool.allocate({
      duration: 0.4,
      now: 0,
      priority: 1,
      token: "second",
    });
    const reused = pool.allocate({
      duration: 0.1,
      now: 0.2,
      priority: 1,
      token: "third",
    });

    expect(first?.voiceIndex).toBe(0);
    expect(reused?.voiceIndex).toBe(0);
    expect(pool.activeCount(0.21)).toBe(2);
  });

  it("drops a lower-priority cue when every voice is more important", () => {
    const pool = new DeterministicCuePool(2);
    pool.allocate({ duration: 1, now: 0, priority: 4, token: "critical-a" });
    pool.allocate({ duration: 1, now: 0, priority: 3, token: "critical-b" });

    expect(
      pool.allocate({ duration: 1, now: 0.1, priority: 1, token: "minor" }),
    ).toBeNull();
    expect(pool.snapshot(0.1).map((voice) => voice.token)).toEqual([
      "critical-a",
      "critical-b",
    ]);
  });

  it("rejects invalid voice budgets", () => {
    expect(() => new DeterministicCuePool(0)).toThrow(RangeError);
    expect(() => new DeterministicCuePool(1.5)).toThrow(RangeError);
  });
});
