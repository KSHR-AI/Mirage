import { describe, expect, it } from "vitest";

import {
  applyOpeningCameraAspect,
  applyControlledCameraOrientation,
  cameraDampingAlpha,
  consumeAfterlightCameraImpulses,
  dampCameraAngle,
  dampCameraScalar,
  normalizeCameraAngle,
  resolveAfterlightCameraProfile,
  resolveAfterlightTargetYaw,
  resolveCameraCollisionBoom,
  resolveVehicleCameraRoll,
  sampleAfterlightCameraShake,
  shortestCameraAngleDelta,
  solveAfterlightCameraFrame,
  stepAfterlightCameraControls,
  translateAfterlightCameraFrameWithTarget,
} from "./math";
import type {
  CameraControlState,
  CameraShakeState,
  MutableCameraFrame,
  MutableCameraProfile,
  MutableCameraShakeSample,
} from "./types";

function profile(): MutableCameraProfile {
  return {
    distance: 0,
    pivotHeight: 0,
    lookHeight: 0,
    lookAhead: 0,
    shoulder: 0,
    neutralPitch: 0,
    yawOffset: 0,
    fov: 0,
    positionLambda: 0,
    lookLambda: 0,
    rotationLambda: 0,
  };
}

function frame(): MutableCameraFrame {
  return {
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: 0,
    boomDistance: 0,
    collisionConstrained: false,
  };
}

function controls(): CameraControlState {
  return {
    initialized: false,
    mode: "on-foot",
    yaw: 0,
    pitch: 0,
    desiredYaw: 0,
    desiredPitch: 0,
    vehicleOrbitYaw: 0,
  };
}

function shake(): CameraShakeState {
  return {
    trauma: 0,
    time: 0,
    phase: 0,
    yawKick: 0,
    pitchKick: 0,
    rollKick: 0,
    fovKick: 0,
    lastSequence: -1,
  };
}

function shakeSample(): MutableCameraShakeSample {
  return {
    lateral: 0,
    vertical: 0,
    longitudinal: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    fov: 0,
  };
}

describe("camera damping and angles", () => {
  it("is render-rate independent for a static target", () => {
    const oneStep = dampCameraScalar(0, 10, 8, 1 / 30);
    const firstHalf = dampCameraScalar(0, 10, 8, 1 / 60);
    const twoSteps = dampCameraScalar(firstHalf, 10, 8, 1 / 60);
    expect(twoSteps).toBeCloseTo(oneStep, 12);
    expect(cameraDampingAlpha(8, 0)).toBe(0);
  });

  it("takes the short path across the angle seam", () => {
    const from = Math.PI - 0.05;
    const to = -Math.PI + 0.05;
    expect(shortestCameraAngleDelta(from, to)).toBeCloseTo(0.1);
    const result = dampCameraAngle(from, to, 12, 1 / 60);
    expect(shortestCameraAngleDelta(from, result)).toBeGreaterThan(0);
    expect(normalizeCameraAngle(Math.PI * 5)).toBeCloseTo(-Math.PI);
  });

  it("normalizes actor and negative-Z vehicle headings to camera yaw", () => {
    expect(resolveAfterlightTargetYaw("on-foot", 0)).toBe(0);
    expect(Math.abs(resolveAfterlightTargetYaw("vehicle", 0))).toBeCloseTo(
      Math.PI,
    );
    expect(resolveAfterlightTargetYaw("vehicle", Math.PI)).toBeCloseTo(0);
  });
});

