import { describe, expect, it } from "vitest";

import { isDriveable } from "./map";
import {
  EMPTY_INPUT,
  MISSION_TARGETS,
  ROUTE_LENGTH,
  advanceMirageRun,
  calculateScore,
  createMirageRunState,
  getCurrentTarget,
  getRank,
  getRoutePose,
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

describe("Mirage guided chase simulation", () => {
  it("moves down the route without throttle or navigation input", () => {
    const initial = createMirageRunState();
    const state = stepFor(1);

    expect(state.car.routeDistance).toBeGreaterThan(8);
    expect(state.car.z).toBeLessThan(initial.car.z - 8);
    expect(state.car.laneOffset).toBe(0);
    expect(isDriveable(state.car)).toBe(true);
    expect(getCurrentTarget(state).id).toBe("pickup");
  });

  it("uses left and right input to change lanes", () => {
    const left = stepFor(0.5, { ...EMPTY_INPUT, steer: -1 });
    const right = stepFor(0.5, { ...EMPTY_INPUT, steer: 1 });

    expect(left.car.laneOffset).toBeLessThan(-3);
    expect(right.car.laneOffset).toBeGreaterThan(3);
    expect(left.car.x).toBeLessThan(-72);
    expect(right.car.x).toBeGreaterThan(-72);
    expect(left.car.routeDistance).toBeCloseTo(right.car.routeDistance, 3);
  });

  it("holds its lane when steering is released", () => {
    const changedLane = stepFor(0.45, { ...EMPTY_INPUT, steer: 1 });
    const released = stepFor(1, EMPTY_INPUT, changedLane);

    expect(released.car.laneOffset).toBeCloseTo(changedLane.car.laneOffset, 3);
    expect(released.car.routeDistance).toBeGreaterThan(
      changedLane.car.routeDistance + 9,
    );
  });

  it("clamps lane changes to the road envelope", () => {
    const rightEdge = stepFor(1, { ...EMPTY_INPUT, steer: 1 });
    const leftEdge = stepFor(1.4, { ...EMPTY_INPUT, steer: -1 }, rightEdge);

    expect(rightEdge.car.laneOffset).toBe(4);
    expect(leftEdge.car.laneOffset).toBe(-4);
    expect(isDriveable(rightEdge.car)).toBe(true);
    expect(isDriveable(leftEdge.car)).toBe(true);
  });

  it("makes boost and brake immediately legible", () => {
    const boosted = stepFor(1, { ...EMPTY_INPUT, boost: true });
    const braked = stepFor(1, { ...EMPTY_INPUT, brake: true });

    expect(boosted.car.speed).toBeGreaterThan(15);
    expect(braked.car.speed).toBeLessThan(7);
    expect(boosted.car.routeDistance).toBeGreaterThan(
      braked.car.routeDistance + 5,
    );
  });

  it("starts pursuit after automatically collecting the package", () => {
    const state = stepFor(4);

    expect(state.routeIndex).toBeGreaterThanOrEqual(1);
    expect(state.phase).toBe("checkpoints");
    expect(state.heat).toBeGreaterThan(0);
  });

  it("completes the whole mission with no navigation input", () => {
    const state = stepFor(45);

    expect(state.phase).toBe("complete");
    expect(state.routeIndex).toBe(MISSION_TARGETS.length);
    expect(state.car.routeDistance).toBe(ROUTE_LENGTH);
    expect(state.elapsed).toBeLessThan(35);
    expect(state.rampUsed).toBe(true);
    expect(state.finalScore).toBeGreaterThan(0);
  });

  it("keeps every route and traffic sample on a street", () => {
    expect(getTrafficCount()).toBe(5);
    for (let distance = 0; distance <= ROUTE_LENGTH; distance += 4) {
      for (const laneOffset of [-4, 0, 4]) {
        expect(isDriveable(getRoutePose(distance, laneOffset))).toBe(true);
      }
    }
    for (let index = 0; index < getTrafficCount(); index += 1) {
      for (const elapsed of [0, 17, 43, 91]) {
        expect(isDriveable(getTrafficPose(index, elapsed))).toBe(true);
      }
    }
  });

  it("bumps the player into a safe lane instead of pinning the car", () => {
    const initial = createMirageRunState();
    const traffic = getTrafficPose(0, initial.elapsed);
    const overlapping = {
      ...initial,
      car: {
        ...initial.car,
        ...getRoutePose(traffic.routeDistance, traffic.laneOffset),
      },
    };
    const impacted = advanceMirageRun(overlapping, EMPTY_INPUT, 1 / 60);
    const escaped = stepFor(1, EMPTY_INPUT, impacted);

    expect(impacted.collisions).toBe(1);
    expect(impacted.recoveries).toBe(1);
    expect(Math.abs(impacted.car.laneOffset)).toBe(4);
    expect(isDriveable(impacted.car)).toBe(true);
    expect(escaped.collisions).toBe(1);
    expect(escaped.car.routeDistance).toBeGreaterThan(
      impacted.car.routeDistance + 7,
    );
  });

  it("rewards a fast clean run and penalizes impacts", () => {
    const base = createMirageRunState();
    const clean = calculateScore({ ...base, elapsed: 24, nearMisses: 2 });
    const rough = calculateScore({ ...base, collisions: 4, elapsed: 35 });

    expect(clean).toBeGreaterThan(rough);
    expect(getRank(clean)).toMatch(/[SA]/);
  });
});
