import { describe, expect, it } from "vitest";

import { RngStreams, SeededRng, createRng, deriveSeed } from "./rng";

describe("seeded RNG", () => {
  it("replays the same sequence for the same numeric or string seed", () => {
    const first = new SeededRng(0xdecafbad);
    const second = createRng(0xdecafbad);

    expect(Array.from({ length: 8 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => second.nextUint32()),
    );

    const stringSeedA = new SeededRng("mirage-bay");
    const stringSeedB = new SeededRng("mirage-bay");
    expect(stringSeedA.next()).toBe(stringSeedB.next());
  });

  it("derives named streams independently of access order", () => {
    const first = new RngStreams(42);
    const trafficFirst = Array.from({ length: 4 }, () =>
      first.stream("traffic").next(),
    );
    const policeFirst = Array.from({ length: 4 }, () =>
      first.stream("police").next(),
    );

    const second = new RngStreams(42);
    const policeSecond = Array.from({ length: 4 }, () =>
      second.stream("police").next(),
    );
    const trafficSecond = Array.from({ length: 4 }, () =>
      second.stream("traffic").next(),
    );

    expect(trafficSecond).toEqual(trafficFirst);
    expect(policeSecond).toEqual(policeFirst);
    expect(trafficFirst).not.toEqual(policeFirst);
    expect(deriveSeed(42, "traffic")).not.toBe(deriveSeed(42, "police"));
  });

  it("snapshots and restores every materialized stream", () => {
    const streams = new RngStreams(1234);
    streams.stream("world").next();
    streams.stream("combat").next();
    const snapshot = streams.snapshot();

    const expected = [
      streams.stream("world").nextUint32(),
      streams.stream("combat").nextUint32(),
    ];
    streams.stream("temporary").next();

    streams.restore(snapshot);

    expect(streams.has("temporary")).toBe(false);
    expect([
      streams.stream("world").nextUint32(),
      streams.stream("combat").nextUint32(),
    ]).toEqual(expected);
  });

  it("provides deterministic bounded helpers", () => {
    const rng = new SeededRng(7);

    for (let index = 0; index < 100; index += 1) {
      expect(rng.int(-3, 5)).toBeGreaterThanOrEqual(-3);
      expect(rng.int(-3, 5)).toBeLessThan(5);
      expect(rng.range(10, 20)).toBeGreaterThanOrEqual(10);
      expect(rng.range(10, 20)).toBeLessThan(20);
    }

    expect(() => rng.pick([])).toThrow(/empty/);
    expect(() => rng.chance(1.1)).toThrow(/probability/);
  });
});
