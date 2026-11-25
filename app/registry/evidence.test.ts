import { describe, expect, it } from "vitest";
import {
  getEvidenceSignals,
  getModelLabel,
  getRecordedHarness,
  getRegistryStats,
  sortByBuildDate,
} from "./evidence";
import type { PublishedGame } from "./schema";

const benchmark: PublishedGame = {
  track: "benchmark",
  id: "night-drive-001",
  title: "Night Drive",
  tagline: "Drive",
  description: "A game",
  model: "example-model",
  builtOn: "2026-07-29",
  source: {
    repositoryUrl: "https://github.com/example/night-drive",
    commit: "abcdef1".padEnd(40, "0"),
  },
  deployment: {
    url: "https://example.github.io/night-drive/",
    provider: "GitHub Pages",
  },
  lineage: {
    kind: "independent",
    seedDigest: `sha256:${"a".repeat(64)}`,
  },
  provenance: {
    harness: "Example harness",
    modelSnapshot: "example-model-2026-07-01",
    humanInterventions: 0,
    prompt: { status: "published", text: "Build it.", note: "Exact prompt." },
  },
  licenses: { code: "MIT" },
  features: ["Driving"],
  presentation: {
    coverPath: "assets/cover.webp",
    coverAlt: "A procedural night driving scene",
    controls: ["WASD"],
    limitations: [],
    protocolVersion: 1,
  },
};

const showcase: PublishedGame = {
  ...benchmark,
  track: "showcase",
  id: "harbor-showcase",
  model: "unknown",
  builtOn: null,
  source: null,
  lineage: { kind: "unverified", note: "No runner record was supplied." },
  provenance: {
    harness: "unknown",
    modelSnapshot: null,
    humanInterventions: null,
    prompt: { status: "not-recorded", text: null, note: "Not supplied." },
  },
  licenses: { code: "NOASSERTION" },
};

function states(game: PublishedGame) {
  return Object.fromEntries(
    getEvidenceSignals(game).map((signal) => [signal.key, signal.state]),
  );
}

describe("evidence signals", () => {
  it("reports recorded facts with their recorded values", () => {
    expect(states(benchmark)).toEqual({
      source: "recorded",
      prompt: "recorded",
      lineage: "recorded",
      license: "recorded",
      snapshot: "recorded",
      interventions: "recorded",
    });
    const values = getEvidenceSignals(benchmark)
      .slice(0, 4)
      .map((signal) => signal.value);
    expect(values).toEqual(["abcdef1", "Published", "Independent", "MIT"]);
  });

  it("keeps every absence explicit instead of inferring a value", () => {
    expect(states(showcase)).toEqual({
      source: "missing",
      prompt: "missing",
      lineage: "missing",
      license: "missing",
      snapshot: "missing",
      interventions: "missing",
    });
    expect(getModelLabel(showcase)).toBe("Model not recorded");
    expect(getRecordedHarness(showcase)).toBeNull();
  });

  it("distinguishes a partial prompt and zero interventions from absence", () => {
    const partial: PublishedGame = {
      ...benchmark,
      provenance: {
        ...benchmark.provenance,
        prompt: { status: "partial", text: "Build it.", note: "No system." },
      },
    };
    const signals = getEvidenceSignals(partial);
    expect(signals.find((signal) => signal.key === "prompt")).toMatchObject({
      state: "partial",
      note: "No system.",
    });
    expect(
      signals.find((signal) => signal.key === "interventions"),
    ).toMatchObject({ state: "recorded", value: "0" });
  });

  it("carries the record's own lineage explanation", () => {
    const lineage = getEvidenceSignals(showcase).find(
      (signal) => signal.key === "lineage",
    );
    expect(lineage?.note).toBe("No runner record was supplied.");
  });
});

describe("registry summary", () => {
  it("counts every game as a run and only models a record names", () => {
    expect(getRegistryStats([benchmark, showcase])).toEqual({
      runs: 2,
      models: 1,
      latestBuild: "2026-07-29",
    });
  });

  it("orders by build date, undated last, without mutating the registry", () => {
    const games = [
      { id: "b", builtOn: null },
      { id: "c", builtOn: "2026-07-30" },
      { id: "a", builtOn: "2026-08-05" },
      { id: "d", builtOn: "2026-07-30" },
    ];
    expect(sortByBuildDate(games).map((game) => game.id)).toEqual([
      "a",
      "c",
      "d",
      "b",
    ]);
    expect(games[0].id).toBe("b");
  });
});
