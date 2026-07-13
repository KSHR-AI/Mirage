export { AfterlightCameraRig } from "./AfterlightCameraRig";
export {
  AFTERLIGHT_OPENING_CINEMATIC_TICKS,
  hasOpeningCinematicInput,
  shouldFinishOpeningCinematic,
} from "./opening";
export {
  collectCameraCollisionRoots,
  nearestCameraCollisionDistance,
  probeCameraCollisionDistance,
} from "./collision";
export {
  AFTERLIGHT_CAMERA_PROFILES,
  applyControlledCameraOrientation,
  cameraDampingAlpha,
  consumeAfterlightCameraImpulses,
  dampAfterlightCameraFrame,
  dampCameraAngle,
  dampCameraScalar,
  normalizeCameraAngle,
  resolveAfterlightCameraProfile,
  resolveAfterlightTargetYaw,
  resolveCameraCollisionBoom,
  sampleAfterlightCameraShake,
  shortestCameraAngleDelta,
  solveAfterlightCameraFrame,
  stepAfterlightCameraControls,
} from "./math";
export type {
  AfterlightCameraImpulse,
  AfterlightCameraImpulseKind,
  AfterlightCameraLookMode,
  AfterlightCameraMode,
  AfterlightCameraOrientation,
  AfterlightCameraOrientationRef,
  AfterlightCameraRigProps,
  CameraControlState,
  CameraControlStep,
  CameraFrameRequest,
  CameraShakeState,
  MutableCameraFrame,
  MutableCameraProfile,
  MutableCameraShakeSample,
  MutableCameraVector,
} from "./types";
