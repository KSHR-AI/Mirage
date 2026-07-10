import { describe, expect, it } from "vitest";

import type { ActorState, VehicleState } from "../core/contracts";
import {
  canEnterVehicle,
  canExitVehicle,
  evaluateVehicleEntry,
  evaluateVehicleExit,
  findSafeVehicleExit,
  VEHICLE_INTERACTION_LIMITS,
  type VehicleExitCandidate,
} from "./vehicle-interaction";

const actor: ActorState = {
  id: 1,
  kind: "player",
  faction: "player",
  pose: { position: [0, 0, 0], rotationY: 0 },
  velocity: [0, 0, 0],
  health: 100,
  life: "alive",
};

const vehicle: VehicleState = {
  id: 10,
  kind: "hero",
  pose: { position: [3, 0, 0], rotationY: 0 },
  velocity: [0, 0, 0],
  health: 100,
  life: "active",
};

const safeExit: VehicleExitCandidate = {
  position: [1, 0, 0],
  pathClear: true,
  spaceClear: true,
  hasGroundSupport: true,
  groundDistance: 0.2,
};

describe("vehicle entry", () => {
  it("allows an alive actor to enter a nearby empty stationary vehicle", () => {
    expect(evaluateVehicleEntry(actor, vehicle)).toEqual({
      allowed: true,
      reason: "allowed",
    });
    expect(canEnterVehicle(actor, vehicle)).toBe(true);
  });

  it("accepts exact distance, vertical, and speed limits", () => {
    const boundaryVehicle: VehicleState = {
      ...vehicle,
      pose: {
        ...vehicle.pose,
        position: [
          VEHICLE_INTERACTION_LIMITS.enterDistance,
          VEHICLE_INTERACTION_LIMITS.enterVerticalDistance,
          0,
        ],
      },
      velocity: [VEHICLE_INTERACTION_LIMITS.enterSpeed, 20, 0],
    };

    expect(canEnterVehicle(actor, boundaryVehicle)).toBe(true);
  });

  it.each([
    ["actor-not-alive", { ...actor, life: "dead" } as ActorState, vehicle, {}],
    ["actor-already-in-vehicle", actor, vehicle, { actorVehicleId: 99 }],
    [
      "vehicle-not-active",
      actor,
      { ...vehicle, life: "disabled" } as VehicleState,
      {},
    ],
    ["vehicle-occupied", actor, { ...vehicle, occupiedBy: 2 }, {}],
    [
      "invalid-motion",
      actor,
      { ...vehicle, velocity: [Number.NaN, 0, 0] } as VehicleState,
      {},
    ],
    [
      "vehicle-moving",
      actor,
      { ...vehicle, velocity: [1.51, 0, 0] } as VehicleState,
      {},
    ],
    [
      "invalid-position",
      {
        ...actor,
        pose: {
          ...actor.pose,
          position: [Number.NaN, 0, 0] as const,
        },
      },
      vehicle,
      {},
    ],
    [
      "vertical-gap",
      actor,
      {
        ...vehicle,
        pose: { ...vehicle.pose, position: [0, 1.76, 0] as const },
      },
      {},
    ],
    [
      "too-far",
      actor,
      {
        ...vehicle,
        pose: { ...vehicle.pose, position: [3.51, 0, 0] as const },
      },
      {},
    ],
  ])(
    "returns %s for unsafe entry",
    (reason, candidateActor, candidateVehicle, options) => {
      expect(
        evaluateVehicleEntry(candidateActor, candidateVehicle, options),
      ).toEqual({ allowed: false, reason });
    },
  );

  it("supports explicit interaction limits", () => {
    expect(
      canEnterVehicle(actor, vehicle, {
        maxDistance: 2,
        maxVehicleSpeed: 2,
        maxVerticalDistance: 2,
      }),
    ).toBe(false);
  });

  it("rejects malformed entry limits", () => {
    expect(() =>
      evaluateVehicleEntry(actor, vehicle, { maxDistance: Number.NaN }),
    ).toThrow("interaction limits");
    expect(() =>
      evaluateVehicleEntry(actor, vehicle, { maxVehicleSpeed: -1 }),
    ).toThrow("interaction limits");
  });
});

describe("vehicle exit", () => {
  const occupiedVehicle: VehicleState = { ...vehicle, occupiedBy: actor.id };

  it("allows a stationary occupant to use a clear supported exit", () => {
    expect(evaluateVehicleExit(actor, occupiedVehicle, safeExit)).toEqual({
      allowed: true,
      reason: "allowed",
    });
    expect(canExitVehicle(actor, occupiedVehicle, safeExit)).toBe(true);
  });

  it("allows safe exit from a disabled vehicle", () => {
    expect(
      canExitVehicle(actor, { ...occupiedVehicle, life: "disabled" }, safeExit),
    ).toBe(true);
  });

  it.each([
    [
      "actor-not-alive",
      { ...actor, life: "down" } as ActorState,
      occupiedVehicle,
      safeExit,
    ],
    ["actor-not-occupant", actor, vehicle, safeExit],
    [
      "invalid-motion",
      actor,
      {
        ...occupiedVehicle,
        velocity: [0, 0, Number.POSITIVE_INFINITY],
      } as VehicleState,
      safeExit,
    ],
    [
      "vehicle-moving",
      actor,
      { ...occupiedVehicle, velocity: [0, 0, 1.51] } as VehicleState,
      safeExit,
    ],
    [
      "invalid-position",
      actor,
      occupiedVehicle,
      { ...safeExit, groundDistance: -0.1 },
    ],
    ["path-blocked", actor, occupiedVehicle, { ...safeExit, pathClear: false }],
    [
      "space-blocked",
      actor,
      occupiedVehicle,
      { ...safeExit, spaceClear: false },
    ],
    [
      "unsupported",
      actor,
      occupiedVehicle,
      { ...safeExit, hasGroundSupport: false },
    ],
    [
      "drop-too-high",
      actor,
      occupiedVehicle,
      {
        ...safeExit,
        groundDistance: VEHICLE_INTERACTION_LIMITS.exitMaxDrop + 0.01,
      },
    ],
  ])(
    "returns %s for unsafe exit",
    (reason, candidateActor, candidateVehicle, exit) => {
      expect(
        evaluateVehicleExit(candidateActor, candidateVehicle, exit),
      ).toEqual({ allowed: false, reason });
    },
  );

  it("selects the first safe exit deterministically", () => {
    const blocked = { ...safeExit, pathClear: false };
    const secondSafe = { ...safeExit, position: [-1, 0, 0] as const };

    expect(
      findSafeVehicleExit(actor, occupiedVehicle, [
        blocked,
        secondSafe,
        safeExit,
      ]),
    ).toBe(secondSafe);
  });

  it("accepts the exact configured drop and speed boundaries", () => {
    expect(
      canExitVehicle(
        actor,
        {
          ...occupiedVehicle,
          velocity: [VEHICLE_INTERACTION_LIMITS.exitSpeed, 50, 0],
        },
        {
          ...safeExit,
          groundDistance: VEHICLE_INTERACTION_LIMITS.exitMaxDrop,
        },
      ),
    ).toBe(true);
  });

  it("rejects malformed exit limits", () => {
    expect(() =>
      evaluateVehicleExit(actor, occupiedVehicle, safeExit, {
        maxDrop: Number.NaN,
      }),
    ).toThrow("interaction limits");
    expect(() =>
      evaluateVehicleExit(actor, occupiedVehicle, safeExit, {
        maxVehicleSpeed: -1,
      }),
    ).toThrow("interaction limits");
  });
});
