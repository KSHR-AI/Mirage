import type { Pose, Vec2 } from "../../core/contracts";

export type AfterlightCameraMode = "on-foot" | "vehicle" | "intro" | "debrief";

export type AfterlightCameraLookMode = "axis" | "delta";

export type AfterlightCameraImpulseKind = "impact" | "recoil" | "explosion";

export interface AfterlightCameraImpulse {
  /** Monotonically increasing identifier used to consume each impulse once. */
  readonly sequence: number;
  /** Normalized intensity in the range 0 to 1. */
  readonly strength: number;
  readonly kind?: AfterlightCameraImpulseKind;
  /** Optional screen-space direction, clamped to the range -1 to 1. */
  readonly direction?: Vec2;
}

export interface AfterlightCameraOrientation {
  yaw: number;
  pitch: number;
}

export interface AfterlightCameraOrientationRef {
  readonly current: AfterlightCameraOrientation;
}

export interface AfterlightCameraRigProps {
  readonly targetPose: Pose;
  readonly mode: AfterlightCameraMode;
  /** Planar target speed in meters per second. */
  readonly speed?: number;
  readonly aim?: boolean;
  /** Horizontal and vertical look signal. See `lookMode`. */
  readonly look?: Vec2;
  /** Axis is a normalized angular velocity; delta is a pixel-like frame delta. */
  readonly lookMode?: AfterlightCameraLookMode;
  readonly paused?: boolean;
  readonly reducedMotion?: boolean;
  /** Clear distance from the target pivot toward the desired camera position. */
  readonly collisionDistance?: number | null;
  readonly impulses?: readonly AfterlightCameraImpulse[];
  /** Mutable, allocation-free output for camera-relative gameplay adapters. */
  readonly orientationRef?: AfterlightCameraOrientationRef;
  readonly enabled?: boolean;
}

export interface MutableCameraVector {
  x: number;
  y: number;
  z: number;
}

export interface MutableCameraProfile {
  distance: number;
  pivotHeight: number;
  lookHeight: number;
  lookAhead: number;
  shoulder: number;
  neutralPitch: number;
  yawOffset: number;
  fov: number;
  positionLambda: number;
  lookLambda: number;
  rotationLambda: number;
}

export interface MutableCameraFrame {
  readonly position: MutableCameraVector;
  readonly lookAt: MutableCameraVector;
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
  boomDistance: number;
  collisionConstrained: boolean;
}

export interface CameraControlState {
  initialized: boolean;
  mode: AfterlightCameraMode;
  yaw: number;
  pitch: number;
  desiredYaw: number;
  desiredPitch: number;
  vehicleOrbitYaw: number;
}

export interface CameraControlStep {
  mode: AfterlightCameraMode;
  targetYaw: number;
  lookX: number;
  lookY: number;
  lookMode: AfterlightCameraLookMode;
  speed: number;
  aim: boolean;
  reducedMotion: boolean;
  cinematicTime: number;
  dt: number;
}

export interface CameraFrameRequest {
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  boomDistance: number;
  pivotHeight: number;
  lookHeight: number;
  lookAhead: number;
  shoulder: number;
  fov: number;
  roll: number;
}

export interface CameraShakeState {
  trauma: number;
  time: number;
  phase: number;
  yawKick: number;
  pitchKick: number;
  rollKick: number;
  fovKick: number;
  lastSequence: number;
}

export interface MutableCameraShakeSample {
  lateral: number;
  vertical: number;
  longitudinal: number;
  yaw: number;
  pitch: number;
  roll: number;
  fov: number;
}
