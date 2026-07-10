import type {
  CrimeKind,
  HeatState,
  PoliceMode,
  Vec3,
} from "../../core/contracts";

export const HEAT_THRESHOLDS = [0, 20, 45, 70] as const;
export const HEAT_HYSTERESIS = 5;
export const LOST_SIGHT_TICKS = 10 * 60;
export const SEARCH_DURATION_TICKS = 15 * 60;

export const CRIME_HEAT: Readonly<Record<CrimeKind, number>> = {
  "vehicle-theft": 22,
  assault: 18,
  gunfire: 15,
  "core-theft": 50,
};

export interface HeatUpdate {
  readonly crime?: CrimeKind;
  readonly witnessed?: boolean;
  readonly playerVisible: boolean;
  readonly playerPosition: Vec3;
  readonly missionFloorLevel?: 0 | 1 | 2 | 3;
}

export interface HeatTransition {
  readonly state: HeatState;
  readonly previousMode: PoliceMode;
  readonly previousWantedLevel: 0 | 1 | 2 | 3;
  readonly dispatched: boolean;
  readonly enteredSearch: boolean;
  readonly cleared: boolean;
}

function clampHeat(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function heatFloorValue(level: 0 | 1 | 2 | 3) {
  return HEAT_THRESHOLDS[level];
}

export function wantedLevelForHeat(
  value: number,
  current: 0 | 1 | 2 | 3,
): 0 | 1 | 2 | 3 {
  const heat = clampHeat(value);
  let level = current;
  while (level < 3 && heat >= HEAT_THRESHOLDS[level + 1]) level += 1;
  while (level > 0 && heat < HEAT_THRESHOLDS[level] - HEAT_HYSTERESIS)
    level -= 1;
  return level as 0 | 1 | 2 | 3;
}

export function createHeatState(): HeatState {
  return {
    value: 0,
    wantedLevel: 0,
    mode: "patrol",
    unseenTicks: 0,
  };
}

export function updateHeat(
  previous: HeatState,
  update: HeatUpdate,
): HeatTransition {
  const previousMode = previous.mode;
  const previousWantedLevel = previous.wantedLevel;
  const floor = heatFloorValue(update.missionFloorLevel ?? 0);
  let value = previous.value;
  let mode = previous.mode;
  let unseenTicks = previous.unseenTicks;
  let lastSeenPosition = previous.lastSeenPosition;

  if (update.crime && update.witnessed) value += CRIME_HEAT[update.crime];
  value = Math.max(floor, clampHeat(value));

  if (update.playerVisible && value > 0) {
    lastSeenPosition = update.playerPosition;
    unseenTicks = 0;
    mode = mode === "patrol" ? "respond" : "pursue";
  } else if (value > floor || floor > 0) {
    unseenTicks += 1;
    if (
      (mode === "respond" || mode === "pursue") &&
      unseenTicks >= LOST_SIGHT_TICKS
    ) {
      mode = "search";
    } else if (
      mode === "search" &&
      unseenTicks >= LOST_SIGHT_TICKS + SEARCH_DURATION_TICKS
    ) {
      mode = "return";
    } else if (mode === "return") {
      value = Math.max(floor, value - 0.08);
    } else if (mode === "patrol") {
      value = Math.max(floor, value - 0.02);
    }
  }

  const wantedLevel = wantedLevelForHeat(value, previousWantedLevel);
  if (mode === "return" && wantedLevel === 0 && floor === 0) {
    mode = "patrol";
    lastSeenPosition = undefined;
    unseenTicks = 0;
  }

  const state: HeatState = {
    value: clampHeat(value),
    wantedLevel,
    mode,
    unseenTicks,
    ...(lastSeenPosition ? { lastSeenPosition } : {}),
  };
  return {
    state,
    previousMode,
    previousWantedLevel,
    dispatched: previousWantedLevel === 0 && wantedLevel > 0,
    enteredSearch: previousMode !== "search" && mode === "search",
    cleared: previousWantedLevel > 0 && wantedLevel === 0,
  };
}
