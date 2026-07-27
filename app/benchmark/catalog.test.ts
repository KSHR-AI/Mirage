import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_RUNS,
  BENCHMARK_TASK,
  FEATURED_RUN,
  hasPublishedPrompt,
  hasPublishedSetup,
} from "./catalog";

describe("benchmark catalog", () => {
  it("discovers manifests and promotes the task-configured featured run", () => {
    expect(BENCHMARK_RUNS.length).toBeGreaterThan(0);
    expect(FEATURED_RUN.id).toBe(BENCHMARK_TASK.featuredRunId);
    expect(BENCHMARK_RUNS[0]).toBe(FEATURED_RUN);
  });

  it("keeps run identifiers unique and tied to the published task", () => {
    const identifiers = BENCHMARK_RUNS.map((run) => run.id);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(
      BENCHMARK_RUNS.every((run) => run.taskId === BENCHMARK_TASK.id),
    ).toBe(true);
  });

  it("keeps task display and sharing configuration complete", () => {
    expect(BENCHMARK_TASK.brandName).not.toHaveLength(0);
    expect(BENCHMARK_TASK.surfaceLabel).not.toHaveLength(0);
    expect(BENCHMARK_TASK.gameTitle).not.toHaveLength(0);
    expect(BENCHMARK_TASK.locationLabel).not.toHaveLength(0);
    expect(BENCHMARK_TASK.updatedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(BENCHMARK_TASK.contribution.guidePath).not.toMatch(/^\//);
    expect(BENCHMARK_TASK.metadata.shareImage.path).toMatch(/^\//);
    expect(BENCHMARK_TASK.metadata.shareImage.width).toBeGreaterThan(0);
    expect(BENCHMARK_TASK.metadata.shareImage.height).toBeGreaterThan(0);

    const latestBuild = BENCHMARK_RUNS.reduce(
      (latest, run) => (run.builtOn > latest ? run.builtOn : latest),
      "",
    );
    expect(BENCHMARK_TASK.updatedOn >= latestBuild).toBe(true);
  });

  it("labels bounded progress as a submitter estimate", () => {
    for (const run of BENCHMARK_RUNS) {
      expect(run.progress.percent).toBeGreaterThanOrEqual(0);
      expect(run.progress.percent).toBeLessThanOrEqual(100);
      expect(run.progress.basis).toBe("submitter-estimate");
      expect(run.progress.note).not.toHaveLength(0);
      expect(run.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("only embeds local or encrypted public artifacts", () => {
    for (const run of BENCHMARK_RUNS) {
      expect(
        run.playUrl.startsWith("/") || run.playUrl.startsWith("https://"),
      ).toBe(true);
      expect(
        run.previewImage.startsWith("/") ||
          run.previewImage.startsWith("https://"),
      ).toBe(true);
    }
  });

  it("pins every artifact and setup record to the same immutable commit", () => {
    for (const run of BENCHMARK_RUNS) {
      expect(run.commit).toMatch(/^[0-9a-f]{40}$/);
      expect(run.provenance.setup.resultCommit).toBe(run.commit);
    }
  });

  it("never claims prompt or setup publication without complete evidence", () => {
    for (const run of BENCHMARK_RUNS) {
      if (run.provenance.prompt.status === "published") {
        const digest = createHash("sha256")
          .update(run.provenance.prompt.text ?? "")
          .digest("hex");
        expect(run.provenance.prompt.digest).toBe(`sha256:${digest}`);
        expect(hasPublishedPrompt(run)).toBe(true);
      } else {
        expect(hasPublishedPrompt(run)).toBe(false);
      }

      if (run.provenance.setup.status === "published") {
        expect(hasPublishedSetup(run)).toBe(true);
      } else {
        expect(hasPublishedSetup(run)).toBe(false);
      }
    }
  });
});
