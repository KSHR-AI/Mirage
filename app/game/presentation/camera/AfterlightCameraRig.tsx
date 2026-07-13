"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  PerspectiveCamera,
  Raycaster,
  Vector3,
  type Intersection,
  type Object3D,
} from "three";

import {
  collectCameraCollisionRoots,
  nearestCameraCollisionDistance,
  probeCameraCollisionDistance,
} from "./collision";

import {
  applyOpeningCameraAspect,
  applyControlledCameraOrientation,
  consumeAfterlightCameraImpulses,
  dampAfterlightCameraFrame,
  dampCameraScalar,
  resolveAfterlightCameraProfile,
  resolveAfterlightTargetYaw,
  resolveCameraCollisionBoom,
  resolveVehicleCameraRoll,
  sampleAfterlightCameraShake,
  solveAfterlightCameraFrame,
  stepAfterlightCameraControls,
} from "./math";
import type {
  AfterlightCameraRigProps,
  CameraControlState,
  CameraControlStep,
  CameraFrameRequest,
  CameraShakeState,
  MutableCameraFrame,
  MutableCameraProfile,
  MutableCameraShakeSample,
} from "./types";

const EMPTY_LOOK = [0, 0] as const;
const EMPTY_IMPULSES = Object.freeze([]);
const MAX_FRAME_DELTA = 0.05;
const TARGET_TELEPORT_DISTANCE_SQUARED = 24 * 24;

interface CameraRigRuntime {
  readonly controls: CameraControlState;
  readonly controlStep: CameraControlStep;
  readonly profile: MutableCameraProfile;
  readonly request: CameraFrameRequest;
  readonly desired: MutableCameraFrame;
  readonly current: MutableCameraFrame;
  readonly shake: CameraShakeState;
  readonly shakeSample: MutableCameraShakeSample;
  readonly lookAt: Vector3;
  readonly collisionOrigin: Vector3;
  readonly collisionTarget: Vector3;
  readonly collisionDirection: Vector3;
  readonly collisionRoots: Object3D[];
  readonly collisionHits: Intersection<Object3D>[];
  readonly raycaster: Raycaster;
  initialized: boolean;
  boomDistance: number;
  cinematicTime: number;
  lastTargetX: number;
  lastTargetY: number;
  lastTargetZ: number;
}

function createFrame(): MutableCameraFrame {
  return {
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: 60,
    boomDistance: 5,
    collisionConstrained: false,
  };
}

