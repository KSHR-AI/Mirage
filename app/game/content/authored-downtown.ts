export type AuthoredDowntownPlacement = {
  readonly collision: {
    readonly maxX: number;
    readonly maxY: number;
    readonly maxZ: number;
    readonly minX: number;
    readonly minY: number;
    readonly minZ: number;
  };
  readonly id: string;
  readonly nodeName: string;
  readonly position: readonly [number, number, number];
  readonly scale: number;
};

export const AUTHORED_DOWNTOWN_MODEL_URL =
  "/game-assets/models/downtown-buildings.glb";

const AUTHORED_DOWNTOWN_BLOCK_CENTERS = [
  [14, -14],
  [42, -14],
  [42, 42],
  [42, 70],
  [70, 70],
] as const;

const CITY_BLOCK_HALF_EXTENT = 9.2;

export const AUTHORED_DOWNTOWN_PLACEMENTS: readonly AuthoredDowntownPlacement[] =
  Object.freeze([
    Object.freeze({
      collision: Object.freeze({
        maxX: 14.634,
        maxY: 15.3,
        maxZ: -6.559,
        minX: 5.6,
        minY: 0.3,
        minZ: -14.393,
      }),
      id: "authored-downtown-medium",
      nodeName: "Building_Medium_2.001",
      position: Object.freeze([10.117, 0.3, -6.9] as const),
      scale: 0.6,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 22.4,
        maxY: 10.516,
        maxZ: -5.516,
        minX: 14.924,
        minY: 0.3,
        minZ: -14.239,
      }),
      id: "authored-downtown-small",
      nodeName: "Building_Small_1",
      position: Object.freeze([19.262, 0.307, -6.9] as const),
      scale: 0.6,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 50.258,
        maxY: 22.701,
        maxZ: -6.642,
        minX: 33.742,
        minY: 0.3,
        minZ: -19.958,
      }),
      id: "authored-downtown-large",
      nodeName: "Building_Large_2",
      position: Object.freeze([41.2, 0.3, -6.9] as const),
      scale: 0.8,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 50.258,
        maxY: 22.701,
        maxZ: 49.358,
        minX: 33.742,
        minY: 0.3,
        minZ: 36.042,
      }),
      id: "authored-downtown-42-42-large",
      nodeName: "Building_Large_2",
      position: Object.freeze([41.2, 0.3, 49.1] as const),
      scale: 0.8,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 40.728,
        maxY: 12.8,
        maxZ: 77.385,
        minX: 33.2,
        minY: 0.3,
        minZ: 70.856,
      }),
      id: "authored-downtown-42-70-medium",
      nodeName: "Building_Medium_2.001",
      position: Object.freeze([36.964, 0.3, 77.1] as const),
      scale: 0.5,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 50.8,
        maxY: 10.516,
        maxZ: 78.484,
        minX: 43.324,
        minY: 0.3,
        minZ: 69.761,
      }),
      id: "authored-downtown-42-70-small",
      nodeName: "Building_Small_1",
      position: Object.freeze([47.662, 0.307, 77.1] as const),
      scale: 0.6,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 78.258,
        maxY: 22.701,
        maxZ: 77.358,
        minX: 61.742,
        minY: 0.3,
        minZ: 64.042,
      }),
      id: "authored-downtown-70-70-large",
      nodeName: "Building_Large_2",
      position: Object.freeze([69.2, 0.3, 77.1] as const),
      scale: 0.8,
    }),
  ]);

export const AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES = Object.freeze(
  AUTHORED_DOWNTOWN_BLOCK_CENTERS.map(
    ([blockX, blockZ]) => `building-${blockX}-${blockZ}-`,
  ),
);

export function belongsToAuthoredDowntownBlock(id: string): boolean {
  return AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES.some((prefix) =>
    id.startsWith(prefix),
  );
}

export function isInsideAuthoredDowntownBlock(x: number, z: number): boolean {
  return AUTHORED_DOWNTOWN_BLOCK_CENTERS.some(
    ([blockX, blockZ]) =>
      x >= blockX - CITY_BLOCK_HALF_EXTENT &&
      x <= blockX + CITY_BLOCK_HALF_EXTENT &&
      z >= blockZ - CITY_BLOCK_HALF_EXTENT &&
      z <= blockZ + CITY_BLOCK_HALF_EXTENT,
  );
}
