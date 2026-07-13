import type { VehicleState } from "../core/contracts";
import { vehiclePlanarExtents } from "../vehicles/building-collision";
import {
  CITY_EXTENTS,
  CITY_ROAD_LINES,
  createBayCityLayout,
} from "../presentation/city/city-layout";
import type {
  CharacterGroundSample,
  CharacterObstacle,
  CharacterWorld,
} from "./character-controller";
import { afterlightSpaceCharacterObstacles } from "./afterlight-space";

export const AFTERLIGHT_CHARACTER_CENTER_TO_FEET = 1;
export const AFTERLIGHT_CHARACTER_HIT_CENTER_OFFSET = 0.25;
export const AFTERLIGHT_CHARACTER_WEAPON_OFFSET = 0.34;

const ROAD_HALF_WIDTH = 4.8;
const ROAD_SURFACE_Y = 0.165;
const SIDEWALK_SURFACE_Y = 0.3;
const BRIDGE_SURFACE_Y = 0.405;
const BRIDGE_HALF_WIDTH = 8.5;
const BRIDGE_RAMP_END_Z = -106;
const UP = Object.freeze([0, 1, 0] as const);
const worlds = new Map<number, CharacterWorld>();

function characterHeight(surfaceY: number): number {
  return surfaceY + AFTERLIGHT_CHARACTER_CENTER_TO_FEET;
}

function nearestRoadDistance(value: number): number {
  let distance = Number.POSITIVE_INFINITY;
  for (const road of CITY_ROAD_LINES) {
    distance = Math.min(distance, Math.abs(value - road));
  }
  return distance;
}

export function sampleAfterlightCharacterGround(
  x: number,
  z: number,
): CharacterGroundSample | null {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

  if (z < CITY_EXTENTS.landMin) {
    if (z < CITY_EXTENTS.bridgeEndZ || Math.abs(x) > BRIDGE_HALF_WIDTH) {
      return null;
    }
    if (z >= BRIDGE_RAMP_END_Z) {
      const progress =
        (CITY_EXTENTS.landMin - z) / (CITY_EXTENTS.landMin - BRIDGE_RAMP_END_Z);
      const surfaceY =
        ROAD_SURFACE_Y + (BRIDGE_SURFACE_Y - ROAD_SURFACE_Y) * progress;
      const slope =
        (BRIDGE_SURFACE_Y - ROAD_SURFACE_Y) /
        (CITY_EXTENTS.landMin - BRIDGE_RAMP_END_Z);
      return {
        height: characterHeight(surfaceY),
        normal: [0, 1, slope],
      };
    }
    return { height: characterHeight(BRIDGE_SURFACE_Y), normal: UP };
  }

  if (
    z > CITY_EXTENTS.landMax ||
    x < -CITY_EXTENTS.landMax ||
    x > CITY_EXTENTS.landMax
  ) {
    return null;
  }

  const road =
    nearestRoadDistance(x) <= ROAD_HALF_WIDTH ||
    nearestRoadDistance(z) <= ROAD_HALF_WIDTH;
  return {
    height: characterHeight(road ? ROAD_SURFACE_Y : SIDEWALK_SURFACE_Y),
    normal: UP,
  };
}

function buildingObstacle(
  building: ReturnType<typeof createBayCityLayout>["buildings"][number],
): CharacterObstacle {
  const halfX = building.scale[0] * 0.5;
  const halfY = building.scale[1] * 0.5;
  const halfZ = building.scale[2] * 0.5;
  return Object.freeze({
    id: building.id,
    minX: building.position[0] - halfX,
    maxX: building.position[0] + halfX,
    minY: building.position[1] - halfY,
    maxY: building.position[1] + halfY,
    minZ: building.position[2] - halfZ,
    maxZ: building.position[2] + halfZ,
  });
}

function vehicleObstacle(vehicle: VehicleState): CharacterObstacle {
  const extents = vehiclePlanarExtents(vehicle);
  return Object.freeze({
    id: `vehicle-${vehicle.id}`,
    minX: vehicle.pose.position[0] - extents.x,
    maxX: vehicle.pose.position[0] + extents.x,
    minY: 0,
    maxY: 2.2,
    minZ: vehicle.pose.position[2] - extents.z,
    maxZ: vehicle.pose.position[2] + extents.z,
  });
}

export function createAfterlightCharacterWorld(seed: number): CharacterWorld {
  const key = Math.trunc(seed) >>> 0 || 1;
  const cached = worlds.get(key);
  if (cached) return cached;

  const layout = createBayCityLayout({ quality: "mobile", seed: key });
  const world: CharacterWorld = Object.freeze({
    obstacles: Object.freeze(
      layout.buildings
        .map(buildingObstacle)
        .concat(afterlightSpaceCharacterObstacles())
        .toSorted((left, right) => left.id.localeCompare(right.id)),
    ),
    sampleGround: sampleAfterlightCharacterGround,
  });
  worlds.set(key, world);
  return world;
}

export function createAfterlightVehicleObstacles(
  vehicles: ReadonlyMap<number, VehicleState>,
): readonly CharacterObstacle[] {
  return [...vehicles.values()]
    .toSorted((left, right) => left.id - right.id)
    .map(vehicleObstacle);
}
