import type {
  EntityId,
  GameEvent,
  Tick,
  VehicleKind,
  VehicleState,
} from "../core/contracts";

export const COURIER_DISABLE_HEALTH = 40;
export const COURIER_DISABLE_IMPULSE = 32;

export interface CollisionDamageConfig {
  readonly minimumDamageImpulse: number;
  readonly damagePerImpulse: number;
  readonly maximumDamage: number;
  readonly courierDisableHealth: number;
  readonly courierDisableImpulse: number;
  readonly disableHealth: Readonly<Record<VehicleKind, number>>;
}

export const DEFAULT_COLLISION_DAMAGE_CONFIG: CollisionDamageConfig =
  Object.freeze({
    minimumDamageImpulse: 4,
    damagePerImpulse: 1.5,
    maximumDamage: 50,
    courierDisableHealth: COURIER_DISABLE_HEALTH,
    courierDisableImpulse: COURIER_DISABLE_IMPULSE,
    disableHealth: Object.freeze({
      hero: 0,
      traffic: 0,
      courier: COURIER_DISABLE_HEALTH,
      police: 0,
    }),
  });

export interface VehicleCollision {
  readonly impulse: number;
  readonly tick: Tick;
  readonly sourceId?: EntityId;
}

export interface VehicleCollisionResult {
  readonly vehicle: VehicleState;
  readonly damage: number;
  readonly disabled: boolean;
  readonly events: readonly GameEvent[];
}

function validateImpulse(impulse: number) {
  if (!Number.isFinite(impulse) || impulse < 0) {
    throw new RangeError(
      "Collision impulse must be a non-negative finite number",
    );
  }
}

export function collisionDamageFromImpulse(
  impulse: number,
  config: CollisionDamageConfig = DEFAULT_COLLISION_DAMAGE_CONFIG,
) {
  validateImpulse(impulse);
  return Math.min(
    config.maximumDamage,
    Math.max(0, impulse - config.minimumDamageImpulse) *
      config.damagePerImpulse,
  );
}

export function applyVehicleCollisionImpulse(
  vehicle: VehicleState,
  collision: VehicleCollision,
  config: CollisionDamageConfig = DEFAULT_COLLISION_DAMAGE_CONFIG,
): VehicleCollisionResult {
  validateImpulse(collision.impulse);
  if (vehicle.life !== "active") {
    return { vehicle, damage: 0, disabled: false, events: [] };
  }

  const calculatedDamage = collisionDamageFromImpulse(
    collision.impulse,
    config,
  );
  const damage = Math.min(Math.max(0, vehicle.health), calculatedDamage);
  if (damage <= 0) {
    return { vehicle, damage: 0, disabled: false, events: [] };
  }

  const health = Math.max(0, vehicle.health - damage);
  const healthThreshold =
    vehicle.kind === "courier"
      ? config.courierDisableHealth
      : config.disableHealth[vehicle.kind];
  const disabledByImpulse =
    vehicle.kind === "courier" &&
    collision.impulse >= config.courierDisableImpulse;
  const disabled = health <= healthThreshold || disabledByImpulse;
  const nextVehicle: VehicleState = {
    ...vehicle,
    health,
    life: disabled ? "disabled" : vehicle.life,
  };
  const events: GameEvent[] = [
    {
      type: "vehicle-damaged",
      tick: collision.tick,
      vehicleId: vehicle.id,
      amount: damage,
      ...(collision.sourceId === undefined
        ? {}
        : { sourceId: collision.sourceId }),
    },
  ];
  if (disabled) {
    events.push({
      type: "vehicle-disabled",
      tick: collision.tick,
      vehicleId: vehicle.id,
    });
  }

  return {
    vehicle: nextVehicle,
    damage,
    disabled,
    events,
  };
}

export const applyCollisionImpulseDamage = applyVehicleCollisionImpulse;
