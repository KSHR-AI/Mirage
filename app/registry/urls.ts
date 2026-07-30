import type { GameSource, PublishedGame } from "./schema";

export function getDeploymentEntryUrl(game: PublishedGame) {
  const url = new URL(game.deployment.url);
  url.searchParams.set("embed", "mirage");
  return url.toString();
}

export function getCanonicalPlayPath(game: Pick<PublishedGame, "id">) {
  return `/play/${game.id}`;
}

export function getPresentationCoverUrl(game: PublishedGame) {
  return new URL(game.presentation.coverPath, game.deployment.url).toString();
}

export function getSourceRevisionUrl(source: GameSource) {
  const url = new URL(source.repositoryUrl);
  const repositoryPath = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
  url.pathname = `${repositoryPath}/tree/${source.commit}`;
  return url.toString();
}
