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
import type { MirageRunState } from "./types";

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

function targetLane(routeDistance: number): number {
  if (routeDistance < 70) return 0;
  if (routeDistance < 112) return 4;
  if (routeDistance < 156) return -4;
  if (routeDistance < 200) return 0;
  if (routeDistance < 218) return 4;
  if (routeDistance < 246) return 0;
  if (routeDistance < 268) return 4;
  return -4;
}

function playCleanRun(initial = createMirageRunState()): MirageRunState {
  let state = initial;
  for (
    let frame = 0;
    frame < 60 * 45 && state.phase !== "complete" && state.phase !== "busted";
    frame += 1
  ) {
    const target = targetLane(state.car.routeDistance);
    const difference = target - state.car.laneOffset;
    const steer =
      Math.abs(difference) < 0.12 || state.steerLatch !== 0
        ? 0
        : Math.sign(difference);
    state = advanceMirageRun(
      state,
      {
        boost: false,
        brake: false,
        steer,
      },
      1 / 60,
    );
  }
  return state;
}

describe("Mirage lane-chase simulation", () => {
  it("moves toward the first obstacle wave without throttle input", () => {
    const initial = createMirageRunState();
    const state = stepFor(1);

    expect(state.car.routeDistance).toBeGreaterThan(8);
    expect(state.car.z).toBeLessThan(initial.car.z - 8);
    expect(state.car.laneOffset).toBe(0);
    expect(isDriveable(state.car)).toBe(true);
    expect(getCurrentTarget(state).id).toBe("pickup");
  });

  it("changes lanes quickly and holds the selected position", () => {
    const changedLane = stepFor(0.5, { ...EMPTY_INPUT, steer: 1 });
    const released = stepFor(1, EMPTY_INPUT, changedLane);

    expect(changedLane.car.laneOffset).toBe(4);
    expect(released.car.laneOffset).toBe(4);
    expect(released.car.routeDistance).toBeGreaterThan(
      changedLane.car.routeDistance + 9,
    );
  });

  it("clamps both lane edges to the driveable road envelope", () => {
    const rightEdge = stepFor(1, { ...EMPTY_INPUT, steer: 1 });
    const leftEdge = stepFor(1, { ...EMPTY_INPUT, steer: -1 });

    expect(rightEdge.car.laneOffset).toBe(4);
    expect(leftEdge.car.laneOffset).toBe(-4);
    expect(isDriveable(rightEdge.car)).toBe(true);
    expect(isDriveable(leftEdge.car)).toBe(true);
  });

  it("makes boost and brake immediately legible", () => {
    const boosted = stepFor(1, { ...EMPTY_INPUT, boost: true });
    const braked = stepFor(1, { ...EMPTY_INPUT, brake: true });

    expect(boosted.car.speed).toBeGreaterThan(16);
    expect(braked.car.speed).toBeLessThan(7);
    expect(boosted.car.routeDistance).toBeGreaterThan(
      braked.car.routeDistance + 5,
    );
  });

  it("ends an unattended run after three impacts", () => {
    const state = stepFor(30);

    expect(state.phase).toBe("busted");
    expect(state.collisions).toBe(3);
    expect(state.car.routeDistance).toBeLessThan(ROUTE_LENGTH);
    expect(state.finalScore).not.toBeNull();
  });

  it("completes cleanly when the player reads and clears each wave", () => {
    const state = playCleanRun();

    expect(state.phase).toBe("complete");
    expect(state.routeIndex).toBe(MISSION_TARGETS.length);
    expect(state.car.routeDistance).toBe(ROUTE_LENGTH);
    expect(state.collisions).toBe(0);
    expect(state.nearMisses).toBeGreaterThanOrEqual(8);
    expect(state.collectedBoosts.filter(Boolean).length).toBeGreaterThanOrEqual(
      3,
    );
    expect(state.rampUsed).toBe(true);
    expect(state.finalScore).toBeGreaterThan(9_500);
  });

  it("builds a multiplier from consecutive close passes", () => {
    const initial = createMirageRunState();
    const firstPose = getRoutePose(45, 0);
    const approaching = {
      ...initial,
      car: { ...initial.car, ...firstPose, speed: 11 },
    };
    const first = stepFor(0.6, EMPTY_INPUT, approaching);
    const secondPose = getRoutePose(65, 0);
    const second = stepFor(0.6, EMPTY_INPUT, {
      ...first,
      car: { ...first.car, ...secondPose, speed: 11 },
    });

    expect(first.trafficResults[0]).toBe("near");
    expect(first.combo).toBe(1);
    expect(second.trafficResults[1]).toBe("near");
    expect(second.combo).toBe(2);
    expect(second.styleScore).toBeGreaterThan(first.styleScore);
  });

  it("registers one impact for a two-car blockade", () => {
    const initial = createMirageRunState();
    const pose = getRoutePose(108, 0);
    const impacted = stepFor(0.5, EMPTY_INPUT, {
      ...initial,
      car: { ...initial.car, ...pose, speed: 11 },
    });

    expect(impacted.collisions).toBe(1);
    expect(impacted.impactCooldown).toBeGreaterThan(0);
    expect(
      impacted.trafficResults.filter((result) => result === "hit"),
    ).toHaveLength(1);
  });

  it("keeps every obstacle and lane sample on a street", () => {
    expect(getTrafficCount()).toBe(18);
    for (let distance = 0; distance <= ROUTE_LENGTH; distance += 4) {
      for (const laneOffset of [-4, 0, 4]) {
        expect(isDriveable(getRoutePose(distance, laneOffset))).toBe(true);
      }
    }
    for (let index = 0; index < getTrafficCount(); index += 1) {
      expect(isDriveable(getTrafficPose(index))).toBe(true);
    }
  });

  it("rewards a clean delivery and penalizes failed runs", () => {
    const clean = playCleanRun();
    const failed = stepFor(30);

    expect(calculateScore(clean)).toBeGreaterThan(calculateScore(failed));
    expect(getRank(calculateScore(clean))).toMatch(/[SA]/);
    expect(getRank(calculateScore(failed))).toBe("C");
  });
});
