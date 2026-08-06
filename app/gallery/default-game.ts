import type { PublishedGame } from "../registry/schema";

export const DEFAULT_GAME_ID = "opus-sanfran";

export function getDefaultGameId(games: readonly Pick<PublishedGame, "id">[]) {
  return games.find((game) => game.id === DEFAULT_GAME_ID)?.id ?? games[0]?.id;
}
