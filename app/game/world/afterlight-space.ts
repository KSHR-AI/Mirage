import type { Vec3 } from "../core/contracts";
import type { CharacterObstacle } from "./character-controller";

export interface AfterlightSpaceBox {
  readonly id: string;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
  readonly coverQuality: 1 | 2;
}

function spaceBox(
  id: string,
  center: Vec3,
  halfExtents: Vec3,
  coverQuality: 1 | 2 = 1,
): AfterlightSpaceBox {
  return Object.freeze({ id, center, halfExtents, coverQuality });
}

/**
 * Canonical collision for authored mission spaces. Each entry maps to visible
 * structure and deliberately leaves interaction anchors and approach lanes open.
 */
export const AFTERLIGHT_SPACE_COLLIDERS: readonly AfterlightSpaceBox[] =
  Object.freeze([
    spaceBox("boost-yard-office", [55.5, 2.42, 46.9], [0.95, 1.75, 1.1]),

    spaceBox("courier-warehouse", [70, 3.3, 33.5], [9, 3.2, 3], 2),
    spaceBox("courier-containers", [79.5, 2.8, 45.5], [2.6, 2.8, 8.2], 2),

    spaceBox("vault-west-wall", [4.85, 3.6, -42], [0.35, 3.6, 8.5], 2),
    spaceBox("vault-east-wall", [23.15, 3.6, -42], [0.35, 3.6, 8.5], 2),
    spaceBox("vault-north-west", [8.1, 3.6, -33.85], [2.9, 3.6, 0.35], 2),
    spaceBox("vault-north-east", [19.9, 3.6, -33.85], [2.9, 3.6, 0.35], 2),
    spaceBox("vault-south-west", [8.1, 3.6, -50.15], [2.9, 3.6, 0.35], 2),
    spaceBox("vault-south-east", [19.9, 3.6, -50.15], [2.9, 3.6, 0.35], 2),

    spaceBox("substation-control", [-75, 2.3, -47], [3, 2.1, 2.5], 2),
    spaceBox("substation-transformer-a", [-66, 1.45, -46], [1.9, 1.25, 1.5]),
    spaceBox("substation-transformer-b", [-66, 1.45, -39], [1.9, 1.25, 1.5]),
    spaceBox("substation-transformer-c", [-74, 1.45, -37], [1.9, 1.25, 1.5]),

    spaceBox("safehouse-wall", [7, 2.5, -232], [5, 2.5, 1], 2),
  ]);

export function afterlightSpaceCharacterObstacles(): readonly CharacterObstacle[] {
  return AFTERLIGHT_SPACE_COLLIDERS.map((box) =>
    Object.freeze({
      id: box.id,
      minX: box.center[0] - box.halfExtents[0],
      maxX: box.center[0] + box.halfExtents[0],
      minY: box.center[1] - box.halfExtents[1],
      maxY: box.center[1] + box.halfExtents[1],
      minZ: box.center[2] - box.halfExtents[2],
      maxZ: box.center[2] + box.halfExtents[2],
    }),
  );
}

export function pointInsideAfterlightSpaceBox(
  point: Vec3,
  box: AfterlightSpaceBox,
  clearance = 0,
): boolean {
  return (
    Math.abs(point[0] - box.center[0]) <= box.halfExtents[0] + clearance &&
    Math.abs(point[1] - box.center[1]) <= box.halfExtents[1] + clearance &&
    Math.abs(point[2] - box.center[2]) <= box.halfExtents[2] + clearance
  );
}
