import { describe, expect, it } from "vitest";

import type { VehicleState } from "../core/contracts";
import {
  COURIER_DISABLE_IMPULSE,
  applyVehicleCollisionImpulse,
  collisionDamageFromImpulse,
} from "./collision-damage";

function vehicle(overrides: Partial<VehicleState> = {}): VehicleState {
  return {
    id: 20,
    kind: "hero",
    pose: { position: [0, 0, 0], rotationY: 0 },
    velocity: [0, 0, 0],
    health: 100,
    life: "active",
    ...overrides,
  };
}

describe("collision impulse damage", () => {
  it("ignores contact below the damage impulse threshold", () => {
    const initial = vehicle();
    const result = applyVehicleCollisionImpulse(initial, {
      impulse: 4,
      tick: 10,
    });
    expect(result).toEqual({
      vehicle: initial,
      damage: 0,
      disabled: false,
      events: [],
    });
  });

  it("converts excess impulse into bounded damage and core events", () => {
    const initial = vehicle();
    const result = applyVehicleCollisionImpulse(initial, {
      impulse: 10,
      tick: 12,
      sourceId: 99,
    });

    expect(result.damage).toBe(9);
    expect(result.vehicle.health).toBe(91);
    expect(result.events).toEqual([
      {
        type: "vehicle-damaged",
        tick: 12,
        vehicleId: 20,
        amount: 9,
        sourceId: 99,
      },
    ]);
    expect(collisionDamageFromImpulse(100)).toBe(50);
    expect(initial.health).toBe(100);
  });

  it("disables a courier at either the health or hard-ram threshold", () => {
    const healthDisabled = applyVehicleCollisionImpulse(
      vehicle({ kind: "courier", health: 50 }),
      { impulse: 11, tick: 20 },
    );
    expect(healthDisabled.vehicle.health).toBe(39.5);
    expect(healthDisabled.vehicle.life).toBe("disabled");
    expect(healthDisabled.events.at(-1)?.type).toBe("vehicle-disabled");

    const ramDisabled = applyVehicleCollisionImpulse(
      vehicle({ kind: "courier" }),
      { impulse: COURIER_DISABLE_IMPULSE, tick: 21 },
    );
    expect(ramDisabled.vehicle.health).toBeGreaterThan(40);
    expect(ramDisabled.disabled).toBe(true);
  });

  it("requires ordinary vehicles to reach zero health before disabling", () => {
    const damaged = applyVehicleCollisionImpulse(
      vehicle({ kind: "traffic", health: 10 }),
      { impulse: 10, tick: 1 },
    );
    expect(damaged.vehicle).toMatchObject({ health: 1, life: "active" });

    const disabled = applyVehicleCollisionImpulse(damaged.vehicle, {
      impulse: 10,
      tick: 2,
    });
    expect(disabled.vehicle).toMatchObject({ health: 0, life: "disabled" });
    expect(disabled.events.map(({ type }) => type)).toEqual([
      "vehicle-damaged",
      "vehicle-disabled",
    ]);
  });

  it("does not repeatedly damage disabled vehicles and validates magnitudes", () => {
    const disabled = vehicle({ life: "disabled", health: 30 });
    expect(
      applyVehicleCollisionImpulse(disabled, { impulse: 50, tick: 1 }),
    ).toEqual({ vehicle: disabled, damage: 0, disabled: false, events: [] });
    expect(() => collisionDamageFromImpulse(-1)).toThrow(/impulse/);
    expect(() => collisionDamageFromImpulse(Number.NaN)).toThrow(/impulse/);
  });
});
