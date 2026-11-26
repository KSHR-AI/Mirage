/**
 * Elo ratings for model + harness pairs, driven by head-to-head votes on
 * their runs. Pure functions shared by the server (vote handling) and the
 * leaderboard (display).
 */

/** Points a single vote can move a rating. */
export const K_FACTOR = 32;

/** A rating with fewer votes than this is shown as provisional. */
export const PROVISIONAL_VOTES = 20;

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
 * Starting rating before any votes, taken from the maintainers' seed index
 * (0–100). Index 45 maps to 1500; each index point is worth 10 Elo.
 */
export function seedRating(index: number) {
  return Math.round(1500 + (index - 45) * 10);
}

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
  /** Rating from the seed index; `rating` equals it until the first vote. */
  seed: number;
};

export function isProvisional(rating: Pick<Rating, "votes">) {
  return rating.votes < PROVISIONAL_VOTES;
}

/** Ratings keyed by entry ID, highest first; ties keep `ids` order. */
export function rankByRating(
  ids: readonly string[],
  ratings: Readonly<Record<string, Rating>>,
) {
  return [...ids].sort(
    (a, b) => (ratings[b]?.rating ?? 0) - (ratings[a]?.rating ?? 0),
  );
}
