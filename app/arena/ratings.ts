import { ENTRIES } from "../bench/scores";
import { seedRating, type Rating } from "./elo";
import { getVoteStore } from "./store";

export type RatingsSnapshot = {
  ratings: Record<string, Rating>;
  /** Votes cast across all entries. */
  totalVotes: number;
  /** "open" when votes are being recorded, otherwise why not. */
  status: "open" | "off" | "error";
};

/** Seed ratings for every entry, before any votes. */
export function seedRatings(): Record<string, Rating> {
  const ratings: Record<string, Rating> = {};
  for (const entry of ENTRIES) {
    const seed = seedRating(entry.index);
    ratings[entry.id] = { rating: seed, votes: 0, seed };
  }
  return ratings;
}

/** Live ratings, falling back to seeds when the store is off or failing. */
export async function loadRatings(): Promise<RatingsSnapshot> {
  const ratings = seedRatings();
  const store = getVoteStore();
  if (!store) return { ratings, totalVotes: 0, status: "off" };
  try {
    const stored = await store.getRatings();
    let votes = 0;
    for (const [id, value] of stored) {
      const current = ratings[id];
      if (!current) continue;
      ratings[id] = {
        ...current,
        rating: Math.round(value.rating),
        votes: value.votes,
      };
      votes += value.votes;
    }
    // Each vote counts toward two entries.
    return { ratings, totalVotes: Math.round(votes / 2), status: "open" };
  } catch (error) {
    console.error("Could not load arena ratings", error);
    return { ratings, totalVotes: 0, status: "error" };
  }
}
