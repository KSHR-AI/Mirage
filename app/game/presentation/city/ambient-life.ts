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
}

const ROAD_LINES = [-84, -56, -28, 0, 28, 56, 84] as const;

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
        offset: index === 3 ? 74 : ((index * 37 + 11) % 196) - 98,
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
      return {
        id: 900 + index,
        x: road + (index % 2 ? 6.6 : -6.6),
        startZ: ((index * 29 + 17) % 184) - 92,
        direction: index % 2 ? (1 as const) : (-1 as const),
        speed: 0.72 + (index % 4) * 0.13,
      };
    }),
  );
}
