import { describe, expect, it } from "vitest";

import { EMPTY_INPUT_FRAME } from "../core/contracts";
import {
  INITIAL_LOCOMOTION_STATE,
  LOCOMOTION_TUNING,
  stepGroundedLocomotion,
} from "./locomotion";

describe("grounded third-person locomotion", () => {
  it("returns a stable idle intent", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      EMPTY_INPUT_FRAME,
      { grounded: true, cameraYaw: 0 },
    );

    expect(result).toEqual({
      state: { grounded: true, sprinting: false, jumping: false },
      intent: {
        moveDirection: [0, 0, 0],
        moveMagnitude: 0,
        horizontalVelocity: [0, 0, 0],
        jumpVelocity: 0,
      },
    });
  });

  it("rotates forward input by the third-person camera yaw", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [0, 1] },
      { grounded: true, cameraYaw: Math.PI / 2 },
    );

    expect(result.intent.moveDirection[0]).toBeCloseTo(1);
    expect(result.intent.moveDirection[2]).toBeCloseTo(0);
    expect(result.intent.horizontalVelocity[0]).toBeCloseTo(
      LOCOMOTION_TUNING.walkSpeed,
    );
    expect(result.intent.facingRotationY).toBeCloseTo(Math.PI / 2);
  });

  it("maps positive lateral input to the camera's screen-right", () => {
    const cameraYaw = 0.73;
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [1, 0] },
      { grounded: true, cameraYaw },
    );
    const screenRight = [-Math.cos(cameraYaw), Math.sin(cameraYaw)] as const;
    const cameraForward = [Math.sin(cameraYaw), Math.cos(cameraYaw)] as const;
    const [moveX, , moveZ] = result.intent.moveDirection;

    expect(moveX * screenRight[0] + moveZ * screenRight[1]).toBeCloseTo(1);
    expect(moveX * cameraForward[0] + moveZ * cameraForward[1]).toBeCloseTo(0);
  });

  it("normalizes diagonal movement and clamps analog magnitude", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [1, 1], sprint: true },
      { grounded: true, cameraYaw: 0 },
    );

    expect(result.state.sprinting).toBe(true);
    expect(result.intent.moveMagnitude).toBe(1);
    expect(Math.hypot(...result.intent.moveDirection)).toBeCloseTo(1);
    expect(Math.hypot(...result.intent.horizontalVelocity)).toBeCloseTo(
      LOCOMOTION_TUNING.sprintSpeed,
    );
  });

  it("clamps oversized input axes before vector normalization", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [Number.MAX_VALUE, Number.MAX_VALUE] },
      { grounded: true, cameraYaw: 0 },
    );

    expect(result.intent.moveMagnitude).toBe(1);
    expect(result.intent.moveDirection.every(Number.isFinite)).toBe(true);
    expect(Math.hypot(...result.intent.moveDirection)).toBeCloseTo(1);
  });

  it("preserves analog walk magnitude outside the deadzone", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [0.5, 0] },
      { grounded: true, cameraYaw: 0 },
    );

    expect(result.intent.moveMagnitude).toBe(0.5);
    expect(result.intent.horizontalVelocity).toEqual([
      -LOCOMOTION_TUNING.walkSpeed * 0.5,
      0,
      0,
    ]);
  });

  it("rejects sprint while aiming, airborne, or stationary", () => {
    const aiming = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [0, 1], sprint: true, aim: true },
      { grounded: true, cameraYaw: 0 },
    );
    const airborne = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, move: [0, 1], sprint: true },
      { grounded: false, cameraYaw: 0 },
    );
    const stationary = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, sprint: true },
      { grounded: true, cameraYaw: 0 },
    );

    expect(aiming.state.sprinting).toBe(false);
    expect(airborne.state.sprinting).toBe(false);
    expect(stationary.state.sprinting).toBe(false);
  });

  it("starts a jump only from ground and latches it until landing", () => {
    const started = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      { ...EMPTY_INPUT_FRAME, jumpPressed: true },
      { grounded: true, cameraYaw: 0 },
    );
    expect(started.state).toEqual({
      grounded: false,
      sprinting: false,
      jumping: true,
    });
    expect(started.intent.jumpVelocity).toBe(LOCOMOTION_TUNING.jumpVelocity);

    const airborne = stepGroundedLocomotion(
      started.state,
      { ...EMPTY_INPUT_FRAME, jumpPressed: true },
      { grounded: false, cameraYaw: 0 },
    );
    expect(airborne.state.jumping).toBe(true);
    expect(airborne.intent.jumpVelocity).toBe(0);

    const landed = stepGroundedLocomotion(airborne.state, EMPTY_INPUT_FRAME, {
      grounded: true,
      cameraYaw: 0,
    });
    expect(landed.state).toEqual({
      grounded: true,
      sprinting: false,
      jumping: false,
    });
  });

  it("distinguishes walking off an edge from jumping", () => {
    const result = stepGroundedLocomotion(
      INITIAL_LOCOMOTION_STATE,
      EMPTY_INPUT_FRAME,
      { grounded: false, cameraYaw: 0 },
    );

    expect(result.state).toEqual({
      grounded: false,
      sprinting: false,
      jumping: false,
    });
  });

  it("filters deadzone and non-finite movement without mutating input", () => {
    const input = Object.freeze({
      ...EMPTY_INPUT_FRAME,
      move: Object.freeze([Number.NaN, 0.05] as const),
    });
    const result = stepGroundedLocomotion(INITIAL_LOCOMOTION_STATE, input, {
      grounded: true,
      cameraYaw: 0,
    });

    expect(result.intent.moveMagnitude).toBe(0);
    expect(input.move[1]).toBe(0.05);
  });

  it("rejects a non-finite camera orientation", () => {
    expect(() =>
      stepGroundedLocomotion(INITIAL_LOCOMOTION_STATE, EMPTY_INPUT_FRAME, {
        grounded: true,
        cameraYaw: Number.NaN,
      }),
    ).toThrow("cameraYaw must be finite");
  });
});
