import type {
  ActorState,
  EntityId,
  Vec3,
  VehicleState,
} from "../core/contracts";

export const VEHICLE_INTERACTION_LIMITS = {
  enterDistance: 3.5,
  enterVerticalDistance: 1.75,
  enterSpeed: 1.5,
  exitSpeed: 1.5,
  exitMaxDrop: 1.25,
} as const;

export type VehicleEntryReason =
  | "allowed"
  | "actor-not-alive"
  | "actor-already-in-vehicle"
  | "vehicle-not-active"
  | "vehicle-occupied"
  | "invalid-motion"
  | "vehicle-moving"
  | "invalid-position"
  | "too-far"
  | "vertical-gap";

export interface VehicleEntryDecision {
  readonly allowed: boolean;
  readonly reason: VehicleEntryReason;
}

export interface VehicleEntryOptions {
  readonly actorVehicleId?: EntityId;
  readonly maxDistance?: number;
  readonly maxVerticalDistance?: number;
  readonly maxVehicleSpeed?: number;
}

export type VehicleExitReason =
  | "allowed"
  | "actor-not-alive"
  | "actor-not-occupant"
  | "invalid-motion"
  | "vehicle-moving"
  | "invalid-position"
  | "path-blocked"
  | "space-blocked"
  | "unsupported"
  | "drop-too-high";

export interface VehicleExitCandidate {
  readonly position: Vec3;
  readonly pathClear: boolean;
  readonly spaceClear: boolean;
  readonly hasGroundSupport: boolean;
  readonly groundDistance: number;
}

export interface VehicleExitDecision {
  readonly allowed: boolean;
  readonly reason: VehicleExitReason;
}

export interface VehicleExitOptions {
  readonly maxVehicleSpeed?: number;
  readonly maxDrop?: number;
}

function isFiniteVec3(value: Vec3) {
  return value.every(Number.isFinite);
}

function planarDistance(from: Vec3, to: Vec3) {
  return Math.hypot(to[0] - from[0], to[2] - from[2]);
}

function planarSpeed(velocity: Vec3) {
  return Math.hypot(velocity[0], velocity[2]);
}

function interactionLimit(value: number | undefined, fallback: number) {
  const limit = value ?? fallback;
  if (!Number.isFinite(limit) || limit < 0) {
    throw new RangeError(
      "vehicle interaction limits must be finite and non-negative",
    );
  }
  return limit;
}

export function evaluateVehicleEntry(
  actor: ActorState,
  vehicle: VehicleState,
  options: VehicleEntryOptions = {},
): VehicleEntryDecision {
  const maxVehicleSpeed = interactionLimit(
    options.maxVehicleSpeed,
    VEHICLE_INTERACTION_LIMITS.enterSpeed,
  );
  const maxVerticalDistance = interactionLimit(
    options.maxVerticalDistance,
    VEHICLE_INTERACTION_LIMITS.enterVerticalDistance,
  );
  const maxDistance = interactionLimit(
    options.maxDistance,
    VEHICLE_INTERACTION_LIMITS.enterDistance,
  );
  if (actor.life !== "alive") {
    return { allowed: false, reason: "actor-not-alive" };
  }
  if (options.actorVehicleId !== undefined) {
    return { allowed: false, reason: "actor-already-in-vehicle" };
  }
  if (vehicle.life !== "active") {
    return { allowed: false, reason: "vehicle-not-active" };
  }
  if (vehicle.occupiedBy !== undefined) {
    return { allowed: false, reason: "vehicle-occupied" };
  }
  if (!isFiniteVec3(vehicle.velocity)) {
    return { allowed: false, reason: "invalid-motion" };
  }
  if (planarSpeed(vehicle.velocity) > maxVehicleSpeed) {
    return { allowed: false, reason: "vehicle-moving" };
  }
  if (
    !isFiniteVec3(actor.pose.position) ||
    !isFiniteVec3(vehicle.pose.position)
  ) {
    return { allowed: false, reason: "invalid-position" };
  }
  if (
    Math.abs(actor.pose.position[1] - vehicle.pose.position[1]) >
    maxVerticalDistance
  ) {
    return { allowed: false, reason: "vertical-gap" };
  }
  if (
    planarDistance(actor.pose.position, vehicle.pose.position) > maxDistance
  ) {
    return { allowed: false, reason: "too-far" };
  }

  return { allowed: true, reason: "allowed" };
}

export function canEnterVehicle(
  actor: ActorState,
  vehicle: VehicleState,
  options?: VehicleEntryOptions,
) {
  return evaluateVehicleEntry(actor, vehicle, options).allowed;
}

export function evaluateVehicleExit(
  actor: ActorState,
  vehicle: VehicleState,
  candidate: VehicleExitCandidate,
  options: VehicleExitOptions = {},
): VehicleExitDecision {
  const maxVehicleSpeed = interactionLimit(
    options.maxVehicleSpeed,
    VEHICLE_INTERACTION_LIMITS.exitSpeed,
  );
  const maxDrop = interactionLimit(
    options.maxDrop,
    VEHICLE_INTERACTION_LIMITS.exitMaxDrop,
  );
  if (actor.life !== "alive") {
    return { allowed: false, reason: "actor-not-alive" };
  }
  if (vehicle.occupiedBy !== actor.id) {
    return { allowed: false, reason: "actor-not-occupant" };
  }
  if (!isFiniteVec3(vehicle.velocity)) {
    return { allowed: false, reason: "invalid-motion" };
  }
  if (planarSpeed(vehicle.velocity) > maxVehicleSpeed) {
    return { allowed: false, reason: "vehicle-moving" };
  }
  if (
    !isFiniteVec3(candidate.position) ||
    !Number.isFinite(candidate.groundDistance) ||
    candidate.groundDistance < 0
  ) {
    return { allowed: false, reason: "invalid-position" };
  }
  if (!candidate.pathClear) {
    return { allowed: false, reason: "path-blocked" };
  }
  if (!candidate.spaceClear) {
    return { allowed: false, reason: "space-blocked" };
  }
  if (!candidate.hasGroundSupport) {
    return { allowed: false, reason: "unsupported" };
  }
  if (candidate.groundDistance > maxDrop) {
    return { allowed: false, reason: "drop-too-high" };
  }

  return { allowed: true, reason: "allowed" };
}

export function canExitVehicle(
  actor: ActorState,
  vehicle: VehicleState,
  candidate: VehicleExitCandidate,
  options?: VehicleExitOptions,
) {
  return evaluateVehicleExit(actor, vehicle, candidate, options).allowed;
}

export function findSafeVehicleExit(
  actor: ActorState,
  vehicle: VehicleState,
  candidates: readonly VehicleExitCandidate[],
  options?: VehicleExitOptions,
) {
  return candidates.find((candidate) =>
    canExitVehicle(actor, vehicle, candidate, options),
  );
}
