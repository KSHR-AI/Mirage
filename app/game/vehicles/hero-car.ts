import { SIMULATION_DT } from "../core/contracts";
import type {
  EntityId,
  InputFrame,
  Vec3,
  VehicleState,
} from "../core/contracts";

export const HERO_CAR_TARGET_SPEED = 26;

export interface ArcadeCarConfig {
  readonly targetSpeed: number;
  readonly reverseSpeed: number;
  readonly acceleration: number;
  readonly reverseAcceleration: number;
  readonly brakeDeceleration: number;
  readonly rollingResistance: number;
  readonly steeringRate: number;
  readonly minimumSteerSpeed: number;
  readonly lateralTraction: number;
}

export const DEFAULT_ARCADE_CAR_CONFIG: ArcadeCarConfig = Object.freeze({
  targetSpeed: HERO_CAR_TARGET_SPEED,
  reverseSpeed: 10,
  acceleration: 18,
  reverseAcceleration: 11,
  brakeDeceleration: 30,
  rollingResistance: 1.8,
  steeringRate: 1.75,
  minimumSteerSpeed: 0.4,
  lateralTraction: 12,
});

export interface VehicleMotion {
  readonly forwardSpeed: number;
  readonly lateralSpeed: number;
  readonly planarSpeed: number;
}

export type VehicleExitSide = "left" | "right";
export type UnsafeExitReason =
  | "not-occupant"
  | "vehicle-destroyed"
  | "airborne"
  | "moving"
  | "blocked";

export interface SafeExitRequest {
  readonly actorId: EntityId;
  readonly grounded: boolean;
  readonly clearance: Readonly<Record<VehicleExitSide, number>>;
  readonly preferredSide?: VehicleExitSide;
  readonly maximumSpeed?: number;
  readonly requiredClearance?: number;
  readonly lateralOffset?: number;
  readonly verticalOffset?: number;
}

export type SafeExitDecision =
  | {
      readonly safe: true;
      readonly side: VehicleExitSide;
      readonly position: Vec3;
    }
  | {
      readonly safe: false;
      readonly reason: UnsafeExitReason;
    };

