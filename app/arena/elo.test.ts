import { describe, expect, it } from "vitest";
import {
  applyVote,
  expectedScore,
  INITIAL_RATING,
  rankByRating,
  ratingRanks,
  ratingSpread,
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

  it("starts every pair at the same rating", () => {
    expect(INITIAL_RATING).toBe(1500);
  });

  it("narrows the spread with votes", () => {
    expect(ratingSpread(0)).toBeGreaterThan(ratingSpread(50));
  });

  it("ranks highest rating first and ties by ID", () => {
    const ratings = {
      a: { rating: 1500, votes: 0 },
      b: { rating: 1600, votes: 3 },
      c: { rating: 1500, votes: 0 },
    };
    expect(rankByRating(["c", "a", "b"], ratings)).toEqual(["b", "a", "c"]);
  });

  it("gives equal ratings the same rank", () => {
    const ratings = {
      a: { rating: 1500, votes: 0 },
      b: { rating: 1600, votes: 3 },
      c: { rating: 1500, votes: 0 },
      d: { rating: 1400, votes: 2 },
    };
    const ranks = ratingRanks(["a", "b", "c", "d"], ratings);
    expect([...ranks]).toEqual([
      ["a", 2],
      ["b", 1],
      ["c", 2],
      ["d", 4],
    ]);
  });
});
