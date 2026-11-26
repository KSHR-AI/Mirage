import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENTRIES,
  METRICS,
  PROVIDERS,
  RUN_SCORES,
  computeIndex,
  rankEntries,
} from "./scores";

const submissionIds = readdirSync(path.join(process.cwd(), "submissions"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

describe("bench scores", () => {
  it("uses unique entry IDs and known providers", () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const entry of ENTRIES) {
      expect(PROVIDERS[entry.provider]).toBeDefined();
    }
  });

  it("keeps every score between 0 and 100", () => {
    for (const item of [...ENTRIES, ...RUN_SCORES]) {
      for (const metric of METRICS) {
        const value = item.scores[metric.key];
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
      expect(item.index).toBe(computeIndex(item.scores));
    }
  });

  it("scores only published runs, once each, under their entry", () => {
    // Accepted runs may wait for scores; a score needs a published run.
    const scored = RUN_SCORES.map((run) => run.runId);
    expect(new Set(scored).size).toBe(scored.length);
    for (const runId of scored) expect(submissionIds).toContain(runId);
    for (const run of RUN_SCORES) {
      const entry = ENTRIES.find((e) => e.id === run.entryId);
      expect(entry?.runIds).toContain(run.runId);
    }
    const attributed = ENTRIES.flatMap((entry) => entry.runIds);
    expect(new Set(attributed).size).toBe(attributed.length);
  });

  it("lists only pairs with a published run", () => {
    for (const entry of ENTRIES) {
      expect(entry.runIds.length).toBeGreaterThan(0);
      for (const runId of entry.runIds) expect(submissionIds).toContain(runId);
    }
  });

  it("ranks highest first", () => {
    const ranked = rankEntries(ENTRIES, "driving");
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1].scores.driving).toBeGreaterThanOrEqual(
        ranked[i].scores.driving,
      );
    }
  });
});