const DEFAULT_MAXIMUM_EXIT_SPEED = 1.5;
const DEFAULT_REQUIRED_EXIT_CLEARANCE = 1.2;
const DEFAULT_EXIT_LATERAL_OFFSET = 2.4;
const TWO_PI = Math.PI * 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteAxis(value: number) {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function moveToward(current: number, target: number, maximumDelta: number) {
  if (current < target) return Math.min(current + maximumDelta, target);
  if (current > target) return Math.max(current - maximumDelta, target);
  return target;
}

function normalizeAngle(angle: number) {
  const wrapped = ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function normalizeZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function validatePositiveFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

function validateNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
  return value;
}

function basis(rotationY: number) {
  return {
    forwardX: -Math.sin(rotationY),
    forwardZ: -Math.cos(rotationY),
    rightX: Math.cos(rotationY),
    rightZ: -Math.sin(rotationY),
  };
}

export function vehiclePlanarSpeed(vehicle: VehicleState) {
  return Math.hypot(vehicle.velocity[0], vehicle.velocity[2]);
}

export function decomposeVehicleMotion(vehicle: VehicleState): VehicleMotion {
  const { forwardX, forwardZ, rightX, rightZ } = basis(vehicle.pose.rotationY);
  const forwardSpeed =
    vehicle.velocity[0] * forwardX + vehicle.velocity[2] * forwardZ;
  const lateralSpeed =
    vehicle.velocity[0] * rightX + vehicle.velocity[2] * rightZ;

  return {
    forwardSpeed,
    lateralSpeed,
    planarSpeed: Math.hypot(vehicle.velocity[0], vehicle.velocity[2]),
  };
}

export function stepHeroCar(
  vehicle: VehicleState,
  input: InputFrame,
  dt = SIMULATION_DT,
  config: ArcadeCarConfig = DEFAULT_ARCADE_CAR_CONFIG,
): VehicleState {
  validatePositiveFinite("dt", dt);
  if (vehicle.life !== "active") return vehicle;

  const throttle = finiteAxis(input.throttle);
  const steer = finiteAxis(input.steer);
  const motion = decomposeVehicleMotion(vehicle);
  let forwardSpeed = motion.forwardSpeed;

  if (input.brake) {
    forwardSpeed = moveToward(forwardSpeed, 0, config.brakeDeceleration * dt);
  } else if (Math.abs(throttle) > Number.EPSILON) {
    const targetSpeed =
      throttle >= 0
        ? throttle * config.targetSpeed
        : throttle * config.reverseSpeed;
    const changingDirection =
      forwardSpeed !== 0 && Math.sign(forwardSpeed) !== Math.sign(targetSpeed);
    const acceleration = changingDirection
      ? config.brakeDeceleration
      : throttle >= 0
        ? config.acceleration
        : config.reverseAcceleration;
    forwardSpeed = moveToward(forwardSpeed, targetSpeed, acceleration * dt);
  } else {
    forwardSpeed = moveToward(forwardSpeed, 0, config.rollingResistance * dt);
  }

  forwardSpeed = clamp(forwardSpeed, -config.reverseSpeed, config.targetSpeed);
  const lateralSpeed = moveToward(
    motion.lateralSpeed,
    0,
    config.lateralTraction * dt,
  );
  const speedForSteering = Math.abs(forwardSpeed);
  let rotationY = vehicle.pose.rotationY;
  if (
    Math.abs(steer) > Number.EPSILON &&
    speedForSteering >= config.minimumSteerSpeed
  ) {
    const speedRatio = clamp(speedForSteering / config.targetSpeed, 0, 1);
    const steeringScale = 0.25 + speedRatio * 0.75;
    const direction = forwardSpeed >= 0 ? 1 : -1;
    rotationY = normalizeAngle(
      rotationY - steer * direction * config.steeringRate * steeringScale * dt,
    );
  }

  const { forwardX, forwardZ, rightX, rightZ } = basis(rotationY);
  const velocityX = normalizeZero(
    forwardX * forwardSpeed + rightX * lateralSpeed,
  );
  const velocityZ = normalizeZero(
    forwardZ * forwardSpeed + rightZ * lateralSpeed,
  );

  return {
    ...vehicle,
    pose: {
      position: [
        vehicle.pose.position[0] + velocityX * dt,
        vehicle.pose.position[1],
        vehicle.pose.position[2] + velocityZ * dt,
      ],
      rotationY,
    },
    velocity: [velocityX, vehicle.velocity[1], velocityZ],
  };
}

export const stepHeroVehicle = stepHeroCar;

export function evaluateSafeExit(
  vehicle: VehicleState,
  request: SafeExitRequest,
): SafeExitDecision {
  if (vehicle.occupiedBy !== request.actorId) {
    return { safe: false, reason: "not-occupant" };
  }
  if (vehicle.life === "destroyed") {
    return { safe: false, reason: "vehicle-destroyed" };
  }
  if (!request.grounded) return { safe: false, reason: "airborne" };

  const maximumSpeed = validateNonNegativeFinite(
    "maximumSpeed",
    request.maximumSpeed ?? DEFAULT_MAXIMUM_EXIT_SPEED,
  );
  if (vehiclePlanarSpeed(vehicle) > maximumSpeed) {
    return { safe: false, reason: "moving" };
  }

  const requiredClearance = validatePositiveFinite(
    "requiredClearance",
    request.requiredClearance ?? DEFAULT_REQUIRED_EXIT_CLEARANCE,
  );
  const preferredSide = request.preferredSide ?? "right";
  const alternateSide = preferredSide === "right" ? "left" : "right";
  const sides: readonly VehicleExitSide[] = [preferredSide, alternateSide];
  const side = sides.find((candidate) => {
    const clearance = request.clearance[candidate];
    return Number.isFinite(clearance) && clearance >= requiredClearance;
  });
  if (!side) return { safe: false, reason: "blocked" };

  const lateralOffset = validatePositiveFinite(
    "lateralOffset",
    request.lateralOffset ?? DEFAULT_EXIT_LATERAL_OFFSET,
  );
  const verticalOffset = request.verticalOffset ?? 0;
  if (!Number.isFinite(verticalOffset)) {
    throw new RangeError("verticalOffset must be finite");
  }
  const { rightX, rightZ } = basis(vehicle.pose.rotationY);
  const sideSign = side === "right" ? 1 : -1;

  return {
    safe: true,
    side,
    position: [
      vehicle.pose.position[0] + rightX * lateralOffset * sideSign,
      vehicle.pose.position[1] + verticalOffset,
      vehicle.pose.position[2] + rightZ * lateralOffset * sideSign,
    ],
  };
}

export function canSafelyExitVehicle(
  vehicle: VehicleState,
  request: SafeExitRequest,
) {
  return evaluateSafeExit(vehicle, request).safe;
}

export const getSafeVehicleExit = evaluateSafeExit;
