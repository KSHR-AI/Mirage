import type { Point2 } from "./types";

export const ROAD_LINES = Object.freeze([-108, -72, -36, 0, 36, 72, 108]);
export const BLOCK_CENTERS = Object.freeze([-90, -54, -18, 18, 54, 90]);
export const ROAD_HALF_WIDTH = 6.2;
export const CITY_LIMIT = 116;

export type District =
  | "chinatown"
  | "downtown"
  | "soma"
  | "victorian"
  | "waterfront";

export interface CityBlock extends Point2 {
  readonly column: number;
  readonly district: District;
  readonly id: string;
  readonly row: number;
}

export interface BuildingDefinition extends Point2 {
  readonly accent: string;
  readonly color: string;
  readonly depth: number;
  readonly district: District;
  readonly height: number;
  readonly id: string;
  readonly kind: "row-house" | "shop" | "tower" | "warehouse";
  readonly width: number;
}

const DISTRICT_COLORS: Readonly<Record<District, readonly string[]>> = {
  chinatown: ["#c45145", "#e4a04d", "#5f7569", "#f0d18b"],
  downtown: ["#657d86", "#8aa6a6", "#a7b5ad", "#d7c7ad"],
  soma: ["#8b6f60", "#c47c5d", "#687a72", "#d1a26f"],
  victorian: ["#e36d70", "#5ba9a6", "#f0bd54", "#9c78ad"],
  waterfront: ["#4f8588", "#d18f56", "#7c9290", "#d8c6a1"],
};

const DISTRICT_ACCENTS: Readonly<Record<District, readonly string[]>> = {
  chinatown: ["#7f1f25", "#f1ce6d", "#254d4b"],
  downtown: ["#d7e5df", "#31535b", "#efc860"],
  soma: ["#3e4f4b", "#e4bf6a", "#663f39"],
  victorian: ["#fff0cf", "#315c64", "#a43e4c"],
  waterfront: ["#e7d7b6", "#315b63", "#d85547"],
};

function districtAt(column: number, row: number): District {
  if (column === 5) return "waterfront";
  if (column <= 1 && row <= 1) return "victorian";
  if (column >= 2 && column <= 3 && row <= 1) return "chinatown";
  if (column >= 2 && column <= 4 && row >= 2 && row <= 4) {
    return "downtown";
  }
  return "soma";
}

export const CITY_BLOCKS: readonly CityBlock[] = Object.freeze(
  BLOCK_CENTERS.flatMap((z, row) =>
    BLOCK_CENTERS.map((x, column) => ({
      column,
      district: districtAt(column, row),
      id: `block-${column}-${row}`,
      row,
      x,
      z,
    })),
  ),
);

function buildingCount(district: District): number {
  if (district === "victorian") return 3;
  if (district === "waterfront") return 1;
  return 2;
}

function buildingKind(district: District): BuildingDefinition["kind"] {
  if (district === "victorian") return "row-house";
  if (district === "downtown") return "tower";
  if (district === "chinatown") return "shop";
  return "warehouse";
}

function createBuildings(): readonly BuildingDefinition[] {
  return CITY_BLOCKS.flatMap((block) => {
    if (["block-0-1", "block-3-2"].includes(block.id)) return [];
    const count = buildingCount(block.district);
    return Array.from({ length: count }, (_, index) => {
      const palette = DISTRICT_COLORS[block.district];
      const accents = DISTRICT_ACCENTS[block.district];
      const seed = block.column * 17 + block.row * 29 + index * 11;
      const kind = buildingKind(block.district);
      const splitAlongX = (block.column + block.row) % 2 === 0;
      const laneOffset =
        count === 1 ? 0 : (index - (count - 1) / 2) * (count === 3 ? 7 : 10);
      const x = block.x + (splitAlongX ? laneOffset : index % 2 === 0 ? -5 : 5);
      const z =
        block.z + (splitAlongX ? (index % 2 === 0 ? -3 : 3) : laneOffset);
      const towerHeight = 18 + (seed % 15);
      const height =
        kind === "tower"
          ? towerHeight
          : kind === "row-house"
            ? 8 + (seed % 4)
            : kind === "shop"
              ? 9 + (seed % 5)
              : 7 + (seed % 7);
      const width = count === 3 ? 7.2 : splitAlongX ? 9.5 + (seed % 4) : 18;
      const depth =
        count === 3 ? 18 : splitAlongX ? 18 : 9.5 + ((seed + 3) % 4);
      return {
        accent: accents[(seed + 1) % accents.length],
        color: palette[seed % palette.length],
        depth,
        district: block.district,
        height,
        id: `${block.id}-building-${index}`,
        kind,
        width,
        x,
        z,
      };
    });
  });
}

export const CITY_BUILDINGS = Object.freeze(createBuildings());

export const LANDMARKS = Object.freeze([
  { id: "painted-ladies", x: -90, z: -54 },
  { id: "chinatown-gate", x: -36, z: -72 },
  { id: "market-pyramid", x: 18, z: -18 },
  { id: "cable-car", x: -108, z: 0 },
  { id: "bay-bridge", x: 132, z: -90 },
  { id: "pier-11", x: 114, z: 36 },
] as const);

export const TREE_POSITIONS: readonly Point2[] = Object.freeze(
  CITY_BLOCKS.flatMap((block, index) => {
    if (block.district === "downtown" || index % 2 === 0) return [];
    return [
      { x: block.x - 11, z: block.z - 11 },
      { x: block.x + 11, z: block.z + 11 },
    ];
  }),
);

export function distanceToNearestRoadLine(value: number): number {
  return Math.min(...ROAD_LINES.map((line) => Math.abs(value - line)));
}

export function nearestRoadLine(value: number): number {
  return ROAD_LINES.reduce((nearest, line) =>
    Math.abs(value - line) < Math.abs(value - nearest) ? line : nearest,
  );
}

export function isDriveable(point: Point2): boolean {
  if (Math.abs(point.x) > CITY_LIMIT || Math.abs(point.z) > CITY_LIMIT) {
    return false;
  }
  return (
    distanceToNearestRoadLine(point.x) <= ROAD_HALF_WIDTH ||
    distanceToNearestRoadLine(point.z) <= ROAD_HALF_WIDTH
  );
}

export function recoverToRoad(point: Point2, yaw: number) {
  const xDistance = distanceToNearestRoadLine(point.x);
  const zDistance = distanceToNearestRoadLine(point.z);
  const recovered =
    xDistance <= zDistance
      ? {
          x: nearestRoadLine(point.x),
          z: Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, point.z)),
        }
      : {
          x: Math.max(-CITY_LIMIT, Math.min(CITY_LIMIT, point.x)),
          z: nearestRoadLine(point.z),
        };
  return {
    ...recovered,
    yaw: Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2),
  };
}

export function districtAtPosition(point: Point2): District {
  const column = Math.max(
    0,
    Math.min(5, Math.floor((point.x + CITY_LIMIT) / 36)),
  );
  const row = Math.max(0, Math.min(5, Math.floor((point.z + CITY_LIMIT) / 36)));
  return districtAt(column, row);
}
