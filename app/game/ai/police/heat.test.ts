import { describe, expect, it } from "vitest";

import type { HeatState } from "../../core/contracts";

import {
  LOST_SIGHT_TICKS,
  SEARCH_DURATION_TICKS,
  createHeatState,
  updateHeat,
} from "./heat";

const position = [0, 0, 0] as const;

describe("police heat", () => {
  it("raises heat only for witnessed crimes", () => {
    const hidden = updateHeat(createHeatState(), {
      crime: "vehicle-theft",
      witnessed: false,
      playerVisible: false,
      playerPosition: position,
    });
    expect(hidden.state.value).toBe(0);
    const witnessed = updateHeat(hidden.state, {
      crime: "vehicle-theft",
      witnessed: true,
      playerVisible: true,
      playerPosition: position,
    });
    expect(witnessed.state.wantedLevel).toBe(1);
    expect(witnessed.state.mode).toBe("respond");
    expect(witnessed.dispatched).toBe(true);
  });

  it("uses wanted thresholds with hysteresis", () => {
    let state: HeatState = { ...createHeatState(), value: 44, wantedLevel: 1 };
    state = updateHeat(state, {
      crime: "gunfire",
      witnessed: true,
      playerVisible: true,
      playerPosition: position,
    }).state;
    expect(state.wantedLevel).toBe(2);
    expect(
      updateHeat(
        { ...state, value: 42 },
        {
          playerVisible: false,
          playerPosition: position,
        },
      ).state.wantedLevel,
    ).toBe(2);
    expect(
      updateHeat(
        { ...state, value: 39 },
        {
          playerVisible: false,
          playerPosition: position,
        },
      ).state.wantedLevel,
    ).toBe(1);
  });

  it("enters search, returns, and clears after losing sight", () => {
    let state: HeatState = {
      ...createHeatState(),
      value: 22,
      wantedLevel: 1 as const,
      mode: "pursue" as const,
    };
    for (let tick = 0; tick < LOST_SIGHT_TICKS; tick += 1) {
      state = updateHeat(state, {
        playerVisible: false,
        playerPosition: position,
      }).state;
    }
    expect(state.mode).toBe("search");
    for (let tick = 0; tick < SEARCH_DURATION_TICKS; tick += 1) {
      state = updateHeat(state, {
        playerVisible: false,
        playerPosition: position,
      }).state;
    }
    expect(state.mode).toBe("return");
    for (let tick = 0; tick < 300; tick += 1) {
      state = updateHeat(state, {
        playerVisible: false,
        playerPosition: position,
      }).state;
    }
    expect(state.mode).toBe("patrol");
    expect(state.wantedLevel).toBe(0);
  });

  it("never decays below the active mission floor", () => {
    let state: HeatState = {
      ...createHeatState(),
      value: 46,
      wantedLevel: 2 as const,
      mode: "return" as const,
    };
    for (let tick = 0; tick < 1_000; tick += 1) {
      state = updateHeat(state, {
        playerVisible: false,
        playerPosition: position,
        missionFloorLevel: 2,
      }).state;
    }
    expect(state.value).toBe(45);
    expect(state.wantedLevel).toBe(2);
  });
});
