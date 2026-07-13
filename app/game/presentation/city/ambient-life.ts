export interface AmbientVehicleDefinition {
  readonly id: number;
  readonly axis: "x" | "z";
  readonly lane: number;
  readonly offset: number;
  readonly speed: number;
  readonly direction: 1 | -1;
  readonly van: boolean;
}

export interface AmbientCivilianDefinition {
  readonly id: number;
  readonly x: number;
  readonly startZ: number;
  readonly direction: 1 | -1;
  readonly speed: number;
  readonly walkSeconds: number;
  readonly idleSeconds: number;
  readonly phaseSeconds: number;
}

export interface AmbientCivilianMotionSample {
  readonly travelSeconds: number;
  readonly walking: boolean;
}

const ROAD_LINES = [-84, -56, -28, 0, 28, 56, 84] as const;
const CENTRAL_TRAFFIC_OFFSETS = [18, -18, -42, 42] as const;
const CENTRAL_CIVILIAN_STARTS = [18, -20, 28, -30] as const;

export function createAmbientVehicleDefinitions(
  count: number,
): readonly AmbientVehicleDefinition[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const road =
        index < 4 ? 0 : ROAD_LINES[(index * 3 + 1) % ROAD_LINES.length];
      return {
        id: 700 + index,
        axis: index % 2 === 0 ? ("x" as const) : ("z" as const),
        lane: road + (index % 4 < 2 ? -2.4 : 2.4),
        offset:
          index < CENTRAL_TRAFFIC_OFFSETS.length
            ? CENTRAL_TRAFFIC_OFFSETS[index]
            : ((index * 37 + 11) % 196) - 98,
        speed: 4.4 + (index % 5) * 0.72,
        direction: index % 3 === 0 ? (-1 as const) : (1 as const),
        van: index >= 4 && index % 5 === 0,
      };
    }),
  );
}

export function createAmbientCivilianDefinitions(
  count: number,
): readonly AmbientCivilianDefinition[] {
  return Object.freeze(
    Array.from({ length: count }, (_, index) => {
      const road =
        index < 4 ? 0 : ROAD_LINES[(index * 5 + 2) % ROAD_LINES.length];
      const walkSeconds = 6.4 + (index % 5) * 0.9;
      const idleSeconds = index % 4 === 1 ? 0 : 0.9 + (index % 3) * 0.55;
      const cycleSeconds = walkSeconds + idleSeconds;
      const phaseSeconds =
        idleSeconds > 0 && index % 3 === 0
          ? walkSeconds + idleSeconds * (0.28 + (index % 2) * 0.31)
          : (index * 2.17 + 0.6) % cycleSeconds;
      return {
        id: 900 + index,
        x: road + (index % 2 ? 6.6 : -6.6),
        startZ:
          index < CENTRAL_CIVILIAN_STARTS.length
            ? CENTRAL_CIVILIAN_STARTS[index]
            : ((index * 29 + 17) % 184) - 92,
        direction: index % 2 ? (1 as const) : (-1 as const),
        speed: 0.72 + (index % 4) * 0.13,
        walkSeconds,
        idleSeconds,
        phaseSeconds,
      };
    }),
  );
}

function accumulatedWalkSeconds(
  elapsedSeconds: number,
  walkSeconds: number,
  idleSeconds: number,
) {
  if (idleSeconds <= 0) return elapsedSeconds;
  const cycle = walkSeconds + idleSeconds;
  const completedCycles = Math.floor(elapsedSeconds / cycle);
  const remainder = elapsedSeconds - completedCycles * cycle;
  return completedCycles * walkSeconds + Math.min(remainder, walkSeconds);
}

export function sampleAmbientCivilianMotion(
  definition: AmbientCivilianDefinition,
  elapsedSeconds: number,
): AmbientCivilianMotionSample {
  const elapsed = Number.isFinite(elapsedSeconds)
    ? Math.max(0, elapsedSeconds)
    : 0;
  const walkSeconds = Math.max(0.1, definition.walkSeconds);
  const idleSeconds = Math.max(0, definition.idleSeconds);
  const phase = Math.max(0, definition.phaseSeconds);
  const localTime = elapsed + phase;
  const cycle = walkSeconds + idleSeconds;
  const cycleTime = idleSeconds > 0 ? localTime % cycle : 0;
  return {
    travelSeconds:
      accumulatedWalkSeconds(localTime, walkSeconds, idleSeconds) -
      accumulatedWalkSeconds(phase, walkSeconds, idleSeconds),
    walking: idleSeconds === 0 || cycleTime < walkSeconds,
  };
}
