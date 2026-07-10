import type {
  PhysicsQueryPort,
  PhysicsRaycastHit,
  PhysicsRaycastQuery,
} from "../combat";
import { CollisionLayer, layerBit } from "../physics/collision-layers";
import type {
  ActorState,
  EntityId,
  GameState,
  Vec3,
  VehicleState,
} from "./contracts";

export interface WorldCollisionBox {
  readonly id: string;
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

export const AFTERLIGHT_MISSION_COVER: readonly WorldCollisionBox[] =
  Object.freeze([
    Object.freeze({
      id: "boost-yard-office",
      center: [78, 2, 68] as Vec3,
      halfExtents: [4, 2, 5] as Vec3,
    }),
    Object.freeze({
      id: "vault-shell",
      center: [14, 3, -42] as Vec3,
      halfExtents: [7, 3, 5] as Vec3,
    }),
    Object.freeze({
      id: "substation-transformer-west",
      center: [-76, 1.5, -45] as Vec3,
      halfExtents: [2.2, 1.5, 3] as Vec3,
    }),
    Object.freeze({
      id: "substation-transformer-east",
      center: [-64, 1.5, -39] as Vec3,
      halfExtents: [2.2, 1.5, 3] as Vec3,
    }),
    Object.freeze({
      id: "safehouse-wall",
      center: [7, 2.5, -232] as Vec3,
      halfExtents: [5, 2.5, 1] as Vec3,
    }),
  ]);

interface SphereCollider {
  readonly kind: "actor" | "vehicle";
  readonly entityId: EntityId;
  readonly center: Vec3;
  readonly radius: number;
  readonly layer: CollisionLayer;
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dot(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function length(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function normalize(vector: Vec3): Vec3 {
  const magnitude = length(vector);
  return magnitude > 0
    ? [vector[0] / magnitude, vector[1] / magnitude, vector[2] / magnitude]
    : [0, 1, 0];
}

function layerIncluded(mask: number, layer: CollisionLayer): boolean {
  return (mask & layerBit(layer)) !== 0;
}

function actorCollider(actor: ActorState): SphereCollider {
  return {
    kind: "actor",
    entityId: actor.id,
    center: [
      actor.pose.position[0],
      actor.pose.position[1] + 0.85,
      actor.pose.position[2],
    ],
    radius: actor.kind === "player" ? 0.58 : 0.62,
    layer:
      actor.kind === "player" ? CollisionLayer.Player : CollisionLayer.Actor,
  };
}

function vehicleCollider(vehicle: VehicleState): SphereCollider {
  return {
    kind: "vehicle",
    entityId: vehicle.id,
    center: [
      vehicle.pose.position[0],
      vehicle.pose.position[1] + 0.72,
      vehicle.pose.position[2],
    ],
    radius: vehicle.kind === "courier" ? 2.25 : 1.9,
    layer: CollisionLayer.Vehicle,
  };
}

function raySphere(
  query: PhysicsRaycastQuery,
  collider: SphereCollider,
): PhysicsRaycastHit | null {
  const offset = subtract(query.origin, collider.center);
  const halfB = dot(offset, query.direction);
  const c = dot(offset, offset) - collider.radius * collider.radius;
  const discriminant = halfB * halfB - c;
  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const near = -halfB - root;
  const far = -halfB + root;
  const distance = near >= 0 ? near : far >= 0 ? far : -1;
  if (distance < 0 || distance > query.maxDistance) return null;

  const point = add(query.origin, scale(query.direction, distance));
  return {
    kind: collider.kind,
    entityId: collider.entityId,
    distance,
    point,
    normal: normalize(subtract(point, collider.center)),
  };
}

function axisValue(vector: Vec3, index: number): number {
  return vector[index] ?? 0;
}

function rayBox(
  query: PhysicsRaycastQuery,
  box: WorldCollisionBox,
): PhysicsRaycastHit | null {
  let near = 0;
  let far = query.maxDistance;
  let normalAxis = 0;
  let normalSign = 1;

  for (let axis = 0; axis < 3; axis += 1) {
    const origin = axisValue(query.origin, axis);
    const direction = axisValue(query.direction, axis);
    const minimum =
      axisValue(box.center, axis) - axisValue(box.halfExtents, axis);
    const maximum =
      axisValue(box.center, axis) + axisValue(box.halfExtents, axis);

    if (Math.abs(direction) < 1e-8) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }

    const first = (minimum - origin) / direction;
    const second = (maximum - origin) / direction;
    const axisNear = Math.min(first, second);
    const axisFar = Math.max(first, second);
    if (axisNear > near) {
      near = axisNear;
      normalAxis = axis;
      normalSign = first < second ? -1 : 1;
    }
    far = Math.min(far, axisFar);
    if (near > far) return null;
  }

  if (far < 0 || near > query.maxDistance) return null;
  const distance = Math.max(0, near);
  const point = add(query.origin, scale(query.direction, distance));
  const normal: [number, number, number] = [0, 0, 0];
  normal[normalAxis] = normalSign;

  return { kind: "world", distance, point, normal };
}

function nearest(
  current: PhysicsRaycastHit | null,
  candidate: PhysicsRaycastHit | null,
): PhysicsRaycastHit | null {
  if (!candidate) return current;
  if (!current || candidate.distance < current.distance) return candidate;
  if (
    candidate.distance === current.distance &&
    (candidate.entityId ?? Number.MAX_SAFE_INTEGER) <
      (current.entityId ?? Number.MAX_SAFE_INTEGER)
  ) {
    return candidate;
  }
  return current;
}

export class AfterlightPhysicsQuery implements PhysicsQueryPort {
  private readonly actors: readonly ActorState[];
  private readonly vehicles: readonly VehicleState[];
  private readonly world: readonly WorldCollisionBox[];

  constructor(
    state: Pick<GameState, "actors" | "vehicles">,
    world: readonly WorldCollisionBox[] = AFTERLIGHT_MISSION_COVER,
  ) {
    this.actors = [...state.actors.values()]
      .filter((actor) => actor.life === "alive")
      .sort((left, right) => left.id - right.id);
    this.vehicles = [...state.vehicles.values()]
      .filter((vehicle) => vehicle.life !== "destroyed")
      .sort((left, right) => left.id - right.id);
    this.world = world;
  }

  raycast(query: PhysicsRaycastQuery): PhysicsRaycastHit | null {
    const excluded = new Set(query.excludeEntityIds);
    let result: PhysicsRaycastHit | null = null;

    if (layerIncluded(query.collisionMask, CollisionLayer.World)) {
      for (const box of this.world)
        result = nearest(result, rayBox(query, box));
    }

    for (const actor of this.actors) {
      if (excluded.has(actor.id)) continue;
      const collider = actorCollider(actor);
      if (!layerIncluded(query.collisionMask, collider.layer)) continue;
      result = nearest(result, raySphere(query, collider));
    }

    if (layerIncluded(query.collisionMask, CollisionLayer.Vehicle)) {
      for (const vehicle of this.vehicles) {
        if (excluded.has(vehicle.id)) continue;
        result = nearest(result, raySphere(query, vehicleCollider(vehicle)));
      }
    }

    return result;
  }
}

export function createAfterlightPhysicsQuery(
  state: Pick<GameState, "actors" | "vehicles">,
  world?: readonly WorldCollisionBox[],
): PhysicsQueryPort {
  return new AfterlightPhysicsQuery(state, world);
}