function createRuntime(): CameraRigRuntime {
  return {
    controls: {
      initialized: false,
      mode: "on-foot",
      yaw: 0,
      pitch: 0.12,
      desiredYaw: 0,
      desiredPitch: 0.12,
      vehicleOrbitYaw: 0,
    },
    controlStep: {
      mode: "on-foot",
      targetYaw: 0,
      lookX: 0,
      lookY: 0,
      lookMode: "axis",
      speed: 0,
      aim: false,
      reducedMotion: false,
      cinematicTime: 0,
      dt: 0,
    },
    profile: {
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
    },
    request: {
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      yaw: 0,
      pitch: 0,
      boomDistance: 5.6,
      pivotHeight: 1.45,
      lookHeight: 1.22,
      lookAhead: 0.35,
      shoulder: 0.38,
      fov: 61,
      roll: 0,
    },
    desired: createFrame(),
    current: createFrame(),
    shake: {
      trauma: 0,
      time: 0,
      phase: 0.37,
      yawKick: 0,
      pitchKick: 0,
      rollKick: 0,
      fovKick: 0,
      lastSequence: -1,
    },
    shakeSample: {
      lateral: 0,
      vertical: 0,
      longitudinal: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      fov: 0,
    },
    lookAt: new Vector3(),
    collisionOrigin: new Vector3(),
    collisionTarget: new Vector3(),
    collisionDirection: new Vector3(),
    collisionRoots: [],
    collisionHits: [],
    raycaster: new Raycaster(),
    initialized: false,
    boomDistance: 5.6,
    cinematicTime: 0,
    lastTargetX: 0,
    lastTargetY: 0,
    lastTargetZ: 0,
  };
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function AfterlightCameraRig({
  aim = false,
  collisionDistance = null,
  controlledOrientation,
  enabled = true,
  impulses = EMPTY_IMPULSES,
  look = EMPTY_LOOK,
  lookMode = "axis",
  mode,
  orientationRef,
  paused = false,
  reducedMotion = false,
  speed = 0,
  steering = 0,
  targetPose,
}: AfterlightCameraRigProps) {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const aspect = useThree((state) => state.size.width / state.size.height);
  const cameraRef = useRef(camera);
  const runtimeRef = useRef<CameraRigRuntime | null>(null);

  useLayoutEffect(() => {
    cameraRef.current = camera;
    runtimeRef.current ??= createRuntime();
  }, [camera]);

  useLayoutEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime && !paused) {
      consumeAfterlightCameraImpulses(runtime.shake, impulses, reducedMotion);
    }
  }, [impulses, paused, reducedMotion]);

  useFrame((_, rawDelta) => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    if (!enabled || paused) return;
    const activeCamera = cameraRef.current;
    const dt = Math.min(Math.max(finiteOr(rawDelta, 0), 0), MAX_FRAME_DELTA);
    const targetX = finiteOr(targetPose.position[0], runtime.lastTargetX);
    const targetY = finiteOr(targetPose.position[1], runtime.lastTargetY);
    const targetZ = finiteOr(targetPose.position[2], runtime.lastTargetZ);
    const targetYaw = Number.isFinite(targetPose.rotationY)
      ? resolveAfterlightTargetYaw(mode, targetPose.rotationY)
      : runtime.controls.yaw;
    if (runtime.controls.mode !== mode) runtime.cinematicTime = 0;
    runtime.cinematicTime += dt;

    resolveAfterlightCameraProfile(
      runtime.profile,
      mode,
      aim,
      speed,
      reducedMotion,
    );
    applyOpeningCameraAspect(runtime.profile, mode, aspect);
    const controlStep = runtime.controlStep;
    controlStep.mode = mode;
    controlStep.targetYaw = targetYaw;
    const controlledOnFoot = mode === "on-foot" && controlledOrientation;
    controlStep.lookX = controlledOnFoot ? 0 : look[0];
    controlStep.lookY = controlledOnFoot ? 0 : look[1];
    controlStep.lookMode = lookMode;
    controlStep.speed = speed;
    controlStep.aim = aim;
    controlStep.reducedMotion = reducedMotion;
    controlStep.cinematicTime = runtime.cinematicTime;
    controlStep.dt = dt;
    stepAfterlightCameraControls(runtime.controls, controlStep);
    if (controlledOnFoot) {
      applyControlledCameraOrientation(runtime.controls, controlledOrientation);
    }

    const request = runtime.request;
    request.targetX = targetX;
    request.targetY = targetY;
    request.targetZ = targetZ;
    request.yaw = runtime.controls.yaw;
    request.pitch = runtime.controls.pitch;
    request.boomDistance = runtime.profile.distance;
    request.pivotHeight = runtime.profile.pivotHeight;
    request.lookHeight = runtime.profile.lookHeight;
    request.lookAhead = runtime.profile.lookAhead;
    request.shoulder = runtime.profile.shoulder;
    request.fov = runtime.profile.fov;
    request.roll =
      mode === "vehicle"
        ? resolveVehicleCameraRoll(steering, speed, reducedMotion)
        : 0;
    solveAfterlightCameraFrame(runtime.desired, request);

    collectCameraCollisionRoots(scene, runtime.collisionRoots);
    runtime.collisionOrigin.set(
      targetX,
      targetY + runtime.profile.pivotHeight,
      targetZ,
    );
    runtime.collisionTarget.set(
      runtime.desired.position.x,
      runtime.desired.position.y,
      runtime.desired.position.z,
    );
    const sceneCollisionDistance =
      mode === "opening"
        ? null
        : probeCameraCollisionDistance(
            runtime.raycaster,
            runtime.collisionOrigin,
            runtime.collisionTarget,
            runtime.collisionRoots,
            runtime.collisionDirection,
            runtime.collisionHits,
          );
    const effectiveCollisionDistance = nearestCameraCollisionDistance(
      collisionDistance,
      sceneCollisionDistance,
    );
    const safeBoom = resolveCameraCollisionBoom(
      runtime.profile.distance,
      effectiveCollisionDistance,
    );
    const collisionConstrained = safeBoom < runtime.profile.distance - 0.001;
    const currentCollisionLimit = resolveCameraCollisionBoom(
      Math.max(runtime.profile.distance, runtime.boomDistance),
      effectiveCollisionDistance,
    );
    const collisionContracted =
      effectiveCollisionDistance != null &&
      Number.isFinite(effectiveCollisionDistance) &&
      currentCollisionLimit < runtime.boomDistance - 0.001;
    runtime.boomDistance =
      !runtime.initialized || collisionContracted
        ? safeBoom
        : dampCameraScalar(
            runtime.boomDistance,
            safeBoom,
            safeBoom < runtime.boomDistance ? 22 : 5.5,
            dt,
          );

    request.boomDistance = runtime.boomDistance;
    solveAfterlightCameraFrame(runtime.desired, request);
    runtime.desired.collisionConstrained = collisionConstrained;

    const targetDx = targetX - runtime.lastTargetX;
    const targetDy = targetY - runtime.lastTargetY;
    const targetDz = targetZ - runtime.lastTargetZ;
    const targetTeleported =
      targetDx * targetDx + targetDy * targetDy + targetDz * targetDz >
      TARGET_TELEPORT_DISTANCE_SQUARED;
    const snapPosition =
      !runtime.initialized || collisionContracted || targetTeleported;
    if (!runtime.initialized) {
      runtime.current.lookAt.x = runtime.desired.lookAt.x;
      runtime.current.lookAt.y = runtime.desired.lookAt.y;
      runtime.current.lookAt.z = runtime.desired.lookAt.z;
      runtime.current.fov = runtime.desired.fov;
      runtime.initialized = true;
    }
    dampAfterlightCameraFrame(
      runtime.current,
      runtime.desired,
      runtime.profile.positionLambda,
      runtime.profile.lookLambda,
      reducedMotion ? 10 : 6.5,
      dt,
      snapPosition,
    );
    sampleAfterlightCameraShake(
      runtime.shakeSample,
      runtime.shake,
      dt,
      reducedMotion,
    );

    const yaw = runtime.current.yaw;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const shake = runtime.shakeSample;
    activeCamera.position.set(
      runtime.current.position.x +
        rightX * shake.lateral +
        forwardX * shake.longitudinal,
      runtime.current.position.y + shake.vertical,
      runtime.current.position.z +
        rightZ * shake.lateral +
        forwardZ * shake.longitudinal,
    );
    runtime.lookAt.set(
      runtime.current.lookAt.x,
      runtime.current.lookAt.y,
      runtime.current.lookAt.z,
    );
    activeCamera.lookAt(runtime.lookAt);
    activeCamera.rotateX(shake.pitch);
    activeCamera.rotateY(shake.yaw);
    activeCamera.rotateZ(runtime.current.roll + shake.roll);

    if (activeCamera instanceof PerspectiveCamera) {
      const nextFov = runtime.current.fov + shake.fov;
      if (Math.abs(activeCamera.fov - nextFov) > 0.001) {
        activeCamera.fov = nextFov;
        activeCamera.updateProjectionMatrix();
      }
    }

    if (orientationRef) {
      orientationRef.current.yaw = runtime.controls.yaw;
      orientationRef.current.pitch = runtime.controls.pitch;
    }
    runtime.lastTargetX = targetX;
    runtime.lastTargetY = targetY;
    runtime.lastTargetZ = targetZ;
  });

  return null;
}
