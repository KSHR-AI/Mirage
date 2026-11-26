import { describe, expect, it } from "vitest";
import { ENTRIES, getEntry } from "../bench/entries";
import type { PublishedGame } from "../registry/schema";
import { getContenders, pickMatch } from "./match";
import { initialRatings } from "./ratings";

const games = ENTRIES.flatMap((entry) =>
  entry.runIds.map((id) => ({ id }) as PublishedGame),
);

describe("pickMatch", () => {
  it("only offers runs attributed to a pair", () => {
    const contenders = getContenders([
      ...games,
      { id: "unattributed" } as PublishedGame,
    ]);
    expect(contenders.map((c) => c.game.id)).not.toContain("unattributed");
    for (const c of contenders) expect(getEntry(c.entry.id)).toBe(c.entry);
  });

  it("always pairs runs from two different pairs", () => {
    const contenders = getContenders(games);
    const ratings = initialRatings();
    for (let seed = 0; seed < 200; seed += 1) {
      let x = seed + 1;
      const random = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
      const match = pickMatch(contenders, ratings, random);
      expect(match).not.toBeNull();
      expect(match![0].entry.id).not.toBe(match![1].entry.id);
    }
  });

  it("returns null with fewer than two pairs", () => {
    const one = getContenders(games.slice(0, 1));
    expect(pickMatch(one, initialRatings())).toBeNull();
  });
});