describe("Afterlight camera profiles", () => {
  it("moves into an over-shoulder close aim frame", () => {
    const regular = profile();
    const aimed = profile();
    resolveAfterlightCameraProfile(regular, "on-foot", false, 0, false);
    resolveAfterlightCameraProfile(aimed, "on-foot", true, 0, false);
    expect(aimed.distance).toBeLessThan(regular.distance);
    expect(aimed.shoulder).toBeGreaterThan(regular.shoulder);
    expect(aimed.fov).toBeLessThan(regular.fov);
  });

  it("restrains vehicle speed FOV and reduces it for reduced motion", () => {
    const normal = profile();
    const reduced = profile();
    resolveAfterlightCameraProfile(normal, "vehicle", false, 100, false);
    resolveAfterlightCameraProfile(reduced, "vehicle", false, 100, true);
    expect(normal.fov).toBe(71);
    expect(normal.fov).toBeLessThanOrEqual(74);
    expect(reduced.fov).toBe(67);
    expect(normal.lookAhead).toBeGreaterThan(2.8);
  });

  it("provides distinct intro and debrief compositions", () => {
    const intro = profile();
    const debrief = profile();
    resolveAfterlightCameraProfile(intro, "intro", false, 0, false);
    resolveAfterlightCameraProfile(debrief, "debrief", false, 0, false);
    expect(intro.distance).toBeGreaterThan(debrief.distance);
    expect(intro.yawOffset).toBeLessThan(0);
    expect(debrief.yawOffset).toBeGreaterThan(0);
  });

  it("stages the opening between the title vista and shoulder camera", () => {
    const intro = profile();
    const opening = profile();
    const onFoot = profile();
    resolveAfterlightCameraProfile(intro, "intro", false, 0, false);
    resolveAfterlightCameraProfile(opening, "opening", false, 0, false);
    resolveAfterlightCameraProfile(onFoot, "on-foot", false, 0, false);

    expect(opening.distance).toBeLessThan(intro.distance);
    expect(opening.distance).toBeGreaterThan(onFoot.distance);
    expect(opening.pivotHeight).toBeLessThan(intro.pivotHeight);
    expect(opening.yawOffset).toBeLessThan(0);
  });

  it("widens only the opening frame for portrait viewports", () => {
    const landscape = profile();
    const portrait = profile();
    const regular = profile();
    resolveAfterlightCameraProfile(landscape, "opening", false, 0, false);
    resolveAfterlightCameraProfile(portrait, "opening", false, 0, false);
    resolveAfterlightCameraProfile(regular, "on-foot", false, 0, false);
    const regularDistance = regular.distance;

    applyOpeningCameraAspect(landscape, "opening", 16 / 9);
    applyOpeningCameraAspect(portrait, "opening", 390 / 844);
    applyOpeningCameraAspect(regular, "on-foot", 390 / 844);

    expect(portrait.distance).toBeGreaterThan(landscape.distance + 5);
    expect(portrait.fov).toBeGreaterThan(landscape.fov);
    expect(regular.distance).toBe(regularDistance);
  });
});

describe("vehicle camera load", () => {
  it("banks with cornering speed and stays level for accessibility", () => {
    expect(resolveVehicleCameraRoll(1, 0, false)).toBe(0);
    expect(resolveVehicleCameraRoll(1, 18, false)).toBeCloseTo(-0.032);
    expect(resolveVehicleCameraRoll(-1, 18, false)).toBeCloseTo(0.032);
    expect(resolveVehicleCameraRoll(1, 100, true)).toBe(0);
    expect(resolveVehicleCameraRoll(Number.NaN, Number.NaN, false)).toBe(0);
  });
});

