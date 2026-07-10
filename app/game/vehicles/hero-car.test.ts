import { describe, expect, it } from "vitest";

import {
  EMPTY_INPUT_FRAME,
  SIMULATION_DT,
  type InputFrame,
  type VehicleState,
} from "../core/contracts";
import {
  HERO_CAR_TARGET_SPEED,
  decomposeVehicleMotion,
  evaluateSafeExit,
  stepHeroCar,
  vehiclePlanarSpeed,
} from "./hero-car";

function vehicle(overrides: Partial<VehicleState> = {}): VehicleState {
  return {
    id: 10,
    kind: "hero",
    pose: { position: [0, 1.35, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "active",
    occupiedBy: 1,
    ...overrides,
  };
}

function input(overrides: Partial<InputFrame> = {}): InputFrame {
  return {
    ...EMPTY_INPUT_FRAME,
    move: [...EMPTY_INPUT_FRAME.move],
    look: [...EMPTY_INPUT_FRAME.look],
    ...overrides,
  };
}

describe("arcade hero car", () => {
  it("accelerates deterministically to the 26 m/s target without overshoot", () => {
    const initial = vehicle();
    const command = input({ throttle: 1 });
    let first = initial;
    let replay = initial;

    for (let tick = 0; tick < 240; tick += 1) {
      first = stepHeroCar(first, command);
      replay = stepHeroCar(replay, command);
      expect(vehiclePlanarSpeed(first)).toBeLessThanOrEqual(
        HERO_CAR_TARGET_SPEED,
      );
    }

    expect(first).toEqual(replay);
    expect(decomposeVehicleMotion(first).forwardSpeed).toBeCloseTo(26, 10);
    expect(initial.pose.position).toEqual([0, 1.35, 0]);
    expect(command.throttle).toBe(1);
  });

  it("brakes to rest and caps reverse at the lower arcade speed", () => {
    const moving = vehicle({ velocity: [0, 0, -20] });
    const stopped = stepHeroCar(moving, input({ brake: true }), 1);
    expect(vehiclePlanarSpeed(stopped)).toBe(0);

    let reversing = stopped;
    for (let tick = 0; tick < 120; tick += 1) {
      reversing = stepHeroCar(
        reversing,
        input({ throttle: -1 }),
        SIMULATION_DT,
      );
    }
    const motion = decomposeVehicleMotion(reversing);
    expect(motion.forwardSpeed).toBeCloseTo(-10, 10);
    expect(reversing.velocity[2]).toBeGreaterThan(0);
  });

  it("turns in the travel direction and removes lateral slip through traction", () => {
    const sliding = vehicle({ velocity: [8, 0, -15] });
    const initialLateralSpeed = decomposeVehicleMotion(sliding).lateralSpeed;
    const turned = stepHeroCar(sliding, input({ throttle: 1, steer: 1 }), 0.25);

    expect(turned.pose.rotationY).toBeLessThan(0);
    expect(Math.abs(decomposeVehicleMotion(turned).lateralSpeed)).toBeLessThan(
      Math.abs(initialLateralSpeed),
    );

    const reversing = stepHeroCar(
      vehicle({ velocity: [0, 0, 8] }),
      input({ throttle: -1, steer: 1 }),
      0.25,
    );
    expect(reversing.pose.rotationY).toBeGreaterThan(0);
  });

  it("coasts, preserves vertical state, and leaves disabled vehicles untouched", () => {
    const moving = vehicle({
      pose: { position: [2, 4, 8], rotationY: 0 },
      velocity: [0, -3, -10],
    });
    const coasted = stepHeroCar(moving, input(), 0.5);
    expect(decomposeVehicleMotion(coasted).forwardSpeed).toBeCloseTo(9.1);
    expect(coasted.pose.position[1]).toBe(4);
    expect(coasted.velocity[1]).toBe(-3);

    const disabled = vehicle({ life: "disabled", velocity: [0, 0, -12] });
    expect(stepHeroCar(disabled, input({ throttle: 1 }))).toBe(disabled);
  });

  it("sanitizes non-finite axes and rejects invalid time steps", () => {
    const result = stepHeroCar(
      vehicle(),
      input({ throttle: Number.NaN, steer: Number.POSITIVE_INFINITY }),
    );
    expect(result.velocity).toEqual([0, 0, 0]);
    expect(() => stepHeroCar(vehicle(), input(), 0)).toThrow(/dt/);
  });
});

describe("safe vehicle exit", () => {
  it("selects the preferred clear side and returns a world-space exit point", () => {
    const decision = evaluateSafeExit(
      vehicle({
        pose: { position: [10, 1.2, 20], rotationY: 0 },
        velocity: [0, 0, -0.5],
      }),
      {
        actorId: 1,
        grounded: true,
        clearance: { left: 0.4, right: 2 },
      },
    );

    expect(decision).toEqual({
      safe: true,
      side: "right",
      position: [12.4, 1.2, 20],
    });
  });

  it("falls back to the opposite side deterministically", () => {
    const decision = evaluateSafeExit(vehicle(), {
      actorId: 1,
      grounded: true,
      preferredSide: "right",
      clearance: { left: 2, right: 0 },
    });
    expect(decision).toMatchObject({ safe: true, side: "left" });
    if (decision.safe) expect(decision.position[0]).toBeCloseTo(-2.4);
  });

  it("supports a strict standstill exit threshold", () => {
    expect(
      evaluateSafeExit(vehicle(), {
        actorId: 1,
        grounded: true,
        clearance: { left: 2, right: 2 },
        maximumSpeed: 0,
      }).safe,
    ).toBe(true);
  });

  it.each([
    [
      "not-occupant",
      vehicle(),
      { actorId: 9, grounded: true, clearance: { left: 2, right: 2 } },
    ],
    [
      "vehicle-destroyed",
      vehicle({ life: "destroyed" }),
      { actorId: 1, grounded: true, clearance: { left: 2, right: 2 } },
    ],
    [
      "airborne",
      vehicle(),
      { actorId: 1, grounded: false, clearance: { left: 2, right: 2 } },
    ],
    [
      "moving",
      vehicle({ velocity: [0, 0, -2] }),
      { actorId: 1, grounded: true, clearance: { left: 2, right: 2 } },
    ],
    [
      "blocked",
      vehicle(),
      { actorId: 1, grounded: true, clearance: { left: 1, right: 1 } },
    ],
  ] as const)("rejects %s exits", (reason, state, request) => {
    expect(evaluateSafeExit(state, request)).toEqual({ safe: false, reason });
  });
});
