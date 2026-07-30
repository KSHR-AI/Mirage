import { describe, expect, it } from "vitest";
import { loadPublishedRegistry } from "./load";

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    id: "night-drive-001",
    title: "Night Drive",
    tagline: "One city, one clean attempt",
    description: "A complete browser driving game.",
    features: ["Driving"],
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
      note: "The clean-room runner record was not preserved.",
    },
    provenance: {
      model: "example-model",
      builtOn: "2026-07-29",
    },
    licenses: {},
    presentation: {
      coverPath: "assets/cover.webp",
      coverAlt: "A car driving through a city at night",
      controls: ["WASD"],
      limitations: ["Desktop browsers are best tested"],
      protocolVersion: 1,
    },
    ...overrides,
  };
}

describe("runtime registry loading", () => {
  it("reports a valid empty registry without inventing games", async () => {
    await expect(loadPublishedRegistry({ records: [] })).resolves.toMatchObject(
      {
        kind: "empty",
        games: [],
      },
    );
  });

  it("projects accepted submission provenance into the gallery record", async () => {
    const result = await loadPublishedRegistry({
      records: [makeSubmission()],
    });
    expect(result).toMatchObject({
      kind: "ready",
      games: [
        {
          id: "night-drive-001",
          model: "example-model",
          builtOn: "2026-07-29",
          deployment: {
            url: "https://example.github.io/night-drive/",
          },
        },
      ],
    });
  });

  it("fails closed for malformed or obsolete submission records", async () => {
    await expect(
      loadPublishedRegistry({
        records: [makeSubmission({ schemaVersion: 1 })],
      }),
    ).resolves.toMatchObject({ kind: "unavailable", games: [] });

    await expect(
      loadPublishedRegistry({
        records: [
          makeSubmission({
            deployment: {
              url: "http://localhost:3000/",
              provider: "Local",
            },
          }),
        ],
      }),
    ).resolves.toMatchObject({ kind: "unavailable", games: [] });
  });
});
