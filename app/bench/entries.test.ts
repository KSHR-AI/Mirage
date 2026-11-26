import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as entries from "./entries";

const { ENTRIES, PROVIDERS, getEntryForRun } = entries;

const submissionIds = readdirSync(path.join(process.cwd(), "submissions"))
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.replace(/\.json$/, ""));

describe("bench entries", () => {
  it("uses unique entry IDs and known providers", () => {
    expect(new Set(ENTRIES.map((e) => e.id)).size).toBe(ENTRIES.length);
    for (const entry of ENTRIES) {
      expect(PROVIDERS[entry.provider]).toBeDefined();
    }
  });

  it("lists only pairs with a published run", () => {
    for (const entry of ENTRIES) {
      expect(entry.runIds.length).toBeGreaterThan(0);
      for (const runId of entry.runIds) expect(submissionIds).toContain(runId);
    }
  });

  it("attributes each run to one pair", () => {
    const attributed = ENTRIES.flatMap((entry) => entry.runIds);
    expect(new Set(attributed).size).toBe(attributed.length);
    for (const runId of attributed) {
      expect(getEntryForRun(runId)?.runIds).toContain(runId);
    }
  });

  it("carries no maintainer scores", () => {
    // Standing comes only from Arena votes; see AGENTS.md.
    for (const entry of ENTRIES) {
      expect(Object.keys(entry).sort()).toEqual(
        ["access", "harness", "id", "model", "provider", "runIds"].sort(),
      );
    }
    expect(Object.keys(entries)).not.toContain("METRICS");
  });
});
