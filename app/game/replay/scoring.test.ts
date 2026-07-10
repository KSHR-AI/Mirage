import { describe, expect, it } from "vitest";
import {
  formatReplayTicks,
  RUN_SCORE_RULES,
  scoreReplayOutcome,
  scoreRun,
  type RunScoreInput,
} from "./scoring";
import type { ReplayOutcomeV1 } from "./types";

const perfect: RunScoreInput = {
  status: "completed",
  completionTicks: RUN_SCORE_RULES.targetCompletionTicks,
  deaths: 0,
  optionalObjectivesCompleted: 5,
  optionalObjectivesTotal: 5,
  shotsFired: 24,
  shotsHit: 24,
  vehicleDamage: 0,
};

describe("run scoring", () => {
  it("awards a transparent 1,000-point S rank for a perfect run", () => {
    const score = scoreRun(perfect);
    expect(score).toMatchObject({
      total: 1000,
      maxTotal: 1000,
      rank: "S",
      completed: true,
    });
    expect(score.breakdown.map(({ id, points }) => ({ id, points }))).toEqual([
      { id: "pace", points: 350 },
      { id: "survival", points: 200 },
      { id: "optionals", points: 200 },
      { id: "accuracy", points: 150 },
      { id: "vehicle", points: 100 },
    ]);
  });

  it("uses a fixed five-minute target and proportionally scaled pace curve", () => {
    expect(RUN_SCORE_RULES.targetCompletionTicks).toBe(18_000);
    expect(RUN_SCORE_RULES.zeroPaceTicks).toBe(31_500);
    expect(scoreRun(perfect).breakdown[0]?.points).toBe(350);
    expect(
      scoreRun({ ...perfect, completionTicks: 22_500 }).breakdown[0]?.points,
    ).toBe(233);
    expect(
      scoreRun({
        ...perfect,
        completionTicks: RUN_SCORE_RULES.zeroPaceTicks,
      }).breakdown[0]?.points,
    ).toBe(0);
  });

  it("produces stable A, B, and C examples", () => {
    const rankA = scoreRun({
      ...perfect,
      completionTicks: 22_500,
      optionalObjectivesCompleted: 4,
      shotsHit: 18,
      vehicleDamage: 20,
    });
    const rankB = scoreRun({
      ...perfect,
      completionTicks: 27_000,
      deaths: 1,
      optionalObjectivesCompleted: 3,
      shotsHit: 14,
      vehicleDamage: 20,
    });
    const rankC = scoreRun({
      ...perfect,
      completionTicks: RUN_SCORE_RULES.zeroPaceTicks,
      deaths: 4,
      optionalObjectivesCompleted: 1,
      shotsHit: 4,
      vehicleDamage: 80,
    });

    expect({ rank: rankA.rank, total: rankA.total }).toEqual({
      rank: "A",
      total: 786,
    });
    expect({ rank: rankB.rank, total: rankB.total }).toEqual({
      rank: "B",
      total: 555,
    });
    expect({ rank: rankC.rank, total: rankC.total }).toEqual({
      rank: "C",
      total: 85,
    });
  });

  it("gates failed and abandoned runs to C regardless of partial points", () => {
    const failed = scoreRun({
      ...perfect,
      status: "failed",
      completionTicks: undefined,
    });
    const abandoned = scoreRun({
      ...perfect,
      status: "abandoned",
      completionTicks: undefined,
    });

    expect(failed.total).toBe(650);
    expect(failed.rank).toBe("C");
    expect(abandoned.rank).toBe("C");
    expect(failed.breakdown[0]?.detail).toBe("Run not completed");
  });

  it("clamps pace, survival, and vehicle components at zero", () => {
    const score = scoreRun({
      ...perfect,
      completionTicks: 60 * 60 * 60,
      deaths: 100,
      vehicleDamage: 100,
    });
    expect(score.breakdown.map(({ points }) => points)).toEqual([
      0, 0, 200, 150, 0,
    ]);
  });

  it("awards optional points when no optional objectives exist", () => {
    const score = scoreRun({
      ...perfect,
      optionalObjectivesCompleted: 0,
      optionalObjectivesTotal: 0,
    });
    expect(score.breakdown[2]).toMatchObject({
      id: "optionals",
      points: 200,
      detail: "0 / 0 complete",
    });
  });

  it("awards no accuracy points when no shots were fired", () => {
    const score = scoreRun({ ...perfect, shotsFired: 0, shotsHit: 0 });
    expect(score.breakdown[3]).toMatchObject({
      id: "accuracy",
      points: 0,
      detail: "0 / 0 hits (0%)",
    });
  });

  it("keeps debrief order and details stable", () => {
    const score = scoreRun({ ...perfect, deaths: 1, vehicleDamage: 12.5 });
    expect(score.breakdown.map(({ id }) => id)).toEqual([
      "pace",
      "survival",
      "optionals",
      "accuracy",
      "vehicle",
    ]);
    expect(score.breakdown.map(({ detail }) => detail)).toEqual([
      "5:00 + 0t (18000 ticks)",
      "1 death",
      "5 / 5 complete",
      "24 / 24 hits (100%)",
      "12.5% damage",
    ]);
    expect(Object.isFrozen(score)).toBe(true);
    expect(Object.isFrozen(score.breakdown)).toBe(true);
  });

  it("formats exact tick remainder without locale-dependent output", () => {
    expect(formatReplayTicks(0)).toBe("0:00 + 0t");
    expect(formatReplayTicks(3_661)).toBe("1:01 + 1t");
  });

  it("scores replay outcome metadata through the same rules", () => {
    const outcome: ReplayOutcomeV1 = {
      missionId: "afterlight-job",
      status: "completed",
      completionTick: RUN_SCORE_RULES.targetCompletionTicks,
      deaths: 0,
      optionalObjectiveIds: ["a", "b", "c", "d", "e"],
      optionalObjectiveCount: 5,
      shotsFired: 24,
      shotsHit: 24,
      vehicleDamage: 0,
    };
    expect(scoreReplayOutcome(outcome)).toEqual(scoreRun(perfect));
  });

  it("rejects internally inconsistent and out-of-range metrics", () => {
    expect(() =>
      scoreRun({ ...perfect, status: "victory" as "completed" }),
    ).toThrow("Run status");
    expect(() => scoreRun({ ...perfect, completionTicks: undefined })).toThrow(
      "require completion ticks",
    );
    expect(() =>
      scoreRun({
        ...perfect,
        status: "failed",
      }),
    ).toThrow("Only completed runs");
    expect(() => scoreRun({ ...perfect, deaths: -1 })).toThrow("Deaths");
    expect(() =>
      scoreRun({ ...perfect, optionalObjectivesCompleted: 6 }),
    ).toThrow("Optional objectives completed");
    expect(() => scoreRun({ ...perfect, shotsHit: 25 })).toThrow("Shots hit");
    expect(() => scoreRun({ ...perfect, vehicleDamage: Number.NaN })).toThrow(
      "Vehicle damage",
    );
  });
});
