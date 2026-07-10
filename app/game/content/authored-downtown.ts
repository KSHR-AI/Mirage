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

export const AUTHORED_DOWNTOWN_PLACEMENTS: readonly AuthoredDowntownPlacement[] =
  Object.freeze([
    Object.freeze({
      collision: Object.freeze({
        maxX: 14.633,
        maxY: 15.299,
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
        minZ: -14.238,
      }),
      id: "authored-downtown-small",
      nodeName: "Building_Small_1",
      position: Object.freeze([19.262, 0.307, -6.9] as const),
      scale: 0.6,
    }),
    Object.freeze({
      collision: Object.freeze({
        maxX: 50.258,
        maxY: 22.7,
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
  ]);

export const AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES = Object.freeze([
  "building-14--14-",
  "building-42--14-",
] as const);

export function belongsToAuthoredDowntownBlock(id: string): boolean {
  return AUTHORED_DOWNTOWN_PROCEDURAL_PREFIXES.some((prefix) =>
    id.startsWith(prefix),
  );
}

export function isInsideAuthoredDowntownBlock(x: number, z: number): boolean {
  const insideZ = z >= -23.2 && z <= -4.8;
  if (!insideZ) return false;
  return (x >= 4.8 && x <= 23.2) || (x >= 32.8 && x <= 51.2);
}
