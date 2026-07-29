import { describe, expect, it } from "vitest";
import type { PublishedGame } from "./schema";
import {
  getArtifactBasePath,
  getArtifactEntryUrl,
  getArtifactFilePath,
  getCanonicalPlayPath,
  getPresentationCoverUrl,
  getSourceRevisionUrl,
} from "./urls";

const game: PublishedGame = {
  id: "night-drive-001",
  title: "Night Drive",
  tagline: "Drive",
  description: "A game",
  model: "example-model",
  builtOn: "2026-07-29",
  source: {
    repositoryUrl: "https://github.com/example/night-drive",
    commit: "1".repeat(40),
  },
  artifact: {
    digest: `sha256:${"a".repeat(64)}`,
    manifestDigest: `sha256:${"b".repeat(64)}`,
    entryPath: "index.html",
    fileCount: 2,
    bytes: 256,
  },
  lineage: {
    kind: "unverified",
    note: "Historical runner evidence is unavailable.",
  },
  provenance: {},
  licenses: {},
  features: ["Driving"],
  presentation: {
    coverPath: "assets/cover 100%.webp",
    coverAlt: "A procedural night driving scene",
    controls: ["WASD"],
    limitations: ["Touch controls are not implemented"],
    protocolVersion: 1,
  },
};

describe("runtime artifact URL derivation", () => {
  it("derives the immutable base path without registry-supplied URLs", () => {
    expect(getArtifactBasePath(game)).toBe(
      `/artifacts/night-drive-001/${"1".repeat(40)}/${"a".repeat(64)}`,
    );
    expect(getCanonicalPlayPath(game)).toBe("/play/night-drive-001");
    expect(getArtifactEntryUrl(game)).toBe(
      `${getArtifactBasePath(game)}/index.html?embed=mirage`,
    );
  });

  it("encodes artifact path segments exactly once", () => {
    expect(getArtifactFilePath(game, "assets/cover 100%.webp")).toBe(
      `${getArtifactBasePath(game)}/assets/cover%20100%25.webp`,
    );
    expect(getPresentationCoverUrl(game)).toBe(
      `${getArtifactBasePath(game)}/assets/cover%20100%25.webp`,
    );
  });

  it("derives the immutable source revision link", () => {
    expect(getSourceRevisionUrl(game.source)).toBe(
      `https://github.com/example/night-drive/tree/${"1".repeat(40)}`,
    );
  });

  it("rejects traversal before constructing a local path", () => {
    expect(() => getArtifactFilePath(game, "../secret.txt")).toThrow(
      "Unsafe artifact path",
    );
  });
});
