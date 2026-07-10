import type { EntityId, Vec3 } from "../core/contracts";
import { CollisionLayer, layerMask } from "../physics/collision-layers";

export const HITSCAN_COLLISION_MASK = layerMask(
  CollisionLayer.World,
  CollisionLayer.Player,
  CollisionLayer.Vehicle,
  CollisionLayer.Actor,
);

export type PhysicsRaycastHitKind = "world" | "actor" | "vehicle";

export interface PhysicsRaycastQuery {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
  readonly collisionMask: number;
  readonly excludeEntityIds: readonly EntityId[];
}

export interface PhysicsRaycastHit {
  readonly kind: PhysicsRaycastHitKind;
  readonly distance: number;
  readonly point: Vec3;
  readonly normal: Vec3;
  readonly entityId?: EntityId;
}

export interface PhysicsQueryPort {
  /** Returns only the nearest blocking hit for the supplied ray. */
  raycast(query: PhysicsRaycastQuery): PhysicsRaycastHit | null;
}

export interface HitscanTraceRequest {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
  readonly sourceEntityId?: EntityId;
  readonly collisionMask?: number;
}

export interface HitscanTrace {
  readonly query: PhysicsRaycastQuery;
  readonly hit?: PhysicsRaycastHit;
}

function isFiniteVec3(value: Vec3) {
  return value.every(Number.isFinite);
}

function cloneVec3(value: Vec3): Vec3 {
  return [value[0], value[1], value[2]];
}

function normalized(value: Vec3): Vec3 {
  if (!isFiniteVec3(value)) {
    throw new RangeError("hitscan direction must be finite");
  }
  const scale = Math.max(
    Math.abs(value[0]),
    Math.abs(value[1]),
    Math.abs(value[2]),
  );
  if (scale === 0) {
    throw new RangeError("hitscan direction must be non-zero");
  }
  const scaled: Vec3 = [value[0] / scale, value[1] / scale, value[2] / scale];
  const length = Math.hypot(...scaled);
  return [scaled[0] / length, scaled[1] / length, scaled[2] / length];
}

function validHit(hit: PhysicsRaycastHit, maxDistance: number) {
  return (
    Number.isFinite(hit.distance) &&
    hit.distance >= 0 &&
    hit.distance <= maxDistance &&
    isFiniteVec3(hit.point) &&
    isFiniteVec3(hit.normal)
  );
}

export function traceHitscan(
  physics: PhysicsQueryPort,
  request: HitscanTraceRequest,
): HitscanTrace {
  if (!isFiniteVec3(request.origin)) {
    throw new RangeError("hitscan origin must be finite");
  }
  if (!Number.isFinite(request.maxDistance) || request.maxDistance <= 0) {
    throw new RangeError("hitscan maxDistance must be finite and positive");
  }

  const query: PhysicsRaycastQuery = {
    origin: cloneVec3(request.origin),
    direction: normalized(request.direction),
    maxDistance: request.maxDistance,
    collisionMask: request.collisionMask ?? HITSCAN_COLLISION_MASK,
    excludeEntityIds:
      request.sourceEntityId === undefined ? [] : [request.sourceEntityId],
  };
  const hit = physics.raycast(query);

  if (hit === null || !validHit(hit, request.maxDistance)) {
    return { query };
  }

  return {
    query,
    hit: {
      ...hit,
      point: cloneVec3(hit.point),
      normal: cloneVec3(hit.normal),
    },
  };
}
