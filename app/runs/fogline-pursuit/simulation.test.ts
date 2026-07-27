import { describe, expect, it } from "vitest";
import {
  createFoglineState,
  isInsideBuilding,
  navigationCue,
  nearestCopDistance,
  OBJECTIVES,
  stepFogline,
  type FoglineState,
} from "./simulation";

const idle = { throttle: 0, steer: 0, handbrake: false };

function simulate(
  initial: FoglineState,
  seconds: number,
  input = idle,
): FoglineState {
  let state = initial;
  const steps = Math.ceil(seconds / 0.02);
  for (let index = 0; index < steps; index += 1) {
    state = stepFogline(state, input, 0.02);
  }
  return state;
}

describe("Fogline Pursuit simulation", () => {
  it("accelerates down the starting road with progressive speed", () => {
    const initial = createFoglineState();
    const state = simulate(initial, 2, {
      throttle: 1,
      steer: 0,
      handbrake: false,
    });

    expect(state.player.speed).toBeGreaterThan(20);
    expect(state.player.z).toBeLessThan(initial.player.z - 15);
    expect(state.player.x).toBeCloseTo(initial.player.x, 1);
  });

  it("turns meaningfully while preserving forward motion", () => {
    let state = createFoglineState();
    state.player.x = -72;
    state.player.z = 24;
    state.player.speed = 25;
    const headingBefore = state.player.heading;
    state = simulate(state, 0.7, {
      throttle: 1,
      steer: 1,
      handbrake: false,
    });

    expect(Math.abs(state.player.heading - headingBefore)).toBeGreaterThan(0.5);
    expect(state.player.speed).toBeGreaterThan(20);
  });

  it("routes the player to road turns instead of pointing through buildings", () => {
    const state = createFoglineState();
    state.objectiveIndex = 1;
    state.phase = "scrub";
    state.player.x = -72;
    state.player.z = 24;
    state.player.heading = Math.PI;
    const atTurn = navigationCue(state);

    expect(atTurn.instruction).toBe("Right now");
    expect(atTurn.bearing).toBeCloseTo(-Math.PI / 2, 1);

    state.player.z = 50;
    const approaching = navigationCue(state);
    expect(approaching.instruction).toMatch(/^Right in \d+m$/);

    state.player.z = -24;
    state.player.heading = Math.PI / 2;
    const eastbound = navigationCue(state);
    expect(eastbound.instruction).toMatch(/^Continue \d+m$/);

    state.player.x = 92;
    state.player.z = -24;
    const overshot = navigationCue(state);
    expect(overshot.instruction).toBe("Turn around");
  });

  it("advances the mission and escalates heat at an objective", () => {
    const state = createFoglineState();
    state.player.x = OBJECTIVES[0].point.x;
    state.player.z = OBJECTIVES[0].point.z;
    const next = stepFogline(state, idle, 0.02);

    expect(next.phase).toBe("scrub");
    expect(next.objectiveIndex).toBe(1);
    expect(next.heat).toBe(OBJECTIVES[0].heatAfter);
    expect(next.score).toBeGreaterThan(0);
  });

  it("completes a full three-move getaway loop", () => {
    let state = createFoglineState();
    for (const objective of OBJECTIVES) {
      state.player.x = objective.point.x;
      state.player.z = objective.point.z;
      state = stepFogline(state, idle, 0.02);
    }

    expect(state.phase).toBe("won");
    expect(state.heat).toBe(0);
    expect(state.score).toBe(17_500);
  });

  it("keeps the player outside solid city blocks", () => {
    const state = createFoglineState();
    state.player.x = -24;
    state.player.z = -48;
    state.player.heading = Math.PI / 2;
    state.player.speed = 30;
    const next = simulate(state, 1, {
      throttle: 1,
      steer: 0,
      handbrake: false,
    });

    expect(isInsideBuilding(next.player.x, next.player.z, 2)).toBe(false);
    expect(next.player.integrity).toBeLessThan(100);
  });

  it("does not destroy a car for resting against a wall", () => {
    const state = createFoglineState();
    state.player.x = -72;
    state.player.z = -93;
    state.player.heading = Math.PI;
    state.player.speed = 35;
    const next = simulate(state, 3, {
      throttle: 1,
      steer: 0,
      handbrake: false,
    });

    expect(next.player.integrity).toBeGreaterThan(65);
    expect(next.phase).not.toBe("busted");
  });

  it("slides along a building edge instead of reversing on a glancing hit", () => {
    const state = createFoglineState();
    state.player.x = -63.5;
    state.player.z = 16;
    state.player.heading = (Math.PI * 3) / 4;
    state.player.speed = 25;
    const headingBefore = state.player.heading;
    const next = stepFogline(
      state,
      { throttle: 1, steer: 0, handbrake: false },
      0.05,
    );

    expect(next.player.x).toBeGreaterThan(state.player.x);
    expect(next.player.z).toBeCloseTo(state.player.z, 1);
    expect(next.player.speed).toBeGreaterThan(0);
    expect(Math.abs(next.player.heading - Math.PI / 2)).toBeLessThan(
      Math.abs(headingBefore - Math.PI / 2),
    );
  });

  it("sends police along the road network and closes pursuit distance", () => {
    const state = createFoglineState();
    state.heat = 3;
    state.player.x = -72;
    state.player.z = 0;
    const spawned = stepFogline(state, idle, 0.02);
    const initialDistance = nearestCopDistance(spawned);
    const pursued = simulate(spawned, 5);

    expect(pursued.cops.length).toBeGreaterThanOrEqual(2);
    expect(nearestCopDistance(pursued)).toBeLessThan(initialDistance - 15);
  });

  it("pressures a stopped player without an instant police pile-on", () => {
    const state = createFoglineState();
    state.heat = 3;
    state.player.x = -72;
    state.player.z = 0;
    let pressured = state;
    let minimumDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 600; index += 1) {
      pressured = stepFogline(pressured, idle, 0.02);
      minimumDistance = Math.min(
        minimumDistance,
        nearestCopDistance(pressured),
      );
    }

    expect(minimumDistance).toBeLessThan(8);
    expect(nearestCopDistance(pressured)).toBeGreaterThan(3);
    expect(pressured.player.integrity).toBeGreaterThan(80);
    expect(pressured.phase).not.toBe("busted");
  });
});
