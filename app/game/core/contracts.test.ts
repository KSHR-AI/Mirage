import { describe, expect, it } from "vitest";

import {
  AI_DECISION_INTERVAL_TICKS,
  CONTRACT_VERSION,
  EMPTY_INPUT_FRAME,
  SIMULATION_DT,
  SIMULATION_HZ,
} from "./contracts";

describe("game contracts", () => {
  it("pins the deterministic simulation cadence", () => {
    expect(CONTRACT_VERSION).toBe(1);
    expect(SIMULATION_HZ).toBe(60);
    expect(SIMULATION_DT).toBeCloseTo(1 / 60, 12);
    expect(AI_DECISION_INTERVAL_TICKS).toBe(6);
  });

  it("provides a neutral immutable input frame", () => {
    expect(EMPTY_INPUT_FRAME.move).toEqual([0, 0]);
    expect(EMPTY_INPUT_FRAME.look).toEqual([0, 0]);
    expect(EMPTY_INPUT_FRAME.throttle).toBe(0);
    expect(EMPTY_INPUT_FRAME.firePressed).toBe(false);
  });
});
