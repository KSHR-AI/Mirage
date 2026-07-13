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
  readonly boostSpeed: number;
  readonly reverseSpeed: number;
  readonly acceleration: number;
  readonly boostAcceleration: number;
  readonly reverseAcceleration: number;
  readonly brakeDeceleration: number;
  readonly rollingResistance: number;
  readonly aerodynamicDrag: number;
  readonly steeringRate: number;
  readonly wheelbase: number;
  readonly lowSpeedSteeringAngle: number;
  readonly highSpeedSteeringAngle: number;
  readonly steeringFalloff: number;
  readonly minimumSteerSpeed: number;
  readonly lateralTraction: number;
  readonly handbrakeTraction: number;
  readonly handbrakeMinimumSpeed: number;
}

export const DEFAULT_ARCADE_CAR_CONFIG: ArcadeCarConfig = Object.freeze({
  targetSpeed: HERO_CAR_TARGET_SPEED,
  boostSpeed: 32,
  reverseSpeed: 9,
  acceleration: 16,
  boostAcceleration: 21,
  reverseAcceleration: 11,
  brakeDeceleration: 32,
  rollingResistance: 1.35,
  aerodynamicDrag: 0.0018,
  steeringRate: 1.25,
  wheelbase: 2.72,
  lowSpeedSteeringAngle: 0.52,
  highSpeedSteeringAngle: 0.065,
  steeringFalloff: 0.45,
  minimumSteerSpeed: 0.2,
  lateralTraction: 7.5,
  handbrakeTraction: 1.65,
  handbrakeMinimumSpeed: 6,
});

export const STREET_TUNED_ARCADE_CAR_CONFIG: ArcadeCarConfig = Object.freeze({
  ...DEFAULT_ARCADE_CAR_CONFIG,
  targetSpeed: 29,
  boostSpeed: 36,
  acceleration: 18.5,
  boostAcceleration: 24,
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

export function steeringAngleForSpeed(
  speed: number,
  config: ArcadeCarConfig = DEFAULT_ARCADE_CAR_CONFIG,
): number {
  const safeSpeed = Number.isFinite(speed) ? Math.abs(speed) : 0;
  const speedRatio = clamp(safeSpeed / config.boostSpeed, 0, 1);
  const falloff = Math.pow(speedRatio, config.steeringFalloff);
  return (
    config.lowSpeedSteeringAngle +
    (config.highSpeedSteeringAngle - config.lowSpeedSteeringAngle) * falloff
  );
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
  const boosting = input.sprint && throttle > 0 && !input.brake;

  if (input.brake) {
    forwardSpeed = moveToward(forwardSpeed, 0, config.brakeDeceleration * dt);
  } else if (Math.abs(throttle) > Number.EPSILON) {
    const forwardTarget = boosting ? config.boostSpeed : config.targetSpeed;
    const targetSpeed =
      throttle >= 0 ? throttle * forwardTarget : throttle * config.reverseSpeed;
    const changingDirection =
      forwardSpeed !== 0 && Math.sign(forwardSpeed) !== Math.sign(targetSpeed);
    const acceleration = changingDirection
      ? config.brakeDeceleration
      : throttle >= 0
        ? boosting
          ? config.boostAcceleration
          : config.acceleration
        : config.reverseAcceleration;
    forwardSpeed = moveToward(forwardSpeed, targetSpeed, acceleration * dt);
  } else {
    const coastDeceleration =
      config.rollingResistance +
      config.aerodynamicDrag * forwardSpeed * forwardSpeed;
    forwardSpeed = moveToward(forwardSpeed, 0, coastDeceleration * dt);
  }

  forwardSpeed = clamp(forwardSpeed, -config.reverseSpeed, config.boostSpeed);
  const originalBasis = basis(vehicle.pose.rotationY);
  const velocityBeforeTurnX =
    originalBasis.forwardX * forwardSpeed +
    originalBasis.rightX * motion.lateralSpeed;
  const velocityBeforeTurnZ =
    originalBasis.forwardZ * forwardSpeed +
    originalBasis.rightZ * motion.lateralSpeed;
  const speedForSteering = Math.abs(forwardSpeed);
  let rotationY = vehicle.pose.rotationY;
  if (
    Math.abs(steer) > Number.EPSILON &&
    speedForSteering >= config.minimumSteerSpeed
  ) {
    const wheelAngle = steer * steeringAngleForSpeed(speedForSteering, config);
    const rawYawRate = (forwardSpeed / config.wheelbase) * Math.tan(wheelAngle);
    const yawRate = clamp(
      rawYawRate,
      -config.steeringRate,
      config.steeringRate,
    );
    rotationY = normalizeAngle(rotationY - yawRate * dt);
  }

  // Preserve world momentum through the yaw change, then let tire grip pull it
  // toward the new chassis direction. Braking while steering leaves more slip.
  const turnedBasis = basis(rotationY);
  const turnedForwardSpeed =
    velocityBeforeTurnX * turnedBasis.forwardX +
    velocityBeforeTurnZ * turnedBasis.forwardZ;
  const turnedLateralSpeed =
    velocityBeforeTurnX * turnedBasis.rightX +
    velocityBeforeTurnZ * turnedBasis.rightZ;
  const handbrakeActive =
    input.brake &&
    Math.abs(steer) >= 0.2 &&
    speedForSteering >= config.handbrakeMinimumSpeed;
  const traction = handbrakeActive
    ? config.handbrakeTraction
    : config.lateralTraction;
  const lateralSpeed =
    turnedLateralSpeed * Math.exp(-Math.max(0, traction) * dt);

  const velocityX = normalizeZero(
    turnedBasis.forwardX * turnedForwardSpeed +
      turnedBasis.rightX * lateralSpeed,
  );
  const velocityZ = normalizeZero(
    turnedBasis.forwardZ * turnedForwardSpeed +
      turnedBasis.rightZ * lateralSpeed,
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
