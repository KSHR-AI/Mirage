import { describe, expect, it } from "vitest";
import type { PublishedGame } from "./schema";
import {
  getCanonicalPlayPath,
  getDeploymentEntryUrl,
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
  deployment: {
    url: "https://example.github.io/night-drive/",
    provider: "GitHub Pages",
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

describe("runtime deployment URL derivation", () => {
  it("uses the verified external deployment for iframe playback", () => {
    expect(getCanonicalPlayPath(game)).toBe("/play/night-drive-001");
    expect(getDeploymentEntryUrl(game)).toBe(
      "https://example.github.io/night-drive/?embed=mirage",
    );
  });

  it("resolves the cover relative to the deployment", () => {
    expect(getPresentationCoverUrl(game)).toBe(
      "https://example.github.io/night-drive/assets/cover%20100%.webp",
    );
  });

  it("derives the immutable source revision link", () => {
    expect(getSourceRevisionUrl(game.source)).toBe(
      `https://github.com/example/night-drive/tree/${"1".repeat(40)}`,
    );
  });
});
