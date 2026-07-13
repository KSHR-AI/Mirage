import { describe, expect, it } from "vitest";

import { EMPTY_INPUT_FRAME } from "../../core/contracts";
import {
  AFTERLIGHT_OPENING_CINEMATIC_TICKS,
  hasOpeningCinematicInput,
  shouldFinishOpeningCinematic,
} from "./opening";

describe("opening cinematic", () => {
  it("stays active for its authored duration while input is neutral", () => {
    expect(
      shouldFinishOpeningCinematic({
        currentTick: AFTERLIGHT_OPENING_CINEMATIC_TICKS - 1,
        input: EMPTY_INPUT_FRAME,
        reducedMotion: false,
        startedAtTick: 0,
      }),
    ).toBe(false);
    expect(
      shouldFinishOpeningCinematic({
        currentTick: AFTERLIGHT_OPENING_CINEMATIC_TICKS,
        input: EMPTY_INPUT_FRAME,
        reducedMotion: false,
        startedAtTick: 0,
      }),
    ).toBe(true);
  });

  it("cancels for movement, look, actions, or reduced motion", () => {
    expect(
      hasOpeningCinematicInput({
        ...EMPTY_INPUT_FRAME,
        move: [0, 1],
      }),
    ).toBe(true);
    expect(
      hasOpeningCinematicInput({
        ...EMPTY_INPUT_FRAME,
        look: [1, 0],
      }),
    ).toBe(true);
    expect(
      hasOpeningCinematicInput({
        ...EMPTY_INPUT_FRAME,
        interactPressed: true,
      }),
    ).toBe(true);
    expect(
      shouldFinishOpeningCinematic({
        currentTick: 1,
        input: EMPTY_INPUT_FRAME,
        reducedMotion: true,
        startedAtTick: 0,
      }),
    ).toBe(true);
  });

  it("ignores device source changes and dead-zone noise", () => {
    expect(
      hasOpeningCinematicInput({
        ...EMPTY_INPUT_FRAME,
        look: [0.04, -0.04],
        move: [0.03, 0.02],
        source: "gamepad",
        steer: 0.05,
        throttle: -0.06,
      }),
    ).toBe(false);
  });
});
