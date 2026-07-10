import type { VehicleKind, VehicleState } from "../core/contracts";
import type { CharacterObstacle } from "../world/character-controller";

export interface VehiclePlanarFootprint {
  readonly halfWidth: number;
  readonly halfLength: number;
}

export interface VehiclePlanarExtents {
  readonly x: number;
  readonly z: number;
}

export interface VehicleBuildingCollision {
  readonly obstacleId: string;
  readonly impactSpeed: number;
  readonly normal: readonly [x: number, z: number];
}

export interface VehicleBuildingCollisionResult {
  readonly vehicle: VehicleState;
  readonly collision?: VehicleBuildingCollision;
}

export const VEHICLE_PLANAR_FOOTPRINTS: Readonly<
  Record<VehicleKind, VehiclePlanarFootprint>
> = Object.freeze({
  hero: Object.freeze({ halfWidth: 1.08, halfLength: 2.2 }),
  traffic: Object.freeze({ halfWidth: 1.08, halfLength: 2.2 }),
  courier: Object.freeze({ halfWidth: 1.25, halfLength: 2.65 }),
  police: Object.freeze({ halfWidth: 1.08, halfLength: 2.2 }),
});

const SWEEP_EPSILON = 1e-9;
const CONTACT_EPSILON = 1e-6;

