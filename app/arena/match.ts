import { getEntryForRun, type Entry } from "../bench/entries";
import type { PublishedGame } from "../registry/schema";
import type { Rating } from "./elo";
import { signMatchup } from "./security";

export type Contender = { game: PublishedGame; entry: Entry };

/** Published runs attributed to a model + harness pair on the leaderboard. */
export function getContenders(games: readonly PublishedGame[]): Contender[] {
  const contenders: Contender[] = [];
  for (const game of games) {
    const entry = getEntryForRun(game.id);
    if (entry) contenders.push({ game, entry });
  }
  return contenders;
}

/**
 * Two different runs. The first leans toward runs with fewer votes so new
 * runs gather votes sooner; the second is uniform among the rest.
 */
export function pickMatch(
  contenders: readonly Contender[],
  ratings: Readonly<Record<string, Rating>>,
  random: () => number = Math.random,
): [Contender, Contender] | null {
  const weights = contenders.map(
    (c) => 1 / Math.sqrt((ratings[c.game.id]?.votes ?? 0) + 1),
  );
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  let firstIndex = contenders.length - 1;
  for (let i = 0; i < contenders.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) {
      firstIndex = i;
      break;
    }
  }
  const first = contenders[firstIndex];
  if (!first) return null;
  const rest = contenders.filter((c) => c.game.id !== first.game.id);
  if (rest.length === 0) return null;
  const second =
    rest[Math.min(rest.length - 1, Math.floor(random() * rest.length))];
  return random() < 0.5 ? [first, second] : [second, first];
}

/** A fresh matchup and, when voting is open, the token that lets it be voted on. */
export function offerMatch(
  contenders: readonly Contender[],
  ratings: Readonly<Record<string, Rating>>,
  secret: string | null,
) {
  const match = pickMatch(contenders, ratings);
  const token =
    match && secret
      ? signMatchup(secret, {
          a: match[0].game.id,
          b: match[1].game.id,
          issuedAt: Date.now(),
        })
      : null;
  return { match, token };
}
