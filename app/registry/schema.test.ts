import { describe, expect, it } from "vitest";
import { parseRegistryDocument } from "./schema";

const COMMIT = "1".repeat(40);
const ARTIFACT_DIGEST = `sha256:${"a".repeat(64)}`;
const MANIFEST_DIGEST = `sha256:${"b".repeat(64)}`;
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
    artifact: {
      digest: ARTIFACT_DIGEST,
      manifestDigest: MANIFEST_DIGEST,
      entryPath: "index.html",
      fileCount: 3,
      bytes: 4_096,
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
  it("parses schema version 1 and drops untrusted derived paths", () => {
    const game = makeGame({
      basePath: "https://attacker.invalid/",
      artifact: {
        ...(makeGame().artifact as Record<string, unknown>),
        basePath: "/attacker-controlled",
      },
    });
    const registry = parseRegistryDocument({
      schemaVersion: 1,
      games: [game],
    });

    expect(registry.games).toHaveLength(1);
    expect(registry.games[0].artifact.digest).toBe(ARTIFACT_DIGEST);
    expect(Object.hasOwn(registry.games[0], "basePath")).toBe(false);
    expect(Object.hasOwn(registry.games[0].artifact, "basePath")).toBe(false);
  });

  it("accepts an honestly empty registry", () => {
    expect(parseRegistryDocument({ schemaVersion: 1, games: [] })).toEqual({
      schemaVersion: 1,
      games: [],
    });
  });

  it("rejects mutable source identities and unsafe artifact metadata", () => {
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

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            artifact: {
              ...(makeGame().artifact as Record<string, unknown>),
              entryPath: "../index.html",
            },
          }),
        ],
      }),
    ).toThrow(/entryPath/);

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          makeGame({
            artifact: {
              ...(makeGame().artifact as Record<string, unknown>),
              fileCount: 5_001,
            },
          }),
        ],
      }),
    ).toThrow(/fileCount/);
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
              coverPath: "cover.webp",
              coverAlt: "A game cover",
              controls: ["WASD"],
              limitations: ["Touch controls are not implemented"],
              protocolVersion: 2,
            },
          }),
        ],
      }),
    ).toThrow(/protocolVersion/);
  });

  it("validates derived parents and rejects lineage cycles", () => {
    const parent = makeGame({ id: "parent-game" });
    const child = makeGame({
      id: "child-game",
      source: {
        repositoryUrl: "https://github.com/example/child-game",
        commit: "2".repeat(40),
      },
      lineage: {
        kind: "derived",
        parentId: "parent-game",
        parentSource: parent.source,
      },
    });
    const games = parseRegistryDocument({
      schemaVersion: 1,
      games: [parent, child],
    }).games;
    expect(games).toHaveLength(2);
    expect(games[1].lineage).toEqual({
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
            lineage: {
              kind: "derived",
              parentId: "cycle-a",
              parentSource: {
                repositoryUrl: "https://github.com/example/night-drive",
                commit: COMMIT,
              },
            },
          }),
        ],
      }),
    ).toThrow(/cycle/);
  });

  it("requires a canonical exact parent source snapshot for derived lineage", () => {
    const parent = makeGame({ id: "parent-game" });

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          parent,
          makeGame({
            id: "child-game",
            lineage: { kind: "derived", parentId: "parent-game" },
          }),
        ],
      }),
    ).toThrow(/lineage/);

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          parent,
          makeGame({
            id: "child-game",
            lineage: {
              kind: "derived",
              parentId: "parent-game",
              parentSource: {
                repositoryUrl:
                  "https://github.com/example/night-drive/tree/main",
                commit: COMMIT,
              },
            },
          }),
        ],
      }),
    ).toThrow(/parentSource\.repositoryUrl/);

    expect(() =>
      parseRegistryDocument({
        schemaVersion: 1,
        games: [
          parent,
          makeGame({
            id: "child-game",
            lineage: {
              kind: "derived",
              parentId: "parent-game",
              parentSource: {
                repositoryUrl: "https://github.com/example/night-drive",
                commit: "4".repeat(40),
              },
            },
          }),
        ],
      }),
    ).toThrow(/parentSource does not match/);
  });
});
