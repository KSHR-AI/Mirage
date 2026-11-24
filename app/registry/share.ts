import { getRecordedModel } from "./evidence";
import type { PublishedGame } from "./schema";
import { getCanonicalPlayPath } from "./urls";

type ShareableGame = Pick<PublishedGame, "id" | "track" | "title" | "model">;

/**
 * A benchmark run is described by its task. A showcase is only named: its
 * record does not establish what was asked of which model.
 */
export function getShareText(game: ShareableGame) {
  const model = getRecordedModel(game);
  if (game.track === "benchmark" && model) {
    return `Can a coding model build GTA in SF? ${model} shipped ${game.title}. Play it in your browser:`;
  }
  if (game.track === "benchmark") {
    return `Can a coding model build GTA in SF? Play ${game.title} in your browser:`;
  }
  return model
    ? `${game.title}, a showcase by ${model} on MirageML Bench. Play it in your browser:`
    : `${game.title}, a showcase on MirageML Bench. Play it in your browser:`;
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
