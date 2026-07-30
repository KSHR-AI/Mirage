import { describe, expect, it } from "vitest";
import { parseRegistryDocument } from "./schema";

const COMMIT = "1".repeat(40);
const SEED_DIGEST = `sha256:${"c".repeat(64)}`;

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "One city, one clean attempt",
    description: "A complete browser driving game.",
    model: "example-model",
    builtOn: "2026-07-29",
    source: {
      repositoryUrl: "https://github.com/example/night-drive",
      commit: COMMIT,
    },
    deployment: {
      url: "https://example.github.io/night-drive/",
      provider: "GitHub Pages",
    },
    lineage: {
      kind: "independent",
      seedDigest: SEED_DIGEST,
    },
    provenance: {
      modelSnapshot: "example-model",
      prompt: { status: "published", text: "Build a driving game." },
    },
    licenses: {
      code: "Apache-2.0",
      assets: [],
    },
    features: ["Driving", "Mission loop"],
    presentation: {
      coverPath: "assets/cover image.webp",
      coverAlt: "A car driving through a procedural city at night",
      controls: ["WASD to drive"],
      limitations: ["Desktop browsers are best tested"],
      protocolVersion: 1,
    },
    ...overrides,
  };
}

describe("runtime registry schema", () => {
  it("parses an accepted externally hosted game", () => {
    const registry = parseRegistryDocument({
      schemaVersion: 1,
      games: [makeGame()],
    });

    expect(registry.games).toHaveLength(1);
    expect(registry.games[0].deployment).toEqual({
      url: "https://example.github.io/night-drive/",
      provider: "GitHub Pages",
    });
  });

  it("accepts an honestly empty registry", () => {
    expect(parseRegistryDocument({ schemaVersion: 1, games: [] })).toEqual({
      schemaVersion: 1,
      games: [],
    });
  });

  it("rejects unknown fields and mutable source identities", () => {
    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [makeGame({ injectedUrl: "https://attacker.invalid/" })],
      }),
    ).toThrow(/must be an object/);

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            source: {
              repositoryUrl: "https://github.com/example/night-drive/tree/main",
              commit: COMMIT,
            },
          }),
        ],
      }),
    ).toThrow(/repositoryUrl/);
  });

  it.each([
    "http://example.github.io/night-drive/",
    "https://localhost/night-drive/",
    "https://127.0.0.1/night-drive/",
    "https://user:secret@example.com/night-drive/",
    "https://example.com:8443/night-drive/",
    "https://example.com/night-drive/?preview=1",
  ])("rejects unsafe deployment URL %s", (url) => {
    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            deployment: { url, provider: "Other" },
          }),
        ],
      }),
    ).toThrow(/deployment\.url/);
  });

  it("requires the normalized presentation contract", () => {
    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            presentation: {
              coverPath: "cover.webp",
              coverAlt: "A game cover",
              controls: ["WASD"],
              limitations: ["Touch controls are not implemented"],
              protocolVersion: 1,
              externalCoverUrl: "https://attacker.invalid/cover.webp",
            },
          }),
        ],
      }),
    ).toThrow(/presentation/);

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            presentation: {
              coverPath: "../cover.webp",
              coverAlt: "A game cover",
              controls: ["WASD"],
              limitations: ["Touch controls are not implemented"],
              protocolVersion: 1,
            },
          }),
        ],
      }),
    ).toThrow(/coverPath/);
  });

  it("validates derived parents and rejects lineage cycles", () => {
    const parent = makeGame({ id: "parent-game" });
    const child = makeGame({
      id: "child-game",
      source: {
        repositoryUrl: "https://github.com/example/child-game",
        commit: "2".repeat(40),
      },
      deployment: {
        url: "https://example.github.io/child-game/",
        provider: "GitHub Pages",
      },
      lineage: {
        kind: "derived",
        parentId: "parent-game",
        parentSource: parent.source,
      },
    });
    expect(
      parseRegistryDocument({
        schemaVersion: 1,
        games: [parent, child],
      }).games[1].lineage,
    ).toEqual({
      kind: "derived",
      parentId: "parent-game",
      parentSource: parent.source,
    });

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            id: "cycle-a",
            source: {
              repositoryUrl: "https://github.com/example/cycle-a",
              commit: "2".repeat(40),
            },
            deployment: {
              url: "https://example.github.io/cycle-a/",
              provider: "GitHub Pages",
            },
            lineage: {
              kind: "derived",
              parentId: "cycle-b",
              parentSource: {
                repositoryUrl: "https://github.com/example/cycle-b",
                commit: "3".repeat(40),
              },
            },
          }),
          makeGame({
            id: "cycle-b",
            source: {
              repositoryUrl: "https://github.com/example/cycle-b",
              commit: "3".repeat(40),
            },
            deployment: {
              url: "https://example.github.io/cycle-b/",
              provider: "GitHub Pages",
            },
            lineage: {
              kind: "derived",
              parentId: "cycle-a",
              parentSource: {
                repositoryUrl: "https://github.com/example/cycle-a",
                commit: "2".repeat(40),
              },
            },
          }),
        ],
      }),
    ).toThrow(/cycle/);
  });
});
