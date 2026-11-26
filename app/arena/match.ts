import { getEntryForRun, type Entry } from "../bench/entries";
import type { PublishedGame } from "../registry/schema";
import { getCanonicalPlayPath } from "../registry/urls";
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

/** The matchup named by a URL's run ids, or null when they don't name two contenders. */
export function findMatch(
  contenders: readonly Contender[],
  a: unknown,
  b: unknown,
): [Contender, Contender] | null {
  if (typeof a !== "string" || typeof b !== "string" || a === b) return null;
  const first = contenders.find((c) => c.game.id === a);
  const second = contenders.find((c) => c.game.id === b);
  return first && second ? [first, second] : null;
}

/** The URL that shows a matchup, so returning to it shows the same pair. */
export function matchPath(match: readonly [Contender, Contender]) {
  return arenaPath(match[0].game.id, match[1].game.id);
}

export function arenaPath(a: string, b: string) {
  return `/arena?${new URLSearchParams({ a, b })}`;
}

/** A run's play page, opened from a matchup, whose back link returns to it. */
export function arenaPlayPath(
  game: PublishedGame,
  match: readonly [Contender, Contender],
) {
  const query = new URLSearchParams({
    from: "arena",
    a: match[0].game.id,
    b: match[1].game.id,
  });
  return `${getCanonicalPlayPath(game)}?${query}`;
}

/** Where a play page's back link goes, given the query it was opened with. */
export function playBackLink(query: Record<string, unknown>) {
  const { from, a, b } = query;
  if (from === "arena" && typeof a === "string" && typeof b === "string") {
    return { href: arenaPath(a, b), label: "Back to arena" };
  }
  return { href: "/", label: "Back to benchmark" };
}

/** A matchup and, when voting is open, the token that lets it be voted on. */
export function offerMatch(
  contenders: readonly Contender[],
  ratings: Readonly<Record<string, Rating>>,
  secret: string | null,
  chosen: [Contender, Contender] | null = null,
) {
  const match = chosen ?? pickMatch(contenders, ratings);
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
