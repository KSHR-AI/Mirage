import { getRecordedModel } from "./evidence";
import type { PublishedGame } from "./schema";
import { getCanonicalPlayPath } from "./urls";

type ShareableGame = Pick<PublishedGame, "id" | "title" | "model">;

/** Names the model only when the record does. */
export function getShareText(game: ShareableGame) {
  const model = getRecordedModel(game);
  return model
    ? `Can a coding model build GTA in SF? ${model} shipped ${game.title}. Play it in your browser:`
    : `Can a coding model build GTA in SF? Play ${game.title} in your browser:`;
}

export function getShareUrl(origin: string, game: Pick<PublishedGame, "id">) {
  return new URL(getCanonicalPlayPath(game), origin).toString();
}

export function getPostIntentUrl(origin: string, game: ShareableGame) {
  const url = new URL("https://x.com/intent/post");
  url.searchParams.set("text", getShareText(game));
  url.searchParams.set("url", getShareUrl(origin, game));
  return url.toString();
}

/** The home-page address that opens one run's evidence record. */
export function getRecordPath(game: Pick<PublishedGame, "id">) {
  return `/?run=${encodeURIComponent(game.id)}`;
}
