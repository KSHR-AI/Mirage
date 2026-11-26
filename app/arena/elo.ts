/**
 * Elo ratings for model + harness pairs, driven by head-to-head votes on
 * their runs. Pure functions shared by the server (vote handling) and the
 * leaderboard (display).
 */

/** Points a single vote can move a rating. */
export const K_FACTOR = 32;

export type Outcome = "a" | "b" | "tie";

export const OUTCOMES: readonly Outcome[] = ["a", "b", "tie"];

export function isOutcome(value: unknown): value is Outcome {
  return value === "a" || value === "b" || value === "tie";
}

/** Probability that a player rated `rating` beats one rated `opponent`. */
export function expectedScore(rating: number, opponent: number) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** Both ratings after one vote. The total of the two is unchanged. */
export function applyVote(
  ratingA: number,
  ratingB: number,
  outcome: Outcome,
  k = K_FACTOR,
) {
  const expectedA = expectedScore(ratingA, ratingB);
  const scoreA = outcome === "a" ? 1 : outcome === "b" ? 0 : 0.5;
  const delta = k * (scoreA - expectedA);
  return { a: ratingA + delta, b: ratingB - delta };
}

/**
 * Every pair starts here before its first vote. There are no maintainer
 * scores to seed from: standing comes only from votes.
 */
export const INITIAL_RATING = 1500;

/**
 * A rough ± band for a rating after `votes` votes. It narrows as votes
 * accumulate; it is a display aid, not a statistical interval.
 */
export function ratingSpread(votes: number) {
  return Math.round(350 / Math.sqrt(votes + 1));
}

export type Rating = {
  /** Current rating, rounded for display. */
  rating: number;
  /** Votes this entry has taken part in. */
  votes: number;
};

/** Entry IDs by rating, highest first; equal ratings sort by ID. */
export function rankByRating(
  ids: readonly string[],
  ratings: Readonly<Record<string, Rating>>,
) {
  const value = (id: string) => ratings[id]?.rating ?? INITIAL_RATING;
  return [...ids].sort((a, b) => value(b) - value(a) || a.localeCompare(b));
}

/**
 * Standard competition rank (1, 2, 2, 4) by rating: equal ratings share a
 * rank, so pairs nobody has voted on yet are not ordered by anything else.
 */
export function ratingRanks(
  ids: readonly string[],
  ratings: Readonly<Record<string, Rating>>,
) {
  const value = (id: string) => ratings[id]?.rating ?? INITIAL_RATING;
  const ranks = new Map<string, number>();
  for (const id of ids) {
    ranks.set(id, 1 + ids.filter((other) => value(other) > value(id)).length);
  }
  return ranks;
}
