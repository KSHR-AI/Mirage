import type {
  AfterlightCameraImpulse,
  AfterlightCameraMode,
  CameraControlState,
  CameraControlStep,
  CameraFrameRequest,
  CameraShakeState,
  MutableCameraFrame,
  MutableCameraProfile,
  MutableCameraShakeSample,
} from "./types";

const TWO_PI = Math.PI * 2;
const CAMERA_COLLISION_MARGIN = 0.24;
const CAMERA_MINIMUM_BOOM = 0.18;
const AXIS_YAW_SPEED = 2.65;
const AXIS_PITCH_SPEED = 1.9;
const DELTA_YAW_SENSITIVITY = 0.025;
const DELTA_PITCH_SENSITIVITY = 0.02;
const VEHICLE_ORBIT_LIMIT = Math.PI * 0.82;
const LOOK_AXIS_LIMIT = 1;
const LOOK_DELTA_LIMIT = 180;

interface CameraProfilePreset {
  readonly distance: number;
  readonly pivotHeight: number;
  readonly lookHeight: number;
  readonly lookAhead: number;
  readonly shoulder: number;
  readonly neutralPitch: number;
  readonly yawOffset: number;
  readonly fov: number;
  readonly positionLambda: number;
  readonly lookLambda: number;
  readonly rotationLambda: number;
}

export const AFTERLIGHT_CAMERA_PROFILES: Readonly<
  Record<AfterlightCameraMode | "aim", CameraProfilePreset>
