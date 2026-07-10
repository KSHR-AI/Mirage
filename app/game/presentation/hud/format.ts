import type { HudMapPoint, HudObjective, HudObjectiveProgress } from "./types";

const CASH_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

export interface ObjectiveProgressSummary {
  readonly requiredCompleted: number;
  readonly requiredTotal: number;
  readonly optionalCompleted: number;
  readonly optionalTotal: number;
  readonly fraction: number;
}

export interface MapRoadLayout {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly rotationDegrees: number;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteOrZero(value)));
}

export function clampPercent(value: number, maximum = 100): number {
  const safeMaximum = finiteOrZero(maximum);
  if (safeMaximum <= 0) return 0;
  return clamp((finiteOrZero(value) / safeMaximum) * 100, 0, 100);
}

export function formatCash(value: number): string {
  const cash = Math.max(0, Math.round(finiteOrZero(value)));
  return `$${CASH_FORMATTER.format(cash)}`;
}

export function formatSpeed(value: number): string {
  return Math.round(Math.max(0, finiteOrZero(value)))
    .toString()
    .padStart(3, "0");
}

export function formatObjectiveProgress(
  progress: HudObjectiveProgress,
): string {
  const total = Math.max(0, finiteOrZero(progress.total));
  const current = clamp(progress.current, 0, total);
  return `${current}/${total}`;
}

export function formatElapsedTicks(ticks: number, simulationHz = 60): string {
  const safeHz =
    simulationHz > 0 && Number.isFinite(simulationHz) ? simulationHz : 60;
  const totalHundredths = Math.max(
    0,
    Math.floor((finiteOrZero(ticks) / safeHz) * 100),
  );
  const minutes = Math.floor(totalHundredths / 6000);
  const seconds = Math.floor((totalHundredths % 6000) / 100);
  const hundredths = totalHundredths % 100;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${hundredths.toString().padStart(2, "0")}`;
}

export function summarizeObjectives(
  objectives: readonly HudObjective[],
): ObjectiveProgressSummary {
  let requiredCompleted = 0;
  let requiredTotal = 0;
  let optionalCompleted = 0;
  let optionalTotal = 0;

  for (const objective of objectives) {
    if (objective.optional) {
      optionalTotal += 1;
      if (objective.completed) optionalCompleted += 1;
    } else {
      requiredTotal += 1;
      if (objective.completed) requiredCompleted += 1;
    }
  }

  return {
    requiredCompleted,
    requiredTotal,
    optionalCompleted,
    optionalTotal,
    fraction: requiredTotal === 0 ? 1 : requiredCompleted / requiredTotal,
  };
}

export function mapPointToPercent(point: HudMapPoint): HudMapPoint {
  return {
    x: clamp(point.x, 0, 1) * 100,
    y: clamp(point.y, 0, 1) * 100,
  };
}

export function calculateMapRoadLayout(
  from: HudMapPoint,
  to: HudMapPoint,
): MapRoadLayout {
  const start = mapPointToPercent(from);
  const end = mapPointToPercent(to);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  return {
    left: start.x,
    top: start.y,
    width: Math.hypot(deltaX, deltaY),
    rotationDegrees: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
  };
}