describe("camera controls", () => {
  it("locks rendered orientation to the deterministic gameplay camera", () => {
    const state = controls();
    state.yaw = -1.4;
    state.desiredYaw = 2.2;
    state.pitch = -0.2;
    state.desiredPitch = 0.3;

    applyControlledCameraOrientation(state, {
      yaw: Math.PI * 2 + 0.65,
      pitch: 0.18,
    });

    expect(state.yaw).toBeCloseTo(0.65);
    expect(state.desiredYaw).toBeCloseTo(0.65);
    expect(state.pitch).toBeCloseTo(0.18);
    expect(state.desiredPitch).toBeCloseTo(0.18);
  });

  it("clamps on-foot pitch and normalizes yaw", () => {
    const state = controls();
    for (let index = 0; index < 240; index += 1) {
      stepAfterlightCameraControls(state, {
        mode: "on-foot",
        targetYaw: 0,
        lookX: 1,
        lookY: -1,
        lookMode: "axis",
        speed: 0,
        aim: false,
        reducedMotion: false,
        cinematicTime: 0,
        dt: 1 / 60,
      });
    }
    expect(state.desiredPitch).toBe(0.52);
    expect(state.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(state.yaw).toBeLessThan(Math.PI);
  });

  it("clamps vehicle orbit and recenters it while moving", () => {
    const state = controls();
    for (let index = 0; index < 300; index += 1) {
      stepAfterlightCameraControls(state, {
        mode: "vehicle",
        targetYaw: 0,
        lookX: -100,
        lookY: 0,
        lookMode: "delta",
        speed: 26,
        aim: false,
        reducedMotion: false,
        cinematicTime: 0,
        dt: 1 / 60,
      });
    }
    expect(state.vehicleOrbitYaw).toBeCloseTo(Math.PI * 0.82);
    const before = state.vehicleOrbitYaw;
    stepAfterlightCameraControls(state, {
      mode: "vehicle",
      targetYaw: 0,
      lookX: 0,
      lookY: 0,
      lookMode: "axis",
      speed: 26,
      aim: false,
      reducedMotion: false,
      cinematicTime: 1,
      dt: 1 / 30,
    });
    expect(state.vehicleOrbitYaw).toBeLessThan(before);
  });

  it("ignores look during scripted framing and removes drift for reduced motion", () => {
    const normal = controls();
    const reduced = controls();
    stepAfterlightCameraControls(normal, {
      mode: "intro",
      targetYaw: 0.4,
      lookX: 1,
      lookY: 1,
      lookMode: "axis",
      speed: 0,
      aim: false,
      reducedMotion: false,
      cinematicTime: 8,
      dt: 1 / 60,
    });
    stepAfterlightCameraControls(reduced, {
      mode: "intro",
      targetYaw: 0.4,
      lookX: 1,
      lookY: 1,
      lookMode: "axis",
      speed: 0,
      aim: false,
      reducedMotion: true,
      cinematicTime: 8,
      dt: 1 / 60,
    });
    expect(reduced.desiredYaw).toBeCloseTo(0.4 - 1.45);
    expect(normal.desiredYaw).not.toBeCloseTo(reduced.desiredYaw);
  });
});

describe("camera collision and frame solving", () => {
  it("contracts before an obstacle and never extends past the desired boom", () => {
    expect(resolveCameraCollisionBoom(8, 3)).toBeCloseTo(2.76);
    expect(resolveCameraCollisionBoom(8, 40)).toBe(8);
    expect(resolveCameraCollisionBoom(8, null)).toBe(8);
    expect(resolveCameraCollisionBoom(8, Number.NaN)).toBe(8);
    expect(resolveCameraCollisionBoom(8, 0.1)).toBeCloseTo(0.18);
  });

  it("places yaw-zero framing behind the target with a right shoulder", () => {
    const output = frame();
    const returned = solveAfterlightCameraFrame(output, {
      targetX: 10,
      targetY: 2,
      targetZ: -4,
      yaw: 0,
      pitch: 0,
      boomDistance: 5,
      pivotHeight: 1.5,
      lookHeight: 1.2,
      lookAhead: 2,
      shoulder: 0.5,
      fov: 60,
      roll: 0,
    });
    expect(returned).toBe(output);
    expect(output.position).toEqual({ x: 10.5, y: 3.5, z: -9 });
    expect(output.lookAt).toEqual({ x: 10, y: 3.2, z: -2 });
  });

  it("scales shoulder offset inward when collision forces a close boom", () => {
    const output = frame();
    solveAfterlightCameraFrame(output, {
      targetX: 0,
      targetY: 0,
      targetZ: 0,
      yaw: 0,
      pitch: 0,
      boomDistance: 0.6,
      pivotHeight: 1,
      lookHeight: 1,
      lookAhead: 0,
      shoulder: 0.8,
      fov: 60,
      roll: 0,
    });
    expect(output.position.x).toBeCloseTo(0.2);
    expect(output.position.z).toBeCloseTo(-0.6);
  });

  it("carries the camera and focus point with planar target movement", () => {
    const output = frame();
    Object.assign(output.position, { x: 8, y: 5, z: -3 });
    Object.assign(output.lookAt, { x: 10, y: 2, z: 4 });

    const returned = translateAfterlightCameraFrameWithTarget(output, 2.5, -6);

    expect(returned).toBe(output);
    expect(output.position).toEqual({ x: 10.5, y: 5, z: -9 });
    expect(output.lookAt).toEqual({ x: 12.5, y: 2, z: -2 });
  });
});

describe("camera impulses", () => {
  it("consumes monotonic impulses once", () => {
    const state = shake();
    const impulses = [
      { sequence: 1, strength: 0.5, kind: "impact" as const },
      { sequence: 2, strength: 0.75, kind: "explosion" as const },
    ];
    consumeAfterlightCameraImpulses(state, impulses, false);
    const trauma = state.trauma;
    consumeAfterlightCameraImpulses(state, impulses, false);
    expect(state.trauma).toBe(trauma);
    expect(state.lastSequence).toBe(2);
  });

  it("replaces oscillatory shake with a restrained FOV pulse", () => {
    const state = shake();
    const sample = shakeSample();
    consumeAfterlightCameraImpulses(
      state,
      [{ sequence: 4, strength: 1, kind: "explosion" }],
      true,
    );
    sampleAfterlightCameraShake(sample, state, 1 / 60, true);
    expect(state.trauma).toBe(0);
    expect(sample.lateral).toBe(0);
    expect(sample.vertical).toBe(0);
    expect(sample.yaw).toBe(0);
    expect(sample.fov).toBeLessThan(0);
    expect(sample.fov).toBeGreaterThan(-0.45);
  });

  it("produces bounded deterministic shake without allocating its output", () => {
    const state = shake();
    const sample = shakeSample();
    consumeAfterlightCameraImpulses(
      state,
      [
        {
          sequence: 8,
          strength: 0.8,
          kind: "impact",
          direction: [1, -0.5],
        },
      ],
      false,
    );
    const returned = sampleAfterlightCameraShake(sample, state, 1 / 60, false);
    expect(returned).toBe(sample);
    expect(Math.abs(sample.lateral)).toBeLessThan(0.1);
    expect(Math.abs(sample.roll)).toBeLessThan(0.03);
    expect(state.trauma).toBeGreaterThan(0);
  });
});
