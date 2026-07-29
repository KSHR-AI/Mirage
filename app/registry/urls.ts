import {
  isSafeArtifactPath,
  type GameArtifact,
  type GameSource,
  type PublishedGame,
} from "./schema";

const LOCAL_URL_BASE = "https://local.mirageml.invalid";

export function getArtifactDigestHex(artifact: GameArtifact) {
  return artifact.digest.slice("sha256:".length);
}

export function getArtifactBasePath(game: PublishedGame) {
  return `/artifacts/${game.id}/${game.source.commit}/${getArtifactDigestHex(game.artifact)}`;
}

export function getArtifactFilePath(game: PublishedGame, path: string) {
  if (!isSafeArtifactPath(path)) {
    throw new Error("Unsafe artifact path");
  }
  return `${getArtifactBasePath(game)}/${path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

export function getArtifactEntryUrl(game: PublishedGame) {
  const url = new URL(
    getArtifactFilePath(game, game.artifact.entryPath),
    LOCAL_URL_BASE,
  );
  url.searchParams.set("embed", "mirage");
  return `${url.pathname}${url.search}`;
}

export function getCanonicalPlayPath(game: Pick<PublishedGame, "id">) {
  return `/play/${game.id}`;
}

export function getPresentationCoverUrl(game: PublishedGame) {
  const coverPath = game.presentation.coverPath;
  return typeof coverPath === "string"
    ? getArtifactFilePath(game, coverPath)
    : null;
}

export function getSourceRevisionUrl(source: GameSource) {
  const url = new URL(source.repositoryUrl);
  const repositoryPath = url.pathname.replace(/\/+$/, "").replace(/\.git$/, "");
  url.pathname = `${repositoryPath}/tree/${source.commit}`;
  return url.toString();
}