interface ExpandedObstacle {
  readonly id: string;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

interface SweepContact {
  readonly obstacle: ExpandedObstacle;
  readonly time: number;
  readonly normal: readonly [x: number, z: number];
  readonly depenetration?: readonly [x: number, z: number];
}

export function vehiclePlanarExtents(
  vehicle: Pick<VehicleState, "kind" | "pose">,
): VehiclePlanarExtents {
  const footprint = VEHICLE_PLANAR_FOOTPRINTS[vehicle.kind];
  const cosine = Math.abs(Math.cos(vehicle.pose.rotationY));
  const sine = Math.abs(Math.sin(vehicle.pose.rotationY));
  return {
    x: cosine * footprint.halfWidth + sine * footprint.halfLength,
    z: sine * footprint.halfWidth + cosine * footprint.halfLength,
  };
}

function expandedObstacle(
  obstacle: CharacterObstacle,
  extents: VehiclePlanarExtents,
): ExpandedObstacle {
  return {
    id: obstacle.id,
    minX: obstacle.minX - extents.x,
    maxX: obstacle.maxX + extents.x,
    minZ: obstacle.minZ - extents.z,
    maxZ: obstacle.maxZ + extents.z,
  };
}

function strictlyInside(
  x: number,
  z: number,
  obstacle: ExpandedObstacle,
): boolean {
  return (
    x > obstacle.minX &&
    x < obstacle.maxX &&
    z > obstacle.minZ &&
    z < obstacle.maxZ
  );
}

function depenetrationContact(
  x: number,
  z: number,
  obstacle: ExpandedObstacle,
): SweepContact {
  const candidates = [
    {
      distance: x - obstacle.minX,
      normal: [-1, 0] as const,
      position: [obstacle.minX - CONTACT_EPSILON, z] as const,
    },
    {
      distance: obstacle.maxX - x,
      normal: [1, 0] as const,
      position: [obstacle.maxX + CONTACT_EPSILON, z] as const,
    },
    {
      distance: z - obstacle.minZ,
      normal: [0, -1] as const,
      position: [x, obstacle.minZ - CONTACT_EPSILON] as const,
    },
    {
      distance: obstacle.maxZ - z,
      normal: [0, 1] as const,
      position: [x, obstacle.maxZ + CONTACT_EPSILON] as const,
    },
  ];
  const nearest = candidates.reduce((best, candidate) =>
    candidate.distance < best.distance ? candidate : best,
  );
  return {
    obstacle,
    time: 0,
    normal: nearest.normal,
    depenetration: nearest.position,
  };
}

function sweepAxis(
  origin: number,
  delta: number,
  minimum: number,
  maximum: number,
  minimumNormal: readonly [number, number],
  maximumNormal: readonly [number, number],
) {
  if (Math.abs(delta) <= SWEEP_EPSILON) {
    return origin < minimum || origin > maximum
      ? null
      : {
          near: Number.NEGATIVE_INFINITY,
          far: Number.POSITIVE_INFINITY,
          normal: minimumNormal,
        };
  }

  if (delta > 0) {
    return {
      near: (minimum - origin) / delta,
      far: (maximum - origin) / delta,
      normal: minimumNormal,
    };
  }
  return {
    near: (maximum - origin) / delta,
    far: (minimum - origin) / delta,
    normal: maximumNormal,
  };
}

function sweepContact(
  startX: number,
  startZ: number,
  deltaX: number,
  deltaZ: number,
  obstacle: ExpandedObstacle,
): SweepContact | null {
  if (strictlyInside(startX, startZ, obstacle)) {
    return depenetrationContact(startX, startZ, obstacle);
  }

  const x = sweepAxis(
    startX,
    deltaX,
    obstacle.minX,
    obstacle.maxX,
    [-1, 0],
    [1, 0],
  );
  const z = sweepAxis(
    startZ,
    deltaZ,
    obstacle.minZ,
    obstacle.maxZ,
    [0, -1],
    [0, 1],
  );
  if (!x || !z) return null;

  const time = Math.max(x.near, z.near);
  const exitTime = Math.min(x.far, z.far);
  if (
    time > exitTime + SWEEP_EPSILON ||
    time < -SWEEP_EPSILON ||
    time > 1 + SWEEP_EPSILON
  ) {
    return null;
  }

  return {
    obstacle,
    time: Math.max(0, time),
    normal: x.near >= z.near ? x.normal : z.normal,
  };
}

function earlierContact(
  current: SweepContact | null,
  candidate: SweepContact,
): SweepContact {
  if (!current) return candidate;
  if (candidate.time < current.time - SWEEP_EPSILON) return candidate;
  if (
    Math.abs(candidate.time - current.time) <= SWEEP_EPSILON &&
    candidate.obstacle.id.localeCompare(current.obstacle.id) < 0
  ) {
    return candidate;
  }
  return current;
}

export function resolveVehicleBuildingCollision(
  previous: VehicleState,
  proposed: VehicleState,
  obstacles: readonly CharacterObstacle[],
): VehicleBuildingCollisionResult {
  const previousExtents = vehiclePlanarExtents(previous);
  const proposedExtents = vehiclePlanarExtents(proposed);
  const extents = {
    x: Math.max(previousExtents.x, proposedExtents.x),
    z: Math.max(previousExtents.z, proposedExtents.z),
  };
  const startX = previous.pose.position[0];
  const startZ = previous.pose.position[2];
  const deltaX = proposed.pose.position[0] - startX;
  const deltaZ = proposed.pose.position[2] - startZ;
  let contact: SweepContact | null = null;

  for (const obstacle of obstacles) {
    const candidate = sweepContact(
      startX,
      startZ,
      deltaX,
      deltaZ,
      expandedObstacle(obstacle, extents),
    );
    if (candidate) contact = earlierContact(contact, candidate);
  }
  if (!contact) return { vehicle: proposed };

  const [normalX, normalZ] = contact.normal;
  const positionX = contact.depenetration
    ? contact.depenetration[0]
    : startX + deltaX * contact.time + normalX * CONTACT_EPSILON;
  const positionZ = contact.depenetration
    ? contact.depenetration[1]
    : startZ + deltaZ * contact.time + normalZ * CONTACT_EPSILON;
  const normalSpeed =
    proposed.velocity[0] * normalX + proposed.velocity[2] * normalZ;
  const enteringSpeed = Math.min(0, normalSpeed);

  return {
    vehicle: {
      ...proposed,
      pose: {
        ...proposed.pose,
        position: [positionX, proposed.pose.position[1], positionZ],
      },
      velocity: [
        proposed.velocity[0] - normalX * enteringSpeed,
        proposed.velocity[1],
        proposed.velocity[2] - normalZ * enteringSpeed,
      ],
    },
    collision: {
      obstacleId: contact.obstacle.id,
      impactSpeed: -enteringSpeed,
      normal: contact.normal,
    },
  };
}