> = Object.freeze({
  "on-foot": Object.freeze({
    distance: 5.6,
    pivotHeight: 1.45,
    lookHeight: 1.22,
    lookAhead: 0.35,
    shoulder: 0.38,
    neutralPitch: 0.12,
    yawOffset: 0,
    fov: 61,
    positionLambda: 10,
    lookLambda: 13,
    rotationLambda: 15,
  }),
  aim: Object.freeze({
    distance: 2.75,
    pivotHeight: 1.52,
    lookHeight: 1.5,
    lookAhead: 2.2,
    shoulder: 0.74,
    neutralPitch: 0.08,
    yawOffset: 0,
    fov: 54,
    positionLambda: 16,
    lookLambda: 18,
    rotationLambda: 20,
  }),
  vehicle: Object.freeze({
    distance: 8.4,
    pivotHeight: 2.2,
    lookHeight: 1.3,
    lookAhead: 2.8,
    shoulder: 0,
    neutralPitch: 0.15,
    yawOffset: 0,
    fov: 63,
    positionLambda: 8.5,
    lookLambda: 11,
    rotationLambda: 9.5,
  }),
  intro: Object.freeze({
    distance: 13.5,
    pivotHeight: 4.8,
    lookHeight: 1.3,
    lookAhead: -2.6,
    shoulder: 0,
    neutralPitch: 0.23,
    yawOffset: -1.45,
    fov: 48,
    positionLambda: 3.2,
    lookLambda: 4.2,
    rotationLambda: 3.4,
  }),
  opening: Object.freeze({
    distance: 9.8,
    pivotHeight: 2,
    lookHeight: 1.15,
    lookAhead: -0.6,
    shoulder: 0,
    neutralPitch: 0.08,
    yawOffset: -0.72,
    fov: 50,
    positionLambda: 7,
    lookLambda: 7.5,
    rotationLambda: 6.4,
  }),
  debrief: Object.freeze({
    distance: 8.8,
    pivotHeight: 2.7,
    lookHeight: 1.25,
    lookAhead: 0.5,
    shoulder: 0.22,
    neutralPitch: 0.16,
    yawOffset: 0.62,
    fov: 50,
    positionLambda: 4.8,
    lookLambda: 6,
    rotationLambda: 4.6,
  }),
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function copyProfile(out: MutableCameraProfile, preset: CameraProfilePreset) {
  out.distance = preset.distance;
  out.pivotHeight = preset.pivotHeight;
  out.lookHeight = preset.lookHeight;
  out.lookAhead = preset.lookAhead;
  out.shoulder = preset.shoulder;
  out.neutralPitch = preset.neutralPitch;
  out.yawOffset = preset.yawOffset;
  out.fov = preset.fov;
  out.positionLambda = preset.positionLambda;
  out.lookLambda = preset.lookLambda;
  out.rotationLambda = preset.rotationLambda;
}

function blendProfile(
  out: MutableCameraProfile,
  from: CameraProfilePreset,
  to: CameraProfilePreset,
  amount: number,
) {
  const t = clamp(amount, 0, 1);
  out.distance = from.distance + (to.distance - from.distance) * t;
  out.pivotHeight = from.pivotHeight + (to.pivotHeight - from.pivotHeight) * t;
  out.lookHeight = from.lookHeight + (to.lookHeight - from.lookHeight) * t;
  out.lookAhead = from.lookAhead + (to.lookAhead - from.lookAhead) * t;
  out.shoulder = from.shoulder + (to.shoulder - from.shoulder) * t;
  out.neutralPitch =
    from.neutralPitch + (to.neutralPitch - from.neutralPitch) * t;
  out.yawOffset = from.yawOffset + (to.yawOffset - from.yawOffset) * t;
  out.fov = from.fov + (to.fov - from.fov) * t;
  out.positionLambda =
    from.positionLambda + (to.positionLambda - from.positionLambda) * t;
  out.lookLambda = from.lookLambda + (to.lookLambda - from.lookLambda) * t;
  out.rotationLambda =
    from.rotationLambda + (to.rotationLambda - from.rotationLambda) * t;
}

export function normalizeCameraAngle(angle: number) {
  const finite = finiteOr(angle, 0);
  const wrapped = ((((finite + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

export function shortestCameraAngleDelta(from: number, to: number) {
  return normalizeCameraAngle(to - from);
}

export function resolveAfterlightTargetYaw(
  mode: AfterlightCameraMode,
  rotationY: number,
) {
  return normalizeCameraAngle(rotationY + (mode === "vehicle" ? Math.PI : 0));
}

export function cameraDampingAlpha(lambda: number, dt: number) {
  const safeLambda = Math.max(0, finiteOr(lambda, 0));
  const safeDt = Math.max(0, finiteOr(dt, 0));
  return 1 - Math.exp(-safeLambda * safeDt);
}

export function dampCameraScalar(
  current: number,
  target: number,
  lambda: number,
  dt: number,
) {
  return current + (target - current) * cameraDampingAlpha(lambda, dt);
}

export function dampCameraAngle(
  current: number,
  target: number,
  lambda: number,
  dt: number,
) {
  return normalizeCameraAngle(
    current +
      shortestCameraAngleDelta(current, target) *
        cameraDampingAlpha(lambda, dt),
  );
}

export function resolveAfterlightCameraProfile(
  out: MutableCameraProfile,
  mode: AfterlightCameraMode,
  aim: boolean,
  speed: number,
  reducedMotion: boolean,
) {
  if (mode === "on-foot" && aim) {
    blendProfile(
      out,
      AFTERLIGHT_CAMERA_PROFILES["on-foot"],
      AFTERLIGHT_CAMERA_PROFILES.aim,
      1,
    );
    return out;
  }

  copyProfile(out, AFTERLIGHT_CAMERA_PROFILES[mode]);
  if (mode === "vehicle") {
    const normalizedSpeed = clamp(finiteOr(speed, 0) / 26, 0, 1);
    const easedSpeed =
      normalizedSpeed * normalizedSpeed * (3 - 2 * normalizedSpeed);
    out.distance += easedSpeed * 1.15;
    out.lookAhead += easedSpeed * 2.1;
    out.fov += easedSpeed * (reducedMotion ? 4 : 8);
  }
  return out;
}

export function applyOpeningCameraAspect(
  out: MutableCameraProfile,
  mode: AfterlightCameraMode,
  aspect: number,
) {
  if (mode !== "opening") return out;
  const safeAspect = Math.max(0.2, finiteOr(aspect, 16 / 9));
  const portraitStrength = clamp((1 - safeAspect) / 0.55, 0, 1);
  out.distance += portraitStrength * 5.4;
  out.pivotHeight += portraitStrength * 0.35;
  out.fov += portraitStrength * 3;
  return out;
}

export function resolveCameraCollisionBoom(
  desiredDistance: number,
  collisionDistance: number | null | undefined,
  margin = CAMERA_COLLISION_MARGIN,
) {
  const desired = Math.max(
    CAMERA_MINIMUM_BOOM,
    finiteOr(desiredDistance, CAMERA_MINIMUM_BOOM),
  );
  if (collisionDistance == null || !Number.isFinite(collisionDistance)) {
    return desired;
  }
  const clearance = Math.max(
    CAMERA_MINIMUM_BOOM,
    collisionDistance - Math.max(0, finiteOr(margin, 0)),
  );
  return Math.min(desired, clearance);
}

function cameraLookDelta(
  value: number,
  mode: CameraControlStep["lookMode"],
  axisSpeed: number,
  deltaSensitivity: number,
  dt: number,
) {
  if (mode === "delta") {
    return (
      clamp(finiteOr(value, 0), -LOOK_DELTA_LIMIT, LOOK_DELTA_LIMIT) *
      deltaSensitivity
    );
  }
  return (
    clamp(finiteOr(value, 0), -LOOK_AXIS_LIMIT, LOOK_AXIS_LIMIT) *
    axisSpeed *
    dt
  );
}

export function stepAfterlightCameraControls(
  state: CameraControlState,
  step: CameraControlStep,
) {
  const dt = clamp(finiteOr(step.dt, 0), 0, 0.1);
  const targetYaw = normalizeCameraAngle(step.targetYaw);
  const profile = AFTERLIGHT_CAMERA_PROFILES[step.mode];
  const scripted =
    step.mode === "intro" || step.mode === "opening" || step.mode === "debrief";

  if (!state.initialized) {
    state.initialized = true;
    state.mode = step.mode;
    state.yaw = normalizeCameraAngle(targetYaw + profile.yawOffset);
    state.pitch = profile.neutralPitch;
    state.desiredYaw = state.yaw;
    state.desiredPitch = state.pitch;
    state.vehicleOrbitYaw = 0;
  } else if (state.mode !== step.mode) {
    if (step.mode === "vehicle") {
      state.vehicleOrbitYaw = clamp(
        shortestCameraAngleDelta(targetYaw, state.yaw),
        -VEHICLE_ORBIT_LIMIT,
        VEHICLE_ORBIT_LIMIT,
      );
    } else if (step.mode === "on-foot") {
      state.desiredYaw = state.yaw;
    } else {
      state.vehicleOrbitYaw = 0;
    }
    state.mode = step.mode;
  }

  if (scripted) {
    const cinematicTime = Math.max(0, finiteOr(step.cinematicTime, 0));
    const drift = step.reducedMotion
      ? 0
      : step.mode === "opening"
        ? Math.sin(Math.min(1, cinematicTime / 2.5) * Math.PI * 0.72) * 0.2
        : Math.sin(cinematicTime * 0.13) * 0.055;
    state.desiredYaw = normalizeCameraAngle(
      targetYaw + profile.yawOffset + drift,
    );
    state.desiredPitch = profile.neutralPitch;
  } else {
    const yawDelta = cameraLookDelta(
      step.lookX,
      step.lookMode,
      AXIS_YAW_SPEED,
      DELTA_YAW_SENSITIVITY,
      dt,
    );
    const pitchDelta = cameraLookDelta(
      step.lookY,
      step.lookMode,
      AXIS_PITCH_SPEED,
      DELTA_PITCH_SENSITIVITY,
      dt,
    );

    if (step.mode === "vehicle") {
      state.vehicleOrbitYaw = clamp(
        state.vehicleOrbitYaw - yawDelta,
        -VEHICLE_ORBIT_LIMIT,
        VEHICLE_ORBIT_LIMIT,
      );
      const lookIsIdle =
        Math.abs(finiteOr(step.lookX, 0)) < 0.025 &&
        Math.abs(finiteOr(step.lookY, 0)) < 0.025;
      if (lookIsIdle) {
        const speedRatio = clamp(finiteOr(step.speed, 0) / 26, 0, 1);
        const recenterLambda = 0.45 + speedRatio * 1.8;
        state.vehicleOrbitYaw = dampCameraScalar(
          state.vehicleOrbitYaw,
          0,
          recenterLambda,
          dt,
        );
      }
      state.desiredYaw = normalizeCameraAngle(
        targetYaw + state.vehicleOrbitYaw,
      );
    } else {
      state.desiredYaw = normalizeCameraAngle(state.desiredYaw - yawDelta);
    }

    const minimumPitch =
      step.mode === "vehicle"
        ? -0.18
        : step.mode === "on-foot" && step.aim
          ? -0.2
          : -0.3;
    const maximumPitch =
      step.mode === "vehicle"
        ? 0.43
        : step.mode === "on-foot" && step.aim
          ? 0.36
          : 0.52;
    state.desiredPitch = clamp(
      state.desiredPitch - pitchDelta,
      minimumPitch,
      maximumPitch,
    );
  }

  const rotationLambda =
    AFTERLIGHT_CAMERA_PROFILES[step.mode].rotationLambda *
    (step.reducedMotion ? 1.35 : 1);
  state.yaw = dampCameraAngle(state.yaw, state.desiredYaw, rotationLambda, dt);
  state.pitch = dampCameraScalar(
    state.pitch,
    state.desiredPitch,
    rotationLambda,
    dt,
  );
  return state;
}

export function applyControlledCameraOrientation(
  state: CameraControlState,
  orientation: { readonly yaw: number; readonly pitch: number },
) {
  const yaw = normalizeCameraAngle(orientation.yaw);
  const pitch = clamp(finiteOr(orientation.pitch, 0), -0.3, 0.52);
  state.yaw = yaw;
  state.desiredYaw = yaw;
  state.pitch = pitch;
  state.desiredPitch = pitch;
  return state;
}

export function solveAfterlightCameraFrame(
  out: MutableCameraFrame,
  request: CameraFrameRequest,
) {
  const yaw = normalizeCameraAngle(request.yaw);
  const pitch = clamp(finiteOr(request.pitch, 0), -0.5, 0.65);
  const boomDistance = Math.max(
    CAMERA_MINIMUM_BOOM,
    finiteOr(request.boomDistance, CAMERA_MINIMUM_BOOM),
  );
  const cosinePitch = Math.cos(pitch);
  const horizontalBoom = boomDistance * cosinePitch;
  const verticalBoom = boomDistance * Math.sin(pitch);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const shoulderScale = clamp(boomDistance / 2.4, 0.25, 1);
  const shoulder = finiteOr(request.shoulder, 0) * shoulderScale;
  const targetX = finiteOr(request.targetX, 0);
  const targetY = finiteOr(request.targetY, 0);
  const targetZ = finiteOr(request.targetZ, 0);

  out.position.x = targetX - forwardX * horizontalBoom + rightX * shoulder;
  out.position.y = targetY + finiteOr(request.pivotHeight, 0) + verticalBoom;
  out.position.z = targetZ - forwardZ * horizontalBoom + rightZ * shoulder;
  out.lookAt.x = targetX + forwardX * finiteOr(request.lookAhead, 0);
  out.lookAt.y = targetY + finiteOr(request.lookHeight, 0);
  out.lookAt.z = targetZ + forwardZ * finiteOr(request.lookAhead, 0);
  out.yaw = yaw;
  out.pitch = pitch;
  out.roll = finiteOr(request.roll, 0);
  out.fov = clamp(finiteOr(request.fov, 60), 42, 74);
  out.boomDistance = boomDistance;
  return out;
}

function impulseStrength(impulse: AfterlightCameraImpulse) {
  return clamp(finiteOr(impulse.strength, 0), 0, 1);
}

export function consumeAfterlightCameraImpulses(
  state: CameraShakeState,
  impulses: readonly AfterlightCameraImpulse[],
  reducedMotion: boolean,
) {
  for (const impulse of impulses) {
    if (
      !Number.isSafeInteger(impulse.sequence) ||
      impulse.sequence <= state.lastSequence
    ) {
      continue;
    }
    state.lastSequence = impulse.sequence;
    const strength = impulseStrength(impulse);
    if (strength <= 0) continue;

    if (reducedMotion) {
      state.trauma = 0;
      state.yawKick = 0;
      state.pitchKick = 0;
      state.rollKick = 0;
      state.fovKick = Math.min(state.fovKick, -0.45 * strength);
      continue;
    }

    const directionX = clamp(finiteOr(impulse.direction?.[0] ?? 0, 0), -1, 1);
    const directionY = clamp(finiteOr(impulse.direction?.[1] ?? 0, 0), -1, 1);
    const kind = impulse.kind ?? "impact";
    const traumaScale =
      kind === "explosion" ? 0.8 : kind === "recoil" ? 0.22 : 0.48;
    state.trauma = clamp(state.trauma + strength * traumaScale, 0, 1);
    state.yawKick += directionX * strength * 0.018;
    state.pitchKick +=
      (kind === "recoil" ? 0.024 : -directionY * 0.012) * strength;
    state.rollKick += directionX * strength * 0.013;
    state.fovKick -= strength * (kind === "explosion" ? 0.65 : 0.22);
    state.phase = normalizeCameraAngle(
      state.phase + impulse.sequence * 0.754877666,
    );
  }
  return state;
}

export function sampleAfterlightCameraShake(
  out: MutableCameraShakeSample,
  state: CameraShakeState,
  dt: number,
  reducedMotion: boolean,
) {
  const safeDt = clamp(finiteOr(dt, 0), 0, 0.1);
  state.time += safeDt;
  const kickLambda = reducedMotion ? 14 : 10;
  state.yawKick = dampCameraScalar(state.yawKick, 0, kickLambda, safeDt);
  state.pitchKick = dampCameraScalar(state.pitchKick, 0, kickLambda, safeDt);
  state.rollKick = dampCameraScalar(state.rollKick, 0, kickLambda, safeDt);
  state.fovKick = dampCameraScalar(state.fovKick, 0, 9, safeDt);

  if (reducedMotion) {
    state.trauma = Math.max(0, state.trauma - safeDt * 3.5);
    out.lateral = 0;
    out.vertical = 0;
    out.longitudinal = 0;
    out.yaw = 0;
    out.pitch = 0;
    out.roll = 0;
    out.fov = state.fovKick;
    return out;
  }

  const amplitude = state.trauma * state.trauma;
  const phase = state.phase;
  const time = state.time;
  out.lateral = Math.sin(time * 31 + phase) * amplitude * 0.095;
  out.vertical = Math.sin(time * 37 + phase * 1.7) * amplitude * 0.065;
  out.longitudinal = Math.sin(time * 23 + phase * 0.6) * amplitude * 0.055;
  out.yaw =
    Math.sin(time * 29 + phase * 1.3) * amplitude * 0.012 + state.yawKick;
  out.pitch =
    Math.sin(time * 41 + phase * 0.8) * amplitude * 0.01 + state.pitchKick;
  out.roll =
    Math.sin(time * 27 + phase * 2.1) * amplitude * 0.014 + state.rollKick;
  out.fov = state.fovKick;
  state.trauma = Math.max(0, state.trauma - safeDt * 1.7);
  return out;
}

export function dampAfterlightCameraFrame(
  current: MutableCameraFrame,
  desired: MutableCameraFrame,
  positionLambda: number,
  lookLambda: number,
  fovLambda: number,
  dt: number,
  snapPosition: boolean,
) {
  const positionAlpha = cameraDampingAlpha(positionLambda, dt);
  const lookAlpha = cameraDampingAlpha(lookLambda, dt);
  if (snapPosition) {
    current.position.x = desired.position.x;
    current.position.y = desired.position.y;
    current.position.z = desired.position.z;
  } else {
    current.position.x +=
      (desired.position.x - current.position.x) * positionAlpha;
    current.position.y +=
      (desired.position.y - current.position.y) * positionAlpha;
    current.position.z +=
      (desired.position.z - current.position.z) * positionAlpha;
  }
  current.lookAt.x += (desired.lookAt.x - current.lookAt.x) * lookAlpha;
  current.lookAt.y += (desired.lookAt.y - current.lookAt.y) * lookAlpha;
  current.lookAt.z += (desired.lookAt.z - current.lookAt.z) * lookAlpha;
  current.yaw = desired.yaw;
  current.pitch = desired.pitch;
  current.roll = dampCameraScalar(current.roll, desired.roll, 12, dt);
  current.fov = dampCameraScalar(current.fov, desired.fov, fovLambda, dt);
  current.boomDistance = desired.boomDistance;
  current.collisionConstrained = desired.collisionConstrained;
  return current;
}
