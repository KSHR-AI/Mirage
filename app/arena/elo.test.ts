import { describe, expect, it } from "vitest";
import {
  applyVote,
  expectedScore,
  isProvisional,
  PROVISIONAL_VOTES,
  rankByRating,
  ratingSpread,
  seedRating,
} from "./elo";

describe("elo", () => {
  it("gives even odds to equal ratings", () => {
    expect(expectedScore(1500, 1500)).toBe(0.5);
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11);
  });

  it("moves 16 points between equal ratings on a win", () => {
    const next = applyVote(1500, 1500, "a");
    expect(next.a).toBe(1516);
    expect(next.b).toBe(1484);
  });

  it("keeps the total unchanged", () => {
    for (const outcome of ["a", "b", "tie"] as const) {
      const next = applyVote(1620, 1410, outcome);
      expect(next.a + next.b).toBeCloseTo(1620 + 1410);
    }
  });

  it("pulls ratings together on a tie", () => {
    const next = applyVote(1600, 1400, "tie");
    expect(next.a).toBeLessThan(1600);
    expect(next.b).toBeGreaterThan(1400);
  });

  it("rewards an upset more than an expected win", () => {
    const upset = applyVote(1400, 1600, "a").a - 1400;
    const expected = applyVote(1600, 1400, "a").a - 1600;
    expect(upset).toBeGreaterThan(expected);
  });

  it("seeds ratings from the index", () => {
    expect(seedRating(45)).toBe(1500);
    expect(seedRating(60)).toBe(1650);
    expect(seedRating(30.4)).toBe(1354);
  });

  it("narrows the spread and clears provisional status with votes", () => {
    expect(ratingSpread(0)).toBeGreaterThan(ratingSpread(50));
    expect(isProvisional({ votes: PROVISIONAL_VOTES - 1 })).toBe(true);
    expect(isProvisional({ votes: PROVISIONAL_VOTES })).toBe(false);
  });

  it("ranks highest rating first", () => {
    const ratings = {
      a: { rating: 1500, votes: 0, seed: 1500 },
      b: { rating: 1600, votes: 3, seed: 1500 },
    };
    expect(rankByRating(["a", "b"], ratings)).toEqual(["b", "a"]);
  });
});
