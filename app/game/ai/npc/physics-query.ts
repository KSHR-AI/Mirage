import type { EntityId, Vec3 } from "../../core/contracts";
import {
  HITSCAN_COLLISION_MASK,
  type PhysicsQueryPort,
  type PhysicsRaycastHit,
  type PhysicsRaycastHitKind,
  type PhysicsRaycastQuery,
} from "../../combat/physics-query";
import { NPC_EPSILON, lengthVec3, normalizeVec3, subtractVec3 } from "./math";

export type {
  PhysicsQueryPort,
  PhysicsRaycastHit,
  PhysicsRaycastHitKind,
  PhysicsRaycastQuery,
};

export interface LineOfSightOptions {
  readonly collisionMask?: number;
  readonly sourceEntityId?: EntityId;
  readonly targetEntityId?: EntityId;
  readonly clearance?: number;
}

export function hasLineOfSight(
  physics: PhysicsQueryPort,
  origin: Vec3,
  target: Vec3,
  options: LineOfSightOptions = {},
): boolean {
  const offset = subtractVec3(target, origin);
  const distance = lengthVec3(offset);
  if (distance <= NPC_EPSILON) return true;

  const hit = physics.raycast({
    origin,
    direction: normalizeVec3(offset),
    maxDistance: distance,
    collisionMask: options.collisionMask ?? HITSCAN_COLLISION_MASK,
    excludeEntityIds:
      options.sourceEntityId === undefined ? [] : [options.sourceEntityId],
  });
  if (
    !hit ||
    (options.targetEntityId !== undefined &&
      hit.entityId === options.targetEntityId)
  ) {
    return true;
  }

  return hit.distance >= distance - (options.clearance ?? 0.05);
}

export const CLEAR_LINE_OF_SIGHT: PhysicsQueryPort = Object.freeze({
  raycast: () => null,
});
