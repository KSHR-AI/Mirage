import { SIMULATION_HZ, type Tick } from "../core/contracts";
import { REPLAY_LIMITS, type ReplayOutcomeV1 } from "./types";

export type RunRank = "S" | "A" | "B" | "C";
export type RunScoreCategory =
  | "pace"
  | "survival"
  | "optionals"
  | "accuracy"
  | "vehicle";

export interface RunScoreInput {
  readonly status: ReplayOutcomeV1["status"];
  readonly completionTicks?: Tick;
  readonly deaths: number;
  readonly optionalObjectivesCompleted: number;
  readonly optionalObjectivesTotal: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
  /** Damage to the hero vehicle expressed as a percentage from 0 to 100. */
  readonly vehicleDamage: number;
}

export interface RunScoreBreakdownEntry {
  readonly id: RunScoreCategory;
  readonly label: string;
  readonly points: number;
  readonly maxPoints: number;
  readonly detail: string;
}

export interface RunScore {
  readonly total: number;
  readonly maxTotal: number;
  readonly rank: RunRank;
  readonly completed: boolean;
  readonly breakdown: readonly RunScoreBreakdownEntry[];
}

export const RUN_SCORE_RULES = Object.freeze({
  targetCompletionTicks: 20 * 60 * SIMULATION_HZ,
  zeroPaceTicks: 35 * 60 * SIMULATION_HZ,
  points: Object.freeze({
    pace: 350,
    survival: 200,
    optionals: 200,
    accuracy: 150,
    vehicle: 100,
  }),
  deathPenalty: 50,
  rankThresholds: Object.freeze({ S: 900, A: 750, B: 550 }),
} as const);

function integer(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be a safe integer from ${minimum} to ${maximum}`,
    );
  }
  return value;
}

function percentage(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be a finite percentage from 0 to 100`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function points(maximum: number, multiplier: number): number {
  return Math.round(maximum * Math.max(0, Math.min(1, multiplier)));
}

function compactDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatReplayTicks(ticks: Tick): string {
  integer(ticks, "Ticks", 0, REPLAY_LIMITS.maxTicks);
  const totalSeconds = Math.floor(ticks / SIMULATION_HZ);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const remainder = ticks % SIMULATION_HZ;
  return `${minutes}:${String(seconds).padStart(2, "0")} + ${remainder}t`;
}

function rankFor(total: number, completed: boolean): RunRank {
  if (!completed) return "C";
  if (total >= RUN_SCORE_RULES.rankThresholds.S) return "S";
  if (total >= RUN_SCORE_RULES.rankThresholds.A) return "A";
  if (total >= RUN_SCORE_RULES.rankThresholds.B) return "B";
  return "C";
}

export function scoreRun(input: RunScoreInput): RunScore {
  if (
    input.status !== "completed" &&
    input.status !== "failed" &&
    input.status !== "abandoned"
  ) {
    throw new RangeError("Run status must be completed, failed, or abandoned");
  }

  const completed = input.status === "completed";
  if (completed && input.completionTicks === undefined) {
    throw new RangeError("Completed runs require completion ticks");
  }
  if (!completed && input.completionTicks !== undefined) {
    throw new RangeError("Only completed runs may include completion ticks");
  }

  const completionTicks =
    input.completionTicks === undefined
      ? undefined
      : integer(
          input.completionTicks,
          "Completion ticks",
          0,
          REPLAY_LIMITS.maxTicks,
        );
  const deaths = integer(input.deaths, "Deaths", 0, REPLAY_LIMITS.maxTicks);
  const optionalObjectivesTotal = integer(
    input.optionalObjectivesTotal,
    "Optional objective total",
    0,
    REPLAY_LIMITS.maxObjectiveIds,
  );
  const optionalObjectivesCompleted = integer(
    input.optionalObjectivesCompleted,
    "Optional objectives completed",
    0,
    optionalObjectivesTotal,
  );
  const shotsFired = integer(
    input.shotsFired,
    "Shots fired",
    0,
    REPLAY_LIMITS.maxTicks,
  );
  const shotsHit = integer(input.shotsHit, "Shots hit", 0, shotsFired);
  const vehicleDamage = percentage(input.vehicleDamage, "Vehicle damage");

  const paceMultiplier =
    completionTicks === undefined
      ? 0
      : completionTicks <= RUN_SCORE_RULES.targetCompletionTicks
        ? 1
        : (RUN_SCORE_RULES.zeroPaceTicks - completionTicks) /
          (RUN_SCORE_RULES.zeroPaceTicks -
            RUN_SCORE_RULES.targetCompletionTicks);
  const pacePoints = points(RUN_SCORE_RULES.points.pace, paceMultiplier);
  const survivalPoints = Math.max(
    0,
    RUN_SCORE_RULES.points.survival - deaths * RUN_SCORE_RULES.deathPenalty,
  );
  const optionalPoints = points(
    RUN_SCORE_RULES.points.optionals,
    ratio(optionalObjectivesCompleted, optionalObjectivesTotal),
  );
  const accuracyPoints = points(
    RUN_SCORE_RULES.points.accuracy,
    shotsFired === 0 ? 0 : shotsHit / shotsFired,
  );
  const vehiclePoints = points(
    RUN_SCORE_RULES.points.vehicle,
    1 - vehicleDamage / 100,
  );

  const breakdown: readonly RunScoreBreakdownEntry[] = Object.freeze([
    Object.freeze({
      id: "pace",
      label: "Completion time",
      points: pacePoints,
      maxPoints: RUN_SCORE_RULES.points.pace,
      detail:
        completionTicks === undefined
          ? "Run not completed"
          : `${formatReplayTicks(completionTicks)} (${completionTicks} ticks)`,
    }),
    Object.freeze({
      id: "survival",
      label: "Survival",
      points: survivalPoints,
      maxPoints: RUN_SCORE_RULES.points.survival,
      detail: `${deaths} ${deaths === 1 ? "death" : "deaths"}`,
    }),
    Object.freeze({
      id: "optionals",
      label: "Optional objectives",
      points: optionalPoints,
      maxPoints: RUN_SCORE_RULES.points.optionals,
      detail: `${optionalObjectivesCompleted} / ${optionalObjectivesTotal} complete`,
    }),
    Object.freeze({
      id: "accuracy",
      label: "Accuracy",
      points: accuracyPoints,
      maxPoints: RUN_SCORE_RULES.points.accuracy,
      detail: `${shotsHit} / ${shotsFired} hits (${compactDecimal(
        shotsFired === 0 ? 0 : (shotsHit / shotsFired) * 100,
      )}%)`,
    }),
    Object.freeze({
      id: "vehicle",
      label: "Vehicle condition",
      points: vehiclePoints,
      maxPoints: RUN_SCORE_RULES.points.vehicle,
      detail: `${compactDecimal(vehicleDamage)}% damage`,
    }),
  ]);

  const total = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  return Object.freeze({
    total,
    maxTotal: 1000,
    rank: rankFor(total, completed),
    completed,
    breakdown,
  });
}

export function scoreReplayOutcome(outcome: ReplayOutcomeV1): RunScore {
  return scoreRun({
    status: outcome.status,
    ...(outcome.completionTick === undefined
      ? {}
      : { completionTicks: outcome.completionTick }),
    deaths: outcome.deaths,
    optionalObjectivesCompleted: outcome.optionalObjectiveIds.length,
    optionalObjectivesTotal: outcome.optionalObjectiveCount,
    shotsFired: outcome.shotsFired,
    shotsHit: outcome.shotsHit,
    vehicleDamage: outcome.vehicleDamage,
  });
}
