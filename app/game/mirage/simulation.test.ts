import { describe, expect, it } from "vitest";
import { isDriveable } from "./map";
import {
  EMPTY_INPUT,
  MISSION_TARGETS,
  advanceMirageRun,
  calculateScore,
  createMirageRunState,
  getCurrentTarget,
  getRank,
  getTrafficCount,
  getTrafficPose,
} from "./simulation";

function stepFor(
  seconds: number,
  input = EMPTY_INPUT,
  initial = createMirageRunState(),
) {
  let state = initial;
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    state = advanceMirageRun(state, input, 1 / 60);
  }
  return state;
}

describe("Mirage arcade simulation", () => {
  it("starts moving toward a visible package without throttle input", () => {
    const initial = createMirageRunState();
    const state = stepFor(1);
    expect(state.car.z).toBeLessThan(initial.car.z - 6);
    expect(getCurrentTarget(state).id).toBe("pickup");
  });

  it("turns left and right relative to the car", () => {
    const left = stepFor(0.5, { ...EMPTY_INPUT, steer: -1 });
    const right = stepFor(0.5, { ...EMPTY_INPUT, steer: 1 });
    expect(left.car.yaw).toBeLessThan(0);
    expect(right.car.yaw).toBeGreaterThan(0);
    expect(left.car.x).toBeLessThan(-72);
    expect(right.car.x).toBeGreaterThan(-72);
  });

  it("starts pursuit after collecting the package", () => {
    const initial = createMirageRunState();
    const atPickup = {
      ...initial,
      car: { ...initial.car, x: -72, z: 72 },
    };
    const state = stepFor(0.2, EMPTY_INPUT, atPickup);
    expect(state.routeIndex).toBe(1);
    expect(state.phase).toBe("checkpoints");
    expect(state.eventLabel).toContain("Two units");
  });

  it("can complete every gate and the finish deterministically", () => {
    let state = createMirageRunState();
    for (const target of MISSION_TARGETS) {
      state = {
        ...state,
        car: { ...state.car, speed: 0, x: target.x, z: target.z },
      };
      state = stepFor(
        target.type === "finish" ? 0.6 : 0.2,
        { ...EMPTY_INPUT, brake: true },
        state,
      );
    }
    expect(state.phase).toBe("complete");
    expect(state.finalScore).toBeGreaterThan(0);
    expect(state.eventLabel).toBe("Package delivered");
  });

  it("keeps all ambient traffic constrained to roads", () => {
    expect(getTrafficCount()).toBe(4);
    for (let index = 0; index < getTrafficCount(); index += 1) {
      for (const elapsed of [0, 17, 43, 91]) {
        expect(isDriveable(getTrafficPose(index, elapsed))).toBe(true);
      }
    }
  });

  it("rewards clean time and near misses while penalizing collisions", () => {
    const base = createMirageRunState();
    const clean = calculateScore({ ...base, elapsed: 30, nearMisses: 2 });
    const rough = calculateScore({ ...base, collisions: 4, elapsed: 45 });
    expect(clean).toBeGreaterThan(rough);
    expect(getRank(clean)).toMatch(/[SA]/);
  });

  it("never creates a hard timeout failure", () => {
    const state = stepFor(95, { ...EMPTY_INPUT, brake: true });
    expect(state.phase).not.toBe("complete");
    expect(state.score).toBeGreaterThan(0);
  });

  it("recovers an invalid car position onto the road", () => {
    const initial = createMirageRunState();
    const invalid = {
      ...initial,
      car: { ...initial.car, speed: 0, x: 18, z: 18 },
    };
    expect(isDriveable(invalid.car)).toBe(false);

    const recovered = stepFor(1.5, EMPTY_INPUT, invalid);
    expect(recovered.recoveries).toBe(1);
    expect(isDriveable(recovered.car)).toBe(true);
    expect(recovered.car.speed).toBeGreaterThan(0);
  });

  it("supports a lane-aware autonomous full mission", () => {
    let state = createMirageRunState();
    for (
      let frame = 0;
      frame < 60 * 100 && state.phase !== "complete";
      frame += 1
    ) {
      const target = getCurrentTarget(state);
      const desiredX = [2, 4].includes(state.routeIndex)
        ? Math.min(target.x, state.car.x + 14)
        : target.x;
      const desiredZ = [0, 1].includes(state.routeIndex)
        ? Math.max(target.z, state.car.z - 14)
        : state.routeIndex === 3
          ? Math.min(target.z, state.car.z + 14)
          : target.z;
      const targetYaw = Math.atan2(
        desiredX - state.car.x,
        -(desiredZ - state.car.z),
      );
      let angle = targetYaw - state.car.yaw;
      while (angle > Math.PI) angle -= Math.PI * 2;
      while (angle < -Math.PI) angle += Math.PI * 2;
      state = advanceMirageRun(
        state,
        {
          boost: Math.abs(angle) < 0.08,
          brake: Math.abs(angle) > 0.3,
          steer: Math.abs(angle) < 0.05 ? 0 : angle > 0 ? 1 : -1,
        },
        1 / 60,
      );
    }

    expect(state.phase).toBe("complete");
    expect(state.routeIndex).toBe(MISSION_TARGETS.length);
    expect(state.elapsed).toBeLessThan(90);
    expect(state.rampUsed).toBe(true);
    expect(state.collectedBoosts.filter(Boolean).length).toBeGreaterThanOrEqual(
      2,
    );
  });
});
