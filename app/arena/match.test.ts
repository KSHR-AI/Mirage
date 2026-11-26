import { describe, expect, it } from "vitest";
import { ENTRIES, getEntry } from "../bench/entries";
import type { PublishedGame } from "../registry/schema";
import {
  arenaPlayPath,
  findMatch,
  getContenders,
  matchPath,
  pickMatch,
  playBackLink,
} from "./match";
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

  it("always offers two different runs", () => {
    const contenders = getContenders(games);
    const ratings = initialRatings();
    for (let seed = 0; seed < 200; seed += 1) {
      let x = seed + 1;
      const random = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646;
      const match = pickMatch(contenders, ratings, random);
      expect(match).not.toBeNull();
      expect(match![0].game.id).not.toBe(match![1].game.id);
    }
  });

  it("returns null with fewer than two runs", () => {
    const one = getContenders(games.slice(0, 1));
    expect(pickMatch(one, initialRatings())).toBeNull();
  });
});

describe("findMatch", () => {
  const contenders = getContenders(games);
  const [a, b] = contenders.map((c) => c.game.id);

  it("returns the pair a URL names, in order", () => {
    const match = findMatch(contenders, a, b);
    expect(match?.map((c) => c.game.id)).toEqual([a, b]);
    expect(matchPath(match!)).toBe(
      `/arena?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`,
    );
  });

  it("rejects missing, repeated or unknown runs", () => {
    expect(findMatch(contenders, undefined, b)).toBeNull();
    expect(findMatch(contenders, a, a)).toBeNull();
    expect(findMatch(contenders, a, "not-a-run")).toBeNull();
    expect(findMatch(contenders, [a], b)).toBeNull();
  });
});

describe("playBackLink", () => {
  const contenders = getContenders(games);
  const match = findMatch(
    contenders,
    contenders[0].game.id,
    contenders[1].game.id,
  )!;

  it("sends a game opened from the arena back to the same pair", () => {
    const url = new URL(arenaPlayPath(match[1].game, match), "https://x");
    expect(url.pathname).toBe(`/play/${match[1].game.id}`);
    const back = playBackLink(Object.fromEntries(url.searchParams));
    expect(back).toEqual({ href: matchPath(match), label: "Arena" });
  });

  it("falls back to the benchmark otherwise", () => {
    expect(playBackLink({})).toEqual({ href: "/", label: "Leaderboard" });
    expect(playBackLink({ from: "arena", a: "x" }).href).toBe("/");
  });
});
